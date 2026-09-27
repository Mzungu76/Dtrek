# DTREK
# Piano di implementazione: Mete multi-tipologia + Places Engine

## 0. OBIETTIVO

Evolvere Dtrek dall'attuale modello centrato sui percorsi escursionistici a un sistema di esplorazione multi-tipologia.

Le Mete saranno divise in:

1. SENTIERI
2. BORGHI / CITTÀ
3. SITI

L'utente sceglie esplicitamente la tipologia.

La tipologia scelta modifica:

- ricerca;
- filtri;
- fonti dati;
- risultati;
- scheda Meta;
- Percorso;
- Guida;
- attività;
- Diario;
- Reportage.

Il sistema deve però rimanere un'unica architettura.

---

# 1. PRINCIPIO ARCHITETTURALE

Adottare questa gerarchia:

META
→ cosa voglio esplorare

PERCORSO
→ come voglio esplorarla

GUIDA
→ cosa Dtrek mi racconta durante l'esplorazione

ATTIVITÀ
→ ciò che l'utente ha effettivamente fatto

DIARIO
→ archivio delle esperienze

REPORTAGE
→ racconto finale dell'esperienza

La proprietà fondamentale è:

```ts
type MetaType =
  | 'sentiero'
  | 'borgo_citta'
  | 'sito'
```

Per i Siti:

```ts
type SiteType =
  | 'museo'
  | 'castello'
  | 'abbazia'
  | 'chiesa'
  | 'sito_archeologico'
  | 'monumento'
  | 'palazzo'
  | 'teatro'
  | 'cascata'
  | 'grotta'
  | 'belvedere'
  | 'area_naturale'
  | 'altro'
```

NON creare tre sistemi separati.

---

# 2. FASE ZERO: AUDIT DEL REPOSITORY

Prima di modificare codice:

creare:

`docs/meta-multitype-audit.md`

Analizzare tutto il repository.

Individuare:

- `PlannedHike`;
- `planned_hikes`;
- `/percorsi`;
- `/api/percorsi`;
- `/api/planned`;
- `/api/guide`;
- GuideReader;
- ReportBook;
- Diario;
- plannedStore;
- IndexedDB/localStorage;
- sync;
- import GPX/TCX/FIT;
- Trail Score;
- Safety Score;
- DTM;
- mappe;
- POI;
- ricerca;
- eventuali sistemi di ranking.

Individuare inoltre ogni componente che presume:

`Meta = trekking`

o:

`Percorso = trekking`.

NON modificare ancora il comportamento.

---

# 3. NUOVO MODELLO: PLACE CATALOG

Non usare `planned_hikes` come database generale dei luoghi.

Creare un catalogo geografico indipendente:

## `dtrek_places`

Schema concettuale:

```text
id
name

meta_type
subtype

description

latitude
longitude
geometry

region
province
municipality
municipality_istat_code

address

image_url
official_url
website

opening_hours

source
source_id

confidence

metadata jsonb

created_at
updated_at
last_verified_at
```

Usare PostGIS per `geometry`.

Coordinate:

`EPSG:4326`

---

# 4. FONTI DATI

Il catalogo deve essere costruito da più fonti.

Non interrogare dieci fonti live durante la ricerca dell'utente.

Usare una pipeline ETL:

FONTI
→ DOWNLOAD
→ NORMALIZZAZIONE
→ CLASSIFICAZIONE
→ DEDUPLICAZIONE
→ ENTITY MATCHING
→ SUPABASE

Fonti iniziali:

## 4.1 ISTAT

Utilizzare ISTAT per:

- Comuni;
- località;
- territorio amministrativo;
- coordinate;
- codici ISTAT.

Fonte di riferimento:

ISTAT Basi Territoriali 2021.

Obiettivo:

creare una base geografica stabile per Borghi/Città.

ISTAT NON deve essere interpretato come classificazione ufficiale dei "borghi".

ISTAT definisce entità territoriali.

Dtrek determina successivamente la classificazione turistica.

---

# 5. PTPR LAZIO

Utilizzare il PTPR Lazio come prima fonte specialistica regionale.

Importare almeno:

- Borghi identitari;
- Centri storici;
- Città di fondazione;
- punti archeologici;
- altri layer pertinenti che possano contribuire alle Mete.

I dataset PTPR possono essere disponibili in:

- SHP;
- CSV;
- XLSX;
- WMS.

Gestire le proiezioni correttamente.

Per eventuali dati ED50 / UTM 33N:

`EPSG:23033`

convertire a:

`EPSG:4326`

prima dell'inserimento in PostGIS.

Riutilizzare, quando possibile, gli strumenti già presenti nel repository per l'importazione dei dati PTPR.

---

# 6. CLASSIFICAZIONE BORGHI / CITTÀ

NON assumere:

Comune = Borgo.

Creare una classificazione Dtrek.

Esempio:

```text
place_category = borgo
place_category = citta
```

oppure una struttura equivalente.

Gli attributi possono includere:

```text
historical_center
ptpr_borgo_identitario
city_of_foundation
tourism_designation
```

In futuro potranno essere aggiunti:

- Borghi più belli d'Italia;
- Bandiera Arancione;
- altri riconoscimenti.

Questi devono essere attributi, non la definizione primaria di borgo.

---

# 7. CENTRO STORICO COME ENTITÀ GEOGRAFICA

Questo è importante.

Una città può essere:

```text
Viterbo
```

ma il percorso turistico può riguardare:

```text
Centro storico di Viterbo
```

Pertanto supportare geometrie areali.

Una Meta Borgo/Città può avere:

- punto rappresentativo;
- perimetro amministrativo;
- perimetro centro storico;
- eventuale area turistica.

Non limitare il modello a `latitude + longitude`.

---

# 8. MINISTERO DELLA CULTURA

Usare il dataset MiC:

`Luoghi della cultura`

come fonte primaria per i Siti culturali.

Importare almeno:

