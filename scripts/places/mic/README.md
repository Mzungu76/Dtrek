# MiC (Ministero della Cultura) → dtrek_places

Implementato: `fetch.ts` in questa cartella (piano `docs/piano-mete-multitipologia.md` §8).

## Fonte (verificata via WebSearch/WebFetch in questa sessione — 2026-08-30)

Il dataset "Luoghi della cultura" del piano corrisponde ad **ArCo** ("Architettura della
Conoscenza"), il knowledge graph ufficiale del MiC:

- Progetto: https://github.com/ICCD-MiBACT/ArCo — endpoint SPARQL pubblico dichiarato dalla home
  ufficiale (https://dati.beniculturali.it/arco/index.php?lang=en): `https://dati.cultura.gov.it/sparql`
- Classe RDF (verificata leggendo il file ontologia da GitHub, non un URL indovinato):
  `http://dati.beniculturali.it/cis/CulturalInstituteOrSite` — proprietà
  `hasCulturalInstituteOrSiteType` per la tipologia, `hasTimeIndexedTypedLocation` →
  `atSite`/`atLocation` per la geolocalizzazione (pattern "time indexed location" tipico di ArCo).
- ID reali osservati in risultati di ricerca pubblici (es.
  `http://dati.beniculturali.it/mibact/luoghi/resource/CulturalInstituteOrSite/104060`) — usati
  come `sourceId`.

**Coordinate — risolto (2026-09-17) leggendo i dati reali con `--describe`.**
Due tentativi dedotti dalla sola documentazione (`geo:lat`/`geo:long` su `?site`, poi
`clv:lat`/`clv:long` via `clv:hasGeometry` su CIS/Site/Feature) avevano dato entrambi 0 risultati.
`--describe` ha dumpato la struttura vera di un `CulturalInstituteOrSite` reale (7275, Archivio di
Stato di Firenze — Fondo Coppedè): il collegamento è `cis:hasSite` (confermato — `hasTimeIndexedTypedLocation`
non compare mai nei dati reali), e la geometria è `clvapit:hasGeometry` sul **Site** stesso →
`clvapit:lat`/`clvapit:long` — l'esempio ufficiale restituito dall'endpoint nel commento della
classe Site, non più una deduzione.

**Nota di copertura**: il record usato per il dump non aveva coordinate popolate (solo un indirizzo
strutturato via `cis:siteAddress` → `clvapit:fullAddress`) — non è detto che tutti i record ArCo
abbiano la geometria. Un secondo record reale trovato dall'utente su LodView (100005, "Museo civico
aufidenate") le aveva, ma con un vocabolario diverso: `geo:lat`/`geo:long` (WGS84 Basic Geo) invece
di `clvapit:hasGeometry` — il catalogo non è uniforme tra schede catalogate in periodi diversi.
`fetch.ts` prova ora entrambi i vocabolari su entrambi i punti di aggancio (CIS e Site).

**Nota di prestazioni (2026-09-17, due round)**:
1. La query con tutti e quattro i rami di ricerca coordinate ha dato `MiC SPARQL 500` (timeout del
   motore) contro l'endpoint reale con `--limit 300`, regione Lazio. Primo tentativo di correzione:
   una sotto-query con `LIMIT` proprio (`CANDIDATE_POOL`) prima dei join per le coordinate — ancora
   `500` con la stessa combinazione.
2. Causa più probabile: il pattern `OPTIONAL` che avvolge una `UNION` a 4 rami è un caso noto in
   cui i motori SPARQL pianificano male la query indipendentemente da quanti candidati arrivano a
   quel punto. `buildSparqlQuery` ora usa 4 `OPTIONAL` indipendenti (uno per combinazione
   vocabolario/nodo) con `COALESCE` per prendere il primo valore trovato, invece di un `OPTIONAL`
   con `UNION` dentro — e il filtro regione entra nella sotto-query **prima** del `LIMIT` sui
   candidati (con una regione specificata, i candidati esaminati sono già quelli di quella regione,
   non un pool casuale su tutta Italia).

`CANDIDATE_POOL_CAP` (2000, scala con `--limit`) resta comunque un tetto al lavoro del motore, non
ai risultati possibili — con una copertura bassa delle coordinate nel catalogo, il numero di
risultati può restare sotto `--limit`.

**Nota di prestazioni (2026-09-17, terzo round — causa isolata con dato reale, non ipotesi)**:
anche dopo i due round sopra, un log reale mostrava ancora `DOMException [TimeoutError]` in
`fetchSparqlJson`. `scripts/places/mic/probe.ts` (query minime isolate, un tentativo ciascuna,
contro l'endpoint reale via il workflow in `mode: probe`) ha bisezionato la query di produzione:

1. Ogni singolo predicato preso da solo è rapido (tutti <1.3s, la maggior parte <250ms) — incluso
   `clvapit:hasGeometry`+`lat`/`long` (coordinate reali popolate, confermate) e `clvapit:hasRegion`
   senza filtro. `cis:hasAddress` (predicato suggerito da una fonte esterna basata sulla sola
   documentazione dell'ontologia CulturalON) è stato testato e **falsificato**: 0 risultati, non
   esiste nei dati reali — stesso errore già evitato due volte prima con `--describe`.
2. La sotto-query dei candidati con il filtro regione così com'era
   (`FILTER(CONTAINS(LCASE(?regionLabel), LCASE("Lazio")))`, dopo due salti `OPTIONAL`
   `siteAddress`→`hasRegion`) dava un **500 istantaneo (~120-180ms)**, non un timeout dopo
   esecuzione lenta: `Virtuoso 42000 Error The estimated execution time 20627 (sec) exceeds the
   limit of 4000 (sec)` — il *pianificatore* di Virtuoso rifiuta la query prima di eseguirla,
   perché `CONTAINS`/`LCASE` a quel punto non è indicizzabile e la sua stima esplode (~5.7h).
3. La stessa identica sotto-query con `FILTER(?regionLabel = "Lazio")` (uguaglianza esatta invece
   di `CONTAINS`/`LCASE`) è passata: `200`, <300ms, risultati corretti (es. "Casa Pasolini", Roma,
   Lazio). Anche senza alcun filtro regione la sotto-query passava — confermando che il problema
   era specificamente `CONTAINS`/`LCASE`, non un filtro in sé né i join `OPTIONAL`.

`buildSparqlQuery` ora usa l'uguaglianza esatta. Compromesso accettato: case-sensitive, nessun
match parziale — la regione passata va scritta con la stessa capitalizzazione del `rdfs:label` nel
grafo (es. "Lazio", non "lazio"/"LAZIO").

**Nota di prestazioni (2026-09-17, quarto round — bug segnalato dal vivo, non un'ipotesi)**: un run
`write` con "Regione: tutta Italia" e `--limit 10000` ha dato **0 risultati**, senza alcun errore
HTTP. Causa trovata rileggendo `buildSparqlQuery`: `CANDIDATE_POOL_CAP` (2000) troncava la
sotto-query dei candidati **prima** del filtro sulle coordinate. Con un filtro regione questo è
innocuo (i candidati sono già ristretti a quella regione), ma senza filtro regione ("tutta Italia")
quel pool era una fetta **arbitraria** dell'intero catalogo (nessun `ORDER BY`, ordine deciso dal
motore — verosimilmente correlato all'ID: il record 7275 usato da `--describe`, un archivio di
stato, non aveva coordinate; il record 100005 con coordinate reali è molto più avanti). Con una
copertura delle coordinate bassa e non uniforme nel catalogo, quella fetta di 2000 poteva contenere
zero record georeferenziati — esattamente il bug osservato.

Fix: il filtro coordinate (i 4 `OPTIONAL` + `COALESCE` + `FILTER(BOUND(...))`) è entrato nella
stessa sotto-query del filtro regione, **prima** del suo `LIMIT` — che ora è direttamente `limit`
invece di un pool separato (`CANDIDATE_POOL_CAP` rimosso). Il `LIMIT` tronca così solo candidati che
hanno già coordinate valide, mai un campione arbitrario da filtrare dopo.

**Nota di prestazioni (2026-09-17, quinto round — bug segnalato dal vivo, non un'ipotesi)**: dopo il
fix del round 4, lo stesso run ("tutta Italia", `--limit 10000`, `mode: write`) non ha più dato 0
risultati ma `Error: MiC SPARQL 500` dopo tutti i retry — nessun corpo di risposta leggibile in log,
perché `fetchSparqlJson` scartava il testo della risposta per qualunque status "transitorio" (500
incluso) prima di esaurire i retry, non solo per quelli definitivi. **Due correzioni**:

1. `fetchSparqlJson` ora legge e conserva il corpo della risposta ad ogni tentativo, non solo per gli
   status non transitori — il prossimo errore dirà con certezza se è un rifiuto immediato del
   pianificatore Virtuoso (come il caso CONTAINS/LCASE del round 3) o un timeout reale dopo
   esecuzione lenta.
2. Causa più probabile del 500 (coerente con l'evidenza disponibile, non ancora confermata dal corpo
   dell'errore): senza un filtro regione a restringere subito lo spazio di ricerca, la sotto-query con
   i 4 `OPTIONAL` coordinate + `FILTER(BOUND(...))` introdotta al round 4 deve scandire l'intero
   catalogo (decine di migliaia di record) per trovare fino a 10000 record georeferenziati — la
   query per-regione, invece, resta verificata veloce e corretta (round 3). `fetch.ts` non tenta più
   una query "tutta Italia" senza filtro: interroga ora una regione alla volta, usando le etichette
   **realmente presenti nel grafo** (query `REGION_LIST_QUERY`, stesso predicato
   `clvapit:hasRegion`/`rdfs:label` già provato veloce senza filtro al round 1 — mai una lista di
   nomi regione indovinata), fino a raggiungere `--limit` o esaurire le regioni trovate.

Aggiunti a `scripts/places/mic/probe.ts`: `tutta-italia-con-coordinate` (round 4, riproduce la forma
poi risultata in 500 — utile a confermare la diagnosi quando il corpo dell'errore sarà leggibile) e
`lista-regioni` (round 5, verifica solo la query di scoperta regioni). **Non ancora verificato dal
vivo** (sandbox senza rete verso l'endpoint, vedi sezione "Bloccante di rete" sotto) — testare prima
con `mode: probe` (in particolare `lista-regioni`) o `mode: dry-run --limit 20` senza regione.

**Nota di prestazioni (2026-09-17, sesto round — bug segnalato dal vivo, non un'ipotesi)**: il fix del
round 5 ha eliminato il 500 generico, ma il run reale ("tutta Italia", `--limit 10000`, `mode: write`)
ha loggato `100 regioni trovate nel grafo` (l'Italia ne ha 20) seguito da
`Virtuoso 42000 Error The estimated execution time -907544064 (sec) exceeds the limit of 4000 (sec)`
— un numero **negativo**, tipico di un overflow di interi nel pianificatore, non il rifiuto "pulito"
già visto col caso CONTAINS/LCASE (round 3). `REGION_LIST_QUERY` non vincola `clvapit:hasRegion` a
restituire solo vere regioni amministrative — tra le 100 etichette distinte trovate, almeno una non è
una regione reale e ha mandato in confusione lo stimatore di costo quando usata nell'uguaglianza
esatta.

Fix: `filterToKnownRegions` (puro, testato in `mic.test.ts`) filtra l'elenco scoperto dal grafo contro
`ITALIAN_REGIONS`, le 20 regioni italiane reali — un'enumerazione fissa e nota (non una deduzione da
documentazione, diversamente dal thesaurus dei tipi MiC o dai predicati RDF) — così non si interroga
mai con un valore sporco. In più, `fetchAllRegions` ora avvolge la query per-regione in un
`try`/`catch`: una singola regione che fallisce (l'endpoint si è già dimostrato imprevedibile per
valori/piani specifici anche con un filtro whitelisted) logga un avviso e passa alla successiva,
invece di abortire l'intero import perdendo il lavoro già fatto sulle regioni precedenti. Compromesso
accettato: un'etichetta reale con capitalizzazione diversa dalla whitelist verrebbe scartata
silenziosamente — "Lazio" nel grafo usa però esattamente questa capitalizzazione (round 3), verificato
su dato reale. Non ancora riverificato dal vivo dopo questo fix.

**Nota di prestazioni (2026-09-17, settimo round — bug segnalato dal vivo, non un'ipotesi)**: il fix
del round 6 ha eliminato il crash (grazie al `try`/`catch`), ma il run reale ("tutta Italia",
`mode: write`) ha fallito su **ogni singola regione provata** (Marche, Piemonte, Calabria,
Emilia-Romagna, Friuli-Venezia Giulia, Molise, Trentino-Alto Adige, Veneto — tutte etichette reali,
confermate dalla whitelist, non un valore sporco), sempre con lo **stesso identico** numero di stima
negativo (`-1990249984`). Uno stesso numero su regioni con cardinalità molto diversa tra loro esclude
un problema del valore filtrato — punta alla FORMA della query introdotta al round 4: i 4 `OPTIONAL`
coordinate + `COALESCE` + `FILTER(BOUND(...))` erano stati spostati DENTRO la stessa sotto-query del
filtro regione (6 `OPTIONAL` totali in un solo scope, con un'uguaglianza e un `FILTER(BOUND(...))`)
— stesso genere di collasso combinatorio già visto al round 2/3, solo con un'altra combinazione di
predicati. **Risultato: 0 record scritti**, confermato in Supabase (488 invariati, nessun nuovo
inserimento).

Fix: le coordinate tornano nella query ESTERNA, fuori dalla sotto-query filtrata per regione —
esattamente la struttura del round 3, **già verificata con una scrittura reale riuscita** (495 record
importati in Lazio, confermati in Supabase prima di questo round). Il punto chiave che rende sicuro
questo ritorno: da quando "tutta Italia" passa sempre da `fetchAllRegions`, `buildSparqlQuery` non
viene più chiamata senza un `regionLabel` reale — il caso che il fix del round 4 doveva risolvere
(scansione dell'intero catalogo senza alcun filtro) non può più accadere da nessun punto di chiamata
attuale, quindi il pool di candidati scalato (`CANDIDATE_POOL_CAP`, tornato) resta sempre limitato a
una singola regione, mai a un campione arbitrario su tutta Italia. Aggiunto
`produzione-round6-coordinate-esterne` a `probe.ts` per riverificare questa struttura isolata prima di
un altro `write`. Non ancora riverificato dal vivo dopo questo fix.

Workflow: `mode: dry-run`/`write` in `import-places-mic.yml` (`mode: describe` e `mode: probe`
restano disponibili per ulteriore diagnostica, nessun secret Supabase richiesto).

## Toscana — probabile falso negativo, da ritestare per prima cosa (2026-09-25)

Verifica utente: 0 Siti con `source='mic'` per la Toscana in Supabase (e Sicilia solo 3 — vedi
`MIC_DATA_SOURCES.md`). Quel valore però risale a un run del 2026-09-17 ("tutta Italia"), **prima**
del fix coordinate mancanti Lombardia/Toscana descritto in cima a `fetch.ts` (geocodifica Nominatim
di ripiego per i record ArCo con indirizzo ma senza tripla di coordinate dirette — verificato dal
vivo SOLO sulla Lombardia, 2026-09-22: 6 record trovati, 6/6 geocodificati). Il commento in cima a
`fetch.ts` è esplicito: il sotto-grafo ArCo per Lombardia/Toscana condivide lo stesso problema
(indirizzo presente, coordinate mai presenti) — la Toscana non è mai stata ritestata con la query
corretta. **Prima di costruire una fonte dedicata come per la Lombardia** (vedi
`scripts/places/toscana/`, tenuta di proposito come riserva), lanciare `mode: dry-run`,
`region: Toscana` su questo workflow: se il numero di risultati è ragionevole, il problema potrebbe
già essere risolto da questo fix, senza bisogno di altro codice.

## Cosa esisteva già nel repository (riusato come riferimento, non duplicato)

`lib/pois/gnaSource.ts` — fetcher live per il solo layer archeologico MiC via GNA (WFS), non
duplicato qui. `MIC_TYPE_MAP` in `fetch.ts` segue lo stesso approccio a sottostringa di
`GNA_TYPE_MAP` in quel file, applicato però all'**etichetta testuale** del tipo (non a un codice),
perché il thesaurus dei tipi ArCo non è stato verificabile in questa sessione.

## Bloccante di rete

Nessun ambiente di sviluppo usato finora (sandbox Claude Code, incluse sessioni successive)
raggiunge `dati.cultura.gov.it` — stesso blocco di rete di ISTAT/PTPR. Solo il runner GitHub
Actions (`.github/workflows/import-places-mic.yml`) ci arriva: entrambi i tentativi sopra hanno
eseguito la query con successo (nessun errore HTTP/rete, query sintatticamente valida) ma con 0
risultati — il problema è il predicato usato, non la raggiungibilità dell'endpoint.

## Licenza (piano §8/§44 — CC BY-SA 4.0)

`fetch.ts` non richiede/usa nessun campo di descrizione testuale estesa — solo dati strutturati
(nome, tipologia, indirizzo/comune, coordinate). `description` resta sempre `undefined` per questa
fonte.

## Test

`scripts/places/__tests__/mic.test.ts` copre `micTypeLabelToSiteType` (mapping tipologia→SiteType)
e `micBindingToPlaceCandidate` (costruzione del candidato, licenza, sourceId/sourceUrl reali) — non
richiede rete. `scripts/places/__tests__/mic-probe.test.ts` copre la struttura di `probe.ts` (nomi
univoci, nessun predicato non verificato fuori dal probe dedicato) — non richiede rete.

## Uso

```bash
npx tsx scripts/places/mic/fetch.ts --describe                       # diagnostica (nessun Supabase)
npx tsx scripts/places/mic/fetch.ts --dry-run --region Lazio --limit 20
npx tsx scripts/places/mic/probe.ts                                  # diagnostica: probe isolati per predicato (nessun Supabase)
```
