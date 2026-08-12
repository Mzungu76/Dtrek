# Dtrek Navigation Engine — Analisi dell'implementazione attuale

Report richiesto prima di modificare l'architettura di navigazione esistente (vedi
`docs/navigation-engine-roadmap.md` per il piano a fasi). Scopo: capire cosa
c'è oggi, cosa può essere riusato così com'è, cosa va adattato e cosa manca
del tutto rispetto all'obiettivo "Navigation Engine outdoor" descritto nella
issue.

## 1. Stato attuale — mappa dei componenti

```
components/navigation/ActiveNavigationView.tsx   UI schermata di navigazione (React)
lib/navigation/
  gpsTracker.ts        AdaptiveGpsTracker — wraps navigator.geolocation.watchPosition
  gpsSmoothing.ts       GpsSmoother — media mobile su lat/lon grezzi
  navigationEngine.ts    NavigationEngine — orchestratore: GPS→smoothing→deviation→POI→eventi
  routeDeviation.ts      RouteTracker — nearest-segment + distanceAlongRoute, offRouteThresholdM
  stateMachine.ts        NavStateMachine — idle/navigating/poi_near/off_route/gps_lost/finished
  orientation.ts         bearing math + compass sensore (DeviceOrientationEvent)
  poiProximity.ts        indice spaziale POI
  routeInstructions.ts   istruzioni turn-by-turn geometriche dalla polyline
  routeMoments.ts         eventi narrativi (climb_start, viewpoint, exposed, junction...)
  paceAssistant.ts        stima ETA/passo (Naismith + meteo + fitness)
  battery.ts              Battery Status API — solo avviso soglia bassa
  haptics.ts, speech.ts   feedback aptico/vocale
  elevationProfile.ts, trackToActivity.ts
lib/offline/
  packageManager.ts       download tile raster (z13-16) in Cache Storage
  packageManifest.ts       manifest di validità (status/checksum/tileCount)
lib/routeBuilder/osmGraph.ts   grafo OSM percorribile (fetch Overpass on-demand, in-memory, non persistito)
lib/trailScore.ts              Trail Score (fatica/bellezza), usato in fase di pianificazione, non in navigazione
public/manifest.json, public/sw.js   PWA — nessun Capacitor, nessun modulo nativo
```

**Nessuna dipendenza Capacitor è presente** (`package.json` non ha
`@capacitor/*`), non esiste una cartella `android/`. L'intera pipeline GPS
gira nella WebView tramite `navigator.geolocation` / Web API standard.

## 2. Come funziona oggi, componente per componente

- **Sorgente GPS**: `AdaptiveGpsTracker` usa `navigator.geolocation.watchPosition`
  con `enableHighAccuracy: true`. Non c'è un polling reale — il browser decide
  la cadenza dei fix; per risparmiare batteria il tracker ferma e riarma
  `watchPosition` su un timer dipendente dall'ultima velocità nota
  (stopped→6s, walking→2s, running→1s). Bearing nativo del fix non è letto —
  `GeolocationCoordinates.heading` esiste ma non è propagato in `GeoFix`.
- **Smoothing**: `GpsSmoother` è una **media mobile ingenua** su lat/lon degli
  ultimi 4 fix grezzi. Nessun quality gate, nessun outlier rejection esplicito
  a livello di posizione (solo `updateTraveledDistance` in
  `navigationEngine.ts` scarta il contributo a distanza-percorsa di un salto
  implausibile, ma non corregge la posizione mostrata). Nessuna interpolazione
  fra fix: il marker salta da un punto medio all'altro ogni volta che arriva
  un nuovo fix (~1-2 Hz), non c'è rendering a 60fps indipendente dal tasso GPS.