- musei;
- aree archeologiche;
- monumenti;
- castelli/fortificazioni quando classificati;
- palazzi;
- chiese;
- abbazie;
- altri luoghi della cultura disponibili.

Il dataset MiC deve essere conservato con:

```text
source = 'mic'
source_id = identificativo originale
```

e con eventuale URL alla fonte.

Preservare il riferimento originale.

Non copiare indiscriminatamente tutto il testo descrittivo se la licenza o la struttura della fonte non lo consentono.

---

# 9. OPENSTREETMAP

Usare OSM come fonte geografica generale.

NON effettuare Overpass live per ogni ricerca utente.

Scaricare gli estratti e importarli nel catalogo.

Per il Lazio usare inizialmente un estratto regionale.

Categorie iniziali:

```text
tourism=museum
tourism=gallery
tourism=attraction

historic=castle
historic=archaeological_site
historic=monument
historic=ruins

natural=waterfall
natural=cave_entrance
natural=peak
natural=viewpoint
natural=spring

amenity=place_of_worship
```

Aggiungere altre categorie solo dopo una verifica della qualità.

Conservare:

```text
source = 'osm'
source_id = osm_id
```

Gestire correttamente attribuzione e requisiti ODbL.

---

# 10. DATASET REGIONALI

Creare l'architettura affinché possano essere aggiunte fonti regionali.

Esempio:

```text
source = 'regione_lazio'
```

La prima implementazione deve supportare Lazio.

Non hardcodare il sistema per il Lazio.

La struttura deve consentire:

```text
regione_lazio
regione_toscana
regione_umbria
...
```

---

# 11. WIKIDATA

Wikidata NON è fonte primaria dell'anagrafe.

Usarla come knowledge layer.

Può fornire:

- identificativi;
- collegamenti Wikipedia;
- periodo storico;
- persone;
- eventi;
- classificazioni;
- immagini;
- relazioni.

Aggiungere eventualmente:

```text
wikidata_id
```

a `dtrek_places`.

NON rendere Wikidata obbligatorio.

---

# 12. PLACE SOURCES

Creare:

## `dtrek_place_sources`

```text
id
place_id

source
source_id
source_url

raw_type

confidence

last_synced_at
```

Questo permette di rappresentare:

```text
Castello X

MiC → ID 123
OSM → way 456
Wikidata → Q789
PTPR → ID 321
```

come una singola Meta Dtrek.

---

# 13. PLACE RELATIONS

Creare:

## `dtrek_place_relations`

Campi:

```text
id
from_place_id
to_place_id
relation_type
metadata
```

Relazioni iniziali:

```text
contains
located_in
part_of
near
associated_with
```

Esempio:

```text
Viterbo
  contains
    Palazzo dei Papi

Viterbo
  contains
    Duomo

Civita di Bagnoregio
  contains
    Porta Santa Maria
```

Questo sistema sarà fondamentale per generare itinerari di visita.

---

# 14. DEDUPLICAZIONE

La stessa attrazione può provenire da:

- MiC;
- OSM;
- Wikidata;
- Regione Lazio.

NON creare quattro Mete.

Creare un sistema di entity matching.

Strategia iniziale:

1. coordinate;
2. distanza geografica;
3. nome normalizzato;
4. Comune;
5. tipologia;
6. identificativi esterni.

Creare un confidence score.

Esempio:

```text
0.98 = match quasi certo
0.85 = match probabile
0.60 = richiede verifica
```

I match incerti NON devono essere automaticamente fusi.

---

# 15. META TYPES CONFIGURATION

Creare:

`lib/metaTypes.ts`

Esempio:

```ts
META_TYPE_CONFIG = {
  sentiero: {
    label: 'Sentieri',
    ...
  },

  borgo_citta: {
    label: 'Borghi / Città',
    ...
  },

  sito: {
    label: 'Siti',
    ...
  }
}
```

Centralizzare:

- label;
- descrizione;
- icona;
- placeholder;
- filtri;
- metriche;
- componenti;
- sezioni guida;
- sezioni reportage.

Evitare di disseminare `if (metaType === ...)` nell'app.

---

# 16. META MODEL

Aggiungere a `PlannedHike`:

```ts
metaType: MetaType
siteType?: SiteType
```

Database:

```sql
meta_type text not null default 'sentiero'
site_type text null
```

Tutte le Mete esistenti diventano automaticamente:

```text
sentiero
```

NON rinominare subito `PlannedHike`.

Il refactoring nominale potrà essere valutato successivamente.

---

# 17. RICERCA GENERALE

Creare un'astrazione:

```ts
MetaSearchParams
MetaSearchResult
```

con:

```ts
searchMeta()
```

che delega a:

```ts
searchSentieri()
searchBorghi()
searchSiti()
```

La UI non deve conoscere i dettagli delle fonti.

---

# 18. RICERCA SENTIERI

Mantenere il sistema attuale.

Conservare:

- distanza;
- dislivello;
- difficoltà;
- durata;
- tipo percorso;
- Trail Score;
- Safety;
- Shade & Water;
- affidabilità;
- natura;
- terreno;
- ecc.

Non alterare il ranking attuale se non necessario.

---

# 19. RICERCA BORGHI / CITTÀ

Nuovo flusso.

Input iniziale:

### Dove?

Regione / provincia / area / distanza.

### Quanto tempo?

```text
30 minuti
1 ora
2 ore
mezza giornata
giornata
```

### Cosa ti interessa?

```text
Storia
Architettura
Arte
Chiese
Archeologia
Panorami
Curiosità
Gastronomia
Artigianato
Fotografia
Famiglie
```

### Tipo esperienza

```text
Essenziale
Completa
Storica
Fotografica
Gastronomica
Personalizzata
```

Il risultato deve essere un elenco di Mete Borgo/Città.

---

# 20. RICERCA SITI

Input:

### Categoria

```text
Musei
Castelli
Abb azie
Chiese
Siti archeologici
Monumenti
Cascate
Grotte
Belvedere
Aree naturali
...
```

### Dove?

### Tempo disponibile?

### Interessi?

### Distanza massima?

