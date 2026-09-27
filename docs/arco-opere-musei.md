# "Opere di questo museo" da ArCo — report di verifica e piano

Data: 2026-09-26. Richiesta: aggiungere le opere conservate nei musei MiC già presenti in Dtrek,
usando ArCo come fonte, come già fatto per "Luoghi della Cultura" (`MIC_DATA_SOURCES.md`,
`scripts/places/mic/`). Questo documento verifica COME si può fare, cosa è già confermato e cosa
resta da verificare dal vivo prima di scrivere una vera pipeline di import.

---

## 0. Vincolo di rete (riverificato oggi, non solo citato)

Stessa policy già documentata in `MIC_DATA_SOURCES.md` §0: questa sessione non raggiunge
`dati.cultura.gov.it`. Riverificato con una richiesta reale, non assunto da un report precedente:

```
$ curl -sS --max-time 8 "https://dati.cultura.gov.it/sparql?query=..." 
curl: (56) CONNECT tunnel failed, response 403

$ curl -sS "$HTTPS_PROXY/__agentproxy/status"
"recentRelayFailures": [{"kind":"connect_rejected","detail":"gateway answered 403 to CONNECT
  (policy denial or upstream failure)","host":"dati.cultura.gov.it:443"}]
```

`raw.githubusercontent.com` funziona invece (come già osservato in sessioni precedenti) — usato
sotto per leggere l'ontologia ArCo reale. **Nessuna query SPARQL di questo report è stata eseguita
dal vivo**: tutto ciò che segue distingue esplicitamente "letto nell'ontologia" (fatto, oggi) da
"verificato sui dati" (da fare, via il workflow proposto in §5).

---

## 1. Cosa esiste già in Dtrek (riusabile, non da rifare)

- `scripts/places/mic/fetch.ts` importa i musei/luoghi MiC in `dtrek_places` con
  `source = 'mic'` e `source_id` = id numerico ArCo del `CulturalInstituteOrSite` (es. `105665` per
  il Museo di Canepina) — verificato in produzione, non ipotetico (`MIC_DATA_SOURCES.md` §3bis).
  Questo id è la chiave che una pipeline "opere" userebbe per sapere QUALE museo ArCo corrisponde a
  quale riga Dtrek — nessun nuovo campo di collegamento da inventare.
- `scripts/places/types.ts` (`FieldProvenance`) e `scripts/places/import.ts` (`mergeMetadata`) già
  implementano provenienza per campo — riusabili identici per le opere (autore/datazione/immagine
  potrebbero venire da fonti diverse in futuro, stesso principio già applicato a orari/prezzo).
- **Oggi "opere" in Dtrek è testo generato da un LLM, senza alcun dato reale**: `lib/guideProfiles.ts`
  (riga ~161) descrive la sezione "Il museo" della Guida Sito come "Le opere e le sale principali,
  gli artisti rappresentati, un percorso di visita consigliato" — un prompt, non una query. Lo
  stesso vale per `docs/piano-mete-multitipologia.md` §30/§36 ("Museo: opere; sale; artisti...").
  Questa è la ragione pratica della richiesta: sostituire/arricchire un'invenzione plausibile con
  dati reali quando disponibili.

---

## 2. Cosa dice ArCo — letto dall'ontologia reale su GitHub (non ancora sui dati)

Fonti primarie lette in questa sessione (via `raw.githubusercontent.com`, non un URL indovinato):

- `https://raw.githubusercontent.com/ICCD-MiBACT/ArCo/master/ArCo-release/ontologie/arco/arco.owl`
  → classe `https://w3id.org/arco/ontology/arco/CulturalProperty` ("opera"/bene catalogato).
  Nessuna proprietà di localizzazione/conservazione definita in QUESTO modulo — solo categoria,
  disciplina, classificazione cartografica, componenti (per beni complessi).
- `https://raw.githubusercontent.com/ICCD-MiBACT/ArCo/master/ArCo-release/ontologie/location/location.owl`
  (lo stesso modulo già usato da `scripts/places/mic/fetch.ts` per `hasCulturalInstituteOrSiteType`)
  → proprietà `https://w3id.org/arco/ontology/location/hasCulturalInstituteOrSite`:
  - domain: `owl:Thing` (quindi applicabile anche a una `CulturalProperty`)
  - range: `http://dati.beniculturali.it/cis/CulturalInstituteOrSite` (la stessa classe già
    importata da Dtrek)
  - rdfs:comment: *"This property links a cultural property to the cultural institute or site."*

Questo è un candidato concreto e non casuale: è nello stesso modulo "location" che già si è
dimostrato affidabile per i CIS (tipologia, indirizzo), ed è testualmente descritto per
esattamente questo scopo.

Il dataset più ampio è pubblicato come **"Catalogo Generale dei Beni Culturali"**
(`dati.beniculturali.it/lodview/resource/datasetSchedeCatalografiche.html`, trovato via WebSearch,
non ancora ispezionato in dettaglio) — l'insieme delle "schede di catalogo" ICCD convertite in
RDF, di cui `arco:CulturalProperty` è la classe che rappresenta il bene descritto da ciascuna
scheda.

---

## 3. Cosa NON è ancora verificato — elenco esplicito

Stessa disciplina di `MIC_DATA_SOURCES.md`: non riportare come fatto ciò che non è stato osservato
su un dato reale.

1. **Se `hasCulturalInstituteOrSite` è davvero popolato nei dati**, o è solo un predicato definito
   nell'ontologia ma mai usato in pratica (già successo con `hasTimeIndexedTypedLocation`/`atSite`
   per i CIS stessi — sostituito da `cis:hasSite`, mai osservato nei dati reali).
