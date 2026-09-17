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

Workflow: `mode: dry-run`/`write` in `import-places-mic.yml` (`mode: describe` e `mode: probe`
restano disponibili per ulteriore diagnostica, nessun secret Supabase richiesto).

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