Il sistema seleziona le fonti pertinenti.

Esempio:

```text
Castelli
→ MiC + OSM + Regione

Cascate
→ OSM + Regione

Musei
→ MiC + OSM

Siti archeologici
→ MiC + OSM + PTPR
```

---

# 21. NON USARE AI COME MOTORE ANAGRAFICO

Regola fondamentale.

L'AI NON deve decidere quali Mete esistono.

Pipeline:

```text
DATABASE
↓
candidati
↓
ranking deterministico
↓
AI opzionale
↓
spiegazione/personalizzazione
```

L'AI può spiegare perché una Meta è adatta.

Non deve inventare la Meta.

---

# 22. RANKING BORGHI / CITTÀ

Creare inizialmente un ranking deterministico.

Possibili fattori:

```text
historical_center
ptpr_borgo_identitario
numero_poi
densità_poi
interessi_corrispondenti
tempo_visita
distanza
qualità dati
```

NON introdurre subito un "Borgo Score" pubblico.

Prima raccogliere dati e validare l'algoritmo.

---

# 23. RANKING SITI

Fattori:

```text
match categoria
match interessi
distanza
qualità fonte
completezza dati
durata visita
accessibilità
```

Eventuali aperture/orari devono essere utilizzati solo quando verificati.

---

# 24. CARD METE

Rendere la card type-aware.

### Sentiero

```text
distanza
D+
durata
difficoltà
Trail Score
```

### Borgo/Città

```text
tempo consigliato
numero tappe
numero POI
eventuale distanza itinerario
```

### Sito

```text
categoria
durata consigliata
eventuale percorso
eventuale distanza
```

NON mostrare dati senza significato.

Mai:

```text
0 km
0 m D+
```

per un museo.

---

# 25. PERCORSO GENERICO

Non assumere:

```text
Percorso = trekking
```

Il Percorso può essere:

Sentiero:
- anello;
- traversata;
- andata/ritorno.

Borgo/Città:
- itinerario storico;
- tour fotografico;
- tour gastronomico;
- itinerario libero.

Sito:
- visita;
- percorso tematico;
- percorso naturalistico.

Non creare subito una tassonomia enorme.

`metaType` è sufficiente per la prima implementazione.

---

# 26. GENERAZIONE ITINERARI BORGO / CITTÀ

Questa è una funzione fondamentale.

Dati:

```text
Meta
+
POI contenuti
+
tempo disponibile
+
interessi
```

→ Dtrek propone un Percorso.

Esempio:

```text
Calcata
↓
Porta
↓
Piazza
↓
Chiesa
↓
Vicoli
↓
Belvedere
↓
Museo
```

Il percorso deve poter avere:

- ordine;
- coordinate;
- distanza;
- tempo stimato;
- descrizione;
- POI associati.

In futuro il motore potrà usare routing pedonale.

---

# 27. GUIDE ENGINE

Il sistema `/api/guide` rimane unico.

Aggiungere al contesto:

```ts
metaType
siteType
```

Creare:

`lib/guideProfiles.ts`

Profili:

```text
sentiero
borgo_citta
sito
```

---

# 28. GUIDA SENTIERO

Mantenere il comportamento attuale.

Priorità:

- orientamento;
- sicurezza;
- terreno;
- natura;
- punti panoramici;
- POI;
- difficoltà;
- condizioni.

---

# 29. GUIDA BORGO / CITTÀ

La guida diventa narrativa e geografica.

Priorità:

- storia;
- architettura;
- monumenti;
- personaggi;
- curiosità;
- tradizioni;
- arte;
- gastronomia.

Struttura:

```text
Tappa 1
Tappa 2
Tappa 3
...
```

Ogni tappa deve avere:

- luogo;
- posizione;
- contenuto;
- indicazione per proseguire.

---

# 30. GUIDA SITO

Dipendere da `siteType`.

Museo:

- opere;
- sale;
- artisti;
- percorso consigliato;
- cosa non perdere.

**Nota (2026-09-26/27)**: "opere" qui è oggi testo generato da un LLM (`lib/guideProfiles.ts`),
senza alcun dato reale. `docs/arco-opere-musei.md` ha verificato ArCo come fonte — meccanismo
tecnico confermato ma copertura reale insufficiente (~8 musei ben catalogati su 2.296 già in
Dtrek), chiuso negativamente per l'obiettivo di arricchire OGNI Guida Sito museo.
`docs/opere-musei-wikidata.md` verifica l'alternativa Wikidata (`P195`/`P276`), con copertura
nettamente migliore per i grandi musei ma ancora da completare per i musei piccoli/tematici —
diagnostica in `scripts/places/wikidata/opere/probe.ts`, nessuna pipeline di import scritta.

Castello:

- storia;
- architettura;
- personaggi;
- ambienti;
- eventi;
- panorama.

Cascata:

- origine;
- geologia;
- ambiente;
- flora/fauna;
- accesso;
- sicurezza;
- punti panoramici.

---

# 31. GUIDE UI

Mantenere un'interfaccia comune.

Rendere condizionali:

- Trail Score;
- Safety;
- DTM;
- profilo altimetrico;
- terreno;
- flora;
- difficoltà.

Per Borghi/Città:

- tappe;
- storia;
- POI;
- mappa;
- tempo.

Per Siti:

- categoria;
- ambienti;
- contenuti;
- informazioni visita.

---

# 32. ATTIVITÀ

Il concetto di Activity deve diventare generico.

Sentiero:

```text
GPS / GPX / percorso effettuato
```

Borgo/Città:

```text
visita / itinerario
```

Sito:

```text
visita
```

Non richiedere una traccia GPS per completare necessariamente una Meta non escursionistica.

---

# 33. REPORTAGE ENGINE

Il Reportage resta uno solo.

Il template cambia in base a:

```text
metaType
siteType
activity data
```

---

# 34. REPORTAGE SENTIERO

Priorità:

- copertina;
- introduzione;
- mappa;
- percorso;
- tappe;
- fotografie;
- natura;
- dati escursionistici;
- momenti salienti.