2. **La direzione della tripla**: il commento implica opera→museo (`?opera hasCulturalInstituteOrSite
   ?cis`), ma è un'assunzione dal testo del commento, non un'osservazione — va testata anche al
   contrario.
3. **La copertura**: quanti musei/opere hanno questo collegamento popolato. Un museo piccolo
   (come Canepina, usato come test in `MIC_DATA_SOURCES.md`) potrebbe non avere alcuna opera
   catalogata individualmente in ArCo, anche se il predicato esiste ed è usato altrove (es. grandi
   musei statali).
4. **Quali campi porta un'opera**: titolo, autore, datazione, materiali/tecnica, misure, immagine,
   numero di catalogo generale (NCTN) — nessuno di questi è stato letto da un dato reale. Il modulo
   "catalogue" dell'ontologia (non ancora ispezionato in questa sessione) probabilmente porta questi
   campi su una risorsa collegata alla `CulturalProperty`, non sulla `CulturalProperty` stessa — un
   dump a 2 salti (`--describe`, §5 sotto) lo rivelerà, stesso metodo già usato con successo per i
   CIS.
5. **Licenza per il riuso, in particolare delle immagini**: `MIC_DATA_SOURCES.md` §1 nota che
   Dtrek esclude oggi qualunque contenuto editoriale/immagine da ArCo per prudenza sulla licenza
   CC BY-SA 4.0, poi rivista quando la descrizione dei CIS si è dimostrata strutturata e attribuibile
   (sourceUrl). Per le opere, in particolare `foaf:depiction` (immagine), la licenza del dataset
   "Catalogo Generale" non è stata verificata in questa sessione — **da controllare esplicitamente
   prima di mostrare o salvare un URL immagine**, non assumere che sia la stessa di "Luoghi della
   Cultura".
6. **Scala**: "Luoghi della Cultura" ha decine di migliaia di record; il "Catalogo Generale dei Beni
   Culturali" è ordini di grandezza più grande (milioni di schede secondo la documentazione
   pubblica di ArCo/ICCD, non verificato con una COUNT reale in questa sessione) — un import
   "a tappeto" non è pensabile: la query deve sempre partire DA un museo già in Dtrek (il
   `source_id` esistente), mai da un crawl generale del catalogo.

---

## 4. Cosa è stato aggiunto in questa sessione (solo diagnostica, nessuna scrittura)

- `scripts/places/mic/opere/probe.ts` — 4 query minime (`LIMIT 5`) più due modalità mirate:
  - probe generici: la classe `arco:CulturalProperty` esiste? il predicato
    `hasCulturalInstituteOrSite` è popolato, in che direzione? co-occorrono sulla stessa opera?
  - `--cis <id>`: opere collegate a UN museo specifico già in `dtrek_places` (mai un id inventato —
    va preso da una riga reale con `source = 'mic'`).
  - `--describe [--name X | --cis <id>]`: dump esaustivo a 2 salti di un'opera reale (stesso
    pattern di `fetch.ts --describe`, già efficace per scoprire `description`/orari/contatti dei
    CIS mai dedotti dalla sola ontologia).
- `.github/workflows/probe-opere-mic.yml` — dispatch manuale, nessun secret Supabase richiesto
  (pura diagnostica in lettura). Stesso schema di `import-places-mic.yml`.
- `scripts/places/mic/opere/__tests__/probe.test.ts` — copre le funzioni pure (costruzione query,
  niente iniezione SPARQL) senza rete; **10/10 passano** (`npx vitest run
  scripts/places/mic/opere/__tests__/probe.test.ts`).

Nessuna tabella, nessuna modifica allo schema, nessun import: prematuro prima di sapere se il
predicato è reale.

---

## 5. Come procedere (passi concreti, in ordine)

1. **Lanciare il workflow `Probe — Opere di questo museo` (modalità `probe`)** da GitHub Actions —
   nessun secret richiesto. Risultato atteso: per ciascuno dei 4 probe, quanti risultati (0 o
   >0) e in quale direzione. Il permesso `workflow_dispatch` per l'integrazione GitHub di questa
   sessione è risultato negato in sessioni precedenti (`MIC_DATA_SOURCES.md` §9) — il lancio
   manuale dell'utente resta la via più affidabile, come già fatto per i probe MiC/luoghi.
2. **Se il predicato risulta popolato**: scegliere 2-3 musei reali già in Dtrek (query su
   `dtrek_places where source = 'mic'`, prendere il `source_id`) e lanciare la modalità `cis` su
   ciascuno — idealmente un museo grande/statale (più probabile avere opere catalogate
   individualmente) e uno piccolo come Canepina (per capire se la copertura è generale o solo per
   le istituzioni maggiori).
3. **Se almeno un museo ha risultati**: lanciare `describe --cis <quell'id>` per scoprire i campi
   reali di un'opera (titolo, autore, datazione, immagine, numero di catalogo) — esattamente come
   `--describe --name Canepina` ha rivelato descrizione/orari/contatti dei CIS mai dedotti dalla
   sola ontologia.
