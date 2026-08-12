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
entry point `app/navigatore/page.tsx` (lista percorsi pianificati → avvia
navigazione), non il sito intero.

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

## Fase 4 — Map Matching non invasivo — base solida, da estendere

`RouteTracker.update()` già rispetta il principio cardine (mai spostare il
fix). Manca:
- Usare il trail graph reale (ora persistito e disponibile via
  `lib/navigation/trailGraphStore.ts` — vedi prerequisito sopra) invece di
  una singola polyline pianificata, per poter riconoscere "quale segmento
  probabilmente sto seguendo" quando esistono alternative vicine (spec §4)
  — oggi `RouteTracker` conosce solo il percorso pianificato, il grafo è
  scaricato/salvato ma nessun codice lo legge ancora per questo scopo.
- Persistere il grafo scaricato per l'hike corrente (oggi `fetchWalkNetwork`
  gira solo in fase di pianificazione, via rete, non salvato) — prerequisito
  anche per l'Escape Engine (fase 7) e per l'offline (fase 6).

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

## Fase 6 — Offline Navigation Package — tile + trail graph oggi

`lib/offline/packageManager.ts` scarica tile raster **e ora anche il
trail graph** (vedi prerequisito sopra — `hasTrailGraph`/
`trailGraphNodeCount` nel manifest). Serve ancora estendere manifest +
download a: POI, profilo altimetrico (`lib/navigation/elevationProfile.ts`
già lo calcola per un hike, va solo persistito nel pacchetto), nav data
(istruzioni/moments/eventi), escape data (fase 7). Poi un vero **Offline
Readiness Check** che verifichi tutti questi pezzi (non solo
`tileCount === downloadedCount` come oggi — e decida se il trail graph,
oggi best-effort/opzionale, debba diventare un requisito) e
un banner esplicito "⚠ Offline navigation incomplete" quando manca
qualcosa di critico.

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

## Fase 8 — Battery-aware + test reali outdoor — parzialmente pronto lato native

`LocationMode` (nativo) già definisce le 4 modalità con cadenza/priorità
diverse, e `NavigationEngine.setLocationMode()` le espone lato JS. Manca:
- La logica che *decide* quando cambiare modalità (velocità, qualità GPS,
  prossimità a un bivio, deviazione, livello batteria, criticità del
  tratto) — oggi il chiamante deve impostarla esplicitamente, non c'è
  ancora un decisore automatico.
- `lib/navigation/battery.ts` va esteso da "solo avviso soglia bassa" a
  input reale per quel decisore.
- Test su device reale outdoor (copertura GPS scarsa, sottobosco, schermo
  spento per ore) — non eseguibile in questo ambiente (nessun Android SDK/
  emulatore disponibile: `ANDROID_HOME` non impostato).

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
6. Offline Navigation Package esteso (POI, profilo altimetrico, nav data,
   escape data) + Readiness Check (Fase 6).
7. Decisore battery-aware automatico (Fase 8) + test reali su device.
