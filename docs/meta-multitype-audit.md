# Audit: refactoring multi-tipologia (FASE ZERO)

Questo documento è l'audit richiesto da `docs/piano-mete-multitipologia.md` §2 ("FASE ZERO") e dalla
regola #48.1-2 ("Prima leggere il repository. Non modificare codice prima dell'audit."). Nessun file
applicativo è stato toccato nella stesura di questo documento — è puro inventario, con citazioni
`file:line` verificate sul repository reale (branch `claude/save-file-repo-6q7ju2`).

**Sintesi.** Dtrek oggi è un'unica architettura verticale: un solo tipo di entità (`PlannedHike`,
persistita in `planned_hikes`) attraversa l'intera pipeline — pianificazione, Guida AI, Attività
(traccia GPS), Reportage, Diario, offline, sync. Non esiste alcuna nozione di tipologia: ogni
punto della UI e ogni funzione server-side assume implicitamente `Meta = escursione`. La buona
notizia è che gli strati infrastrutturali "bassi" (IndexedDB/outbox in `lib/localStore.ts`, il
motore di sync in `lib/sync/syncEngine.ts` e `lib/sync/pullEngine.ts`) sono già generici per
`entityType`/id e non richiedono modifiche strutturali. La cattiva notizia è che lo strato
"orchestratore" — in particolare `app/guida/GuidaHub.tsx`, `app/api/guide/route.ts` e
`app/api/planned/route.ts` — invoca in modo **incondizionato** una catena di calcoli
escursione-specifici (Trail Score, Safety Score, DTM, profilo terreno, flora, `assessHike`) ogni
volta che una Meta viene aperta o salvata, indipendentemente dal fatto che quella Meta abbia mai
avuto una traccia GPS. Questo — non la UI di visualizzazione, che in alcuni punti è già
difensiva — è il rischio strutturale principale per l'introduzione di Borghi/Città e Siti. Esiste
inoltre un sistema di POI multi-fonte già funzionante (`lib/pois/*`, sorgenti Overpass/PTPR/GNA
(MiC)/Wikidata + dedupe) concettualmente vicino a `dtrek_places`, ma costruito per query live
per-bbox intorno a una traccia, non per un catalogo persistente con identità stabile — riutilizzabile
per i "fetcher" di sorgente, non per il modello dati o la cache.

---

## 1. `PlannedHike`

Definito in `lib/plannedStore.ts:22-149` (interfaccia `PlannedHike`) con `PlannedHikeMeta` derivato
come `Omit<PlannedHike, 'trackPoints'>` (`lib/plannedStore.ts:152`, usato per le liste "leggere").

Campi rilevanti per tipo di dato:
- **Metriche escursionistiche non opzionali nel senso del dominio** (sempre presenti, tipizzate
  `number`, non `number | undefined`): `distanceMeters`, `elevationGain`, `elevationLoss`,
  `altitudeMax`, `altitudeMin`, `estimatedTimeSeconds` (`lib/plannedStore.ts:34-39`).
- **Dati traccia**: `routePolyline?`, `trackPoints?`, `osmId?` (`lib/plannedStore.ts:40-42`).
- **Punteggi cache-only, già opzionali**: `cachedBeautyScore`, `cachedTrailScore`,
  `cachedTrailScoreConfidence`, `cachedSafetyScore`, `cachedTsTotal` (`lib/plannedStore.ts:66-78`).
- **DTM/terreno/flora/area protetta**, tutti opzionali ma calcolati da `trackPoints`/`routePolyline`:
  `dtmProfile`/`dtmTrackHash` (`lib/plannedStore.ts:114-116`), `terrainProfile`
  (`lib/plannedStore.ts:118-120`), `cachedInProtectedArea` (`lib/plannedStore.ts:122-124`),
  `floraResult` (`lib/plannedStore.ts:126-128`).
- **Metadati generici (già type-neutral)**: `title`, `plannedDate`, `userNotes`, `hikeNotes`, `tags`,
  `createdAt`/`updatedAt`, `favorite`, `diaryId`, `firstCompletedAt`, `isSample`/`sampleRegion`
  (`lib/plannedStore.ts:23-33, 94-148`).

Nessun campo `metaType`/`siteType` esiste oggi (confermato: `grep -rn "metaType"` sull'intero
repository non produce risultati applicativi).

**File che importano/usano `PlannedHike`/`PlannedHikeMeta`** (43 file, elenco completo via
`grep -rln "PlannedHike"`): tra i più significativi — `app/api/planned/route.ts`,
`app/api/guide/route.ts`, `app/api/guide/qa/route.ts`, `app/guida/GuidaHub.tsx`,
`app/guida/useDtmProfile.ts`, `app/guida/useSafetyScore.ts`, `app/guida/useTerrainProfile.ts`,
`app/guida/useProtectedAreaCheck.ts`, `app/guida/useDrivingDistance.ts`,
`components/guida/GuideReader.tsx`, `components/libro/GuideGenerationPanel.tsx`,
`components/libro/PercorsoToolsDrawer.tsx`, `components/upload/{ActivityUploader,GpxUploader,
ManualPlanUploader,RouteBuilder,UrlImportUploader}.tsx`, `lib/{plannedFromActivity,plannedIndex,
computeCtsForHike,computeSafetyForHike,recalcScores,navigatorSlot}.ts`,
`lib/offline/{packageManager,packageManifest}.ts`, `lib/routeBuilder/{buildHikeFromCandidate,
importResultItem}.ts`, `utils/{exportGpx,pdfExport/index}.ts`.

**Punti che assumono esplicitamente `Meta = trekking`** (i più gravi, in ordine di impatto):

1. `app/api/planned/route.ts:336-341` — **ogni** `POST /api/planned` (creazione/aggiornamento di
   una Meta) chiama incondizionatamente `assessHike(hike.distanceMeters, hike.elevationGain,
   hike.altitudeMax, activities)` (`lib/hikeAssessment.ts:31-36`, che produce un giudizio
   "facile/moderata/impegnativa/estrema" + `suitabilityScore`). Per un museo con
   `distanceMeters = 0` questo produrrebbe un `assessment` fuorviante, non semplicemente vuoto.