- **Map matching / posizione vs percorso**: **punto positivo da preservare** —
  `RouteTracker.update()` calcola nearest-segment/distance-to-route/
  distance-along-route **senza mai alterare il fix stesso**. Il principio
  "non snappare il GPS sul trail" è già rispettato architetturalmente oggi.
  Va solo esteso (oggi lavora su un'unica polyline pianificata, non su un
  vero trail graph con percorsi alternativi).
- **Off-route**: soglia singola `offRouteThresholdM = max(50, accuracy*1.5)`
  con isteresi a conteggio fix (3 fix consecutivi oltre soglia → off_route, 3
  sotto soglia → back on route). Non considera direzione, velocità, tendenza
  della divergenza nel tempo, né percorsi alternativi. Fix con
  `accuracy > 100m` vengono semplicemente ignorati per la decisione (nessun
  concetto di stato `UNCERTAIN` distinto da `ON_ROUTE`/`OFF_ROUTE`).
- **Stati**: `NavStateMachine` ha `idle/navigating/poi_near/off_route/
  gps_lost/finished` — non ha `UNCERTAIN`, non ha `WRONG_DIRECTION`.
- **Eventi anticipatori**: esistono già `routeInstructions.ts` (svolte
  geometriche) e `routeMoments.ts` (salita/viewpoint/esposto/bivio/cambio
  ambiente) con countdown di distanza — è un embrione ragionevole del
  "Navigation Events" richiesto dalla spec, ma senza un tipo unificato
  `{type, distance, direction?, severity?, message, geometry?}` e senza
  copertura di tutti i casi (fine sentiero, sorgenti/acqua, tratti ripidi
  come categoria esplicita).
- **Audio/haptic**: `haptics.ts`/`speech.ts` esistono ma andrebbero
  verificati per anti-ridondanza sistematica (debouncing centralizzato per
  tipo di evento) — non ho trovato un motore di deduplica eventi audio unico.
- **Offline**: `packageManager.ts` scarica **solo tile raster**
  (z13-16, bbox+300m buffer) in Cache Storage. Non include trail graph, POI,
  dati altimetrici, dati di navigazione (istruzioni/moments) né escape data.
  Non esiste un "Offline Readiness Check" — la UI dichiara "mappa scaricata"
  solo in base a `isManifestValid` (tile count completo), non alla
  disponibilità di tutto il necessario per navigare offline.
- **Background/schermo spento**: nessun Foreground Service — il tracking
  dipende dal ciclo di vita della WebView/tab. `RouteMap3D.tsx` usa
  `navigator.wakeLock` ma solo per tenere lo schermo acceso, non aiuta con
  schermo spento o app in background (dove Chrome/WebView throttla o
  sospende i timer JS). Su Android reale, con schermo spento o app in
  background, `watchPosition` si ferma o rallenta drasticamente: è
  esattamente il problema che la issue vuole risolvere.
- **Trail graph OSM**: `lib/routeBuilder/osmGraph.ts` (`fetchWalkNetwork`)
  scarica già un grafo percorribile da Overpass (nodi condivisi = intersezioni
  reali) ma **solo in fase di pianificazione del percorso**, in memoria, via
  rete — non persistito, non disponibile in navigazione offline, non usato
  da `navigationEngine.ts`.
- **Trail Score**: `lib/trailScore.ts` calcola fatica/bellezza in fase di
  pianificazione (non un `trailConfidence` per segmento in navigazione).
- **Battery-aware**: `battery.ts` è solo un avviso di soglia bassa, non
  modula affatto la frequenza/accuratezza GPS in base a batteria o contesto.
- **Escape Engine**: non esiste.

## 3. Cosa è riusabile così com'è

