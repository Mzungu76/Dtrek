# Dtrek Navigation Engine — roadmap a fasi

Compagno di `docs/navigation-engine-analysis.md` (l'analisi del codice
esistente). Questo file traccia lo stato delle 8 fasi descritte nella issue
"DTREK NAVIGATION ENGINE" e cosa serve, concretamente, per completare quelle
non ancora fatte. Ogni fase è pensata per restare testabile/rivedibile da
sola, senza dover aspettare le fasi successive.

## Fase 1 — Native Location Engine — ✅ landed in questa PR

**Architettura a due app** (vedi `docs/navigation-engine-analysis.md` §5):
questo progetto Capacitor è **DTrek Navigator**, un'app separata dall'app
principale DTrek (che resta web/PWA senza wrapper nativo), installabile a
parte da chi vuole la navigazione GPS attiva. AppId `com.dtrek.navigator`,
entry point `app/navigatore/page.tsx` (home a mappa live, pronta a
navigare — l'elenco dei percorsi pianificati è dietro il menu, vedi
"Post-collaudo — Navigator gancio verso l'app madre" più sotto), non il
sito intero.

- `capacitor.config.ts` + `android/` (progetto Capacitor scaffolded via
  `npx cap add android`). Pattern scelto: **`server.url`**, non un bundle
  statico — Dtrek è Next.js server-rendered (API routes, middleware auth),
  quindi la WebView nativa carica l'app remota via HTTPS invece di
  impacchettare `public/` come sito statico. `public/index.html` esiste solo
  come fallback richiesto dal tool di build Capacitor, non è la UI reale.
  `resolveServerUrl()` in `capacitor.config.ts` punta di default a
  `/navigatore` se l'URL passato non ha già un path esplicito.
- Plugin nativo `NativeLocation`
  (`android/app/src/main/java/com/dtrek/navigator/nativelocation/`):
  - `LocationForegroundService.kt` — Foreground Service
    (`foregroundServiceType="location"`) con `FusedLocationProviderClient`,
    notifica persistente onesta ("DTrek sta seguendo la tua posizione"),
    cadenza/priorità per modalità (`LocationMode.kt`, base per la fase 12).
  - Ogni fix viene scritto su disco (`TrackLogWriter.kt`, JSONL) **prima**
    di essere inoltrato al JS — la traccia sopravvive anche se la
    WebView/il processo viene ucciso mentre lo schermo è spento (spec §13).
  - `NativeLocationPlugin.kt` — bridge Capacitor: permessi (two-step
    `location` → `backgroundLocation`, come richiesto da Android 10+),
    start/stop/setMode, `getPendingFixes()` per il "catch-up" dopo una
    sospensione della WebView.
- Lato TS: `lib/native/nativeLocationPlugin.ts` (tipi + `registerPlugin`) e
  `lib/native/locationSource.ts` — la facciata che unifica sorgente nativa e
  fallback web (`AdaptiveGpsTracker`, invariato) dietro un'unica interfaccia
  a eventi `GeoFix`. `NavigationEngine` ora usa `LocationSource` al posto di
  `AdaptiveGpsTracker` direttamente: su web il comportamento è identico a
  prima (stesso tracker sotto), su Android nativo prende automaticamente il
  path a foreground service. Aggiunto anche l'ascolto di
  `visibilitychange` per richiamare `catchUp()` al rientro in foreground.

**Non ancora fatto / prossimi passi concreti:**
- Build reale su un ambiente con Android SDK (questa sessione non ne ha
  uno: `ANDROID_HOME` non impostato) — verificare che `./gradlew
  assembleDebug` compili e che il plugin sia effettivamente registrato a
  runtime su un device/emulatore.
- Impostare `CAPACITOR_SERVER_URL` (dominio Vercel di produzione o staging)
  prima di una build reale — vedi commento in `capacitor.config.ts`.
- Flusso UI per il consenso "always allow" alla posizione in background:
  Google Play richiede una schermata di disclosure dedicata prima della
  richiesta di `ACCESS_BACKGROUND_LOCATION` (non basta il permesso
  runtime) — la issue tecnica di questa fase è pronta
  (`requestBackgroundLocationPermission()` sul plugin), manca la schermata.
- Icone/branding reali per l'app Android (`android/app/src/main/res/mipmap-*`
  sono ancora i placeholder generati da Capacitor).
- **Pubblicazione come app separata**: scheda Play Store dedicata a "DTrek
  Navigator" (nome, descrizione, screenshot, policy sulla posizione in
  background — obbligatoria per Google Review quando si richiede
  `ACCESS_BACKGROUND_LOCATION`), keystore di firma per la build di release,
  e in futuro la stessa cosa su App Store Connect quando si aggiunge iOS.
  Tutti passi manuali, non automatizzabili da qui.
- ✅ Gestito il caso "Navigator installato prima dell'app principale":
  `app/navigatore/page.tsx` mostra sempre un pulsante per aprire l'app
  principale (`lib/native/mainAppLinks.ts`, apre il sito nel browser di
  sistema, non nella WebView di Navigator stesso — le due app restano
  separate), e chi non ha ancora nessun percorso pianificato può comunque
  usare `app/navigatore/traccia` per registrare una traccia GPS libera
  (`lib/navigation/freeTrackSession.ts`), salvata a fine giro come
  attività nel Diario tramite `buildActivityFromTrack` +
  `saveActivityWithEnrichment` — la stessa pipeline già usata per il
  salvataggio a fine navigazione pianificata.
- Per la pubblicazione pratica (account Play Console, build firmata,
  disclosure sulla posizione in background, ecc.) vedi la guida passo-passo
  non tecnica in `docs/guida-pubblicazione-dtrek-navigator.md`, e il
  workflow `.github/workflows/build-navigator-apk.yml` che costruisce
  l'APK di test senza bisogno di Android Studio in locale.