4. **Solo a questo punto**, con predicati e campi confermati:
   - verificare la licenza del dataset "Catalogo Generale dei Beni Culturali" (in particolare per
     `foaf:depiction`, se presente) prima di importare o mostrare qualunque immagine;
   - progettare una tabella `dtrek_place_artworks` (proposta, non creata): `place_id` (FK verso
     `dtrek_places.id`), `source`/`source_id` (stesso pattern di `dtrek_places`), `title`,
     `author`, `dating`, `materials`, `image_url`, `catalog_number`, `source_url`, `metadata jsonb`
     con `fieldProvenance` (riuso diretto del tipo già esistente in `scripts/places/types.ts`);
   - scrivere `scripts/places/mic/opere/fetch.ts`, import **sempre per museo già in Dtrek** (mai un
     crawl generale — §3.6), offline/batch come il resto della pipeline (piano §9/§21);
   - lato UI: un nuovo widget "Opere di questo museo" (stesso pattern di
     `components/guida/widgets/RelatedPlacesWidget.tsx`) mostrato solo per `siteType === 'museo'`
     con almeno un'opera importata, e i dati reali passati come contesto a `guideProfiles.ts` per
     ancorare la sezione "Il museo" a fatti veri invece che a un'invenzione LLM plausibile — senza
     rimuovere il testo narrativo per i musei senza opere catalogate in ArCo (probabile la
     maggioranza, §3.3).
5. **Se il predicato risulta vuoto o la direzione è invertita**: aggiornare `probe.ts` con la forma
   corretta (o un predicato alternativo del modulo "catalogue", da ispezionare a quel punto) prima
   di procedere — stesso ciclo probe→fix già usato 8 volte per `scripts/places/mic/fetch.ts`
   (`scripts/places/mic/README.md`).

---

## 5bis. Primo probe eseguito dal vivo (2026-09-27, via Termux, utente) — RISULTATO POSITIVO

Il probe generico (`scripts/places/mic/opere/probe.ts`, nessun argomento) è stato lanciato dal vivo
dall'utente (versione standalone senza dipendenze, incollata via `node - <<'EOF'` in Termux — stessa
logica del file nel repo). Risultato reale, non dedotto:

- **`baseline-culturalproperty`**: 200, 5 risultati — `arco:CulturalProperty` ha istanze reali
  (es. `https://w3id.org/arco/resource/AltoAdige/HistoricOrArtisticProperty/21022`).
- **`hasCulturalInstituteOrSite-forward`**: 200, 5 risultati reali — soggetto un bene
  (`ArchaeologicalProperty/0900277320` e altri), oggetto un museo
  (`CulturalInstituteOrSite/43d07f7aa3c07bf446441d29a5904e75`). **Direzione confermata: opera →
  museo**, esattamente come indicato dal commento nell'ontologia (§2).
- **`culturalproperty+hasCulturalInstituteOrSite-combo`**: 200, 5 risultati — 5 istanze reali di
  `arco:CulturalProperty` (`AltoAdige/HistoricOrArtisticProperty/21022`, `/72026`, `/72027`,
  `/72028`, `/72029`) tutte collegate allo STESSO museo reale
  (`AltoAdige/CulturalInstituteOrSite/AA_CG_SVM`) — la prova end-to-end che il meccanismo
  "opere di questo museo" funziona con dati reali, non solo nell'ontologia.