2. `app/guida/GuidaHub.tsx:170-189` — al mount di **qualunque** Meta aperta in `/guida/[id]`
   vengono invocati incondizionatamente `useFlora` (l.170), `useDtmProfile(hike)` (l.177),
   `useTerrainProfile(hike)` (l.178), `useProtectedAreaCheck(hike)` (l.179),
   `useDrivingDistance(hike)` (l.180), `useSafetyScore(hike, setHike)` (l.189), più
   `useCtsRecompute` a l.418. Nessuno di questi hook è gated da una tipologia — sono legati solo
   alla presenza/assenza tecnica di `trackPoints`, non a una scelta di dominio.
3. `lib/computeSafetyForHike.ts:70-71` — `computeSafetyForHike` richiede
   `Pick<PlannedHike, 'id'|'routePolyline'|'distanceMeters'|'elevationGain'|'elevationLoss'|
   'altitudeMax'|'altitudeMin'|'estimatedTimeSeconds'|'plannedDate'|'routeMode'|'dtmProfile'>` —
   tipizzato in modo da richiedere geometria di traccia.
4. `app/api/guide/route.ts:487-520` (funzione `buildGuidePrompt`, vedi §3) interpola
   direttamente `hike.title`, `DISTANZA`, `DISLIVELLO POSITIVO/NEGATIVO`, `QUOTA MASSIMA/MINIMA`,
   `DURATA STIMATA`, punteggi Trail/Safety/Beauty (l.491-508) nel prompt AI — assume sempre una
   traccia GPS.
5. `app/percorsi/page.tsx:230-233` e `app/diari/[id]/page.tsx:407-408` — le card elenco Mete
   renderizzano incondizionatamente `distanceMeters`, `elevationGain`, `altitudeMax`,
   `estimatedTimeSeconds` (vedi §3/§24 del piano — "mai 0 km / 0 m D+ per un museo").

**Implicazioni per fasi successive.** Il piano (§16) chiede di aggiungere `metaType`/`siteType` a
`PlannedHike` senza rinominarlo: è compatibile con la struttura attuale (l'interfaccia è già un
sacco di campi quasi tutti opzionali). Il lavoro vero non è lo schema ma i **call site
incondizionati** elencati sopra (1-4): vanno resi condizionali su `metaType === 'sentiero'` prima
ancora di toccare la UI, altrimenti anche con `metaType` aggiunto il sistema continuerà a calcolare
DTM/Safety/assessment per un borgo.

---

## 2. Tabella `planned_hikes`

Schema base in `supabase-schema.sql:45-67` (colonne fondamentali: `id`, `user_id`, `title`,
`planned_date`, `distance_meters`, `elevation_gain`, `elevation_loss`, `altitude_max`,
`altitude_min`, `estimated_time_seconds`, `route_polyline` JSONB, `track_points` JSONB **NOT NULL
DEFAULT '[]'**, `assessment`, `cached_beauty_score`, `cached_pois`, `cached_poi_wiki`,
`cached_guide`). Nota: `track_points NOT NULL DEFAULT '[]'` è vincolante solo per assenza di dati,
non blocca righe senza traccia — ma ogni riga porta comunque le colonne metriche con default `0`,
non `NULL`.

Da lì la tabella è stata estesa da **37 migration file** distinti sotto `supabase/migrations/`
(elenco completo ottenuto via grep su `ALTER TABLE planned_hikes`), tra cui: DTM
(`add_dtm_columns.sql`), terreno (`add_terrain_columns.sql`), flora (`add_flora_columns.sql`),
area protetta (`add_protected_area_columns.sql`), Trailscore v2 (`add_trailscore_v2_columns.sql`),
Sentinel-2/SI (`add_planned_hikes_si_sentinel2_columns.sql` — 25 colonne satellitari, poi in parte
rimosse da `drop_pai_geologia_sentinel2_dead_code.sql`), route mode (`add_planned_hikes_route_mode.sql`),
Diario (`add_diaries_table.sql:61-62`, `diary_id`+`first_completed_at`), sample/gift route
(`add_gift_route_sample_columns.sql`). Il mapping riga↔oggetto è centralizzato in un solo punto:
`rowToHike()`/`hikeToRow()` in `app/api/planned/route.ts:23-146` — ottimo per l'estensione futura
(un solo posto da aggiornare per `meta_type`/`site_type`), ma oggi ogni funzione assume che tutte
le colonne "hiking" esistano concettualmente su ogni riga.

**API/funzioni server che leggono/scrivono `planned_hikes`:**
- `app/api/planned/route.ts` — GET (lista + singolo + digest per sync), POST (upsert, con
  `assessHike` incondizionato, vedi §1), PATCH (aggiornamento parziale, whitelist esplicita di
  campi a `app/api/planned/route.ts:396-441`), DELETE (cascata via
  `lib/deletePercorsoCascade.ts`).
- `app/api/percorsi/route.ts:36-42` — SELECT cross-diario per la vista "Mete" (§3).
- `app/api/guide/route.ts` — legge la riga per costruire il prompt AI e scrive
  `cached_guide*`/`cached_epoch_pois` (via `updatePlannedMeta`, non direttamente).
- `app/api/percorsi/[id]/reportage/route.ts`, `app/api/trails/conditions/route.ts`,
  `app/api/migrate/route.ts`, `app/api/gift-route/*` — letture/scritture puntuali aggiuntive.
- `lib/deletePercorsoCascade.ts` — cancellazione a cascata (Attività collegate, marker difficoltà).