## Fase 2 — Position Engine — ✅ landed e agganciato a NavigationEngine

- `lib/navigation/positionEngine.ts`: quality check (`checkFixQuality`,
  esportata e testabile da sola), rigetto spike basato su velocità implicita
  al netto dell'accuracy combinata dei due fix, un vero filtro di Kalman a
  velocità costante per asse (sostituisce la media mobile ingenua che aveva
  `gpsSmoothing.ts`, rimosso — non più referenziato da nessuna parte), e
  `sample(atMs)` per ottenere una posizione interpolata/estrapolata a
  qualunque timestamp.
- Nessuna dipendenza da moduli legati al trail (nessun import da
  `routeDeviation.ts`/`navigationEngine.ts`) — rispetta il principio "il
  Position Engine non sa nulla del percorso".
- `navigationEngine.ts`'s `handleFix()` ora chiama `this.position.ingest(raw)`
  seguito da `this.position.sample(raw.ts)` a ogni fix: `ingest()` fa passare
  il fix da quality gate/spike rejection/filtro, ma può rigettarlo (torna
  `null`); `sample()` restituisce comunque la miglior stima corrente — se il
  fix è stato rigettato, estrapolata dall'ultimo stato buono — così un
  singolo fix rumoroso degrada a "la posizione non si è mossa molto" invece
  di bloccare l'interfaccia o, peggio, mostrare per un attimo lo spike. Il
  bearing GPS-fallback ora arriva direttamente dalla velocità filtrata del
  Kalman (niente più media circolare separata su una cronologia di bearing
  grezzi).

**Non ancora fatto / prossimi passi concreti:**
- Agganciare `sample()` a un loop `requestAnimationFrame` nel renderer
  mappa (`NavigationMap.tsx`/`NavigationMapLibre.tsx`) per un marker che si
  muove a 60fps anche tra un fix GPS e l'altro, non solo ogni volta che
  arriva un nuovo evento `positionUpdated` (che resta al ritmo dei fix, non
  del rendering) — più naturale da fare insieme alla fase 4 (Map Matching),
  perché è lì che si decide anche cosa disegnare rispetto al trail.
- Non esiste un test runner nel repo (`package.json` non ha `test`/
  `jest`/`vitest`): se si vuole una suite automatica per
  `checkFixQuality`/il filtro di Kalman, va prima scelto e configurato uno
  strumento — non è stato aggiunto qui per non introdurre una dipendenza di
  infrastruttura non richiesta esplicitamente.

## Prerequisito trasversale — Persistenza del trail graph — ✅ landed

Comune a Fase 4 (Map Matching), Fase 6 (Offline Package) e Fase 7 (Escape
Engine): prima di questo lavoro `fetchWalkNetwork` (`lib/routeBuilder/
osmGraph.ts`) girava solo in fase di pianificazione, via rete, e il
risultato non veniva mai conservato — inutilizzabile offline e già perso
nel momento in cui si arrivava davvero a navigare.

- `lib/navigation/trailGraphStore.ts` (nuovo): serializza/persiste in
  IndexedDB il `WalkNetwork` per hikeId (`saveTrailGraph`/`loadTrailGraph`/
  `deleteTrailGraph`), e `fetchAndSaveTrailGraph`/`ensureTrailGraph` per
  scaricarlo da Overpass (stessa fonte della pianificazione) e salvarlo
  — bbox più ampia (~1.1km, `computeBbox` di default) di quella dei tile
  (~300m), perché un'alternativa vicina o una via di fuga sono spesso
  fuori dal tile visibile ma non fuori dal corridoio utile.
- **Sempre best-effort**: sia nel pacchetto offline sia al via della
  navigazione, un fallimento nel recupero del grafo (Overpass lento/giù)
  non blocca né il download dei tile né l'avvio della navigazione — il
  comportamento di oggi (solo il percorso pianificato) resta il fallback
  naturale, non una regressione.
- `lib/offline/packageManager.ts`: `downloadOfflinePackage()` scarica e
  salva anche il trail graph dopo i tile (nuovi campi manifest
  `hasTrailGraph`/`trailGraphNodeCount`, `lib/offline/packageManifest.ts`
  — deliberatamente **non** dentro `isManifestValid()`, che resta legata
  solo ai tile: se il grafo debba diventare un requisito per considerare
  il pacchetto "pronto" è una decisione dell'Offline Readiness Check della
  Fase 6, non presa qui). `deleteOfflinePackage()` elimina anche il grafo.
- `ActiveNavigationView.tsx`: all'avvio di una navigazione (anche senza
  aver scaricato un pacchetto offline) chiama `ensureTrailGraph()` in
  fire-and-forget, così anche una navigazione solo online accumula questo
  dato per le fasi successive.

**Cosa questo NON fa (ancora)**: nessun consumatore usa davvero il grafo
persistito — `RouteTracker`/Map Matching continuano a lavorare solo sulla
polyline pianificata, e non esiste ancora un Escape Engine che lo
interroghi. Questo lavoro è solo l'infrastruttura dati; la logica che la
usa è Fase 4/7.

## Fase 3/5 — Off-Route Engine multi-fattore + stati — ✅ landed

- `NavState` ha ora anche `uncertain` e `wrong_direction` (`types.ts`,
  `stateMachine.ts` — transizioni aggiornate per entrambi).
- `RouteProgress.expectedBearingDeg` (nuovo campo, `routeDeviation.ts`):
  direzione della tangente del segmento più vicino del percorso — la
  "direzione corretta da seguire" richiesta dalla spec, calcolata dalla
  polyline stessa senza dipendere dal trail graph.