**Predicato `loc:hasCulturalInstituteOrSite` ora CONFIRMED sui dati reali** (non più "NON
verificato") — direzione opera→museo, popolato, co-occorre con `arco:CulturalProperty` tipizzata.

**Difetto trovato nel probe `hasCulturalInstituteOrSite-reverse` (mio errore di progettazione, non
un dato ambiguo)**: rinominare le variabili SPARQL (`?cis`/`?opera`) non inverte la direzione della
tripla — `?a predicato ?b` e `?b predicato ?a` scritti con nomi di variabile scambiati restituiscono
comunque la stessa tripla reale nella stessa posizione soggetto/oggetto. Il risultato di quel probe
infatti mostrava la STESSA direzione reale (soggetto=bene, oggetto=museo), solo con le colonne di
output rinominate — non era un test di direzione alternativa. Corretto in `probe.ts` con un test
vero: verifica se un `CulturalInstituteOrSite` reale compare mai come SOGGETTO di questo predicato
(dovrebbe dare 0 risultati se la direzione è univoca opera→museo).

**Nuovo rischio reale trovato, non ipotizzato**: gli URI dei musei nei risultati sopra
(`https://w3id.org/arco/resource/CulturalInstituteOrSite/<hash>`,
`https://w3id.org/arco/resource/AltoAdige/CulturalInstituteOrSite/AA_CG_SVM`) usano una base
DIVERSA da quella già usata da `scripts/places/mic/fetch.ts` per i musei già importati in Dtrek
(`http://dati.beniculturali.it/mibact/luoghi/resource/CulturalInstituteOrSite/<id numerico>`).
ArCo ha più "famiglie" di URI per la stessa classe a seconda della regione/sotto-dataset di
provenienza — già notato per Lombardia/Toscana nei commenti di `fetch.ts` (namespace
`w3id.org/arco/resource/<Regione>/...` per la geometria), ora confermato anche per l'Alto Adige e
ESTESO qui all'identità stessa del CIS, non solo alla sua geometria. Conseguenza pratica:
`buildCisUri`/`buildOperaByCisQuery` (che ricostruiscono l'URI del museo dal `source_id` già salvato
in Dtrek, assumendo sempre la base nazionale `mibact/luoghi`) **potrebbero non trovare nulla anche
per un museo che ha opere catalogate**, se quel museo specifico in ArCo vive sotto una base
regionale diversa — non un fallimento del predicato, un problema di ricostruzione dell'URI corretto
per QUEL museo specifico.

## 5ter. Secondo e terzo probe eseguiti dal vivo (2026-09-27) — risultato negativo, non ancora conclusivo

- **`--cis 105665` (Canepina)**: 0 risultati. Da solo inconclusivo (piccolo ecomuseo, plausibile
  nessuna opera catalogata singolarmente).
- **`hasCulturalInstituteOrSite-verso-namespace-nazionale`** (filtro diretto sulla base URI
  dell'oggetto, indipendente da quale museo si scelga — vedi query in `probe.ts`): **0 risultati su
  un campione di 5**. Nessuna delle triple `hasCulturalInstituteOrSite` osservate in quel campione
  punta a un museo della base nazionale `mibact/luoghi` — la stessa già usata da
  `scripts/places/mic/fetch.ts` per Lazio e le altre regioni "non regionali" già importate in
  Dtrek.

**Interpretazione, con cautela** (campione di soli 5 record, non ancora una copertura reale):
compatibile con l'ipotesi che i dati "opere" (Catalogo Generale dei Beni Culturali) collegati via
questo predicato esistano SOLO per i sotto-grafi regionali che hanno una loro pipeline di
digitalizzazione confluita in ArCo (Alto Adige confermato, verosimilmente anche Lombardia/Toscana
per analogia con quanto già noto su namespace regionali diversi — MIC_DATA_SOURCES.md), mentre il
grosso dei "Luoghi della Cultura" a namespace nazionale (la maggioranza dei musei già in Dtrek)
potrebbe non avere alcuna opera catalogata raggiungibile con questo meccanismo — non perché il
predicato sia sbagliato, ma perché il "Catalogo Generale" a questo endpoint non ha, per quei musei,
schede di opere separate collegate così.

**Prossimo passo aggiunto in questa sessione**: `scripts/places/mic/opere/probe.ts --coverage`
(nuovo, non ancora eseguito dal vivo) — prende un campione più ampio (default 500, non filtrato per
famiglia) di triple `hasCulturalInstituteOrSite` reali e le raggruppa lato client per "famiglia" di
URI museo (nazionale `mibact/luoghi`, generico `w3id.org/arco/resource/CulturalInstituteOrSite/`,
regionale `w3id.org/arco/resource/<Regione>/...`), stampando quante ce ne sono di ciascuna. Risponde
alla domanda che il probe puntuale su 5 record non può risolvere da solo: la famiglia nazionale è
DAVVERO assente su una scala più ampia, o solo sotto-rappresentata in un campione piccolo?

Se anche a 500 record la famiglia nazionale resta a 0 (o quasi), la conclusione pratica per
`docs/arco-opere-musei.md` §5 cambierebbe: "Opere di questo museo" sarebbe realisticamente
disponibile solo per il sottoinsieme di musei Dtrek che ricadono nei sotto-grafi regionali con
opere catalogate (da identificare — probabilmente Alto Adige, forse Lombardia/Toscana), non per
"tutti i musei MiC già in Dtrek" come nella richiesta originale — un limite reale della fonte, da
comunicare esplicitamente, non un difetto della pipeline da correggere.

## 5quater. `--coverage` eseguito dal vivo (2026-09-27, campione di 500) — risultato netto, non più un caso raro

```
500 triple nel campione, 1 famiglie distinte:
   500  https://w3id.org/arco/resource/CulturalInstituteOrSite/
Famiglia nazionale (mibact/luoghi, già usata da Dtrek): 0/500
```

**500 su 500**: nessuna eccezione, nessuna traccia della famiglia nazionale né di quella regionale
Alto Adige vista nel probe `combo` precedente (probabile: quest'ultima è una minoranza che un
campione di 500 senza `ORDER BY` — ordine deciso dal motore, non casuale — non ha incluso). Il
risultato è ora netto, non un artefatto di un campione piccolo: **tutte le triple
`hasCulturalInstituteOrSite` osservate finora puntano a musei di una famiglia URI "generica"**
(`w3id.org/arco/resource/CulturalInstituteOrSite/<hash a 32 caratteri esadecimali>`), MAI alla
famiglia nazionale `mibact/luoghi` già usata da `scripts/places/mic/fetch.ts` per i musei "Luoghi
della Cultura" già importati in Dtrek (Lazio e altre regioni non regionali, Canepina inclusa).

**Domanda aperta, decisiva per la fattibilità**: questi musei "hash" sono le STESSE istituzioni già
in Dtrek ma raggiungibili con un URI diverso (es. tramite un collegamento `owl:sameAs` non ancora
cercato), o sono un universo di cataloghi/istituzioni completamente diverso (es. collezioni private,
diocesane, universitarie — mai importate come "Luoghi della Cultura")? Dalla verifica esaustiva già
fatta su Canepina/105665 in una sessione precedente (`MIC_DATA_SOURCES.md` §3bis, dump COMPLETO
delle sue proprietà dirette) risulta un solo `owl:sameAs` — verso Wikidata (`Q21552216`), NON verso
un URI ArCo di questa famiglia "hash". Non prova che NESSUN museo nazionale abbia un ponte simile
(Canepina è un caso, non un campione), ma indica che non è un meccanismo automatico/universale.

**Prossimo passo aggiunto in questa sessione**: `probe.ts --describe-uri "<uri>"` (nuovo, generico —
dump a 2 salti di un URI qualunque, non solo un CIS ricostruito dal `source_id`). Da lanciare su uno
degli URI "hash" reali già osservati (es.
`https://w3id.org/arco/resource/CulturalInstituteOrSite/43d07f7aa3c07bf446441d29a5904e75`, apparso
nel probe forward collegato a 4 `ArchaeologicalProperty` reali) per scoprire COSA rappresenta questo
museo — nome (`rdfs:label`), tipo, eventuale `owl:sameAs` verso un URI `mibact/luoghi` — prima di
poter rispondere se "Opere di questo museo" può coprire i musei Dtrek esistenti o solo un
sottoinsieme diverso da importare a parte.

## 5quinquies. `--describe-uri` eseguito dal vivo (2026-09-27) — identità reale del museo "hash" e un secondo predicato

Il dump (parziale — l'utente riporta un output "enorme", solo un estratto incollato) di
`https://w3id.org/arco/resource/CulturalInstituteOrSite/43d07f7aa3c07bf446441d29a5904e75` ha
rivelato due cose importanti:

1. **`cis:hasCISNameInTime` → `CISNameInTime/museo-archeologico-nazionale-di-firenze`**: questo
   museo "hash" è il **Museo Archeologico Nazionale di Firenze** — un grande museo statale, non una
   collezione oscura o un catalogo parallelo minore. Prova diretta che la famiglia URI "generica"
   trovata da `--coverage` (§5quater, 500/500 del campione) copre istituzioni di primo piano, non
   un angolo marginale del grafo.
2. **Un secondo predicato, mai visto prima**: `loc:isCulturalInstituteOrSiteOf`, usato DIRETTAMENTE
   sul museo verso un'opera che possiede (`ArchaeologicalProperty/0900277672`, tipizzata
   `arco:ArchaeologicalProperty`) — probabile inverso "pulito" di `hasCulturalInstituteOrSite`: più
   diretto per elencare le opere DI un museo partendo dal museo stesso, invece di cercarle a
   ritroso su tutto il catalogo (come fanno i probe generici di §2-§5quater). Aggiunte
   `buildWorksCountQuery`/`buildWorksSampleQuery` (nuovo modo CLI `--museo-opere <uri>`) per
   verificarlo su scala (quante opere ha DAVVERO questo museo, non solo le 4-5 viste finora in
   campioni piccoli).

**Cosa resta da fare per rispondere alla domanda del §5quater** (questi musei "hash" sono le STESSE
istituzioni già in Dtrek, o un catalogo da importare a parte): verificare se "Museo Archeologico
Nazionale di Firenze" è già presente in `dtrek_places` (query diretta o ricerca nell'app — fuori
dalla portata di questa sessione, che non ha credenziali Supabase). Se sì, controllare il suo
`source_id`: se è un hash a 32 caratteri esadecimali (non un numero piccolo come Canepina/105665),
conferma che i musei della regione Toscana — importati da `scripts/places/mic/fetch.ts` solo dopo il
fix di geocodifica del 2026-09-21 per la mancanza di coordinate dirette in quel sotto-grafo, vedi
commenti in quel file — hanno GIÀ un `source_id` nella stessa famiglia "hash" usata dalle opere, e
quindi la ricostruzione dell'URI museo per interrogare le opere funzionerebbe DIRETTAMENTE per
quei record, senza bisogno di alcun ponte `owl:sameAs`. In tal caso il problema smesso di essere
"la famiglia nazionale non ha opere" e diventa "solo i musei del sotto-grafo regionale (Toscana,
Alto Adige, verosimilmente Lombardia) hanno opere collegate in ArCo — e Dtrek li importa già, con
l'id giusto, dal fix del 2026-09-21".

