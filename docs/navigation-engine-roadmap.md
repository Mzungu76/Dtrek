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

## Fase 2 — Position Engine — ✅ modulo pronto, non ancora agganciato alla UI

- `lib/navigation/positionEngine.ts`: quality check (`checkFixQuality`,
  esportata e testabile da sola), rigetto spike basato su velocità implicita
  al netto dell'accuracy combinata dei due fix, un vero filtro di Kalman a
  velocità costante per asse (sostituisce la media mobile ingenua di
  `gpsSmoothing.ts`), e `sample(atMs)` per ottenere una posizione
  interpolata/estrapolata a qualunque timestamp — la base per un rendering
  a 60fps indipendente dal tasso dei fix GPS (~1 Hz).
- Nessuna dipendenza da moduli legati al trail (nessun import da
  `routeDeviation.ts`/`navigationEngine.ts`) — rispetta il principio "il
  Position Engine non sa nulla del percorso".

**Non ancora fatto / prossimi passi concreti:**
- Sostituire `GpsSmoother` con `PositionEngine` dentro
  `navigationEngine.ts` (oggi convivono: `GpsSmoother` resta quello
  realmente usato in produzione, per non toccare in questa stessa PR il
  comportamento della UI di navigazione già in uso). È uno swap contenuto:
  `this.smoother.push(raw)` → `this.positionEngine.ingest(raw)`, con
  gestione esplicita del caso "fix rigettato" (oggi `GpsSmoother` non
  rigetta mai nulla).
- Agganciare `sample()` a un loop `requestAnimationFrame` nel renderer
  mappa (`NavigationMap.tsx`/`NavigationMapLibre.tsx`) per il marker a
  60fps — questo è più naturale da fare insieme alla fase 4 (Map Matching),
  perché è lì che si decide anche cosa disegnare rispetto al trail.
- Non esiste un test runner nel repo (`package.json` non ha `test`/
  `jest`/`vitest`): se si vuole una suite automatica per
  `checkFixQuality`/il filtro di Kalman, va prima scelto e configurato uno
  strumento — non è stato aggiunto qui per non introdurre una dipendenza di
  infrastruttura non richiesta esplicitamente.

## Fase 3 — Navigation Engine (distanza/direzione/off-route) — parzialmente esistente

Già presente: `RouteTracker` (nearest-segment + distance-along-route),
soglia off-route singola con isteresi a conteggio-fix, stati
`navigating/off_route/gps_lost/poi_near/finished`. Da fare per allinearsi
alla spec:
- Aggiungere stati `UNCERTAIN` e `WRONG_DIRECTION` a `NavState`/
  `stateMachine.ts`.
- Calcolare "direzione corretta da seguire" vs. direzione effettiva
  (confronto tra `bearingDeg` della posizione e la tangente del trail nel
  punto più vicino) — oggi si emette solo `bearingToRouteDeg` (dove sta il
  trail), non se il verso di marcia è quello giusto.
- "Prossimo waypoint/bivio" con distanza: `routeInstructions.ts` ha già le
  svolte geometriche, manca l'esposizione esplicita di "prossimo bivio" come
  concetto separato da un'istruzione turn-by-turn generica.

## Fase 4 — Map Matching non invasivo — base solida, da estendere

`RouteTracker.update()` già rispetta il principio cardine (mai spostare il
fix). Manca:
- Usare il trail graph reale (`lib/routeBuilder/osmGraph.ts`,
  `fetchWalkNetwork`) invece di una singola polyline pianificata, per poter
  riconoscere "quale segmento probabilmente sto seguendo" quando esistono
  alternative vicine (spec §4) — oggi `RouteTracker` conosce solo il
  percorso pianificato, non la rete circostante.
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

## Fase 6 — Offline Navigation Package — solo tile oggi

`lib/offline/packageManager.ts` scarica solo tile raster. Serve estendere
manifest + download a: trail graph (fase 4), POI, profilo altimetrico
(`lib/navigation/elevationProfile.ts` già lo calcola per un hike, va solo
persistito nel pacchetto), nav data (istruzioni/moments/eventi), escape
data (fase 7). Poi un vero **Offline Readiness Check** che verifichi
tutti questi pezzi (non solo `tileCount === downloadedCount` come oggi) e
un banner esplicito "⚠ Offline navigation incomplete" quando manca
qualcosa di critico.

## Fase 7 — Escape Engine — da costruire

Non esiste ancora. Si appoggia direttamente sul trail graph persistito
della fase 4/6: dato un punto fuori percorso, cercare nel grafo percorsi
verso (a) il punto più vicino sull'ultimo segmento noto, (b) trail
alternativi vicini con `trailConfidence` alta, (c) strade, (d) POI sicuri —
e restituire `ESCAPE OPTIONS` ordinate con distanza/dislivello/sicurezza
motivati. `lib/trailScore.ts` è il punto di partenza naturale per il
concetto di `trailConfidence`/sicurezza per segmento.

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

1. Build Android reale (Fase 1, chiusura) su un ambiente con SDK — prima di
   tutto il resto, per non accumulare altro codice nativo non verificato.
2. Swap `GpsSmoother` → `PositionEngine` dentro `NavigationEngine` (Fase 2,
   chiusura) + aggancio `sample()` al rendering mappa.
3. Persistenza del trail graph per l'hike attivo (prerequisito comune a
   Fase 4, 6, 7).
4. `UNCERTAIN`/`WRONG_DIRECTION` + Off-Route Engine multi-fattore (Fase 3/5
   della issue originale).
5. Escape Engine (Fase 7) — la feature distintiva citata esplicitamente
   nella issue, ma ha senso solo dopo che il trail graph è persistito.
6. Offline Navigation Package esteso + Readiness Check (Fase 6).
7. Decisore battery-aware automatico (Fase 8) + test reali su device.