- `lib/navigation/offRouteEngine.ts` (nuovo): sostituisce la vecchia soglia
  singola + isteresi a conteggio-fix con un vero motore multi-fattore —
  distanza scontata dall'accuracy GPS, trend della divergenza (crescente vs.
  in rientro) su una finestra di campioni recenti, **isteresi temporale**
  (millisecondi, non conteggio fix — la cadenza dei fix varia con la
  modalità batteria) sia per entrare che per uscire da OFF_ROUTE, e verifica
  di compatibilità direzionale (bearing effettivo vs. `expectedBearingDeg`)
  per `wrong_direction` — valutata solo quando l'aderenza è `on_route`,
  perché "direzione giusta/sbagliata" non ha senso se si è già lontani dal
  percorso. I default (`baseThresholdM=20`, `accuracySlackFactor=1`,
  `uncertainAccuracyThresholdM=30`) riproducono esattamente gli esempi della
  spec (accuracy 5m + distanza 25m + trend crescente + 20s → OFF ROUTE;
  accuracy 35m + distanza 20m → UNCERTAIN).
- `navigationEngine.ts`: `updateRouteDeviation()` ora traduce il verdetto
  del motore in transizioni di stato + eventi (`uncertain`/`certain`,
  `wrongDirection`/`rightDirection`, oltre ai già esistenti
  `offRoute`/`backOnRoute`, riusati anche per `wrong_direction` così la UI
  di navigazione già esistente (banner/haptics/voce) non ha dovuto essere
  riscritta, solo estesa).
- UI: `NavigationMap.tsx`/`NavigationMapLibre.tsx` (nuovi colori marker per
  i due stati), `ActiveNavigationView.tsx` (banner dedicato per
  `wrong_direction`, copy distinto da `off_route`). Lo stato `uncertain`
  resta senza banner dedicato in questa fase — deliberato, per non introdurre
  un avviso allarmante per "non so", solo lo stato è tracciato/disponibile
  per una futura schermata Navigation Health (spec §16).

**Non ancora fatto / prossimi passi concreti:**
- "Prossimo waypoint/bivio" con distanza: `routeInstructions.ts` ha già le
  svolte geometriche, manca l'esposizione esplicita di "prossimo bivio" come
  concetto separato da un'istruzione turn-by-turn generica.
- Il fattore "presenza di percorsi alternativi vicini" della spec è
  deliberatamente fuori scope qui — richiede il trail graph (già persistito,
  vedi sopra) ed è lavoro di Map Matching, Fase 4.
- Non esiste un test runner nel repo — gli esempi numerici della spec sopra
  sono stati usati per calibrare i default a mano, non verificati da una
  suite automatica.

## Fase 4 — Map Matching non invasivo — ✅ landed (v1)

`RouteTracker.update()` continua a rispettare il principio cardine (mai
spostare il fix) — Map Matching aggiunge solo un'interpretazione sopra,
non tocca né il fix mostrato né il verdetto on/off-route dell'Off-Route
Engine.

- `lib/navigation/mapMatcher.ts` (nuovo): `matchToTrailGraph()`, funzione
  pura — dato il trail graph persistito (`lib/navigation/trailGraphStore.ts`)
  e la posizione corrente, trova l'arco del grafo più vicino (proiezione
  punto-segmento, non solo nodo più vicino) e classifica quanto
  quell'informazione è affidabile (`high`/`medium`/`low` in base alla
  distanza). Restituisce `onPlannedRoute: true` senza nemmeno scandire il
  grafo quando la distanza dal percorso è già sotto la soglia usata da
  `offRouteEngine.ts` (20m) — a quel punto non c'è nulla da aggiungere.
- **Deliberatamente eseguito solo quando serve**, non a ogni fix: come
  l'Escape Engine, la scansione (anche con pre-filtro bbox) non è gratis da
  ripetere continuamente. `ActiveNavigationView.tsx` la richiama solo
  quando lo stato è già `off_route`/`wrong_direction` — mentre si è sul
  percorso pianificato non aggiungerebbe informazione.
- Il grafo viene caricato una volta sola in memoria (`trailNetworkRef`)
  quando `ensureTrailGraph()` risolve all'avvio della navigazione, invece
  di rileggerlo da IndexedDB a ogni match.
- UI: quando viene rilevato un sentiero reale mappato vicino alla posizione
  (`alternativeDetected`), il banner off-route/wrong-direction mostra una
  riga informativa in più ("C'è un sentiero conosciuto proprio qui…" /
  "Sentiero noto nelle vicinanze") — distingue "fuori dal piano ma su un
  sentiero vero, probabilmente di proposito" da "fuori dal piano e da
  qualunque sentiero noto", senza mai cambiare il verdetto off-route stesso
  né spostare il marker.

**Non ancora fatto / prossimi passi concreti:**
- Nessuna compatibilità di direzione (bearing) nel matching — l'arco più
  vicino è scelto solo per distanza, non per coerenza con la direzione di
  marcia; su una rete fitta di sentieri paralleli/incrociati potrebbe
  scegliere un arco che in realtà non è quello seguito. `expectedBearingDeg`
  (già calcolato da `RouteTracker` per il percorso pianificato) non esiste
  ancora per un arco qualunque del grafo — richiederebbe calcolare la
  tangente locale dell'arco, non fatto qui.
- Non testato su un grafo reale scaricato in un'area con molte alternative
  ravvicinate (stesso caveat di Fase 7: costanti `MATCH_SEARCH_RADIUS_M=60`
  ragionevoli ma non calibrate su un caso reale outdoor).
- Non esiste un test runner nel repo — nessuna suite automatica per
  `matchToTrailGraph()`.

## Fase 5 — Navigation Events + audio/haptic — embrione esistente

`routeInstructions.ts` + `routeMoments.ts` coprono già buona parte del
"cosa sta arrivando" (svolte, salite, viewpoint, tratti esposti, bivi).
Da fare:
- Tipo evento unificato `{type, distance, direction?, severity?, message,
  geometry?}` che copra anche i casi non ancora modellati esplicitamente
  (fine sentiero, sorgenti/acqua — questi ultimi già esistono come dati in
  `lib/pois`/Shade & Water, ma non come "Navigation Event" con countdown).
