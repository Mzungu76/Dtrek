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