| Componente | Perché si può tenere |
|---|---|
| `RouteTracker` (routeDeviation.ts) — nearest-segment search con finestra scorrevole | Algoritmo corretto ed efficiente (O(window) non O(n)); rispetta già "non spostare il fix". Riusabile come base del Map Matching non invasivo (va esteso a più segmenti/trail candidati, non riscritto). |
| `NavStateMachine` | Struttura a transizioni valide centralizzata è il pattern giusto — va solo esteso con `UNCERTAIN`/`WRONG_DIRECTION`. |
| `orientation.ts` (bearing math, compass) | Corretto (mean bearing circolare, gestione iOS permission gate). Riusabile as-is. |
| `routeInstructions.ts`, `routeMoments.ts`, `poiProximity.ts` | Buona base per Navigation Events — da unificare sotto un tipo evento comune, non da riscrivere da zero. |
| `paceAssistant.ts` | Indipendente dal position engine, riusabile invariato. |
| `lib/routeBuilder/osmGraph.ts` | Il trail graph richiesto dalla spec esiste già — va persistito/esteso per navigazione e uso offline/escape, non ricostruito. |
| `lib/trailScore.ts` | Base per `trailConfidence` per segmento — da adattare, non da rifare. |
| `packageManifest.ts` (pattern manifest+status+checksum) | Il pattern è giusto per l'Offline Navigation Package esteso — va allargato ai nuovi contenuti (grafo/POI/elevazione/nav data/escape), non riscritto. |
| Architettura a eventi di `NavigationEngine` (`on/emit`, pura TS, nessuna dipendenza da React) | Esattamente il disaccoppiamento richiesto dalla spec (§14) — la UI resta sottoscrittore. Va mantenuta come layer, ricollegata a una sorgente posizione nativa. |

## 4. Cosa deve essere sostituito o aggiunto ex novo

| Componente | Motivo |
|---|---|
| Sorgente GPS (`AdaptiveGpsTracker`) | Basata su `navigator.geolocation`, si ferma con schermo spento/app in background. Va affiancata (non necessariamente rimossa: resta il fallback web/desktop) da un **Native Location Engine** Capacitor/Android con Foreground Service. |
| `GpsSmoother` | Media mobile ingenua su lat/lon: non fa quality gate, non rigetta spike, non stima velocità/bearing, non interpola a 60fps. Da sostituire con un vero **Position Engine** (fase 2). |
| Soglia off-route singola | Da sostituire con un vero **Off-Route Engine** multi-fattore con isteresi temporale (non a conteggio fix) — §5 della spec. |
| Offline package (solo tile) | Da estendere a un vero **Offline Navigation Package** (trail graph, POI, elevazione, nav data, escape data) + readiness check esplicito. |
| Battery-aware | Da costruire: profili BATTERY_SAVE/TREKKING/NAVIGATION/EMERGENCY che modulano davvero il Location Engine nativo. |
| Escape Engine | Da costruire ex novo, sopra il trail graph OSM già esistente. |
| `trailConfidence` / Navigation Confidence separata da GPS accuracy | Da costruire ex novo (oggi non esiste alcuna distinzione). |

## 5. Rischi/vincoli notati

- Il progetto è un'app Next.js **server-rendered** (`output: 'standalone'`,
  API routes, middleware auth Supabase) — non un sito statico esportabile.
  Questo esclude il pattern Capacitor "bundle statico in `webDir`": la shell
  nativa dovrà caricare l'app via `server.url` (HTTPS, dominio Vercel/
  produzione), col bridge dei plugin nativi iniettato nella WebView. È lo
  stesso pattern già usato da molte hybrid app Next.js+Capacitor ed è
  compatibile col principio "la PWA/Next.js rimane l'interfaccia principale".
- L'ambiente di sviluppo/CI di questa sessione non ha Android SDK
  (`ANDROID_HOME` non impostato) — Gradle e JDK sono presenti, ma una build
  `.apk` reale non è verificabile qui. Il codice nativo va quindi validato
  poi in un ambiente con Android SDK/emulatore o dispositivo reale (fase 8
  della roadmap, "test reali outdoor").
- Nessun modulo attuale "finge" la posizione per adattarla al trail — questo
  è un vincolo di sicurezza (§15.1) che era già rispettato prima di questo
  lavoro; va preservato in ogni refactor successivo.