Tono:

diario di escursione.

---

# 35. REPORTAGE BORGO / CITTÀ

Priorità:

- copertina;
- apertura narrativa;
- mappa;
- sequenza dei luoghi;
- fotografie;
- dettagli;
- storia;
- curiosità;
- impressioni personali.

Tono:

taccuino di viaggio.

---

# 36. REPORTAGE SITO

Dipendere dal tipo.

Museo:

- opere;
- sale;
- impressioni;
- fotografie.

Castello:

- arrivo;
- storia;
- ambienti;
- dettagli;
- panorama.

Cascata:

- percorso;
- ambiente;
- salto;
- paesaggio;
- esperienza.

Il Reportage deve raccontare ciò che l'utente ha vissuto.

NON deve essere una copia della Guida.

---

# 37. DIARIO

Il Diario rimane unico.

Può contenere:

```text
Sentiero
Borgo/Città
Sito
```

Le card devono mostrare informazioni coerenti con la categoria.

Non creare tre Diari.

---

# 38. OFFLINE / CACHE / SYNC

Aggiornare:

- plannedStore;
- IndexedDB;
- localStorage;
- sync;
- API cache.

Una Meta Borgo/Città o Sito non deve richiedere:

- GPX;
- trackPoints;
- routePolyline;
- Trail Score.

Questi dati diventano opzionali in funzione della categoria.

---

# 39. MIGRAZIONE

Tutte le Mete esistenti:

```text
metaType = sentiero
```

Nessuna perdita di dati.

Verificare:

- Guide;
- Reportage;
- Diario;
- GPX;
- Activity;
- offline;
- sync.

---

# 40. DATABASE INDEXES

Creare indici PostGIS e PostgreSQL adeguati.

Almeno:

```text
GIST(geometry)
INDEX(meta_type)
INDEX(site_type)
INDEX(municipality_istat_code)
INDEX(region)
```

Valutare indici compositi dopo aver analizzato le query reali.

---

# 41. PLACE IMPORT PIPELINE

Creare una struttura:

```text
scripts/places/
```

con:

```text
download/
normalize/
classify/
deduplicate/
import/
```

Possibile struttura:

```text
scripts/places/
├── istat/
├── ptpr/
├── mic/
├── osm/
├── wikidata/
├── normalize.ts
├── deduplicate.ts
└── import.ts
```

Non obbligare ogni fonte ad avere esattamente gli stessi script.

L'importer finale deve produrre dati nel modello comune.

---

# 42. LAZIO COME DATASET PILOTA

Prima implementazione completa:

```text
LAZIO
```

Non tutta Italia.

Motivazione:

- PTPR disponibile;
- borghi identitari;
- centri storici;
- dati territoriali;
- MiC;
- OSM;
- dataset regionali;
- esperienza già presente con PTPR nel progetto.

Il modello però deve essere nazionale.

---

# 43. VERIFICA DELLE FONTI

Per ogni fonte salvare:

```text
source
source_id
source_url
license
last_synced_at
```

Non eliminare l'identità della fonte.

La provenienza dei dati deve essere sempre ricostruibile.

---

# 44. ATTRIBUTION

Prevedere una sezione tecnica per le attribuzioni.

In particolare verificare:

- OSM / ODbL;
- MiC / CC BY-SA 4.0;
- ISTAT;
- PTPR;
- dataset regionali;
- Wikidata.

Non assumere una licenza unica per tutto il catalogo.

La licenza deve essere valutata fonte per fonte.

---

# 45. QUALITÀ DATI

Aggiungere:

```text
confidence
```

e possibilmente:

```text
data_quality
```

Il ranking può penalizzare dati incompleti.

Esempio:

```text
complete
partial
poor
```

Non mostrare necessariamente questo dato all'utente.

---

# 46. FUTURO: PLACE ENRICHMENT

NON implementare nella prima fase, ma lasciare spazio a:

- immagini;
- recensioni;
- eventi;
- orari;
- prezzi;
- accessibilità;
- parcheggi;
- trasporti;
- ristorazione;
- fontane;
- servizi.

Questi saranno enrichment layer.

---

# 47. ORDINE DI IMPLEMENTAZIONE

## BLOCCO A — FOUNDATION

1. Audit.
2. MetaType.
3. SiteType.
4. Migration.
5. Aggiornamento PlannedHike.
6. `metaTypes.ts`.

## BLOCCO B — PLACES ENGINE

7. `dtrek_places`.
8. `dtrek_place_sources`.
9. `dtrek_place_relations`.
10. PostGIS.
11. Import ISTAT.
12. Import PTPR.
13. Import MiC.
14. Import OSM.
15. Normalizzazione.
16. Deduplicazione.
17. Entity matching.

## BLOCCO C — SEARCH

18. MetaSearch.
19. Sentieri.
20. Borghi/Città.
21. Siti.
22. Ranking.
23. Card.

## BLOCCO D — EXPERIENCE

24. Percorso generico.
25. Itinerari Borghi/Città.
26. Visite Siti.
27. Activity.

## BLOCCO E — AI

28. Guide profiles.
29. Guide UI.
30. Reportage profiles.
31. Reportage UI.

## BLOCCO F — PLATFORM

32. Diario.
33. Offline.
34. Sync.
35. Migration/regression.

---

# 48. REGOLE PER CLAUDE CODE

1. Prima leggere il repository.

2. Non modificare codice prima dell'audit.

3. Non creare tre copie dei componenti.

4. Non rompere Sentieri.

5. Non rinominare subito `PlannedHike`.

6. Non usare AI come database.

7. Non usare Overpass live come motore principale della ricerca.

8. Non introdurre nuovi score senza definizione.

9. Non mostrare metriche escursionistiche alle categorie non escursionistiche.

10. Non rendere obbligatorio GPS per Borghi/Città/Siti.

11. Non dedurre `metaType` dalla geometria o dalla presenza di GPX.

12. Ogni nuova fonte deve avere `source` e `source_id`.