**Implicazioni.** Aggiungere `meta_type text not null default 'sentiero'` e `site_type text null`
(come da piano §16, §40) è un'operazione a basso rischio sullo schema (pattern `ADD COLUMN IF NOT
EXISTS` già consolidato in questo progetto, vedi i 37 file sopra). Il rischio è tutto a valle: le
funzioni che leggono la riga (in particolare `buildGuidePrompt` e `computeSafetyForHike`) non
controllano oggi nessun flag di tipo prima di usare le colonne metriche.

---

## 3. Route: `/percorsi`, `/api/percorsi`, `/api/planned`, `/api/guide`

### `/percorsi` (`app/percorsi/page.tsx`)
Pagina client "Mete" (rinominata da "Tutti i Percorsi", vedi commento `app/percorsi/page.tsx:14-24`):
fetcha `/api/percorsi`, filtra lato client le sole righe senza Reportage (`reportageCount === 0`,
`app/percorsi/page.tsx:67`), offre ricerca testo + ordinamento per data/km/D+/Trail Score
(`app/percorsi/page.tsx:38-41, 69-85`). Ogni riga della lista renderizza **incondizionatamente**
`distanceMeters`, `elevationGain`, `altitudeMax`, `estimatedTimeSeconds`
(`app/percorsi/page.tsx:230-233`) e, solo se `trailScore != null`, il badge Trail Score
(`app/percorsi/page.tsx:237-239` — quest'ultimo è già difensivo). Non esiste alcun ramo per
tipologia: una Meta Borgo/Città con `distanceMeters = 0` mostrerebbe "0.0 km".

### `/api/percorsi` (`app/api/percorsi/route.ts`)
GET, autenticato. Query `planned_hikes` (id, title, distance_meters, elevation_gain, altitude_max,
estimated_time_seconds, route_polyline, created_at, first_completed_at, diary_id, archived_at,
cached_ts_total, favorite — `app/api/percorsi/route.ts:36-41`), unita a `diaries` (per il titolo
del Diario di appartenenza) e ad `activities.linked_planned_id` (per contare i Reportage collegati,
`reportageCount`, usato per decidere "Meta ancora da camminare" vs "già raccontata",
`app/api/percorsi/route.ts:58-84`). Risposta tipata `AllPercorsiRow`
(`app/api/percorsi/route.ts:7-25`) — nessun campo di tipologia.

### `/api/planned` (`app/api/planned/route.ts`)
Vedi §1/§2 per i dettagli campo-per-campo. Da notare separatamente:
- Gestione trial/entitlement (`resolveDtrekEntitlement`, `app/api/planned/route.ts:279-293`) — logica
  generica (conta "percorsi" contro un tetto), non tipo-specifica, riusabile as-is.
- `hike.assessment = assessHike(...)` sempre eseguito nel POST (vedi §1, punto 1) — **il singolo
  punto più urgente da rendere condizionale**, perché è lato server e scrive dati persistiti.
- Marker di difficoltà GPX (`trail_difficulty_markers`, `app/api/planned/route.ts:349-366`) — solo
  popolati se `hike.difficultyMarkers?.length`, già difensivo, ma concettualmente sensato solo per
  `sentiero`.

### `/api/guide` (`app/api/guide/route.ts`, 1128 righe)
Il sistema più massicciamente hiking-specifico del repository. Persona AI "Giulia, guida
escursionistica italiana" cablata nel system prompt (`SYSTEM_CORE`, `app/api/guide/route.ts:52-91`;
`SYSTEM_VERIFICATO`, `app/api/guide/route.ts:117-150`). La funzione che costruisce il prompt utente
(`app/api/guide/route.ts:487-520`, non esportata con nome proprio ma corpo del builder tra
l.393-521) interpola direttamente e senza alcun controllo di tipo: `hike.title`, `DISTANZA`,
`DISLIVELLO POSITIVO/NEGATIVO`, `QUOTA MASSIMA/MINIMA`, `DURATA STIMATA`, `DIFFICOLTÀ`
(`assessment.difficulty`), punteggi Trail/Safety/Beauty (`scoresBlock`,
`app/api/guide/route.ts:453-460`), POI Wikipedia/OSM (`wikiBlock`/`rawOnly`,
`app/api/guide/route.ts:414-434`). Le sezioni generabili sono definite in modo canonico da
`GUIDE_SECTIONS` (`lib/guideSections.ts`, non incluso qui ma referenziato a
`app/api/guide/route.ts:8-10`) — un elenco fisso pensato per un'escursione ("Il percorso", "Dati e
sicurezza", "Prima di partire", "La natura intorno a te", ecc.), non parametrizzato per
tipologia. GET (`app/api/guide/route.ts:590-615`) espone solo lo stato di accesso AI/trial, non
legge la Meta. POST (`app/api/guide/route.ts:623-636`) è un guscio sottile su `generateGuide`
(`app/api/guide/route.ts:638` in poi) che gestisce auth, chiave AI/entitlement, poi costruisce il
prompt e invoca Claude in streaming.

**Implicazioni.** Il piano (§27) prevede di mantenere `/api/guide` unico aggiungendo `metaType`/
`siteType` al contesto e creando `lib/guideProfiles.ts` per selezionare `SYSTEM_CORE` e la lista
sezioni per tipo. È fattibile senza riscrivere l'endpoint, ma **tutto** il blocco
`app/api/guide/route.ts:393-521` (costruzione prompt) va riscritto per essere profile-aware — non
è un patch isolato, è il cuore del file.

---

## 4. `GuideReader`, `ReportBook`

### `GuideReader` (`components/guida/GuideReader.tsx`, 1137 righe)
Componente client "lettore continuo" della Guida (usato dalla vista estesa, distinta dal libro a
pagine di `GuideBookPage`, vedi §5). Prop principale: `hike: PlannedHike`
(`components/guida/GuideReader.tsx:101`) — riceve l'intero oggetto, non una vista ridotta. Prop
bundle tipizzati esplicitamente per dati escursionistici:
- `ScoresBundle` (`components/guida/GuideReader.tsx:53-70`): `safety: SafetyScore | null`,
  `personalSafety`, `cts: CtsProps` (Trail Score), toggle aspetto/pendenza, `guideNotices`.
- `SafetyDetailsBundle` (`components/guida/GuideReader.tsx:72-80`): `assessment`, `hasGps: boolean`,
  `osmId?`, `polyline?`, `markers: ClassifiedDifficultyMarker[]`.
- `PoiListBundle` (`components/guida/GuideReader.tsx:82-89`): `pois`, `poiWikiEntries`,
  `hasGps: boolean`, coordinate centro.
- `NaturaBundle` (`components/guida/GuideReader.tsx:91-98`): `hasGps: boolean`, `flora?`,
  `trackPoints: TrackPoint[]`, `month`.

Nota positiva: quasi ogni bundle porta già un flag `hasGps: boolean` — il componente è stato
scritto assumendo che una traccia GPS *possa* mancare (caso "percorso trovato" senza file GPX
caricato), quindi il pattern di guardia esiste già a livello di prop, solo non è mai stato
generalizzato a "questa Meta non ha mai una traccia per definizione" (Borgo/Sito).

### `ReportBook` → `ReportBookPage` (`components/libro/ReportBookPage.tsx`, 238 righe)
Non esiste un componente chiamato letteralmente `ReportBook`; l'equivalente concettuale nel codice
è `ReportBookPage.tsx` (pagina di reportage nel "libro" — pattern gemello di `GuideBookPage.tsx`,
vedi commento `components/libro/ReportBookPage.tsx:1-14`). Legge i dati via
`useReportageBookData(activityId)` (`components/libro/ReportBookPage.tsx:17,61`), la cui sorgente è
la tabella `activities` (Attività = traccia GPS registrata), non `planned_hikes` direttamente.
Sezioni fisse sempre presenti: `dati_punteggi`, `andamento` (`ReportBookPage.tsx:30`); sezioni
condizionali: `natura` (se `hasNatura`), `poi` (se `hasLuoghi`), `galleria_foto` (se `hasPhotos`)
(`components/libro/ReportBookPage.tsx:32-40`) — quindi già type-neutral nella struttura, ma le
sezioni "sempre presenti" (`dati_punteggi`, `andamento`) sono intrinsecamente numeriche
escursionistiche (statistiche di cammino, andamento altimetrico).

**Implicazioni.** `GuideReader`/`GuideBookPage`/`ReportBookPage` condividono lo stesso principio di
estrazione (`buildGuideDisplaySections`/`renderGuideWidget` in `lib/guida/guideDisplaySections.tsx`,
e l'equivalente `buildReportDisplaySections`/`renderReportFixedWidget` in
`lib/resoconto/reportDisplaySections.ts`) — un solo punto per sezione/widget, riusato sia dal
lettore continuo sia dal libro a pagine. Questo è esattamente il pattern che il piano vuole
generalizzare (§31): la lista di sezioni "sempre presenti" andrà resa dipendente da `metaType`
invece che hardcoded, ma l'infrastruttura di rendering condizionale (le funzioni `isSectionPresent`
già viste in entrambi i file libro) è già un buon punto di innesto.

---

## 5. Diario

Route: `app/diari/page.tsx` (elenco Diari) e `app/diari/[id]/page.tsx` (Sommario di un Diario).
Modello dati in `components/diario/types.ts`: `DiaryReport`
(`components/diario/types.ts:4-15`) è il tipo centrale — un "Reportage" legato a un'`activity`
(traccia GPS) con `distance_meters`, `total_time_seconds`, `elevation_gain`,
`weather_at_hike`. `BookPage` (`components/diario/types.ts:22-24`) è un'unione tra `{kind:
'report', report: DiaryReport}` e `{kind: 'stub', activity: ActivityMeta}` — **entrambe le varianti
assumono un'`Activity`** (cioè una traccia GPS registrata), non una "visita" generica.

Nel Sommario, ogni riga di percorso ordina per `km`/`dplus`/`cts` (`app/diari/[id]/page.tsx:95-97`)
e renderizza incondizionatamente `distanceMeters`/`elevationGain` in km/m
(`app/diari/[id]/page.tsx:407-408`) più il badge Trail Score se presente
(`app/diari/[id]/page.tsx:422-423`) — stesso pattern esatto di `/percorsi` (§3).

**Implicazioni.** Il piano (§37) vuole un Diario unico che ospiti le tre tipologie con card
"coerenti con la categoria". La struttura dati (`BookPage`, `DiaryReport`) è definita sopra
`activities` — la stessa tabella usata per la registrazione GPS (§9 sotto) — quindi un Reportage
Borgo/Sito senza traccia GPS avrà bisogno di un percorso di creazione diverso da
`ActivityUploader` (che oggi presume sempre un file GPX/TCX/FIT, vedi §9), non solo di una card
diversa in fase di rendering.

---

## 6. `plannedStore`

`lib/plannedStore.ts` (367 righe) — store locale-first per `PlannedHike`, pattern cache-first +
outbox. API pubblica: `getAllPlanned()` (`lib/plannedStore.ts:168-209`), `getPlannedById(id)`
(`lib/plannedStore.ts:212-240`), `savePlanned(hike)` (`lib/plannedStore.ts:262-303` — unico scrittore
che tenta la rete sincrona con retry, perché la pagina successiva ha bisogno subito
dell'`assessment` calcolato server-side), `updatePlannedMeta(id, meta)`
(`lib/plannedStore.ts:306-317` — whitelist esplicita di campi patchabili, tutti opzionali/cache,
elencata alla firma della funzione), `deletePlanned(id)` (`lib/plannedStore.ts:320-326`).

È hike-specifico solo nel senso che opera sul tipo `PlannedHike`/`PlannedHikeMeta` — l'infrastruttura
sottostante (chiavi `LS_KEYS.planned(id)`/`LS_KEYS.plannedList`, entity type `'planned_hike'`
`lib/plannedStore.ts:161`, integrazione con `syncEngine`/`pullEngine`) è generica e non richiede
modifiche: aggiungere `metaType`/`siteType` a `PlannedHike` si propaga automaticamente attraverso
questo store senza toccarne la logica.

Il self-heal logic (`needsRepair` in `getAllPlanned`, `lib/plannedStore.ts:190-193`, e in
`getPlannedById`, `lib/plannedStore.ts:219`) verifica `!h.routePolyline?.length && h.osmId == null`
come segnale di cache corrotta — **questo controllo assume che ogni Meta debba avere
`routePolyline` o `osmId`**: per un Borgo/Sito senza traccia, questa condizione sarebbe sempre vera
e scatenerebbe un refetch di sfondo permanente e inutile a ogni lettura dalla cache.

**Implicazioni.** Basso rischio strutturale (lo store è già generico), ma il controllo di
self-heal citato sopra va reso condizionale su `metaType === 'sentiero'`, altrimenti ogni Meta non
escursionistica genera traffico di rete continuo e superfluo.

---

## 7. IndexedDB / localStorage

Wrapper unico in `lib/localStore.ts` (254 righe): due object store IndexedDB, `kv` (key-value
generico, `lib/localStore.ts:43-45`) e `outbox` (coda di scritture pendenti,
`lib/localStore.ts:46-50`). Nessuno schema per-entità: `kv` è `{key: string, v: unknown, ts:
number}` — completamente agnostico al tipo di dato salvato. Le chiavi tipizzate sono elencate in
`LS_KEYS` (`lib/localStore.ts:236-253`): `plannedList`, `planned(id)`, `activitiesList`,
`activity(id)`, `report(activityId)`, `questionnaire(activityId)`, `userSettings`,
`startPointInfo(hikeId)`, `returnOptions(hikeId)`, `streetViewCoverage(hikeId)`.

Non c'è uso diretto di `localStorage` per dati applicativi in questo modulo (solo IndexedDB) — un
grep più ampio (`localStorage.setItem` fuori da `lib/localStore.ts`) esula da questo audit puntuale
ma non risulta usato per Mete/Percorsi.

**Implicazioni.** Nessuna migrazione di schema IndexedDB necessaria: il KV store accetta già
qualunque forma di oggetto sotto qualunque chiave stringa. Le uniche chiavi con nome
esplicitamente "hike"-shaped (`startPointInfo`, `returnOptions`, `streetViewCoverage`) sono cache
di funzionalità sentiero-specifiche (punto di partenza, opzioni di rientro, copertura Street View)
che semplicemente non verranno mai popolate per un Borgo/Sito — comportamento già sicuro per
omissione, nessun refactor richiesto qui.

---

## 8. Sync engine

`lib/sync/syncEngine.ts` — motore di flush dell'outbox, generico per `entityType`
(`registerEntityFlusher(entityType, handler)`, `lib/sync/syncEngine.ts:52-54`). Backoff esponenziale
per riga (`lib/sync/syncEngine.ts:38-48`), debounce 15s (`lib/sync/syncEngine.ts:79-89`), drain
(`flush()`, `lib/sync/syncEngine.ts:96` in poi) tollerante a fallimenti parziali per entità
(`flushRows`, `lib/sync/syncEngine.ts:63-77`). `plannedStore.ts` vi si registra come una delle
entità (`registerEntityFlusher(ENTITY_TYPE, ...)`, `lib/plannedStore.ts:328-354`, dove
`ENTITY_TYPE = 'planned_hike'`, `lib/plannedStore.ts:161`).

`lib/sync/pullEngine.ts` — controparte per la riconciliazione in pull: `registerListReconciler`
(`lib/sync/pullEngine.ts:55`) è generico su due type parameter (`TMeta`, `TFull`), usato da
`plannedStore.ts:358-366` passando `PlannedHikeMeta`/`PlannedHike` come istanziazione concreta —
nessuna assunzione hike-specifica nel motore stesso.

**Implicazioni.** Nessuna modifica strutturale necessaria: sia `syncEngine` sia `pullEngine` sono
già astratti per entità. Aggiungere un domani un secondo entity type per un ipotetico "place cache
locale" richiederebbe solo una nuova chiamata a `registerEntityFlusher`/`registerListReconciler`,
pattern già consolidato tre volte nel repository (planned, activities via `blobStore.ts`,
user settings via `userSettingsStore.ts`).

---

## 9. Import GPX/TCX/FIT

Parser: `lib/gpxParser.ts` (client, `parseGpx`, `lib/gpxParser.ts:86`), `lib/serverGpxParser.ts`
(lato server), `lib/tcxParser.ts` (`TrackPoint` interfaccia canonica, `lib/tcxParser.ts:1-9`;
`parseTcx`, `lib/tcxParser.ts:92`), `lib/gpxActivityParser.ts`, `lib/gpxSourceFetch.ts` (fetch di
GPX da URL esterni). FIT non ha un parser proprietario nel repo: `app/api/parse-fit/route.ts`
(151 righe) usa la libreria di terze parti `fit-file-parser`
(`app/api/parse-fit/route.ts:6-7`) lato server e normalizza l'output verso lo stesso tipo
`TrackPoint`/`TcxActivity` di `lib/tcxParser.ts` (`app/api/parse-fit/route.ts:3`).

Punti di ingresso UI: `components/upload/{GpxUploader,ActivityUploader,ManualPlanUploader,
UrlImportUploader,RouteBuilder}.tsx` — tutti producono/consumano `PlannedHike` (via `savePlanned`)
o `ActivityMeta`. `ActivityUploader.tsx:173,175` elenca esplicitamente i formati supportati (TCX
per dati completi con FC/calorie, GPX per solo traccia) come parte della UI di caricamento di
un'**Attività** (Reportage), confermando che "registrare un'Attività" oggi significa sempre
"caricare un file di traccia GPS".

**Implicazioni.** Questi parser sono corretti e non vanno toccati (piano regola #4 "Non rompere
Sentieri") — restano l'unico percorso per Sentieri. Per Borghi/Città/Siti (piano §32, §38: "Non
richiedere una traccia GPS per completare... una Meta non escursionistica") serve un percorso di
creazione Attività alternativo che non passi da nessuno di questi parser — non un'estensione dei
parser stessi.

---

## 10. Trail Score, Safety Score

`lib/trailScore.ts` (277 righe): `TrailScoreInputs` (`lib/trailScore.ts:7-23`) — interamente
composto da metriche di traccia (`distanceMeters`, `elevationGain`, `elevationLoss`,
`altitudeMax`, `sacScale?`, `surfaces?`, `avgSlopeDeg?` da DTM) più fattori fisiologici personali
(FC, età). `lib/trailScoreV2.ts` (78 righe) compone Comfort×gate(Sicurezza) in un unico
`cachedTsTotal`. `lib/beautyScore.ts` (262 righe) è l'input "Bellezza" del Trail Score (mai un
punteggio pubblico a sé, per commento esplicito in `lib/plannedStore.ts:70-71`).
`lib/safetyScore.ts` (595 righe): `SafetyScore` (`lib/safetyScore.ts:19-33`) con cinque categorie
(`altitude`, `terrain`, `exposure`, `wildlife`, `logistics`) — concettualmente tutte legate a
percorrere fisicamente un terreno.

**Non sono legati a un motore di ricerca/ranking indicizzato**: sono calcolati per-Meta (mai su un
elenco/indice) e persistiti nelle colonne cache di `planned_hikes` (§2). I punti di calcolo sono
funzioni esplicite e già "opt-in" nel senso che vengono chiamate da hook dedicati, non
automaticamente da ogni fetch:
- `lib/computeTsForHike.ts:16` — `refreshTsForHike(hikeId)`.
- `lib/computeSafetyForHike.ts:32,70` — `computeSafetyCore`/`computeSafetyForHike`.
- Ma questi hook **sono** chiamati incondizionatamente da `GuidaHub.tsx` per ogni Meta aperta (vedi
  §1, punto 2) — quindi "opt-in a livello di funzione" non equivale a "opt-in a livello di
  esperienza utente" oggi.

Uso in UI/ranking: `app/percorsi/page.tsx` (ordinamento `cts`, §3), `app/diari/[id]/page.tsx`
(idem, §5), `components/profilo/SectionComfortTrailScore.tsx`, `app/api/percorsi-per-te` → 
`lib/routeBuilder/generateRecommendations.ts` (usa `computeProvisionalScore`,
`lib/routeBuilder/provisionalScore.ts`, per pre-classificare candidati **prima** che Trail
Score/Safety pieni vengano calcolati — vedi commento esplicito
`lib/routeBuilder/generateRecommendations.ts:22` "nessun punteggio (Trail Score/Sicurezza) viene
calcolato qui").

**Implicazioni.** Il piano (regola #9 "Non mostrare metriche escursionistiche alle categorie non
escursionistiche") è già rispettato lato *display* in più punti (badge Trail Score condizionato a
`!= null`, vedi §3) — il problema non è nascondere il numero, è **evitare di calcolarlo**: oggi gli
hook di `GuidaHub.tsx` lo calcolano comunque per ogni Meta aperta, sprecando chiamate DTM/Overpass
e, peggio, potenzialmente producendo un punteggio "basso" o "N/D rumoroso" per un Borgo che verrebbe
comunque scartato solo alla renderizzazione.

---

## 11. DTM (modello digitale del terreno)

`lib/dtm/` (9 file): `dtmClient.ts` (client per il servizio DTM esterno), `dtmCache.ts` (cache
Supabase, tabella `dtm_cache` — `supabase-schema.sql:752`), `openTopographyClient.ts` (fonte dati
OpenTopography), `slopeAspect.ts`/`graphElevation.ts` (calcoli pendenza/esposizione),
`trailDtmProfile.ts` (tipo `TrailDtmProfile`, usato in `PlannedHike.dtmProfile`,
`lib/plannedStore.ts:114`), `dtmColors.ts` (palette per la visualizzazione).

Punto di ingresso applicativo: `app/guida/useDtmProfile.ts`, chiamato incondizionatamente da
`GuidaHub.tsx:177` per ogni Meta (vedi §1). Il profilo DTM richiede una traccia (`trackPoints`) da
cui campionare i punti — non ha senso per un punto singolo (Borgo/Sito), a meno di adattarlo per
generare un profilo lungo un eventuale itinerario di visita (piano §26).

**Implicazioni.** Modulo di calcolo autosufficiente e riusabile inalterato per Sentieri; per
Borghi/Città con itinerario generato (piano §26) potrebbe eventualmente essere riusato sul
percorso proposto, ma è un'estensione futura, non richiesta dalla prima fase (piano §31: DTM va
reso "condizionale", cioè spento, per Borghi/Siti — non riadattato subito).

---

## 12. Mappe

Due motori mappa coesistono, con ruoli distinti:
- **MapLibre GL** (`components/RouteMap3D.tsx:2-3`) — mappa 3D immersiva a schermo intero, usata
  dentro `GuideBookPage.tsx:46` (import dinamico, no SSR) e da `components/navigation/
  {NavigationMap,NavigationMapLibre,FreeTrackMap}.tsx` per la navigazione live. Consuma
  `TrackPoint[]`, `PoiItem[]` (`components/RouteMap3D.tsx:5,15`).
- **Leaflet** (`components/routehub/BottomGallery.tsx:2-3`, `GalleryMapThumb`) — thumbnail statiche
  leggere nelle liste (usate sia da `/percorsi` sia dal Sommario Diario). Consuma `polyline:
  [number, number][]`.

Entrambi i motori sono generici dal punto di vista tecnico (rendering di punti/linee su tile), ma
**ogni componente che li avvolge oggi è scritto assumendo un tracciato lineare** (polyline +
marker inizio/fine) piuttosto che un punto singolo o un'area (centro storico, perimetro turistico —
piano §7). Nessun componente mappa nel repository accetta oggi una geometria "areale" (poligono)
o un insieme di più tappe non ordinate lungo una linea.

**Implicazioni.** Le librerie sottostanti (MapLibre/Leaflet) non vanno sostituite. Serve un nuovo
componente (o una variante) per il caso "punto singolo + eventuale poligono centro storico +
marker multipli non ordinati", perché `RouteMap3D`/`GalleryMapThumb` sono ottimizzati per
"una traccia continua".

---

## 13. POI — sistema esistente vs. `dtrek_places`

`lib/pois/` (6 file) — il sistema più direttamente sovrapponibile concettualmente al nuovo
`dtrek_places`, ma con un modello e un ciclo di vita opposti a quelli richiesti dal piano.

- **Sorgenti già integrate**: `overpassSource.ts` (`fetchOverpassPois(bbox)`,
  `lib/pois/overpassSource.ts:185` — mappa tag OSM `historic=*`/`natural=*`/`tourism=*`/
  `amenity=*` verso `PoiType`, `lib/pois/overpassSource.ts:72-144`), `ptprSource.ts`
  (`fetchPtprPois(bbox)`, `lib/pois/ptprSource.ts:23` — stessa fonte regionale citata dal piano
  §5), `wikidataSource.ts` (`fetchWikidataPois(bbox)`, `lib/pois/wikidataSource.ts:74`),
  `gnaSource.ts` (`fetchGnaPois(bbox)`, `lib/pois/gnaSource.ts:91` — Geoportale Nazionale per
  l'Archeologia, dati di tipo MiC/archeologico). `dedupe.ts`
  (`deduplicateByProximity(pois, thresholdM=50)`, `lib/pois/dedupe.ts:14`) fa già deduplicazione
  geografica per soglia di distanza — la stessa strategia di base richiesta dal piano §14
  (punto 1-2: coordinate/distanza).
- **Modello dato attuale**: `PoiItem` (`lib/overpass.ts:20-29`) — **`distFromTrack: number` è un
  campo obbligatorio**, cioè ogni POI è definito come "punto vicino a QUESTA traccia", non come
  entità geografica autonoma con identità stabile. Non ha `id` persistente cross-sessione (solo
  `id: number`, l'id OSM/sorgente grezzo), non ha `source`/`source_id` normalizzati, non ha
  `confidence`.
- **Orchestrazione**: `app/api/pois/route.ts` — interroga le 4 fonti **in parallelo e live** per
  ogni richiesta (`Promise.allSettled`, `app/api/pois/route.ts:53-58`), con una cache Supabase
  `poi_cache` **chiave per bounding-box arrotondato** (`normalizeBboxKey`,
  `app/api/pois/route.ts:16-18`), non per identità di luogo — due bbox leggermente diversi
  rifanno tutto il fetch e possono restituire lo stesso POI due volte con id di cache diversi.
  Questo è esattamente il pattern che il piano vieta esplicitamente per il nuovo catalogo (§4 "Non
  interrogare dieci fonti live durante la ricerca dell'utente"; regola #48.7 "Non usare Overpass
  live come motore principale della ricerca").
- **Consumo**: i risultati vengono salvati come `cachedPois`/`cachedPoiWiki` **dentro la singola
  riga `planned_hikes`** (§1-2) — cioè i POI oggi non sono affatto un catalogo indipendente, sono
  un sottoprodotto cache-only di una traccia specifica.

**Implicazioni.** Riutilizzabile: i "fetcher" di sorgente (`overpassSource.ts`, `ptprSource.ts`,
`wikidataSource.ts`, `gnaSource.ts`) codificano già mapping tag→tipologia utili come punto di
partenza per gli importer ETL richiesti dal piano (`scripts/places/osm/`, `/ptpr/`, `/wikidata/`,
§41) — ma vanno **spostati da query live per-bbox a job di importazione batch** con normalizzazione
verso lo schema `dtrek_places`/`dtrek_place_sources` (id/source/source_id/confidence stabili), non
riusati as-is. Il tipo `PoiItem` (con `distFromTrack` obbligatorio) non deve diventare la base di
`dtrek_places`: sono due modelli concettualmente diversi (POI-relativo-a-traccia vs.
luogo-indipendente-con-identità), il piano lo dice esplicitamente al §3 ("Non usare `planned_hikes`
come database generale dei luoghi").

---

## 14. Ricerca / sistemi di ranking

Non esiste un motore di ricerca indicizzato generico: esistono due flussi distinti, entrambi
Sentieri-specifici.

1. **"Percorsi per te"** (raccomandazioni): `app/api/percorsi-per-te/route.ts` (GET, legge/rigenera
   `route_recommendations`, con bootstrap sincrono al primo accesso,
   `app/api/percorsi-per-te/route.ts:35-77`) → `lib/routeBuilder/generateRecommendations.ts`
   (`generateRecommendationsForUser`, l.459; `refreshRecommendationsForUser`, l.532) → candidati
   generati algoritmicamente da `lib/routeBuilder/{osmGraph,loopBuilder,hikingProbability,
   resolvePlace}.ts` (grafo di sentieri OSM, costruzione anelli, probabilità di percorribilità) e
   classificati con `computeProvisionalScore` (`lib/routeBuilder/provisionalScore.ts`) —
   deliberatamente *senza* Trail/Safety Score pieni in questa fase (commento esplicito,
   `lib/routeBuilder/generateRecommendations.ts:22`). `scoreCandidates.ts` fa un secondo passo di
   ranking sui candidati grezzi.
2. **Ricerca "trova un percorso" manuale**: `app/api/route-build/route.ts` (300 righe),
   `app/api/route-search/route.ts` (296 righe) — usati da `components/upload/RouteBuilder.tsx` per
   costruire/ritrovare un percorso da un punto di partenza, sempre via grafo OSM
   (`lib/routeBuilder/osmGraph.ts`).
3. **Trail Confidence / TEI**: `lib/navigation/trailConfidence.ts` — `TrailConfidenceInput`/
   `TrailConfidenceResult`/`computeTrailConfidence` (`lib/navigation/trailConfidence.ts:17-67`),
   consumato da `components/navigation/useTrailConfidence.ts` durante la navigazione live (non
   nella fase di ricerca/scoperta) per stimare quanto affidabile sia il match tra posizione GPS e
   traccia pianificata. `lib/tei/landCoverSurfaceMap.ts` fornisce dati di land-cover per questo
   calcolo.

Non esiste alcuna funzione `searchMeta()`/`searchSentieri()` né un modulo unico "ricerca" — la
"ricerca" oggi è distribuita tra generazione di raccomandazioni (background/cron), costruzione
guidata di un percorso (RouteBuilder) e classificazione affidabilità in tempo reale durante il
cammino (Trail Confidence). Tutti e tre operano esclusivamente su grafi/way OSM di sentieri
pedonali — nessuno di questi produce o consuma un'entità "luogo" generica.

**Implicazioni.** L'astrazione `MetaSearchParams`/`searchMeta()` richiesta dal piano (§17) può
avvolgere il flusso (1)+(2) come implementazione di `searchSentieri()` senza modificarne
l'internals — sono già isolati dietro route API proprie. `searchBorghi()`/`searchSiti()` andranno
scritti da zero contro il nuovo `dtrek_places` (nessun sistema esistente da riusare per questi due
casi, a parte i fetcher POI di §13 come base per il fetch/import, non per la ricerca runtime).
Trail Confidence resta fuori scope (è navigazione live, non ricerca/scoperta) e va lasciato
intatto.

---

## 15. Altri componenti con logica implicitamente hike-based

- **Registrazione Attività**: `app/api/parse-fit/route.ts`, i componenti `components/upload/*`
  (§9) — "registrare un'Attività" oggi *è* "caricare/importare un file di traccia GPS": non esiste
  un percorso "ho visitato questo museo, niente GPS" nel modello attuale. La tabella `activities`
  stessa ha `track_points JSONB NOT NULL DEFAULT '[]'` (`supabase-schema.sql:36`) — tecnicamente
  non blocca un array vuoto, ma ogni schermata che consuma un'Attività (Diario, Reportage) assume
  comunque le colonne metriche (`distance_meters`, `elevation_gain`, ecc.) come significative.
- **Generazione PDF reportage**: `utils/pdfExport/` (6 file: `index.ts`, `map.ts`, `mapTiles.ts`,
  `canvasCharts.ts`, `stats.ts`, `docHelpers.ts`) — `map.ts`/`mapTiles.ts` presuppongono una
  polyline da disegnare, `stats.ts`/`canvasCharts.ts` presuppongono statistiche di cammino
  (andamento altimetrico, velocità). Nessuna delle funzioni qui è tipizzata su `PlannedHike`
  direttamente ma sull'output di `activities`/`planned_hikes`, quindi eredita la stessa
  assunzione.
- **Offline package manager**: `lib/offline/packageManager.ts` + `packageManifest.ts` —
  `OfflinePackageManifest` è chiavata per `hikeId` (`lib/offline/packageManifest.ts:14`) e include
  `hasTrailGraph`/`trailGraphNodeCount`/`hasElevationGraph`/`hasElevationProfile`
  (`lib/offline/packageManifest.ts:37-60`) — il pacchetto offline è esplicitamente concepito come
  "tile mappa + grafo sentieri + profilo altimetrico" per l'uso *durante* un'escursione senza
  segnale. Per un Borgo/Sito (dove l'offline avrebbe più senso come "contenuti guida scaricati",
  non "grafo di vie di fuga") questo manifest andrebbe esteso con un concetto diverso di
  "readiness", non riusato as-is.
- **`lib/routeMode.ts`** (`effectiveHikeMetrics`, usato in `app/api/guide/route.ts:480` e
  `GuideReader.tsx:25`) — calcola distanza/dislivello "effettivi" raddoppiando le cifre per un
  percorso andata-e-ritorno: concetto (`RouteMode: 'round_trip'|'one_way'`) intrinsecamente legato
  a un cammino lineare, non applicabile a una visita di Borgo/Sito.
- **`app/api/migrate/route.ts`** — endpoint di migrazione dati puntuale (nome generico, ma
  riferito a `PlannedHike` nell'import, coerente con l'audit di riferimenti a §1) — da rivedere
  solo se la migrazione `metaType` verrà eseguita come script piuttosto che SQL diretto (piano §39
  non impone un meccanismo specifico).

---

## Implicazioni generali per l'ordine di implementazione (piano §47)

- **BLOCCO A (Foundation)**: aggiungere `metaType`/`siteType` a `PlannedHike` e `planned_hikes` è a
  basso rischio isolato (schema + `rowToHike`/`hikeToRow` in un solo file, §2). Il vero lavoro del
  Blocco A dovrebbe includere fin da subito il gating dei call site incondizionati elencati al §1
  (punti 1-4) — altrimenti il Blocco C (Search) e D (Experience) erediteranno chiamate sprecate o
  fuorvianti per ogni Borgo/Sito aperto.
- **BLOCCO B (Places Engine)**: nessun conflitto con il codice esistente — `dtrek_places` è
  indipendente da `planned_hikes`. I fetcher in `lib/pois/*` sono un buon punto di partenza per gli
  importer ma richiedono di essere riscritti da "live per-bbox" a "batch ETL con id stabile"
  (§13).
- **BLOCCO C (Search)**: `searchSentieri()` può avvolgere `route-search`/`route-build`/
  `generateRecommendations` senza toccarli (§14); `searchBorghi()`/`searchSiti()` sono greenfield.
- **BLOCCO D (Experience)**: il rischio maggiore è qui — `GuidaHub.tsx` (§1 punto 2) è
  l'orchestratore condiviso da ogni tipo di Meta secondo il piano ("il sistema `/api/guide` rimane
  unico", §27), ma oggi è scritto per un solo tipo di esperienza end-to-end (hook DTM/Safety/Flora
  sempre attivi). Va introdotto un gate esplicito per `metaType` a monte di quegli hook, non solo a
  valle nella UI.
- **BLOCCO E/F**: `GuideReader`/`GuideBookPage`/`ReportBookPage` hanno già un pattern di sezioni
  condizionali riusabile (§4); Diario/Offline/Sync (§5, §7, §8) sono strutturalmente pronti o quasi
  (localStore e syncEngine non richiedono modifiche, §7-8); il manifest offline (§15) è l'unico
  pezzo di questo blocco che richiede un ripensamento concettuale, non solo un'estensione.