- Verificare/centralizzare la deduplica degli avvisi audio/aptici
  (`haptics.ts`/`speech.ts` esistono ma non ho trovato un motore anti-
  ridondanza esplicito che copra tutti i tipi di evento).

## Fase 6 — Offline Navigation Package — ✅ landed (v1)

`lib/offline/packageManager.ts` scarica tile raster e il trail graph
(`hasTrailGraph`/`trailGraphNodeCount` nel manifest, vedi prerequisito
sopra). Elevazione, POI e istruzioni di navigazione sono funzioni pure di
dati già presenti sul `PlannedHike` cache-ato (nessuna nuova chiamata di
rete) — quello che mancava non era andarli a scaricare, ma **verificare e
registrare che i dati sorgente ci siano davvero** prima di perdere
connessione, invece di scoprirlo a metà escursione.

- `packageManifest.ts`: nuovi campi `hasElevationProfile`/
  `elevationProfilePointCount`, `hasPois`/`poiCount`,
  `hasNavInstructions`/`navInstructionCount`/`navMomentCount` — calcolati
  e salvati da `downloadOfflinePackage()` (ora accetta anche
  `trackPoints`/`cachedPois` dell'hike) solo a pacchetto completo, stesso
  punto in cui oggi si prova a recuperare il trail graph. Tutti opzionali
  e `undefined` su un manifest salvato prima di questo campo — letti come
  "sconosciuto", mai come "corrotto".
- `lib/offline/offlineReadiness.ts` (nuovo): il vero **Offline Readiness
  Check**. Distingue esplicitamente un unico requisito rigido — le tile
  (`tilesReady`, ancora `isManifestValid()` di `packageManifest.ts`: senza
  mappa non c'è nulla da disegnare offline) — da una lista di pezzi che
  *degradano* l'esperienza ma non bloccano la navigazione (trail graph,
  profilo altimetrico, POI, istruzioni): `ready` resta legato solo alle
  tile, `degradedMissing: string[]` elenca il resto. La decisione "il
  trail graph deve diventare un requisito rigido?" (lasciata aperta nelle
  fasi precedenti) è quindi presa qui, esplicitamente: no, resta
  degradabile, come gli altri pezzi non critici.