13. Ogni modifica al modello dati deve avere migration.

14. Dopo ogni blocco:

```bash
npm run lint
npm run build
```

o i comandi equivalenti già presenti nel progetto.

15. Verificare UI con browser automation.

16. Non cancellare funzionalità esistenti per semplificare l'implementazione.

17. Preferire configurazione centralizzata rispetto a condizioni sparse.

18. Ogni fase deve essere committabile indipendentemente.

---

# 49. CRITERI DI ACCETTAZIONE

## SENTIERO

L'utente può:

- cercare;
- creare Meta;
- aprire Guida;
- percorrere;
- registrare Activity;
- generare Reportage;
- archiviarlo nel Diario.

Il comportamento attuale deve rimanere funzionante.

## BORGO / CITTÀ

L'utente può:

- selezionare Borghi/Città;
- cercare per area;
- filtrare per tempo;
- filtrare per interessi;
- vedere Mete;
- aprire una Meta;
- generare un itinerario;
- aprire una Guida;
- effettuare la visita;
- generare Reportage;
- archiviarlo nel Diario.

## SITO

L'utente può:

- selezionare Siti;
- scegliere categoria;
- cercare per area;
- filtrare;
- vedere risultati;
- aprire una Meta;
- generare/aprire Percorso o visita;
- utilizzare Guida specifica;
- generare Reportage;
- archiviarlo nel Diario.

---

# 50. DEFINIZIONE FINALE DELL'ESPERIENZA

L'esperienza Dtrek deve diventare:

```text
                    METE
                      │
       ┌──────────────┼──────────────┐
       │              │              │
   SENTIERI     BORGHI/CITTÀ       SITI
       │              │              │
   ricerca        ricerca         ricerca
       │              │              │
       └──────────────┼──────────────┘
                      │
                   META
                      │
                  PERCORSO
                      │
                   GUIDA
                      │
                 ESPERIENZA
                      │
                  ATTIVITÀ
                      │
                 REPORTAGE
                      │
                   DIARIO
```

Il principio da mantenere in tutto il codice è:

**una sola piattaforma, tre modi diversi di esplorare.**

Dtrek non deve diventare "un'app di trekking che permette anche di visitare borghi e musei".

Deve diventare una piattaforma in cui il trekking è una delle tre forme native di esplorazione.

---

# 51. AGGIORNAMENTO (2026-09-26): SITI — AUTONOMIA E RAPPORTO CON GLI ITINERARI

Decisione presa in discussione (2026-09-26). Integra e specifica le sezioni 13, 20, 30 sopra, senza sostituirle.

## 51.1 Stato reale ad oggi

Gran parte di questo piano è già implementata:

```text
dtrek_places            → meta_type, subtype (§3)
dtrek_place_sources     → §12
dtrek_place_relations   → part_of / located_in / near / contains / associated_with (§13)
lib/metaTypes.ts        → MetaType, SiteType, SITE_TYPE_CONFIG (§15)
lib/guideProfiles.ts    → profilo sito generico + override per ciascuno dei 12 SiteType (§30)
lib/guideCardVariant.ts → scheda_pratica / galleria_sicurezza
SitoInfoWidget, SitoGalleryWidget, PlaceDescriptionWidget
planned_hikes.place_id  → FK reale verso dtrek_places, GIÀ presente (supabase/migrations/
                          add_planned_hikes_place_link.sql, Blocco D) — non solo un placeId
                          annidato nei metadati come una prima ricognizione aveva letto: il
                          bridge lib/metaToPlannedHike.ts la valorizza già per ogni Meta creata
                          da ricerca, `app/api/planned/route.ts` la legge/scrive già.
```

Il nodo NON ancora risolto (fino a questo aggiornamento): `planned_hikes` non aveva modo di sapere se la Guida di un Sito fosse nata autonoma o dentro la Guida di un Borgo/Città — un sito menzionato in un itinerario e un sito con Guida propria restavano due mondi senza collegamento di *provenienza*, anche condividendo lo stesso `place_id`.

## 51.2 Provenienza della Guida di un Sito — ✅ IMPLEMENTATO (2026-09-26)

Aggiunto a `planned_hikes` (`supabase/migrations/add_planned_hikes_parent_meta.sql`, `lib/plannedStore.ts`, `app/api/planned/route.ts`):

```sql
parent_meta_id text null references planned_hikes(id) on delete set null
```

`text`, non `uuid`: `planned_hikes.id` è `TEXT` (a differenza di `dtrek_places.id`, che è `UUID`) — vedi la `CREATE TABLE` in `supabase-schema.sql`.

`place_id` (già esistente, invariato da questo aggiornamento) collega SEMPRE la Guida al suo record `dtrek_places` — entità unica, mai duplicata: descrizione/foto/orari vivono lì, non copiati nella Guida.

`parent_meta_id` (nuovo):

```text
NULL  → Guida autonoma
<id>  → Guida generata da/annidata nella Guida del Borgo/Città con quell'id
```

Un Sito nasce nested quando la sua Guida viene generata dall'interno della Guida di un Borgo/Città (una tappa promossa a Guida a sé). Resta di proprietà di quella Guida — §51.4 stabilisce dove viene mostrata.

Anche `guideProfileFor` (`lib/guideProfiles.ts`) accetta ora un quarto parametro `isNestedSite` che esclude `sapori`/`consigli` per una Guida nested (§52.5) — cablato in `app/api/guide/route.ts` e `components/guida/GuideReader.tsx` da `!!hike.parentMetaId`.

NON duplicare `dtrek_places` quando la stessa entità è raggiunta sia come menzione interna a un itinerario sia come Guida autonoma: `place_id` resta l'unico punto di verità.