**Nota collaterale, bug preesistente non ancora corretto** (trovato indagando questo, non nello
scope originale): `micBindingToPlaceCandidate` in `scripts/places/mic/fetch.ts` costruisce SEMPRE
`sourceUrl` con la base nazionale `http://dati.beniculturali.it/mibact/luoghi/resource/...`,
indipendentemente da quale base URI avesse realmente il `?cis` trovato dalla query (che per
Toscana/Lombardia è invece `w3id.org/arco/resource/...`, confermato qui) — per quei record
`source_id` è corretto (l'hash reale) ma `sourceUrl` punta a una risorsa che non esiste. Non
corretto in questa PR (fuori scope, richiede toccare `fetch.ts` in produzione), ma segnalato perché
influisce sull'attribuzione mostrata per quei record oggi.

## 5sexies. Verifica diretta su Supabase (2026-09-27) — risposta alla domanda del §5quinquies

Interrogato direttamente `dtrek_places` (progetto Supabase collegato a questa sessione,
`sdxlcpxgbkagbxhukehd`, 18.471 righe con `source='mic'`):

- **"Museo Archeologico Nazionale di Firenze" NON è in Dtrek** (`name ilike '%firenze%'` su
  `source='mic'` → 0 righe). Coerente con un fatto più ampio: **`region = 'Toscana'` non compare
  affatto** nella distribuzione per regione dei musei MiC già importati (`Emilia-Romagna` 642,
  `Piemonte` 554, `Lazio` 488, ... fino a `Lombardia` con solo 2 — **Toscana: 0**). Conferma quanto
  già annotato in `scripts/places/mic/README.md`/`MIC_DATA_SOURCES.md`: il sotto-grafo Toscana non
  ha mai prodotto record scritti in Supabase.
- **`Trentino-Alto Adige` invece È ben rappresentato (116 righe)** — ma con `source_id` **numerici**
  (es. `100518` "Museo archeologico dell'Ato Adige", `100519` "Museo civico di Bolzano"), la STESSA
  famiglia nazionale `mibact/luoghi` di Canepina — **non** il formato alfanumerico
  `AA_CG_SVM`/`AA_CG_...` visto nel probe `combo` (§5, sotto-grafo regionale
  `w3id.org/arco/resource/AltoAdige/...`). Sono quindi individui ArCo DIVERSI per lo stesso
  territorio: la Provincia di Bolzano è rappresentata sia nel grafo nazionale (quello che Dtrek ha
  importato) sia in un sotto-grafo regionale a parte (quello con le opere collegate) — due insiemi
  di URI paralleli, non uno sovrapposto all'altro.

**Risposta netta, non più un'ipotesi**: **nessuno dei 18.471 musei/luoghi MiC già in Dtrek usa un
`source_id` della famiglia URI a cui `hasCulturalInstituteOrSite`/`isCulturalInstituteOrSiteOf`
risultano collegati** (confermato per Toscana — assente — e per Trentino-Alto Adige — presente ma
sotto un'identità diversa). La ricostruzione dell'URI dal `source_id` (`buildCisUri`,
`buildOperaByCisQuery`) **non può funzionare per NESSUN museo già in Dtrek allo stato attuale** — non
un limite di un singolo test (Canepina), ma della struttura stessa dei due dataset: "Luoghi della
Cultura" (già importato, identità nazionale) e il sotto-grafo con le opere catalogate (identità
regionale/hash, mai importato) sono due insiemi di individui ArCo distinti per lo stesso patrimonio
reale, senza un ponte diretto verificato tra loro (Canepina non ne ha uno verso Wikidata a parte,
§5quater — nessun test ha ancora cercato un `owl:sameAs` sul lato "hash").

**Conseguenza pratica per la richiesta originale** ("tutti i musei MiC già in Dtrek"): con lo stato
attuale dei dati, "Opere di questo museo" **non si può agganciare per ID a un museo già importato**.
Le strade restano due, entrambe più impegnative di un semplice join per `source_id`:
1. **Cercare un ponte `owl:sameAs` reale** tra un individuo "hash" e uno "nazionale" — non ancora
   verificato su nessun record (solo escluso su Canepina, dove non serviva comunque perché Canepina
   non ha opere). Prossimo test: `--describe-uri` sul Museo Archeologico di Firenze con
   `--grep sameAs` (ora possibile senza incollare l'intero dump, §5septies).
2. **Importare il sotto-grafo "opere" come una fonte a sé** (nuovi record in `dtrek_places` o in una
   tabella `dtrek_place_artworks` con il proprio `source_id` hash, collegati ai musei Dtrek esistenti
   per NOME+comune con un passaggio di matching esplicito — stesso principio già usato da
   `deduplicate.ts` tra fonti diverse, mai un collegamento automatico per ID) — più lavoro, ma non
   dipende dal trovare un `owl:sameAs` che potrebbe non esistere.

## 5septies. Miglioria agli strumenti (2026-09-27) — output troppo grandi da incollare

Il dump `--describe-uri` sul Museo Archeologico di Firenze ha prodotto un output "enorme" (l'utente
non è riuscito a incollarlo per intero) — un dump a 2 salti ripete lo stesso predicato/valore su più
righe quando l'oggetto ha molte proprietà (es. decine di `isCulturalInstituteOrSiteOf`, uno per
opera posseduta). Corretto in `probe.ts`:

- `--describe`/`--describe-uri` ora stampano un formato compatto (`predicato = valore`, URI
  accorciati al nome locale, righe deduplicate raggruppando i salti multipli sotto lo stesso
  predicato/valore di primo livello) invece del JSON grezzo.
- Nuovo `--grep "<termine>"`: filtra le righe (case-insensitive, su predicato o valore) prima di
  stampare — es. `--describe-uri "<uri museo>" --grep sameAs` per cercare un ponte verso l'identità
  nazionale senza incollare l'intero dump.
- Tetto di 60 righe stampate anche senza `--grep`, con avviso esplicito se troncato (mai un output
  silenziosamente incompleto).

28/28 test passano (incluse le nuove funzioni pure `localName`/`formatDescribeBindings`), `tsc`
pulito.

## 5nonies. IL PONTE ESISTE — `owl:sameAs` verificato dal vivo (2026-09-27), conclusione ribaltata

Testato direttamente (rete di questa sessione ancora bloccata verso `dati.cultura.gov.it` —
riverificato con `curl` e WebFetch prima di chiedere all'utente di lanciarlo — quindi eseguito
dall'utente via Termux) sul Museo Archeologico Nazionale di Firenze, source_id nazionale **20310**
(dedotto dal ponte stesso — Firenze non è ancora in Dtrek, Toscana ha 0 record, §5sexies):

```
sameAs uscente dal museo hash  -> http://dati.beniculturali.it/mibact/luoghi/resource/CulturalInstituteOrSite/20310
sameAs entrante nel museo hash -> http://dati.beniculturali.it/mibact/luoghi/resource/CulturalInstituteOrSite/20310
```

**Il ponte `owl:sameAs` tra l'identità nazionale (quella usata da Dtrek) e quella "hash" (quella con
le opere collegate) esiste davvero, in entrambe le direzioni**, per questo museo. La conclusione del
§5sexies ("nessun museo Dtrek può agganciarsi per ID alle opere") era corretta sui FATTI osservati
fino a quel momento (nessuna sovrapposizione diretta di `source_id`) ma prematura sulla CONCLUSIONE:
esiste una via indiretta — nazionale → `owl:sameAs` → hash → `isCulturalInstituteOrSiteOf`/
`hasCulturalInstituteOrSite` — a due salti invece di uno diretto, non un vicolo cieco.

**Verificato anche su Supabase**: `source_id = '20310'` non è tra i musei già importati (coerente
con Toscana assente) — il ponte è stato trovato PRIMA di sapere se il museo fosse in Dtrek,
partendo dall'URI hash e risalendo al nazionale, non il contrario.

Aggiunto `probe.ts --bridge <source_id nazionale>`: dato un `source_id` già in `dtrek_places`, cerca
il ponte `owl:sameAs` verso la famiglia hash e, se lo trova, conta subito le opere collegate
(`loc:isCulturalInstituteOrSiteOf`). **Prossimo test, decisivo per capire se è un caso isolato (solo
i grandi musei statali più noti) o un meccanismo generale**: lanciarlo su musei REALMENTE già in
Dtrek con un source_id nazionale — candidati reali trovati su Supabase (grandi musei statali di
Roma, stessa categoria di rilievo del Museo Archeologico di Firenze):

| Museo | source_id (già in Dtrek) |
|---|---|
| Galleria Borghese | `20405` |
| Musei Capitolini | `105936` |
| Museo nazionale romano – Palazzo Massimo | `20231` |
| Museo nazionale etrusco di Villa Giulia | `20238` |
| Galleria nazionale d'arte moderna e contemporanea | `20772` |

Se il ponte si conferma su questi (musei già presenti in Dtrek, non un'ipotesi come Firenze), la
funzionalità "Opere di questo museo" diventa implementabile per un sottoinsieme reale e già
importato di musei Dtrek — non serve più un matching per nome/comune (§5sexies punto 2), basta il
ponte `owl:sameAs` per i musei che lo hanno.

## 5decies. Ponte confermato su TUTTI e 5 (meccanismo generale) — ma `isCulturalInstituteOrSiteOf` non è quello giusto

Eseguito dal vivo (2026-09-27) sui 5 musei reali del §5nonies:

```
Galleria Borghese (20405) -> 6bad7964748b182f24b5f24cea21dcf8 : 0 opere
Musei Capitolini (105936) -> 44d6521b9eb398ea8eff374000d6886d : 0 opere
Museo naz. romano - Palazzo Massimo (20231) -> 92a671f958f8b52634ecb1651f1ad18f : 0 opere
Museo naz. etrusco di Villa Giulia (20238) -> DBunicoCG20238 : 0 opere
Galleria naz. d'arte moderna (20772) -> DBunicoCG20772 : 0 opere
```

**Buona notizia, confermata su 5/5**: il ponte `owl:sameAs` nazionale→hash **non è un caso isolato
di Firenze** — esiste per ogni museo statale di rilievo testato finora. Non è quindi un meccanismo
raro: è verosimilmente sistematico per i grandi musei statali (tutti già in Dtrek).

**Scoperta collaterale sull'identificatore "hash"**: non è sempre un hash a 32 caratteri esadecimali
— Villa Giulia e Galleria nazionale usano invece `DBunicoCG<stesso id nazionale>` (es.
`DBunicoCG20238`), un formato leggibile che incorpora lo stesso numero già noto. La "famiglia" URI
(`w3id.org/arco/resource/CulturalInstituteOrSite/`) è quindi condivisa da almeno due schemi di
generazione dell'identificatore diversi — irrilevante per il meccanismo (il ponte `owl:sameAs`
funziona comunque), ma da tenere a mente per non assumere un formato fisso.

**Cattiva notizia, altrettanto netta**: `loc:isCulturalInstituteOrSiteOf` (il predicato forward
museo→opera trovato con `--describe-uri` su Firenze, mai confermato prima con una COUNT vera) dà
**0 su tutti e 5** questi grandi musei — il singolo esempio visto su Firenze in un dump parziale
NON generalizza. **Non era il predicato giusto da usare per contare**, o quantomeno non è quello
popolato per la maggioranza dei musei.

**Prossimo test, decisivo**: lo stesso conteggio ma con `loc:hasCulturalInstituteOrSite` in
direzione opera→museo (il predicato ORIGINALE confermato su dati reali fin dal primo probe — combo
AltoAdige, forward su Firenze prima del ponte) — mai ancora verificato con una COUNT su questi 5
musei specifici, solo su un campione generico. Aggiunta `buildWorksCountReverseQuery` (e wired in
`--bridge`/`--museo-opere`, che ora stampano ENTRAMBE le direzioni) per chiuderlo.

## 5undecies. Predicato giusto trovato — ma copertura reale bassissima anche sui grandi musei

Eseguito dal vivo (2026-09-27) con `hasCulturalInstituteOrSite` (direzione opera→museo) sui 5 musei
del §5decies:

```
Galleria Borghese                     : 1 opera
Musei Capitolini                      : 1 opera
Museo naz. romano - Palazzo Massimo   : 0 opere
Museo naz. etrusco di Villa Giulia    : 0 opere
Galleria naz. d'arte moderna          : 0 opere
```

**Predicato confermato definitivamente giusto** (non più 0 su tutti come con `isCulturalInstituteOrSiteOf`)
— ma la copertura reale è **estremamente scarsa anche per i musei statali di primo piano**: la
Galleria Borghese (collezione reale di centinaia di capolavori — Bernini, Caravaggio, Tiziano) ha
esattamente **1** opera collegata in questo grafo. Non è un problema del ponte o del predicato: è
un limite della conversione LOD stessa — il "Catalogo Generale dei Beni Culturali" esposto da
questo endpoint SPARQL sembra avere una copertura pilota/parziale del collegamento
opera↔istituto-di-conservazione, non una rappresentazione completa delle collezioni reali.

**Conclusione pratica, onesta**: la catena tecnica ora FUNZIONA end-to-end (source_id Dtrek → ponte
`owl:sameAs` → URI hash → `hasCulturalInstituteOrSite` → opera reale) — ma il risultato per un
museo importante sarebbe oggi "1 opera" o "0 opere", non una lista utile per un utente. Prima di
investire nella pipeline di import (tabella, UI, integrazione nella Guida Sito) serve capire se
questa scarsità è UNIFORME su tutto il grafo (nessun museo ha una copertura utile) o se esistono
alcuni musei "ben catalogati" con centinaia/migliaia di opere collegate, isolabili e mostrabili
selettivamente. Aggiunta `summarizeExactCis`/estensione di `--coverage` (stampa ora anche i top 10
musei per numero di opere nel campione, non solo le famiglie URI) per rispondere a questo.

## 5duodecies. `--coverage` su campione più ampio (2026-09-27, limit 2000) — concentrazione confermata, ma insufficiente per l'obiettivo

```
 460  8d00851bb176a855d2935df8ac76eec8
 310  07daec82c37b58c5e76bebf2202aced1
 308  62751cb807dfaaabef951084cdbb8534
 300  1ffb7396479e81a82c3659ef4fc03430
 289  ea8cc7832f45fd30b720ae44e41c5d8f
 196  43d07f7aa3c07bf446441d29a5904e75  (Museo Archeologico Nazionale di Firenze, §5quinquies)
 118  98338f8bf3066710602ae0ef97f83c4c
  12  157d0e5464995f9f4a2b1a7f1bc2594e
 ... poi 4, 2, 1
```

**Non è una copertura uniformemente scarsa**: esistono ~8 musei con una copertura reale sostanziosa
(12-460 opere) su un campione di 2000 triple — la Galleria Borghese/Musei Capitolini/Palazzo
Massimo/Villa Giulia/Galleria nazionale del §5decies (1/1/0/0/0 opere) NON sono tra questi, quindi
la scarsità non è casuale: dipende dal singolo museo, non dal meccanismo.

**Ma è comunque insufficiente per l'obiettivo reale**: Dtrek ha **2.296 musei** già importati
(`subtype='museo'`, verificato su Supabase). Anche assumendo che l'intero catalogo ArCo (non solo
questo campione di 2000 triple) porti qualche decina di musei ben catalogati invece di 8, resterebbe
un sottoinsieme minuscolo (nell'ordine dell'1% o meno) — utile al massimo per una manciata di
"musei vetrina", non per arricchire le Guide Sito in modo diffuso come richiesto dal piano §30/§36
(dove "opere" è una sezione prevista per OGNI museo, non per una selezione ristretta).