- UI: `ActiveNavigationView.tsx` mostra ora un banner distinto ("Dati
  offline incompleti per questo percorso — Non disponibili: …") quando si
  è offline e mancano pezzi non critici, separato dall'avviso esistente
  per le tile mancanti (quello resta un caso più severo, non sostituito).

**Non ancora fatto / prossimi passi concreti:**
- "Escape data" (fase 7) non ha un campo di readiness dedicato — la sua
  unica dipendenza dati è il trail graph già tracciato
  (`hasTrailGraph`/`trailGraphNodeCount`); i POI sicuri usati
  dall'Escape Engine sono già coperti da `hasPois`/`poiCount`.
- Nessun controllo sulla *qualità* dei dati, solo sulla presenza (es. un
  profilo altimetrico con 2 soli punti risulta "presente" anche se poco
  utile) — soglie più severe sono possibili ma non aggiunte qui per non
  inventare limiti arbitrari senza un caso reale che li richieda.
- Non testato su un pacchetto scaricato con dati realmente incompleti (es.
  guida generata senza POI) — solo verificato a livello di tipi/logica.

## Fase 7 — Escape Engine — ✅ landed (v1, senza dislivello)

- `lib/navigation/escapeEngine.ts` (nuovo): `computeEscapeOptions()`,
  funzione pura chiamata **on-demand** (non a ogni fix — è una ricerca nel
  grafo, non gratis da ripetere ogni secondo), che restituisce fino a 4
  `EscapeOption` nell'ordine dell'esempio della issue:
  1. **Torna sul percorso** — non serve il trail graph, usa direttamente
     `RouteProgress.nearestPointLat/Lon`/`distanceToRouteM` già calcolati da
     `RouteTracker`.
  2. **Raggiungi trail alternativo** — Dijkstra semplice (O(n²), accettabile:
     gira una volta per tap utente su un grafo di poche centinaia/migliaia
     di nodi, non per fix) da `nearestGraphNode` sulla posizione corrente,
     filtrando i nodi raggiunti troppo vicini al percorso pianificato
     (`minDistToTrack`, non sono "alternative" vere) e preferendo tag
     `highway` di qualità migliore (`track`/`footway` > `path`/`bridleway`/
     `steps`).
  3. **Raggiungi strada** — stessa ricerca, filtrando per `highway`
     `unclassified`/`residential`.
  4. **POI sicuro** — il rifugio/bivacco/riparo (`PoiType` da
     `lib/overpass.ts`) più vicino tra quelli già noti all'hike, in linea
     d'aria (nessuna ricerca nel grafo per i POI). Richiede che `NavPoi`
     porti il campo `type` (aggiunto — `types.ts` + il mapping in
     `ActiveNavigationView.tsx` che prima lo scartava).
  Ogni opzione ha sempre un campo `reason` esplicito (spec: "l'utente deve
  sempre sapere perché viene proposta") e una `safety` (`alta`/`media`/
  `bassa`) stimata da distanza + qualità del tag OSM — **non** da un vero
  calcolo di dislivello.
- **Perché niente dislivello** (il fattore "dislivello" della spec):
  `GraphNode`/`GraphEdge` non portano quota, e l'unica pipeline di
  elevazione esistente (`lib/dtm/`) richiede una chiamata di rete verso un
  servizio esterno **rate-limited a 50 chiamate/24h** — inaccettabile da
  spendere per una decisione live in navigazione. La sicurezza qui è quindi
  un proxy più grezzo (lunghezza + tipo di superficie), non un vero
  trailConfidence/sicurezza per segmento come originariamente ipotizzato.
  Se in futuro serve, l'opzione più realistica è cache-are l'elevazione dei
  nodi del grafo *una volta* al momento del download del pacchetto offline
  (Fase 6), non calcolarla al volo.
- UI: `components/navigation/EscapeOptionsSheet.tsx` (nuovo) — lista
  ordinata con distanza, badge di sicurezza, motivazione testuale e freccia
  di direzione; instradato da un pulsante "Vie d'uscita" dentro il banner
  off_route/wrong_direction già esistente in `ActiveNavigationView.tsx`
  (nessuna nuova UI persistente, solo quando il percorso è già segnalato
  come perso/sbagliato).

**Non ancora fatto / prossimi passi concreti:**
- Nessun vero `trailConfidence` per segmento (§6 della spec) — oggi la
  qualità di un'alternativa è solo il tag `highway`. Costruire un vero
  trailConfidence (da `lib/trailScore.ts` + dati di connettività) è lavoro
  a parte, non fatto qui.
- Il pulsante "Vie d'uscita" compare solo per `off_route`/`wrong_direction`,
  non per `uncertain` — coerente con la scelta di non allarmare per una
  semplice incertezza GPS, ma da rivedere se in pratica risulta troppo
  restrittivo.
- Non testato su un grafo reale scaricato in un'area montana ampia — le
  costanti (`MAX_SEARCH_RADIUS_M=2000`, `MAX_VISITED_NODES=600`) sono stime
  ragionevoli, non calibrate su un caso reale.

## Prerequisito trasversale — Simulazione (GPS Replay/Scenario Injection) — ✅ landed

Non è una delle 8 fasi della issue originale, ma un requisito trasversale
chiesto a parte: ogni componente del Navigation Engine deve essere
testabile senza GPS reale, e nessuna logica di navigazione deve dipendere
direttamente dalle API Android/browser. Il secondo punto era già vero
(`NavigationEngine` parla solo con `LocationSource`, mai con Capacitor o
`navigator.geolocation` direttamente — commento "pure, mockable,
replayable" presente fin dalla Fase 1); questo lavoro lo rende sfruttabile:

- `lib/native/locationSource.ts`: estratta l'interfaccia `LocationProvider`
  (`start`/`stop`/`setMode`/`catchUp`) che `LocationSource` implementa —
  prima era solo implicita. `NavigationEngineOptions.locationProviderFactory`
  (nuovo, opzionale) permette di iniettare un provider diverso al posto
  del vero `LocationSource`; di default resta quello reale, quindi nessun
  cambiamento di comportamento quando non lo si usa.
- `lib/navigation/simulation/simulationLocationProvider.ts`: un
  `LocationProvider` che riproduce una sequenza di `GeoFix` su un timer
  invece di leggere il GPS — **rispetta i timestamp dei fix** (non li
  consegna tutti insieme), perché la logica dell'Off-Route Engine e del
  watchdog GPS-lost è basata sul tempo reale, non su un elenco statico.
- `lib/navigation/simulation/gpxReplay.ts`: riusa
  `lib/gpxActivityParser.ts` (già usato dall'import `/upload`) per
  trasformare una traccia GPX registrata in una sequenza di fix — cammini
  reali già fatti, da poter rigiocare.
- `lib/navigation/simulation/scenarioBuilder.ts`: primitive componibili —
  `walkAlongRoute` (cammino pulito lungo un percorso pianificato, la
  base), `injectDeviation`, `injectPoorAccuracy`, `injectGpsLoss`,
  `injectSpike` — per costruire scenari sintetici senza bisogno di una
  traccia reale per ogni caso limite.
- `lib/navigation/simulation/presetScenarios.ts`: scenari pronti
  (`clean`, `off_route`, `wrong_direction`, `uncertain`, `gps_lost`,
  `spike`) costruiti sulle primitive sopra, usabili senza scrivere codice.
- **Uso**: `app/guida/[id]/naviga?simulate=off_route` (o un altro nome da
  `SCENARIO_NAMES`) fa partire la navigazione con quello scenario al
  posto del GPS vero — l'intera UI (mappa, banner off-route, Escape
  Engine, pace assistant) reagisce dal vivo. Un banner viola fisso
  "SIMULAZIONE" resta visibile per tutta la sessione simulata, così non è
  mai confondibile con una posizione reale (stesso principio di "non
  falsificare la posizione" della spec, esteso a "non far sembrare reale
  una posizione finta").

**Deliberatamente fuori scope qui** (chiesto esplicitamente all'utente
prima di partire, per non introdurre una dipendenza non richiesta): nessun
test runner automatico (Vitest/Jest) e nessuna suite di test aggiunta — la
libreria di simulazione è pronta per diventarne la base quando/se si deciderà
di aggiungerne uno, ma oggi è uno strumento interattivo, non automatizzato.

## Fase 8 — Battery-aware — ✅ landed (v1, decisore); test reali outdoor ancora da fare

`LocationMode` (nativo) già definiva le 4 modalità con cadenza/priorità
diverse, e `NavigationEngine.setLocationMode()` già le esponeva lato JS —
mancava solo la logica che *decide* quando cambiare modalità.

- `lib/navigation/locationModeDecider.ts` (nuovo): `decideLocationMode()`,
  funzione pura — dato stato di navigazione, velocità istantanea, accuracy
  GPS, distanza dalla prossima istruzione e livello batteria, sceglie la
  modalità che serve, in ordine di priorità: `off_route`/`wrong_direction`
  → `emergency` (fix più affidabili per risolvere la situazione, subito,
  senza isteresi — spec: "durante Navigation/Emergency privilegiare
  affidabilità"); vicino a un bivio (<100m) o velocità sopra il passo da
  escursione (>2.5 m/s, corsa/bici) o accuracy scarsa (>30m) → `navigation`;
  batteria sotto il 30% e non in carica, nient'altro di urgente →
  `battery_save`; altrimenti `trekking`. `LocationModeDecider` (classe)
  aggiunge isteresi a tempo (8s, stesso pattern di
  `offRouteEngine.ts`) così un segnale al limite della soglia non fa
  accendere/spegnere continuamente la richiesta GPS nativa.
- `lib/navigation/battery.ts`: nuovo `watchBatteryLevel()`, feed continuo
  di livello/carica (non solo l'avviso soglia-bassa one-shot di
  `watchBattery`, che ora è riscritto sopra di esso senza duplicare la
  logica di connessione alla Battery Status API) — la soglia proattiva del
  decisore (30%) è deliberatamente più conservativa di quella reattiva
  dell'avviso esistente (15%, "già critico").
- `ActiveNavigationView.tsx`: il decisore viene aggiornato a ogni fix
  (stato, velocità, accuracy, distanza dalla prossima istruzione, livello
  batteria) e `engine.setLocationMode()` viene chiamato solo quando
  `LocationModeDecider.update()` restituisce davvero una nuova modalità.

**Non ancora fatto / prossimi passi concreti:**
- Nessun input "criticità del tratto" (es. tratto esposto/pericoloso da
  `lib/pois`/`safetyScore.ts`) nel decisore — i segnali usati sono solo
  quelli osservabili in tempo reale (velocità, GPS, batteria, prossimità
  bivio), non una caratteristica statica del percorso.
- Le soglie (`FAST_SPEED_MS=2.5`, `NEAR_INSTRUCTION_M=100`,
  `POOR_ACCURACY_M=30`, `LOW_BATTERY_FOR_DOWNSHIFT=0.30`,
  `MODE_CHANGE_DWELL_MS=8000`) sono stime ragionevoli, non calibrate su un
  caso reale — stesso caveat delle costanti dell'Off-Route Engine e
  dell'Escape Engine.
- Test su device reale outdoor (copertura GPS scarsa, sottobosco, schermo
  spento per ore, consumo batteria reale su un'intera giornata di
  escursione) — non eseguibile in questo ambiente (nessun Android SDK/
  emulatore disponibile: `ANDROID_HOME` non impostato). Resta l'unico
  pezzo della Fase 8 (e dell'intera roadmap) che richiede davvero un
  device fisico all'aperto, non solo una build CI verificata.

## Post-collaudo — mappa reale nell'app Navigator — ✅ landed

Non una delle 8 fasi della issue, ma un problema segnalato dall'utente dopo
il primo collaudo reale su device: le tile OSM/Leaflet vere (quelle
visibili durante la navigazione, `NavigationMap.tsx`) non comparivano né
nell'elenco dei percorsi pianificati (`app/navigatore/page.tsx`) né nella
registrazione di un percorso senza pianificazione
(`app/navigatore/traccia/page.tsx`) — entrambe le schermate usavano solo
`RouteThumb.tsx`, una linea SVG auto-adattata senza nessun dato di mappa
sotto.

- **Che mappa usa il navigatore vero** (`NavigationMap.tsx`): tile raster
  stile CartoDB "Voyager" (dati OSM, nessuna chiave richiesta), proxati
  server-side da `app/api/tile/route.ts` — lo stesso endpoint supporta già
  anche `dark`/`positron`/OSM standard (`light`), solo non collegati a un
  selettore in Navigation. `NavigationMapLibre.tsx` (mappa "online",
  soddisfatta solo con connessione) offre in più stili vettoriali/3D/
  satellite via MapTiler, ma non fa parte del pacchetto offline.
- `lib/webMercator.ts` (nuovo): la stessa matematica Web Mercator a tile
  256px che una libreria come Leaflet farebbe internamente, scritta a
  mano — necessaria per allineare esattamente tile reali e polyline
  disegnata senza montare una mappa interattiva completa per ogni card di
  un elenco (potenzialmente lungo).
- `components/MapRouteThumb.tsx` (nuovo): sostituisce `RouteThumb` nelle
  card dell'elenco pianificate — mosaico delle sole tile necessarie
  (poche immagini `<img>` posizionate via `lib/webMercator.ts`, non una
  mappa Leaflet viva) più il tracciato disegnato sopra nello stesso spazio
  pixel, quindi perfettamente allineato alla mappa reale sotto. Usa lo
  stesso `/api/tile?...&style=voyager` del navigatore vero.
- `components/navigation/FreeTrackMap.tsx` (nuovo): mappa Leaflet vera e
  interattiva per la registrazione senza pianificazione — stesso tile
  layer, stesso stile di marker/cerchio di accuratezza/pulsante ricentra
  di `NavigationMap.tsx`, disegna il tracciato percorso finora (che cresce
  man mano) al posto di un percorso pianificato fisso. `app/navigatore/
  traccia/page.tsx` ora è a schermo intero durante la registrazione
  (prima era un riquadro fisso di 220px dentro una pagina con scroll),
  stessa struttura di `ActiveNavigationView.tsx`.

**Non ancora fatto / prossimi passi concreti:**
- Nessun selettore di stile mappa (`dark`/`positron`/OSM standard) esposto
  in nessuna delle due schermate — usano sempre `voyager`, come
  `NavigationMap.tsx`.
- `MapRouteThumb` non è stato provato con un numero molto grande di card
  contemporaneamente a schermo (molte richieste `/api/tile` in parallelo)
  — il proxy le cache-a per 24h (`Cache-Control` in `app/api/tile/
  route.ts`), ma non è stato misurato l'impatto su una lista con decine di
  percorsi.

## Post-collaudo — sentieri vicini stile CalTopo — ✅ landed (fix + estensione)

L'utente ha segnalato di apprezzare, in CalTopo, i sentieri vicini sempre
visibili con etichetta di distanza (rassicurante, e utile come possibile
via di fuga/alternativa). Verificando il codice, la feature esisteva già
(`useNearbyTrails` + il layer tratteggiato in `NavigationMap.tsx`) ma
**non è mai comparsa davvero**: era disegnata dentro l'effetto React che
crea la mappa una volta sola al mount (`useEffect(..., [])`), che quindi
chiudeva su `nearbyTrails` così com'era in quel momento — sempre `[]`,
perché il fetch Overpass di `useNearbyTrails` risolve dopo, in modo
asincrono, quando quell'effetto non gira più una seconda volta. Bug
silenzioso, mai un errore in console.

- `NavigationMap.tsx`: il disegno dei sentieri vicini è ora un effetto
  React a sé (`useEffect(..., [nearbyTrails, mapReady])`), che ridisegna
  ogni volta che la prop cambia — corregge il bug sopra.
- `lib/navigation/nearbyTrailLabels.ts` (nuovo): calcola lunghezza ed
  etichetta di ogni segmento — un'etichetta per way OSM distinta (stesso
  livello di dettaglio delle etichette di CalTopo nello screenshot
  condiviso), non una ogni tot metri.
- Stile aggiornato: linea più marcata (colore marrone caldo, distinto dal
  verde del percorso pianificato e dagli arancioni degli avvisi
  fuori-percorso) più etichetta di distanza per segmento, testo con alone
  bianco per restare leggibile sopra qualunque sfondo della mappa.
- `NavigationMapLibre.tsx` (mappa online): la feature non esisteva
  affatto qui — aggiunta con lo stesso stile/soglie (linea tratteggiata +
  layer `symbol` per le etichette), così passare da mappa offline a
  online durante la navigazione non fa sparire questo contesto.
- `ActiveNavigationView.tsx`: `nearbyTrails` (già calcolato da
  `useNearbyTrails`) ora passato anche a `NavigationMapLibre`, non solo a
  `NavigationMap`.

**Non ancora fatto / prossimi passi concreti:**
- Nessuna distinzione visiva tra "sentiero qualunque nelle vicinanze" e
  "sentiero che l'Escape Engine (Fase 7) proporrebbe davvero come via
  d'uscita" — sono la stessa fonte dati (OSM) ma non la stessa query
  (`fetchNearbyTrailPaths` per il layer di contesto, il trail graph
  persistito per l'Escape Engine); unificarle o quantomeno evidenziare le
  une dentro le altre è lavoro futuro, non fatto qui.
- Non aggiunto a `FreeTrackMap.tsx` (registrazione senza pianificazione) —
  richiederebbe usare il percorso percorso finora come riferimento per il
  bbox invece di un percorso pianificato fisso, fuori scope di questo giro.
- Soglia di lunghezza minima per l'etichetta (`NEARBY_TRAIL_MIN_LABEL_LENGTH_M
  = 60`) e stile non calibrati su un caso reale con molti sentieri
  ravvicinati (stesso caveat delle altre costanti "a stima" in questo file).

## Post-collaudo — icone POI e tap per info nella mappa di navigazione — ✅ landed

Altra segnalazione dallo stesso giro di test: nella mappa di navigazione
live tutti i POI avevano la stessa icona (un pallino arancione, o —
peggio, in `NavigationMapLibre.tsx` — il pin generico di default di
MapLibre), a differenza della mappa della pagina di dettaglio percorso
(`components/MapView.tsx`), dove ogni tipo di POI ha icona e colore
propri (`components/poiIcons.tsx` + `POI_META` in `lib/overpass.ts`); e
toccare un POI sulla mappa di navigazione non mostrava nessuna
informazione.

- `NavigationMap.tsx` e `NavigationMapLibre.tsx`: stessa icona/colore per
  tipo di `MapView.tsx` (`poiBadgeMarkup`/`POI_META`), riusata così com'è
  — nessuna logica duplicata.
- Nuova prop `onPoiTap` su entrambi i componenti mappa: `
  ActiveNavigationView.tsx` la collega allo stesso pannello (`callout`/
  `PoiCalloutSheet`) già usato quando ci si avvicina a piedi a un POI
  (evento `enteredPoi` del motore) — toccare il marker sulla mappa mostra
  ora la stessa scheda con nome/estratto Wikipedia/immagine, non un
  popup diverso o nessuna reazione.

**Perché lo stile della mappa stessa (tile) resta diverso dall'app
principale — non un bug, non toccato qui**: la pagina di dettaglio
percorso usa tile OSM standard live (`style=light` in `app/api/tile/
route.ts`, che proxa `tile.openstreetmap.org`) — uso in tempo reale,
volume basso, compatibile con la policy di utilizzo di OpenStreetMap. La
mappa di navigazione di Navigator usa invece CartoDB Voyager
(`style=voyager`) **perché è la stessa mappa scaricata in blocco per
l'uso offline** (`lib/offline/packageManager.ts`) — la policy di OSM
vieta esplicitamente il download in blocco/il mirroring offline delle
loro tile, mentre CartoDB lo permette nel proprio piano gratuito. Se le
tile "live" di Navigator venissero cambiate a `style=light` senza
cambiare anche cosa viene scaricato per l'offline, la mappa offline
smetterebbe di funzionare (le tile in cache sotto la vecchia URL
`style=voyager` non corrisponderebbero più a quelle richieste): un
cambiamento del genere richiede prima verificare se esiste uno stile con
lo stesso aspetto ricco ma compatibile col download in blocco — non
fatto qui, segnalato come possibile lavoro futuro se lo stile "più
semplice" di Navigator continua a essere percepito come un downgrade.

## Post-collaudo — Navigator "gancio" verso l'app madre: home a mappa, menu, limite di 1 percorso — ✅ landed (parte 1 di 2)

Discussione strategica con l'utente dopo il secondo giro di test: Navigator deve restare uno
strumento leggero "sul sentiero", non una seconda copia dell'app di pianificazione — un gancio
verso l'app principale, non un sostituto. Decisioni prese insieme (vedi anche
`docs/piano-ottimizzazione-ai.md`, sezione "Contesto di business: verso freemium/premium", per il
contesto di business più ampio in cui questa scelta si inserisce):
1. Il limite "massimo 1" riguarda **solo** ciò che Navigator stesso lascia creare (import/
   registrazione) — un percorso pianificato nell'app principale resta **sempre** visibile/
   navigabile in Navigator, nessun limite, nessuna sorpresa per chi ne ha già diversi sincronizzati.
2. Le registrazioni senza pianificazione **contano** nello stesso slot (non sono separate).
3. L'import in Navigator (fase 2, non ancora fatta) si limiterà a file (GPX/KML/KMZ/GeoJSON) e
   import da link — non la ricerca/costruzione AI, che resta solo nell'app principale.

**Implementato in questo giro:**
- `supabase/migrations/add_source_app_column.sql`: nuova colonna `source_app` su
  `planned_hikes` e `activities` — `NULL` (comportamento di sempre, nessuna riga esistente
  cambia stato) o `'navigator'`, impostata solo dalle azioni di import/registrazione DI Navigator.
  `PlannedHike.sourceApp`/`StoredActivity.sourceApp` nei tipi TS, letta/scritta dalle rispettive
  API route.
- `lib/navigatorSlot.ts` (nuovo): `getNavigatorSlotStatus()` — vero unico punto che decide se lo
  slot di Navigator è occupato, guardando sia `planned_hikes` che `activities` con
  `sourceApp === 'navigator'`.
- **Home a mappa**: `app/navigatore/page.tsx` non è più l'elenco — ora mostra una mappa live
  (riusa `FreeTrackMap.tsx`, posizione grezza via `LocationSource` senza il livello di
  registrazione/PositionEngine, inutile per una schermata che non accumula una traccia) con un
  pulsante "Naviga" per il percorso più recente pronto, se c'è. L'elenco completo si è spostato in
  `app/navigatore/percorsi/page.tsx`, raggiungibile dal menu.
- **Menu**: `components/navigation/NavigatorMenu.tsx` (nuovo, foglio a comparsa) — Percorsi
  pianificati, Registra senza pianificazione, Apri DTrek, Esci. Aperto dall'icona hamburger sulla
  home.
- **Applicazione del limite**: `app/navigatore/traccia/page.tsx` controlla lo slot all'apertura —
  se già occupato, blocca "Avvia registrazione" con un messaggio che nomina cosa lo occupa e offre
  di rimuoverlo (`deletePlanned`/`deleteActivity` a seconda del tipo) o di aprire l'app principale.
  Il salvataggio di una traccia registrata imposta `sourceApp: 'navigator'`
  (`saveActivityWithEnrichment`'s nuova opzione).
- **Bonus scoperto durante il lavoro**: l'elenco pianificate (ora `percorsi/page.tsx`) non aveva
  alcun modo di scaricare la mappa offline se non aprendo prima la navigazione vera e propria —
  aggiunto un badge compatto di download direttamente su ogni card (`OfflinePackageDownloader`'s
  nuova prop `compact`).

**Non ancora fatto / prossimi passi concreti (parte 2):**
- Import file (GPX/KML/KMZ/GeoJSON) e da link direttamente in Navigator, con lo stesso controllo
  slot già costruito — riuso della logica di parsing già esistente in
  `components/upload/GpxUploader.tsx`/`UrlImportUploader.tsx`, non duplicata.
- Nessuna UI ancora per "hai un percorso pianificato nell'app madre ma vuoi sostituirlo con uno
  importato in Navigator" — oggi l'unico modo di liberare lo slot da Navigator stesso è rimuovere
  quello già lì.
- La domanda più ampia (rapporto strategico app madre/Navigator, leva di fidelizzazione, dove si
  inserisce rispetto al freemium/premium) resta una conversazione di prodotto aperta, non una
  decisione tecnica presa qui.

## Ordine consigliato per le prossime PR

1. ✅ Swap `GpsSmoother` → `PositionEngine` dentro `NavigationEngine` (Fase 2,
   chiusura). Resta da fare solo l'aggancio di `sample()` al rendering
   mappa a 60fps (vedi Fase 2 sopra).
2. ✅ Persistenza del trail graph per l'hike attivo (prerequisito comune a
   Fase 4, 6, 7) — vedi sezione dedicata sopra. Resta da fare: usarlo
   davvero in Map Matching/Escape Engine (punti 4-5 sotto).
3. ✅ Build Android reale, verificata tramite
   `.github/workflows/build-navigator-apk.yml` — non eseguibile dentro
   questa sessione (rete bloccata verso `dl.google.com`/Google Maven), ma
   confermata funzionante sul workflow GitHub dopo 4 round di fix reali
   (Node 22, retry sul rate-limit di Maven Central, allineamento JVM-target
   Java/Kotlin, `override` mancante su due metodi del plugin). L'app
   compila, si installa e la navigazione con Native Location Engine +
   Position Engine funziona su device reale (rilevamento off-route incluso).
4. ✅ `UNCERTAIN`/`WRONG_DIRECTION` + Off-Route Engine multi-fattore (Fase
   3/5 della issue originale) — vedi sezione dedicata sopra.
5. ✅ Escape Engine (Fase 7) — la feature distintiva citata esplicitamente
   nella issue — vedi sezione dedicata sopra (v1 senza dislivello, per il
   costo/rate-limit della pipeline DTM).
6. ✅ Map Matching non invasivo contro il trail graph reale (Fase 4) — vedi
   sezione dedicata sopra (v1 senza compatibilità di bearing).
7. ✅ Offline Navigation Package esteso + Readiness Check (Fase 6) — vedi
   sezione dedicata sopra.
8. ✅ Decisore battery-aware automatico (Fase 8) — vedi sezione dedicata
   sopra. Resta da fare solo il test reale su device outdoor, non
   eseguibile in questo ambiente.