**Aggiornamento (2026-09-26, seconda parte) — ✅ IMPLEMENTATO**: §51.3 (promozione — bottone "Crea Guida di questo Sito" su ogni tappa `archivio` in `BorgoTappeWidget.tsx`, via `lib/useCreateSiteGuideFromStop.ts`/`itineraryStopToNestedSitePlannedHike` in `lib/metaToPlannedHike.ts`), §51.4 (filtro `parentMetaId` nel tab "Siti" di `app/guida/GuidaHub.tsx`, sezione nested in `GuideReader.tsx` via `NestedSiteGuidesWidget.tsx` e `GET /api/planned?parentMetaId=`), §51.6 (cross-link — `fetchRelatedPlaces` in `lib/metaSearch/placeRelations.ts`, esposto da `/api/places/[id]`, mostrato da `RelatedPlacesWidget.tsx`/`ParentGuideLinkWidget.tsx`).

**Ancora da fare**: §51.5 (persistenza della descrizione Wikipedia al momento della promozione — oggi la Guida nested nasce comunque senza descrizione propria in `dtrek_places`, ricade sull'arricchimento live esistente in `/api/places/[id]`, corretto ma non ottimizzato). Il cross-link (§51.6) è costruito ma inerte in pratica: `dtrek_place_relations` non ha ancora righe importate da nessuna fonte, quindi "Vicino a te" resta silenzioso finché quell'importazione non esiste.

## 51.3 Promozione e sganciamento

L'utente, da un punto menzionato nella Guida di un Borgo/Città, può generare la Guida di quel Sito: si crea una riga `planned_hikes` con `metaType='sito'`, `place_id` = il `dtrek_places` del punto, `parent_meta_id` = la Guida del Borgo.

Sganciare una Guida nested per farla diventare autonoma: azzerare `parent_meta_id`. Nessuna migrazione di contenuto — stesso `place_id`, stessa riga.

NON esiste il percorso inverso automatico (autonoma → nested): richiede una scelta esplicita dell'utente su quale Borgo/Città "adotta" quel Sito, mai dedotto da sola vicinanza geografica.

## 51.4 Collocazione UI — ✅ IMPLEMENTATO, aggiornato (2026-09-26, verifica utente)

```text
Elenco generale delle Guide (app/guida/GuidaHub.tsx, app/guida/elenco/page.tsx)
  → NON mostra MAI una Guida con parent_meta_id valorizzato, in nessun filtro/tab,
    "tutte" incluso — solo le Guide costruite direttamente dalla ricerca (parent_meta_id
    NULL) formano l'elenco generale, con o senza filtro per tipologia

Guida di un Borgo/Città
  → sezione interna, EVIDENTE (sfondo/bordo d'accento, non un elenco anonimo), con le
    Guide dei Siti che le appartengono (parent_meta_id = quella Guida) — mai una sezione o
    un elenco visibile a parte: vedi §51.4.2, "Leggi tutto" è l'unico punto di accesso
```

Correzione rispetto alla prima stesura di questa sezione: non basta escludere una Guida nested dal solo tab "Siti" — non deve comparire nell'elenco generale in ALCUN caso, "tutte le Guide" incluso. L'unico modo di raggiungerla resta "Leggi tutto" sulla sua tappa dentro la Guida del Borgo/Città (o un deep link diretto già noto) — mai la ricerca/l'elenco globale.

### 51.4.1 Apertura — overlay, non navigazione (2026-09-27) — ✅ IMPLEMENTATO

Bug osservato con l'apertura via `router.push('/guida/[id]')`: `GuidaHub`/`RouteHub` pescano SEMPRE la Guida da mostrare dallo stesso array filtrato per l'elenco generale (§51.4 sopra) — una Guida nested, esclusa da quell'array, apriva quindi una Guida SBAGLIATA (`displayItems.find(...) ?? displayItems[0]`, fallback sul primo elemento). Corretto una volta (item aperto sempre esente dal filtro), ma il difetto architetturale resta: lista sfogliabile e Guida aperta condividono lo stesso array.

Sostituito con un overlay (mockup comparativo A/B/C, verifica utente 2026-09-27 — opzione B scelta): `components/guida/SiteGuideOverlay.tsx`, montato da `GuideReader.tsx` (stato `openSiteGuideId`, mai una navigazione).

`GuideReader` richiede solo `hike`/`onHikeUpdate`/`enrichmentReady`/`hasAiAccess`/`aiUnavailable`/`trialExpired` per funzionare (verificato sulla sua interface) — CTS/Safety/DTM/distanza in auto sono tutti opzionali e comunque non pertinenti per un Sito. `enrichmentReady` = `hike.metaType !== 'sentiero'` (sempre vero per un Sito appena caricato, stessa formula di `GuidaHub.tsx`), `hasAiAccess`/`aiUnavailable`/`trialExpired` da `useHasAiAccess()` (già cachato per sessione, sicuro da richiamare in un componente in più). Nessuna replica dell'orchestrazione completa di `GuidaHub` (che porterebbe con sé l'intera lista sfogliabile — esattamente ciò che l'overlay evita).

La route `/guida/[id]` resta comunque funzionante per ogni Guida (nested inclusa, deep link diretto) — l'overlay è il percorso preferito da dentro un Borgo, non l'unico.

### 51.4.2 Un solo bottone, creazione invisibile (2026-09-28, verifica utente) — ✅ IMPLEMENTATO

Due iterazioni intermedie di questa sezione (badge "Guida creata" + bottone "Crea Guida di questo Sito" separati; poi un foglio di anteprima consolidato con `StopSourceSheet`) sono state scartate su richiesta esplicita: **"Nessuna altra cosa"**. L'utente non deve mai percepire la differenza tra una tappa già promossa a Guida e una no.

Stato finale: ogni tappa `source: 'archivio'` mostra un solo bottone, **"Leggi tutto"**, sempre uguale (`BorgoTappeWidget.tsx`'s `handleLeggiTutto`):

```text
Tappa già promossa (una Guida con quel placeId esiste in existingSiteGuides)
  → onOpenSiteGuide(id) diretto, apre subito

Tappa non ancora promossa
  → itineraryStopToNestedSitePlannedHike + savePlanned (lib/useCreateSiteGuideFromStop.ts),
    poi onOpenSiteGuide(nuovoId) — stesso identico risultato agli occhi dell'utente, solo con
    uno spinner al posto della chevron mentre salva
```

Nessuna lista "Guide dei Siti di questo Borgo" separata (`NestedSiteGuidesWidget.tsx`, rimosso) — l'elenco delle tappe stesso è l'unica interfaccia, non c'è un secondo posto che riveli quali sono "già create". `existingSiteGuides` (lo stesso fetch `GET /api/planned?parentMetaId=` di prima) resta, ma solo come dato interno per la decisione apri/crea, mai renderizzato come stato visibile.

Una tappa `source: 'wikipedia'` (nessun `dtrek_places.id`, non promuovibile) resta con `StopSourceSheet.tsx` nella sua forma originale — un semplice "leggi di più" senza alcun legame con una Guida, dato che tecnicamente non può averne una.

### 51.4.3 Rifinitura: skeleton di caricamento e Street View (2026-09-29, verifica utente) — ✅ IMPLEMENTATO

Due rifiniture indipendenti, stessa sessione:

- **Caricamento a cascata**: l'apertura di una Guida di Sito mostrava prima uno spinner semplice, poi tutto il contenuto in blocco — nel mezzo, il pannello "Informazioni pratiche" non esisteva affatto finché `placeDetail` non arrivava (appariva di colpo, già completo), e per un `siteType` "ambiguo" poteva perfino cambiare FAMIGLIA di scheda (`scheda_pratica` vs `galleria_sicurezza` dipendono da `hasVisitInfo`, derivato da `placeDetail` — `lib/guideCardVariant.ts`). Aggiunto `SiteGuideSkeleton.tsx` (mostrato da `SiteGuideOverlay.tsx` mentre `hike` carica) e `SitoInfoSkeleton.tsx` (mostrato da `GuideReader.tsx` mentre `placeDetailLoading`, nuovo stato) — stessa forma del contenuto reale, blocchi grigi pulsanti al posto del testo, mai il pannello sbagliato per un istante.
- **Street View**: `SitoInfoWidget.tsx` accetta ora `latitude`/`longitude` — quando presenti insieme all'indirizzo, la cella diventa un link a Google Street View (`maps.google.com/@?api=1&map_action=pano&viewpoint=lat,lon`, l'URL ufficiale documentato, nessuna chiave richiesta) con una piccola icona (`Camera`) accanto al valore a segnalare la funzione.

### 51.4.4 Pin di sezione e conteggio POI (2026-09-30, verifica utente) — ✅ IMPLEMENTATO

Due bug indipendenti segnalati sulla Guida di un Borgo/Città:

- **Il pin "Itinerario" non si accendeva**: `GuideReader.tsx` tracciava la sezione attiva con un `IntersectionObserver` su una banda sottile vicino al bordo superiore dello schermo, evidenziando la sezione più in basso (`Math.max` degli indici) tra quelle che in quel momento intersecavano la banda. Se in un dato istante NESSUNA sezione la intersecava (una sezione breve appena superata — es. "Il borgo" senza ancora testo proprio, solo l'invito "Approfondisci" — e quella successiva non ancora entrata), il pin restava fermo sull'ultima sezione vista invece di aggiornarsi: da qui "Il borgo" restava acceso con "Itinerario consigliato" già visibile sotto. Sostituito con uno scrollspy classico (`components/guida/GuideReader.tsx`, stesso `useEffect`): ad ogni scroll/resize (throttled con `requestAnimationFrame`), l'attiva è l'ultima sezione il cui bordo superiore (`getBoundingClientRect().top`) ha già superato la riga di attivazione sotto la barra sticky — un confronto diretto con la posizione, mai un "buco" possibile perché c'è sempre un'ultima sezione sopra quella riga.
- **Il conteggio "N punti d'interesse" sulla copertina chiusa non corrispondeva alle tappe reali della Guida**: `app/guida/GuidaHub.tsx` calcolava quel numero con una query Overpass indipendente (`/api/pois`, ogni POI nominato nel raggio di 600m dal centro) — una cosa del tutto diversa dalle tappe curate dell'"Itinerario consigliato" mostrate dentro la Guida (`BorgoTappeWidget`, derivate da `borgo-itinerary` con clustering/dedup/limiti per tappa). Le due fonti non potevano che divergere. Sostituito con un conteggio derivato dalla STESSA fonte: `PlannedHikeMeta.borgoWalkStopsHash` (l'elenco degli id delle tappe reali, già persistito alla creazione della Meta e ricalcolato alla prima apertura della Guida — `lib/borgoWalkPolyline.ts`) — `stopsCountFromWalkHash()` in `GuidaHub.tsx` ne conta gli id. Aggiunta la colonna `borgo_walk_stops_hash` a `META_COLS` (`app/api/planned/route.ts`) perché la lista leggera della galleria la portasse con sé. Rimossa la vecchia fetch Overpass in background (e l'import ormai inutilizzato di `haversineM`): nessun rimpiazzo attivo per le Guide più vecchie ancora senza hash, la pillola resta assente finché quella Guida non viene aperta almeno una volta (mai un numero fabbricato, stesso principio già seguito dal codice rimosso).

### 51.4.5 Scrollspy sul pannello vero + lightbox sul mosaico dei Siti "scheda_pratica" (2026-09-30, verifica utente) — ✅ IMPLEMENTATO

Due bug ulteriori, entrambi emersi solo alla verifica del fix precedente:

- **Il pin ancora non si accendeva mai sulla sezione giusta**: lo scrollspy di 51.4.4 ascoltava `scroll` su `window`, ma la Guida non scorre mai la finestra — è montata dentro un pannello proprio con `overflow-y-auto` (`components/routehub/RoutePage.tsx`, la "stage" di dettaglio; anche `SiteGuideOverlay.tsx` ha il proprio `overflow-y-auto`). Un evento `scroll` non fa MAI bubbling fino a `window` da un discendente con overflow (a differenza di quasi ogni altro evento DOM) — solo la fase di cattura lo raggiunge. Il listener quindi non riceveva mai lo scroll reale: il pin restava fermo al valore calcolato una volta sola al mount, mai più aggiornato. Corretto passando `{ capture: true }` a `addEventListener`/`removeEventListener` — intercetta lo scroll di qualunque pannello discendente, a prescindere da quale lo ospiti.
- **Le foto del mosaico in cima a un Sito "scheda_pratica" (es. un museo) non si aprivano al tap**: a differenza di `SitoGalleryWidget.tsx` (usata per un Sito non-scheda_pratica, con un proprio `GuideGalleryLightbox` interno), il mosaico `PhotoMosaic.tsx` mostrato per gli altri casi accetta un `onPhotoClick` opzionale — mai passato da `GuideReader.tsx`, quindi il tap non faceva nulla. Aggiunto un lightbox dedicato: `routePhotos` (prima solo `string[]` di URL) ora conserva l'oggetto `RoutePhoto` completo (url/titolo/credito, la stessa forma già usata da `SitoGalleryWidget`), da cui `routePhotoGalleryItems` costruisce gli item per lo stesso `GuideGalleryLightbox` già in uso altrove nella Guida — un'istanza propria (non condivisa con la Galleria fotografica di fondo pagina, che resta condizionata a `hasGuide`: il mosaico in cima è visibile anche prima).

## 51.5 Cache della descrizione

Il momento in cui una menzione diventa Guida (nested o autonoma, §51.2/51.3) è il punto naturale per persistere in `dtrek_places.description` l'estratto Wikipedia oggi recuperato live a ogni apertura (`lib/wikipedia.ts`, `lib/guideBorgoDetailStops.ts`). NON ricalcolarlo più a ogni lettura una volta che il Sito ha una Guida propria.

## 51.6 Cross-link geografico

`dtrek_place_relations` (§13) esiste già ma non è mai letto lato Guida. Usarlo per un blocco "Fa parte di [Borgo]" (Guida nested) o "Vicino a te" (Guida autonoma) — dati già presenti, nessuna nuova fonte richiesta.

---

# 52. AGGIORNAMENTO (2026-09-26): CONTENUTI DELLA GUIDA SITO

Integra la sezione 30 con lo stato reale e i contenuti ancora da definire.

## 52.1 Dati strutturati (già esistenti)

```text
SitoInfoWidget         → orari, biglietti, indirizzo, telefono, email
                          cascata: dato reale → link ufficiale → Wikipedia, mai inventato
SitoGalleryWidget      → foto (Wikimedia Commons) + avviso di sicurezza per categoria
PlaceDescriptionWidget → riassunto enciclopedico, solo finché l'AI non ha ancora scritto la narrazione
```

Famiglia di scheda decisa da `siteType` + presenza reale di dati di visita (`lib/guideCardVariant.ts`):

```text
scheda_pratica     → musei, palazzi, chiese, castelli/monumenti/siti archeologici con dati reali
galleria_sicurezza → cascata, grotta, belvedere, area_naturale (sempre)
                      + castelli/monumenti/siti archeologici SENZA dati di visita
```

## 52.2 Narrativa AI (già esistente)

`lib/guideProfiles.ts`: profilo `sito` generico + override per ciascuno dei 12 `SiteType` su "Prima di partire"/"Il [tipo]". Sezioni escluse sempre: `dati_sicurezza`, `comfort`. "Natura" disponibile solo per i 4 tipi naturali (`isNaturalSiteType`).

NON creare un secondo scheletro di sezioni: resta `GUIDE_SECTIONS` (`lib/guideSections.ts`).

## 52.3 Gap noti, indipendenti da §51

```text
PhotoMosaic vuoto per un Sito senza traccia GPS
  → nascondere, o alimentare da image_url (docs/piano-guide-eccellenza.md, Fase 2)

Tempo di visita (SITE_TYPE_CONFIG.visitMinutes) mai mostrato nella Guida autonoma
  → oggi usato solo per il budget interno delle tappe di un Borgo
  → promuoverlo a riga visibile in "Prima di partire" quando il Sito è Guida a sé
```

## 52.4 Backlog dipendente da fonti dati non ancora disponibili

```text
prezzo/biglietto reale              → nessuna fonte oggi lo fornisce in modo strutturato
accessibilità (motoria/sensoriale)  → nessuna fonte oggi la fornisce
```

NON inventare questi dati nel frattempo: cella omessa o link, stessa regola generale di `SitoInfoWidget`.

## 52.5 Contenuti nuovi, legati a §51 (`parent_meta_id`)

```text
Guida nested    → richiamo "Fa parte della Guida di [Borgo/Città]" con link (§51.6) — ✅ FATTO
Guida autonoma  → nessun richiamo di provenienza; eventuale blocco "Vicino a te" (§51.6) — ✅ FATTO

Sezioni sapori/consigli:
  Guida nested    → escluse di default (già raccontate a livello del Borgo genitore) — ✅ FATTO
  Guida autonoma  → incluse (nessun genitore che le racconti)                        — ✅ FATTO
```

✅ La distinzione sapori/consigli è implementata: `guideProfileFor` (`lib/guideProfiles.ts`) accetta `isNestedSite` come quarto parametro, condizionato dalla presenza di `parent_meta_id` sul lato chiamante — NON una quarta lista di sezioni parallela, resta un filtro (`NESTED_SITE_EXCLUDED_SECTIONS`) sulle sezioni già esistenti. Test in `lib/__tests__/guideProfiles.test.ts` ("Sito nested (piano §52.5)").

✅ Anche il richiamo di provenienza e il cross-link sono implementati: `ParentGuideLinkWidget.tsx` ("Fa parte della Guida di...") e `RelatedPlacesWidget.tsx` ("Vicino a te", da `placeDetail.relatedPlaces`), montati in `GuideReader.tsx` subito sotto `GuideHero`. `RelatedPlacesWidget` resta silenzioso finché `dtrek_place_relations` non avrà righe reali (nessuna fonte la importa ancora).