**Conclusione di questo report**: ArCo/il "Catalogo Generale dei Beni Culturali" via questo endpoint
SPARQL **non è la fonte giusta per arricchire in modo diffuso la sezione "opere" delle Guide Sito
museo** — il meccanismo tecnico (ponte `owl:sameAs` + `hasCulturalInstituteOrSite`) funziona, ma la
copertura reale dei dati non regge l'obiettivo. Non si esclude un uso mirato futuro per i pochi
musei con collezione ben catalogata (identificabili con `--describe-uri`/`--bridge`), ma NON come
soluzione principale. **Vedi `docs/opere-musei-wikidata.md`** per l'alternativa verificata subito
dopo nella stessa sessione — Wikidata (proprietà `P195`/`P276`, già riusabile via l'arricchimento
`wikidata_id` esistente in `scripts/places/wikidata/enrich.ts`, oggi non ancora eseguito sui musei:
0/2296 con `wikidata_id`) dà una copertura reale nettamente migliore per i grandi musei (Galleria
Borghese 240 opere contro 1 su ArCo).

Nessuna pipeline di import/tabella creata in questa PR (coerente con quanto dichiarato dall'inizio):
il lavoro qui resta diagnostica + questo report, propedeutici alla decisione di NON proseguire su
questa fonte per l'obiettivo "opere in ogni Guida Sito museo".

## 5octies. Segnalazione di sicurezza trovata durante la verifica su Supabase (fuori scope, da comunicare)

L'advisory di Supabase per il progetto `sdxlcpxgbkagbxhukehd` segnala **Row Level Security
disabilitata** su due tabelle: `public.nature_cell_cache` e `public.spatial_ref_sys` — esposte in
lettura/scrittura a chiunque abbia la chiave `anon`. Non correlato a "opere"/ArCo, ma da comunicare
esplicitamente all'utente (non auto-applicato: abilitare RLS senza policy bloccherebbe ogni accesso
a quelle tabelle finché non si aggiungono le policy corrette):

```sql
ALTER TABLE "public"."nature_cell_cache" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."spatial_ref_sys" ENABLE ROW LEVEL SECURITY;
```

---

## 6. Perché non si implementa già ora la pipeline di import

Il repository ha una regola esplicita, dimostrata necessaria più volte (coordinate dei CIS,
tipologia via `dc:type`, contatti): un predicato letto dalla sola documentazione/ontologia, per
quanto plausibile, **non va scritto in una query di produzione prima di essere confermato contro
un dato reale**. `hasCulturalInstituteOrSite` è un candidato solido (stesso modulo, stesso stile
delle proprietà già verificate, commento esplicito) ma resta un'ipotesi finché §5.1 non restituisce
un risultato reale. Costruire già ora una tabella e un importer su un predicato non confermato
rischierebbe di ripetere lo stesso errore già corretto due volte per le coordinate dei CIS.
