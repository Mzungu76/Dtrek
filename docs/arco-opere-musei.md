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

## 6. Perché non si implementa già ora la pipeline di import

Il repository ha una regola esplicita, dimostrata necessaria più volte (coordinate dei CIS,
tipologia via `dc:type`, contatti): un predicato letto dalla sola documentazione/ontologia, per
quanto plausibile, **non va scritto in una query di produzione prima di essere confermato contro
un dato reale**. `hasCulturalInstituteOrSite` è un candidato solido (stesso modulo, stesso stile
delle proprietà già verificate, commento esplicito) ma resta un'ipotesi finché §5.1 non restituisce
un risultato reale. Costruire già ora una tabella e un importer su un predicato non confermato
rischierebbe di ripetere lo stesso errore già corretto due volte per le coordinate dei CIS.
