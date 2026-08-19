# DTREK — Audit multidisciplinare come strumento di navigazione outdoor

**Metodologia**: analisi del codice sorgente reale (non solo lettura, verifica incrociata), esecuzione della suite di test automatici (`npx vitest run`, 49/49 test passati inclusi 5 test che riproducono fix GPS realmente registrati su un'escursione vera), `npm install`/`npm audit` per verificare le dipendenze, lettura della documentazione interna del progetto (`docs/*.md`, scritta dal team stesso, sorprendentemente onesta sui propri limiti), ricerca sistematica nel codice con citazioni `file:riga` per ogni affermazione tecnica. Nessuna funzionalità descritta qui è stata inventata: dove il codice stesso dichiara un limite ("mai verificato contro una risposta reale", "nessun chiamante valorizza mai questo campo"), è citato testualmente.

Non è stato possibile avviare l'app in un browser reale (mancano le credenziali Supabase/Anthropic in questo ambiente) né testarla su un dispositivo Android fisico all'aperto — questo limite è dichiarato esplicitamente ove rilevante, e il giudizio su quelle parti si basa sull'analisi del codice e sui test automatici esistenti, non su un'osservazione diretta.

---

## 0. Cosa è DTrek, in una frase

Non è (solo) un'app di trekking: è un prodotto Next.js maturo con due superfici — **DTrek** (web/PWA: pianificazione, guide AI narrate, diario, statistiche, condivisione) e **DTrek Navigator** (app Android separata via Capacitor, superficie minima, unico scopo: navigare un percorso già pianificato con GPS attivo anche a schermo spento/in background). La separazione in due app è una decisione di prodotto motivata e documentata (`docs/navigation-engine-analysis.md` §5), non un accidente architetturale.

Il motore di navigazione (`lib/navigation/*`) è **tecnicamente molto più sofisticato di quanto la categoria "app di trekking indie" lasci presagire**: filtro di Kalman a velocità costante per il position engine, Off-Route Engine multi-fattore con isteresi temporale, Escape Engine con Dijkstra su grafo OSM persistito offline, decisore battery-aware, framework di simulazione GPS per testare scenari senza un GPS reale, e una suite di test che include la riproduzione di fix GPS **realmente registrati sul campo** (escursione "Faggeta del Cimino"/Monte Cimino, account reale). Questo è raro in questa categoria di prodotto e va riconosciuto come tale prima di ogni critica.

Ma un motore di tracking eccellente non è la stessa cosa di uno strumento di navigazione outdoor pronto all'uso: mancano pezzi di fiducia dei dati (chiusure sentiero, verifica acqua/rifugi, copertura di rete), la UX in cammino ha lacune concrete (nessun wake lock, testo critico a 15px, target di tocco incoerenti), e diversi algoritmi di scoring hanno bias di "assenza-dati-trattata-come-ok" che il codice stesso ammette ma non risolve ancora.

---

## 1. Architettura — ricostruzione rapida

| Livello | Stato reale |
|---|---|
| Frontend | Next.js 14.2.3 (App Router), React 18, TypeScript, Tailwind. **Next 14.2.3 ha CVE attivamente segnalate da `npm audit`, inclusa severità critica** (cache poisoning, SSRF via middleware redirect, DoS su Server Actions/Image Optimization, XSS su CSP nonce) — vedi §8, P0. |
| Dati | Migrazione parziale a **local-first**: IndexedDB (`lib/localStore.ts`) + outbox di sync (`lib/sync/syncEngine.ts`) solo per user settings, resoconti, percorsi pianificati, attività, questionario. Il resto (guida AI, sessioni navigazione, condizioni sentiero, admin, POI/PTPR, cache specie) legge/scrive Supabase **direttamente**, senza cache locale né offline — dichiarato esplicitamente in `README.md:5-26`, non aspirazionale. |
| Mappe | Leaflet (pianificazione/dettaglio) + MapLibre GL (3D flythrough, navigazione online) + tile raster proxati server-side (`app/api/tile`). Offline: solo tile raster CartoDB Voyager z13-z16 (licenza compatibile col download in blocco, a differenza di OSM standard). |
| GPS/Navigazione | `lib/navigation/*`: PositionEngine (Kalman) → OffRouteEngine (multi-fattore, isteresi temporale) → NavStateMachine (8 stati) → eventi tipizzati consumati dalla UI. Su Android nativo: Foreground Service (`android/app/src/main/java/com/dtrek/navigator/nativelocation/`) con scrittura su disco **prima** dell'inoltro a JS — sopravvive a un processo ucciso a schermo spento. Su web: fallback `navigator.geolocation.watchPosition`, che si ferma/rallenta a schermo spento (limite noto e documentato). |
| Offline | `lib/offline/packageManager.ts`: tile (requisito rigido) + trail graph OSM + elevazione reale + POI + note AI (tutti "degradabili", mai bloccanti) — architettura readiness ben progettata (`lib/offline/offlineReadiness.ts`). |
| Routing/Scoring | Grafo OSM via Overpass (`lib/routeBuilder/osmGraph.ts`) + Dijkstra puro sulla distanza; Trail Score (fatica/bellezza personalizzata), Safety Score, TEI (Trekking Excellence Index, 5 componenti pesate), Trail Confidence (v1, aggregato). |
| Test | `vitest` configurato, **49/49 test passati** verificati in questa sessione, inclusi 5 test end-to-end su dati GPS reali (29-67s ciascuno, non mock). Copertura reale solo su `lib/navigation/*` — nessun test per gli algoritmi di scoring/TEI/route-builder verificato in questa sessione oltre a `trailConfidence.test.ts`. |
| Business | Freemium con trial (30gg o 2 percorsi+2 resoconti), sblocco owner/premium/BYOK, pagamenti Paddle implementati ma **mai testati end-to-end con un pagamento reale** (`docs/navigator-dtrek-boundary.md`, ultima riga). `ai_usage_log` ha **0 righe in produzione** — nessuna generazione AI reale è mai passata dal contatore: il prodotto non ha ancora utenti reali oltre l'account owner. |

---

## 2. Percorso utente end-to-end — dove un utente non saprebbe cosa fare

| Fase | Frizione osservata |
|---|---|
| Scoperta | Due percorsi di ricerca paralleli — "Esistenti" (AI + web search + match OSM) e "Su misura" (Route Builder OSM) — concettualmente diversi ma presentati nella stessa hub; un utente nuovo non ha modo ovvio di sapere quale scegliere né perché i numeri di uno (stimati da un LLM) siano meno affidabili dell'altro (calcolati da OSM+DTM). |
| Valutazione | Trail Score/Beauty/Safety mostrano numeri precisi (0-100) e etichette rassicuranti ("Perfetto per te") anche quando i dati sottostanti sono neutri/stimati — nessun modo per l'utente di distinguere "calcolato da dati reali" da "stimato/neutro" a colpo d'occhio (approfondito in §7, §10). |
| Preparazione | Nessun onboarding contestuale della UI di navigazione (SOS, vie d'uscita, layer, colori marker) — il wizard iniziale copre solo il profilo escursionista. Un utente scopre questi controlli per la prima volta **sul sentiero**, nel momento peggiore per farlo. |
| Download offline | Il badge "pronto" copre solo le tile; l'utente deve leggere l'elenco "dati mancanti" per capire cosa è degradato — buona architettura, ma richiede attenzione che un utente frettoloso in partenza probabilmente non dedica. |
| Partenza | Nessuna checklist esplicita pre-partenza (acqua verificata? meteo aggiornato? batteria? qualcuno sa dove vado?) — il prodotto ha i pezzi (meteo, offline readiness, SOS) ma non li compone in un rituale "prima di partire". |
| Navigazione | Vedi §4 — tecnicamente solido, UX outdoor con lacune concrete. |
| Deviazione | Bene gestita concettualmente (Off-Route Engine multi-fattore), ma le "vie d'uscita" (l'unico aiuto proattivo) sono raggiungibili solo **dopo** essere già segnalati come fuori percorso — non consultabili "per sicurezza" mentre si è ancora on-route ma preoccupati. |
| Imprevisti | SOS onesto (dichiara i propri limiti in UI) ma interamente dipendente da rete per i livelli più efficaci; nessuna funzione di chiusura sentiero, copertura rete, o verifica rifugio aperto. |
| Arrivo | Conferma a doppio tap (evita stop accidentali), buona UX. |
| Post-trekking | Il pezzo più maturo del prodotto: Diario, Resoconto, PDF editoriali, "Vette" (gamification-lite dei picchi raggiunti), condivisione — mesi di iterazione e bug-fix reali documentati in `docs/bug-e-note.md`. |

---

## 3. Scenari simulati (A–L)

| # | Scenario | Cosa succede realmente | Gravità | Soluzione |
|---|---|---|---|---|
| A | Principiante, 8km facile | Trail Score personalizza su sforzo/durata dichiarati, buona idea. Ma senza `sacScale`/`surfaces` mai valorizzati (`lib/safetyScore.ts:238`, ammesso nel codice), un tratto tecnico corto su un percorso "facile" per lunghezza/dislivello può sfuggire al filtro. | Media | Esporre esplicitamente "dati di terreno non disponibili per questo tratto" invece di un badge di sicurezza generico. |
| B | Esperto, 15-20km | Route Builder produce candidati via Dijkstra puro-distanza; penalità per gradini/esposizione applicate solo *dopo*, solo se l'utente ha già dichiarato "preoccupazioni" nel profilo. Un esperto che non ha compilato quel campo non riceve segnalazioni anche su tratti oggettivamente impegnativi. | Media-Alta | Penalizzare il routing stesso per tag di rischio (steps, sac_scale alto), non solo lo scoring a valle. |
| C | Import GPX trovato online | Nessuna dead-band di rumore sull'elevazione per import file/URL/KML (`lib/gpxParser.ts:123-126` — a differenza delle attività registrate, che hanno 0.5m di dead-band). Un GPX rumoroso mostra D+/D- gonfiati **presentati come dato affidabile**, senza disclaimer. | Alta | Applicare la stessa dead-band già esistente in `gpxActivityParser.ts:74-77` anche ai tre parser di import. |
| D | Parte senza connessione | Offline Readiness Check ben progettato (tile=requisito rigido, resto degradabile con elenco esplicito). Ma meteo non è mai nel pacchetto offline, e il checksum del pacchetto (`packageManifest.ts:92-97`) è scritto ma **mai verificato a runtime** prima di fidarsi dei dati. | Media | Verificare il checksum al caricamento del pacchetto; aggiungere un badge "meteo non disponibile offline, ultimo dato di X ore fa". |
| E | Perde il sentiero | Off-Route Engine multi-fattore ben calibrato e testato su GPS reale (7/7 test + scenario reale). Il banner è chiaro. Ma le "vie d'uscita" richiedono un fix GPS valido per essere calcolate (`handleEscapeOptions`) — se il GPS è anche perso, l'opzione sparisce insieme al banner off-route che la conteneva (vedi §6, P0). | **Alta** | Rendere l'Escape Engine utilizzabile anche con l'ultima posizione nota, e sempre raggiungibile da un menu, non solo dal banner. |
| F | Devia volontariamente | Stato `off_route` è indistinguibile — per design — da una deviazione voluta. Il Map Matching (v1) mostra "sentiero noto nelle vicinanze" quando rileva un trail OSM reale, un buon segnale per "sto deviando di proposito su un sentiero vero". | Bassa | Già gestito ragionevolmente; nessuna azione critica. |
| G | GPS scarso | PositionEngine ben progettato: quality gate, rigetto spike, filtro di Kalman che pesa la varianza in base all'accuracy — degrada verso "la posizione non si è mossa molto" invece di mostrare lo spike. Stato `uncertain` distinto da `off_route`. | Bassa | Nessuna azione critica — punto di forza reale. |
| H | Batteria al 15% | Avviso di soglia bassa esiste ma scatta **una sola volta** (`lib/navigation/battery.ts`) — se l'utente lo chiude, non ricompare finché non risale sopra soglia. `LocationModeDecider` passa a `battery_save` automaticamente sotto il 30% (soglia più conservativa dell'avviso), testato. **Ma nessun wake lock esiste durante la navigazione** — l'utente probabilmente tiene lo schermo acceso manualmente per compensare, consumando più batteria di quanta il sistema stia risparmiando. | Media | Aggiungere wake lock con opzione di disattivazione per risparmio energia esplicito, invece di lasciare che l'utente lo faccia "a mano" senza saperlo. |
| I | Acqua disponibile ma non garantita | `spring`/`drinking_water`/`well` sono tutti mappati alla stessa etichetta UI "Acqua potabile" (`lib/pois/overpassSource.ts:83-111`) — nessuna distinzione di tipo, nessuna verifica di stagionalità/stato, nessuna data di ultima verifica. | **Alta** | Distinguere le tre categorie nell'etichetta e aggiungere un flag community "verificata attiva/secca" con data. |
| J | Tratti esposti/pericolosi | I "moments" di navigazione generati **da DTrek stesso** coprono solo l'inizio di una salita ripida (`lib/navigation/routeMoments.ts:9-17`, dichiarato esplicitamente incompleto). Tratti esposti/guadi sono rilevati **solo** da regex su testo di waypoint GPX importati da terzi (`lib/difficultyMarkers.ts`) — un percorso costruito con il Route Builder interno non genera mai questi avvisi. | **Alta** | Costruire rilevamento di esposizione/guadi da dati geometrici (pendenza laterale DTM, incroci con corsi d'acqua OSM), non solo da testo importato. |
| K | Tratto non verificato | Trail Confidence esiste e comunica "dati insufficienti" quando non ha segnali — ma quando li ha, il default per un fallimento di rete meteo/clima è "nessuna penalità" (`lib/trailConditions/weatherSignals.ts:47-49`), indistinguibile da "condizioni verificate buone". | **Alta** | Distinguere esplicitamente `null` (sconosciuto) da `0` (verificato neutro) in ogni pipeline di segnale. |
| L | "È adatto a me?" | Il sistema più elaborato del prodotto (Trail Score personalizzato su sforzo/durata/fitness/quota-fisiologia) risponde bene a questa domanda — ma la confonde concettualmente con "è sicuro/affidabile" nel Trail Confidence (60% del peso è il Trail Score personale, non un indicatore di esistenza/sicurezza — vedi §7.5). | Media | Separare in UI "adatto a te" (Trail Score) da "affidabile/sicuro" (Trail Confidence) — oggi il secondo eredita distorsioni del primo. |

---

## 4. Il test dei 3 secondi

**Domanda**: se fossi su un sentiero reale e guardassi lo smartphone per 3 secondi camminando, capirei subito dove andare?

**Risposta: parzialmente sì per "dove sono", no per "cosa devo fare adesso".**

- La mappa comunica bene la posizione (marker colorato per stato + cerchio di accuratezza GPS, `NavigationMap.tsx`) — un vantaggio reale.
- Ma l'istruzione di svolta e il riepilogo distanza/ETA — le uniche informazioni testuali sempre visibili — sono entrambe a **15px** (`InstructionBanner.tsx:66`, `NavBottomStrip.tsx:48`), testo bianco nudo con solo un'ombra come contrasto, **senza sfondo pieno**. Su terreno chiaro (neve, roccia calcarea, satellite) e sole forte, questo è un rischio di leggibilità concreto — a titolo di paragone, Google Maps/Waze usano 24-30px+ per l'istruzione attiva.
- L'ETA compare come "13:40" **senza etichetta** nella vista sempre visibile — leggibile solo come "ora di arrivo" se già si conosce il formato; il dato contestualizzato (stato del passo, margine di luce) è un tap più in profondità (`NavStatsSheet.tsx`).
- Non c'è alcun segnale sulla mappa stessa per "sei fuori strada, vai di là" — solo un piccolo `ArrowUp` dentro il testo del banner. Chi guarda solo la mappa (comportamento naturale in cammino) può non notare il cambio di stato.
- Layer "sentieri vicini" + POI sono **entrambi accesi di default**, aggiungendo densità visiva proprio nel momento in cui serve il colpo d'occhio più pulito.
- Nessuna modalità alto contrasto/sole forte esiste per compensare nulla di questo.

**Conclusione**: il motore che decide *cosa* mostrare è affidabile; la presentazione visiva di *cosa fare ora* non è ancora ottimizzata per l'uso reale in cammino, sotto sole, con attenzione limitata.

---

## 5. Sicurezza — conseguenze concrete sul campo

| Area | Stato | Conseguenza concreta |
|---|---|---|
| SOS | 4 livelli onestamente etichettati per affidabilità decrescente (chiamata 112 → SMS 112, esplicitamente "non garantito" → coordinate a schermo, sempre leggibili offline → link live-share). | In area senza campo (probabile su 20km isolati), **solo il livello 3 funziona** — correttamente comunicato in UI, quindi non c'è falso senso di sicurezza attivo qui. Punto di onestà raro, va riconosciuto. |
| Condivisione live | Scrive posizione ogni ~18s su Supabase, fallisce silenziosamente offline, nessun retry persistente, nessun dead-man's switch se la posizione smette di aggiornarsi. | Un contatto a casa vede l'ultima posizione ferma da ore e deve accorgersene da solo controllando manualmente lo stato "stale" — nessun allarme proattivo. |
| Escape Engine + GPS perso | Il pulsante "Vie d'uscita" vive **solo** dentro il banner off_route/wrong_direction, che è subordinato al banner gps_lost quando entrambi sono attivi. | **Nel momento di massima criticità (batteria scarica + GPS perso + fuori percorso insieme, lo scenario peggiore reale), l'unica funzione pensata proprio per quell'emergenza diventa irraggiungibile.** |
| Chiusure sentiero | Nessun sistema, in nessuna forma, oltre a regex su testo di GPX importati. | Un sentiero chiuso per frana/manutenzione è indistinguibile da uno aperto, a meno che qualcuno non l'abbia scritto a mano in un file importato da terzi. |
| Tratti esposti/guadi | Generati da DTrek stesso: solo l'inizio di salite ripide (8% per ≥300m). Il resto: solo da testo di GPX importati. | Un percorso costruito nativamente in DTrek (Route Builder) non segnala mai esposizione/guadi, indipendentemente dalla pericolosità reale — **assenza di avviso interpretabile erroneamente come "tratto sicuro"**. |
| Copertura rete | Assente, dichiarato esplicitamente in UI ("non tiene ancora conto... della copertura di rete", `TrailConfidenceBadge.tsx:74-77`). | Nessun modo di sapere in anticipo se un tratto avrà campo per chiamare il 112 — rilevante perché l'intero stack SOS/live-share dipende dalla rete. Punto positivo: dichiarato onestamente, non finto. |
| Rifugi come "via di fuga sicura" | Nessuna verifica di apertura reale/stagionalità (`docs/rifugi-progettazione.md:5-9`, gap noto e documentato dal team stesso). | L'Escape Engine può suggerire un rifugio con "sicurezza alta" basata solo su distanza — rischio concreto di dirigersi verso una struttura chiusa fuori stagione. |
| Meteo | Refresh ogni 20 min via rete; su errore, fallback silenzioso senza indicatore di "dato non aggiornato" (a differenza del live-share, che invece segnala esplicitamente `stale`). | Appena si perde rete, il meteo mostrato resta congelato senza avviso — falso senso di aggiornamento. |
| Safety Score (gate) | Proxy `D=√(2·dislivello·km)` — il codice stesso ammette: "una ferrata corta ma esposta ha poco dislivello e poca distanza, quindi D-score basso ⇒ 'Terreno sicuro al 90%' anche quando il pericolo reale è alto" (`lib/safetyScore.ts:236-241`). | **Il falso negativo di sicurezza più rilevante del sistema**: sentieri corti/ripidi/esposti/attrezzati (il profilo di rischio più letale in escursionismo) possono ricevere un punteggio di sicurezza alto. |

---

## 6. Red Team — problemi trovati, classificati

Oltre 30 problemi, ordinati per categoria di gravità. Ogni riga cita dove riprodurre/verificare.

### P0 — Critico/sicurezza

| # | Problema | Dove | Come riprodurlo/verificarlo |
|---|---|---|---|
| 1 | Escape Engine irraggiungibile esattamente quando serve di più (GPS perso, che nasconde il banner off-route che lo contiene) | `components/navigation/ActiveNavigationView.tsx` (banner `gps_lost` subordina/nasconde `off_route`) | Simulare scenario `gps_lost` mentre si è anche `off_route` (`?simulate=gps_lost` combinato) — il pulsante "Vie d'uscita" non appare. |
| 2 | ✅ **Risolto** — `RouteTracker` non resettava mai la finestra di ricerca (`searchWindow=15`) su un salto ampio di posizione — su percorsi a tornanti/che si incrociano, dopo una sospensione lunga dell'app (schermo spento a lungo, poi ripresa) poteva agganciarsi al segmento vicino sbagliato, falsando silenziosamente `distanceToRouteM`/`distanceAlongRouteM`/`expectedBearingDeg`. Corretto con un hint esplicito `forceFullScan` (`lib/navigation/routeDeviation.ts`), agganciato in `navigationEngine.ts` a `wasLost` (uscita da `gps_lost`) e a una finestra di grazia dopo la ripresa di visibilità della WebView (`watchVisibilityForCatchUp`). **Nota di design**: la prima versione includeva anche un fallback automatico basato sulla sola distanza (senza hint del chiamante) — rimosso dopo aver rotto un test reale su un percorso ad anello (`realRouteSimulation.test.ts`): un escursionista genuinamente fuori sentiero può risultare, per pura geometria, più vicino a un tratto diverso dello stesso anello — solo un segnale di discontinuità reale può distinguere i due casi, la distanza da sola non basta. Test dedicato in `lib/navigation/__tests__/routeDeviation.test.ts`. | `lib/navigation/routeDeviation.ts`, `lib/navigation/navigationEngine.ts` | Nuovi test unitari + suite `realRouteSimulation.test.ts` (GPS reale) verde. |
| 3 | ✅ **Risolto** — Safety Score usava dislivello×distanza come unico proxy di pericolosità tecnica — sottostimava sistematicamente ferrate/creste corte ed esposte. Corretto estendendo il correttivo esistente (`refineSafetyWithSlope` → `refineSafetyWithTerrainSignals`, `lib/safetyScore.ts`) a due segnali reali già presenti nel codebase ma inutilizzati: picco di pendenza DTM (`maxSlopeDeg`, non più la media) e scala SAC reale via OSM (`fetchTerrainContext`, funzione orfana con zero chiamanti prima di questo fix). La correzione ora è **collegata al calcolo persistito** (`computeSafetyCore`/`computeSafetyForHike`/`recalcAllSafety`), non solo a una vista come prima — il gate `trailScoreV2` e ogni altro consumatore vedono il valore corretto. Nessuna nuova chiamata DTM introdotta (rate limit 50/24h rispettato: si legge solo `dtmProfile.maxSlopeDeg` se già cachato). Test dedicato in `lib/__tests__/safetyScore.test.ts`, incluso il caso esatto "ferrata corta" citato dall'audit. | `lib/safetyScore.ts`, `lib/computeSafetyForHike.ts`, `lib/recalcScores.ts` | Nuovi test unitari + suite `vitest` completa verde. |
| 4 | Acqua: `spring`/`drinking_water`/`well` tutti presentati come "Acqua potabile", nessuna verifica di stato/stagionalità | `lib/pois/overpassSource.ts:83-111` | Ispezionare un POI di tipo `natural=spring` sulla mappa: etichetta identica a una fontanella pubblica verificata. |
| 5 | ✅ **Risolto** — Nessun sistema di chiusura sentiero in nessuna forma verificata (unico surrogato: regex su testo GPX importato). Aggiunta una nuova tabella `trail_closure_reports` (RLS owner-only, mirror di `trail_completions`) con segnalazione autenticata (`POST /api/trails/closures`, riusa `findTrailForPolyline`/`filterNoteText`/`checkNoteRateLimit` già esistenti) e lettura pubblica solo aggregata con quorum (`lib/community/closureSummary.ts`: 2+ segnalatori distinti nella finestra di 120 giorni → `confirmed`, 1 → `reported`, un `reopened` più recente azzera lo streak). Segnale **separato** da `CommunitySignal` esistente (che alimenta solo un piccolo bonus, mai un avviso) perché una chiusura è un fatto binario di sicurezza. Collegato a `/api/trails/conditions` (stesso `Promise.all`, zero chiamate di rete aggiuntive), poi in UI: riquadro di avviso + form di segnalazione in pianificazione (`CurrentConditionsNotice.tsx`), e un avviso dedicato in navigazione attiva per lo stato `confirmed` (`ActiveNavigationView.tsx`, tra `gps_lost` e `off_route`/`wrong_direction` nello stack di priorità — `useTrailConfidence.ts` riusa il fetch a 30 min già esistente). Test in `lib/community/__tests__/closureSummary.test.ts` (logica di quorum pura). **⚠️ Passo manuale ancora necessario**: la migrazione `supabase/migrations/add_trail_closure_reports.sql` va eseguita nel Supabase SQL Editor prima che la funzione sia utilizzabile in produzione — non applicabile da questa sessione (nessuna credenziale Supabase nel sandbox). Fuori scope per questo giro (v1.1): nessuna UI di segnalazione durante la navigazione attiva stessa, nessuna integrazione in `EndHikeReviewDialog.tsx`. | `supabase/migrations/add_trail_closure_reports.sql`, `lib/community/closureSummary.ts`, `app/api/trails/closures/route.ts`, `app/api/trails/conditions/route.ts`, `components/CurrentConditionsNotice.tsx`, `components/navigation/useTrailConfidence.ts`, `components/navigation/ActiveNavigationView.tsx` | Nuovi test unitari (`closureSummary.test.ts`) verdi; verifica end-to-end reale non eseguibile da questo sandbox (richiede la migrazione applicata + credenziali Supabase reali). |
| 6 | Fallimento rete su segnali meteo/clima collassa a "nessuna penalità" = indistinguibile da "condizioni verificate buone" | `lib/trailConditions/weatherSignals.ts:47-49`, `climateSignals.ts:29-31` | Simulare un errore di fetch Open-Meteo: `totalPenalty` torna 0, la UI mostra "condizioni favorevoli". |
| 7 | Nessun wake lock durante la navigazione attiva — solo per l'export video 3D | `components/RouteMap3D.tsx:1124-1133` è l'unico uso di `wakeLock` nel repo; assente in `ActiveNavigationView.tsx` | Grep `wakeLock` in tutto il repo — un solo risultato, fuori contesto navigazione. |
| 8 | ✅ **Risolto (parzialmente — vedi limite dichiarato sotto)** — SOS/live-share interamente dipendenti da rete, nessun dead-man's switch se la posizione smette di aggiornarsi. La verifica ha trovato un bug più grave di quanto descritto: lo stato `stale` in `LiveShareViewer.tsx`/`GroupShareViewer.tsx` non controllava MAI l'età reale di `last_live_ts`, solo se l'ultima chiamata fetch fosse fallita — se il telefono dell'escursionista si scarica o l'app crasha, l'API pubblica (che legge solo Supabase) continua a rispondere `200 OK` con lo stesso `last_live_ts` vecchio all'infinito, **zero avviso**, mai. Corretto con `lib/navigation/liveShareStatus.ts` (funzione pura `computeLiveStatus`, soglie 3min="stale"/15min="critical", testata), collegato a entrambi i viewer con un ticking indipendente dal poll (così l'età avanza anche se il poll continua a rispondere con dati vecchi). All'ingresso in `critical`: vibrazione + beep (Web Audio, nessun asset nuovo) + notifica di sistema se già autorizzata (`lib/navigation/deadManAlert.ts`, opt-in esplicito via pulsante, mai auto-richiesto). Simmetricamente, l'escursionista stesso viene avvisato sul proprio schermo se il proprio "battito" di posizione live smette di arrivare al server (`publishLivePosition` ora ritorna `boolean`, prima falliva in silenzio totale — `ActiveNavigationView.tsx`). **Limite dichiarato, non risolvibile da questa sessione**: nessun canale di notifica reale esiste nel repo per raggiungere un contatto che NON ha la pagina aperta (nessuna email transazionale generica, nessun push VAPID/service worker, nessun SMS), e l'unico cron esistente è 1/giorno (piano Vercel Hobby) — un vero avviso "a tab chiuso" richiede nuova infrastruttura (service worker + subscription table, o un contatto salvato + canale a pagamento + cron sub-giornaliero), non testabile da questo sandbox senza credenziali. Il fix qui rende l'avviso realmente proattivo solo per chi ha già la pagina aperta (anche in background) — documentato come V1.1 il resto. | `lib/navigation/liveShareStatus.ts`, `lib/navigation/deadManAlert.ts`, `lib/navigation/liveLocationPublish.ts`, `components/navigation/LiveShareViewer.tsx`, `components/navigation/GroupShareViewer.tsx`, `components/navigation/ActiveNavigationView.tsx` | Nuovi test unitari (`liveShareStatus.test.ts`) verdi; comportamento Notification API/vibrazione/audio non verificabile end-to-end da questo sandbox (richiede un browser reale con permessi utente). |
| 9 | Next.js 14.2.3 con CVE attive incluse di severità critica (cache poisoning, SSRF via middleware, auth bypass, DoS Server Actions/Image Optimization, XSS su CSP nonce) | `package.json:40` | `npm audit` — riportato in questa sessione, 1 pacchetto critico + multipli high. |
| 10 | ✅ **Risolto** — Tratti esposti/guadi mai generati dal motore di navigazione DTrek — solo da testo di GPX importati da terzi. Confermato: `lib/difficultyMarkers.ts` era chiamato SOLO da `GpxUploader.tsx`, un percorso costruito via Route Builder non impostava mai `difficultyMarkers`. Corretto sfruttando il fatto che il Route Builder cammina già su un grafo OSM reale (`lib/routeBuilder/osmGraph.ts`): nuovo `pathHazardMarkers` (mirror esatto del già esistente `pathHasSteps`, stesso principio "solo archi REALMENTE percorsi dal pathfinding, zero query aggiuntive") rileva `sac_scale` T4+ e `ford` sugli archi usati dal cammino scelto, propagati fino a `buildHikeFromBuilt` come `difficultyMarkers` (`source: 'osm_way'`) — stessa forma di un import GPX, `MapView.tsx`/`GuidaHub.tsx` li mostrano senza alcuna modifica a valle. **Due bug preesistenti trovati e corretti nello stesso giro, stessa area**: (1) `lib/overpass.ts::fetchTerrainContext` (usata dal fix Safety Score P0, già mergiato) confrontava il tag OSM `sac_scale` GREZZO contro le sigle `T1`-`T6` — ma i valori reali scritti da OSM sono le stringhe lunghe standard (`hiking`, `demanding_alpine_hiking`, ...), mai le sigle dirette: `ctx.sacScale` non veniva quindi mai impostato da un dato reale, e il ramo SAC di `refineSafetyWithTerrainSignals` restava silenziosamente morto in pratica (solo il ramo `maxSlopeDeg`/DTM funzionava). Corretto con un nuovo modulo condiviso `lib/osm/sacScale.ts` (`mapOsmSacScale`, testato), usato sia qui sia nel nuovo rilevamento. (2) La query Overpass del grafo di instradamento (`osmGraph.ts::fetchWalkNetwork`) usava `out skel qt` — verbosità che NON include mai i tag delle way: `GraphEdge.highway` (e con esso `pathHasSteps`/`hasSteps`, il rilevamento scalini già in produzione) era quindi sempre `undefined`/`false`, un bug silenzioso perché "nessuno scalino rilevato" è indistinguibile da "davvero nessuno scalino" senza guardare il codice. Corretto passando a `out body qt` — stessa identica combinazione filtro/bbox già usata con successo in produzione da `hikingProbability.ts::fetchTaggedNetwork` con timeout comparabile (25s vs 18s): il costo lato server di trovare le way è identico, cambia solo la serializzazione. **Rischio dichiarato, non verificabile da questo sandbox**: payload più grande su bbox molto ampie potrebbe avvicinare il timeout Overpass più di prima — nessun accesso Overpass live qui per misurarlo; il precedente diretto nello stesso repo con timeout più lungo è la base per questa scelta, non una garanzia. **Fuori scope per questo giro**: `buildHikeFromFound` (percorsi "trovati" per nome/relation OSM, non la riproduzione specifica dell'audit); integrazione con le callout vocali in navigazione attiva (i `difficultyMarkers` da GPX importato non ne generano nemmeno oggi — questo fix porta i percorsi costruiti alla stessa parità già esistente, non oltre); `highway=via_ferrata` (cambierebbe quali percorsi il motore propone come "camminabili", modifica di generazione più ampia di un fix di rilevamento). | `lib/osm/sacScale.ts`, `lib/overpass.ts`, `lib/routeBuilder/osmGraph.ts`, `lib/routeBuilder/loopBuilder.ts`, `lib/routeBuilder/scoreCandidates.ts`, `lib/routeBuilder/buildHikeFromCandidate.ts`, `lib/difficultyMarkers.ts`, `app/api/route-build/step/enrich/route.ts` | Nuovi test unitari (`sacScale.test.ts`, `loopBuilder.test.ts`) verdi; una vera generazione Route Builder end-to-end richiede una chiamata Overpass live, non eseguibile da questo sandbox. |

### P1 — Compromette gravemente l'esperienza

| # | Problema | Dove |
|---|---|---|
| 11 | ✅ **Risolto (parzialmente — vedi limite dichiarato sotto)** — `fetchDtmTile` folda ogni fallimento (rate limit, bbox fuori copertura, chiave non valida, timeout, GeoTIFF non decodificabile) nello stesso `null`, zero distinzione. Corretto con `classifyDtmFailure` (pura, testata: HTTP 429 → `'rate_limited'`, transitorio — si risolve da solo; ogni altro fallimento → `'no_coverage'`, non si risolve ritentando) e un callback opzionale `onUnavailable`, propagato senza breaking change attraverso `fetchDtmTile → fetchDtmTileCached → enrichGeometryWithElevation → enrichBuiltCandidateWithRealElevation` fino a un nuovo campo opzionale `ScoredCandidate.elevationUnavailableReason` — non cambia il contratto "mai un'eccezione qui" di cui altri chiamanti tolleranti dipendono (`lib/routeBuilder/resolveTrack.ts:108`, `lib/dtm/graphElevation.ts`), zero rischio di regressione lì. Log server ora esplicito sul motivo (`fetchDtmTile fallito per bbox ... (rate_limited\|no_coverage)`). **Limite dichiarato**: il motivo è propagato fino al candidato scelto ma **non arriva ancora alla UI** — l'arricchimento DTM reale scatta solo al click "Salva" (`saveResultItemToGuide`), che salva e reindirizza immediatamente alla guida senza un punto naturale per mostrare un avviso che sopravviva alla navigazione (nessun toast in questo repo, e `PlannedHike` non porta oggi alcun flag "quota stimata" post-salvataggio — gap preesistente più ampio di questo ticket). Il campo è comunque già disponibile per un futuro giro UI (es. banner sulla guida salvata) senza ulteriore lavoro sul lato dati. | `lib/dtm/dtmClient.ts`, `lib/dtm/dtmCache.ts`, `lib/dtm/elevationEnrich.ts`, `lib/routeBuilder/scoreCandidates.ts` | Nuovo test unitario (`lib/dtm/__tests__/dtmClient.test.ts`) verde; suite `vitest` completa (96/96) verde; nessuna chiamata OpenTopography reale possibile da questo sandbox. |
| 12 | ✅ **Risolto (parzialmente — vedi limite dichiarato sotto)** — I tre client restano non verificabili contro una risposta live da questo sandbox (egress verso `wms.pcn.minambiente.it`/l'endpoint WFS uso-suolo/`portal.opentopography.org` bloccato dalla policy di rete — stesso limite, confermato di nuovo con un test diretto in questa sessione, non solo dichiarato). Aggiunta la verifica massima possibile senza rete: gli helper puri di parsing (`extractDesignation`, `extractFeatureBlocks`, `extractGeometry`, `extractFlatProperties` in `natura2000Client.ts`; `extractClassCode` in `usoSuoloClient.ts`) sono ora esportati e testati contro fixture GML/WFS costruite a mano seguendo esattamente le convenzioni WFS 1.1.0/GML 3.1.1 e i nomi campo candidati già documentati nel codice (`featureMember` singolo e wrapper `featureMembers`, `posList` con ordine lat/lon per URN CRS vs `coordinates` legacy lon/lat, ring esterno+foro, precedenza `sic_zsc`/`zps` sui campi di designazione generici, nessuna fabbricazione di codice/designazione da un valore non riconosciuto). Questo verifica la coerenza interna del parser con le proprie assunzioni dichiarate — non equivale a una conferma contro il server reale, ma è la prima copertura di test che questi due client abbiano mai avuto, e avrebbe intercettato una classe di bug reale (tag/struttura non nella forma attesa) se presente. `openTopographyClient.ts` (DTM) non ha logica di parsing hand-rolled propria (decodifica GeoTIFF via libreria `geotiff`, non XML a mano) — già coperto indirettamente dal fix P1 #11 sullo stesso client. | `lib/natura2000/natura2000Client.ts`, `lib/usosuolo/usoSuoloClient.ts` | Nuovi test unitari (`natura2000Client.test.ts`, 23 casi; `usoSuoloClient.test.ts`) verdi; suite `vitest` completa (119/119) verde; nessuna chiamata di rete reale possibile da questo sandbox (verificato con un tentativo diretto in questa sessione, non solo per sentito dire). |
| 13 | ✅ **Risolto (quick win)** — Verificato in questa sessione: dead-band di rumore elevazione ora presente anche per import file/URL/KML, stessa soglia usata per attività/FIT registrate (`// Dead-band against raw GPS-elevation noise`). | `lib/gpxParser.ts:125`, `lib/serverGpxParser.ts:63`, `lib/kmlParser.ts:97` |
| 14 | ✅ **Risolto** — Verificato: nessun limite in tutta la catena (client `file.text()`/`arrayBuffer()` su qualunque file scelto/trascinato; server `res.text()`/`arrayBuffer()` illimitato su un URL esterno scelto dall'utente, in 4 punti identici — GPX, KML/KMZ, GeoJSON, pagina HTML che li linka). Nuovo modulo condiviso `lib/fetchBoundedBody.ts` (`textBounded`/`bufferBounded`): legge il body **a stream**, non solo controllando `Content-Length` (che il server può omettere o dichiarare in modo scorretto) — interrompe la lettura appena supera la soglia, senza mai accumulare oltre il limite in memoria. `MAX_IMPORT_FILE_BYTES` (20MB, generoso per una traccia anche molto densa) usato sia lato client (`GpxUploader.tsx`, controllo su `file.size` **prima** di leggere il contenuto — niente blocco del thread principale su un file enorme) sia lato server (`gpxSourceFetch.ts`, `kmlSourceFetch.ts`, `geoJsonSourceFetch.ts`); `MAX_HTML_PAGE_BYTES` (5MB) più stretto per le pagine HTML che linkano una traccia (incluso `app/api/route-import/route.ts`'s `fetchPageHtml`, stesso pattern). Fallisce con lo stesso comportamento tollerante già esistente in ogni punto (server: `catch { return null }` invariato; client: nuovo `errorMsg` esplicito con la dimensione del file e il limite). | `lib/fetchBoundedBody.ts`, `lib/gpxSourceFetch.ts`, `lib/kmlSourceFetch.ts`, `lib/geoJsonSourceFetch.ts`, `app/api/route-import/route.ts`, `components/upload/GpxUploader.tsx` | Nuovi test unitari (`lib/__tests__/fetchBoundedBody.test.ts`, 7 casi — incluso un body a stream multi-chunk senza Content-Length) verdi; suite `vitest` completa (126/126) verde. |
| 15 | ✅ **Risolto** — Verificato: `attempts`/`lastError` erano nello schema ma nessun punto del codice li scriveva mai — ogni riga fallita restava pendente e veniva ritentata alla stessa cadenza aggressiva di ogni riga sana (debounce 15s, ogni cambio di visibilità, ogni riconnessione, il safety net orario), per sempre, senza mai smettere né segnalare che qualcosa fosse bloccato. Nuova `obRecordFailure` (`lib/localStore.ts`) scrive `attempts`/`lastError`/il nuovo `lastAttemptAt` a ogni fallimento — mai cancella la riga, un dead-letter qui significa "smetti di ritentare in automatico", mai "perdi il dato". Backoff esponenziale puro e testato (`backoffMs`/`isRowDueForRetry`, `lib/sync/syncEngine.ts`: 30s→60s→120s...tetto 30 min) applicato **prima** di proporre una riga al flusher — una riga in backoff non viene nemmeno tentata, non solo "fallisce di nuovo". Oltre `MAX_SYNC_ATTEMPTS` (10, ~2.5 ore di tentativi crescenti) una riga diventa dead-letter: esclusa da ogni retry automatico finché un nuovo edit dell'utente sullo stesso record non la resetta (`RESET_RETRY_STATE` nel merge di `obEnqueue` — un edit fresco merita un tentativo fresco, non l'eredità del backoff di un fallimento precedente). `flushRows` (il loop condiviso usato da 5 dei 6 store con outbox) ora cattura il messaggio d'errore reale per riga invece di scartarlo nel `catch`; il flusher isolato di `userSettingsStore.ts` (merge dell'intero batch in un solo PATCH) aggiornato allo stesso contratto. | `lib/localStore.ts`, `lib/sync/syncEngine.ts`, `lib/sync/userSettingsStore.ts` | Nuovi test unitari (`lib/sync/__tests__/syncEngine.test.ts`, 9 casi — backoff, dead-letter, cattura errori) verdi; suite `vitest` completa (135/135) verde. `obEnqueue`/`obRecordFailure` non testabili con IndexedDB reale da questo sandbox (`environment: 'node'` in `vitest.config.ts`, nessun `indexedDB` globale — le funzioni degradano a no-op sicuro, stesso comportamento già accettato per ogni altra funzione di `localStore.ts`); la policy pura di backoff/dead-letter è comunque interamente coperta. |
| 16 | ✅ **Risolto** — Nuovo modulo condiviso `lib/arrayMinMax.ts` (`arrayMax`/`arrayMin`, un loop invece dello spread — stesso principio già usato da `lib/gpxParser.ts:136-139` e da `components/RouteMap3D.tsx`'s `seriesMax`/`seriesMin`, dove questo identico bug era **già stato trovato una volta in produzione**: finiva nel catch della preparazione video come il fuorviante "riprova con meno foto/POI"). Applicato ai due punti citati dall'audit (`gpxActivityParser.ts`, `parse-fit/route.ts`) più un terzo trovato durante la verifica — `lib/navigation/trackToActivity.ts`, che il proprio commento descrive letteralmente come "same stat computation as parseGpxActivity": stessa forma, stessi dati (traccia GPS grezza, potenzialmente decine di migliaia di punti per una navigazione live lunga), stesso bug, mai coperto dal fix del "file gemello" citato dall'audit. Non toccati (deliberatamente, rischio già basso): i ~90 altri usi di `Math.max/min(...arr)` nel resto del repo operano su serie intrinsecamente piccole/limitate (meteo orario 24-168 voci, bin mensili, bbox di poche decine di punti per un thumbnail, liste di attività) — categoria diversa da una traccia GPS grezza non campionata. | `lib/arrayMinMax.ts`, `lib/gpxActivityParser.ts`, `lib/navigation/trackToActivity.ts`, `app/api/parse-fit/route.ts` | Nuovo test unitario sull'helper (`lib/__tests__/arrayMinMax.test.ts`, incluso un array da 200k elementi che dimostra `Math.max(...arr)` lanciare davvero `RangeError` su questo Node, dove `arrayMax` no) + test end-to-end sul chiamante reale (`lib/navigation/__tests__/trackToActivity.test.ts`, traccia da 150.000 punti); suite `vitest` completa (142/142) verde. |
| 17 | ✅ **Risolto** — Confermato il problema esatto: `trailScore` (60% del peso) era il TrailScoreV2 **già gated dalla Sicurezza** (`cachedTsTotal`), quindi un percorso sicuro ma faticoso/poco adatto al profilo dell'utente collassava nello stesso punteggio basso di un percorso davvero pericoloso — mostrato con la stessa etichetta "Affidabilità bassa" e la stessa icona a scudo rosso (`ShieldAlert`, universalmente lo stesso codice visivo usato altrove nell'app per un pericolo reale). Corretto separando i due segnali: `trailScore` ora è il Comfort TrailScore personale NON gated (`cachedTrailScore`), e un nuovo `safetyScore` (`cachedSafetyScore.overall`) applica lo stesso gate non-compensabile di `lib/trailScoreV2.ts` ma **separatamente**, con un fattore testuale distinto ("Punteggio di Sicurezza basso/moderato in fase di pianificazione — non un giudizio di comodità") mai mescolato nella stessa frase del Trail Score personale (ora esplicitamente "ti si addice bene/nella media/potrebbe risultarti più faticoso — non è un giudizio di sicurezza"). UI (`TrailConfidenceBadge.tsx`) rinominata coerentemente: via "Affidabilità" + icone a scudo (codificate universalmente come sicurezza), sostituite con "Quanto ti si addice questo percorso" + icone neutre (pollice su/giù, tachimetro), disclaimer esplicito che rimanda al Punteggio Sicurezza dedicato per il giudizio di rischio vero e proprio. | `lib/navigation/trailConfidence.ts`, `components/navigation/useTrailConfidence.ts`, `components/navigation/ActiveNavigationView.tsx`, `components/navigation/TrailConfidenceBadge.tsx` | Nuovi test unitari (`lib/navigation/__tests__/trailConfidence.test.ts`, +5 casi sul canale separato) verdi; suite `vitest` completa (146/146) verde. |
| 18 | ✅ **Già risolto dal giro di quick win precedente** (non riflesso nella tabella P1 — stesso gap di #13/#19) — verificato in questa sessione: `computeTrailConfidence` calcola già `label = hasBaseSignal ? labelFor(score) : 'sconosciuta'` (`lib/navigation/trailConfidence.ts:131`), con un commento esplicito sul bias "assenza-dato-trattata-come-neutro" da evitare, e un test dedicato (`trailConfidence.test.ts`: "resta 'sconosciuta' anche con un piccolo correttivo community, se manca ogni segnale di base"). Nessuna modifica necessaria. | `lib/navigation/trailConfidence.ts:131` | Verifica di lettura + test esistente confermato verde in questa sessione. |
| 19 | ✅ **Risolto (quick win)** — Verificato in questa sessione: tutti i controlli principali (pausa/stop/chiudi/audio/bussola) ora a 44px (`ICON_BTN = 'w-11 h-11 ...'`), con commento esplicito nel codice sul perché ("tra i pulsanti più toccati durante il cammino"). | `InstructionBanner.tsx:30,34`, `NavBottomStrip.tsx:17,19` |
| 20 | ✅ **Risolto** — Nessuna vera modalità alto contrasto: gli sfondi semi-trasparenti dietro il testo di navigazione (`bg-black/40-45`, già rinforzati da un giro di quick win precedente) restano insufficienti sotto sole diretto o su uno schermo molto luminoso. Nessun sensore di luce ambientale è disponibile a una pagina web in un browser moderno (rimosso ovunque per privacy) — l'unica strada realistica è un interruttore manuale, stesso principio già usato per "Mantieni lo schermo acceso" nello stesso pannello. Nuovo toggle "Modalità alto contrasto (sole forte)" in `NavStatsSheet.tsx` (pannello dettagli, aperto dal pulsante "Dettagli"), persistito in `localStorage` (`lib/navigation/highContrastPref.ts` — preferenza di visualizzazione legata allo schermo/momento, non un dato utente da sincronizzare tra dispositivi, stesso principio già usato da `SpeedChart.tsx`/`HRChart.tsx`). Quando attivo, `InstructionBanner.tsx` e `NavBottomStrip.tsx` passano a sfondo **pieno opaco** (`bg-black`, non `bg-black/40-45`) per testo e pulsanti icona, invece del semi-trasparente di default. **Limite dichiarato**: nessun browser reale disponibile in questo sandbox per verificare visivamente il risultato sotto sole reale — solo `tsc`/build verificati; il toggle non è wired nella registrazione libera (`app/navigatore/traccia/page.tsx`), che già oggi non espone nemmeno il toggle "schermo acceso" gemello — stessa parità, non una regressione introdotta da questo fix. | `lib/navigation/highContrastPref.ts`, `components/navigation/InstructionBanner.tsx`, `components/navigation/NavBottomStrip.tsx`, `components/navigation/NavStatsSheet.tsx`, `components/navigation/ActiveNavigationView.tsx` | `tsc --noEmit` pulito; suite `vitest` completa (146/146) verde (nessun nuovo test — puro wiring UI/localStorage, nessuna logica pura da isolare); verifica visiva reale non eseguibile da questo sandbox (nessun browser/dispositivo). |

### P2 — Problemi importanti

| # | Problema | Dove |
|---|---|---|
| 21 | ✅ **Risolto (parzialmente — vedi limite dichiarato sotto)** — Le soglie di `classifyTrailScore` (90/50/15) erano documentate contro un solo caso reale, senza alcun test. Nessuna chiamata Overpass reale possibile da questo sandbox (egress bloccato dalla policy di rete, confermato con un tentativo diretto), quindi non è possibile ampliare il dataset di calibrazione con altri casi reali in questo giro. Aggiunta la massima verifica possibile senza rete: gli helper puri di scoring (`scoreWayTags`, `scoreRelationTags`, `computeUrbanPenalty`, `isUrbanTransferWay`, `isExcluded`, `scoreProtectedAreas`, `scorePoiProximity`) esportati e testati contro 17 profili di tag OSM sintetici ma realistici (convenzioni di tagging escursionistico italiane: sac_scale/trail_visibility/osmc:symbol via CAI, footway/via urbana asfaltata vicino a un centro abitato, guado, sabbia costiera, tracktype) — inclusi un test di monotonicità sulle soglie e i confini esatti 14/15, 49/50, 89/90. Nessun bug trovato nella lettura attenta della logica di scoring. Trovato e corretto un problema strutturale scoperto scrivendo i test: `hikingProbability.ts` importava `lib/supabase.ts` staticamente in cima al file (usato da una sola funzione I/O, `fetchRawHikingDataCached`) — rendeva impossibile importare gli helper puri da un test senza credenziali Supabase reali (`createClient('', '')` lancia su env var mancanti). Corretto con un `await import()` dinamico scoped alla funzione che lo usa, stesso principio già adottato altrove nel repo per moduli pure+I/O misti. | `lib/routeBuilder/hikingProbability.ts` | Nuovo test unitario (`lib/routeBuilder/__tests__/hikingProbability.test.ts`, 17 casi) verde; suite `vitest` completa (163/163) verde; nessuna verifica contro un dataset OSM reale più ampio possibile da questo sandbox — limite dichiarato, non risolvibile senza accesso di rete a Overpass. |
| 22 | ✅ **Risolto (mirato, su conferma esplicita dell'utente — vedi nota)** — Confermato: il Dijkstra minimizzava solo la distanza, un percorso poteva venire SCELTO attraverso una scalinata o un tratto SAC T3+/T4+ anche per chi aveva dichiarato di volerli evitare, se era il più corto — la penalità a valle si limitava a fargli avere un punteggio più basso tra candidati già generati, mai a impedire che il pathfinding lo scegliesse. Nessun dato di pendenza è disponibile al momento del routing (il grafo non porta l'elevazione dei nodi qui), quindi il proxy usato è lo stesso segnale già presente sull'arco (fix P0 #10): scala SAC T4+ e `highway=steps`. **Scope concordato con l'utente prima di procedere** (rischio non verificabile dal vivo contro Overpass in questo sandbox): nuovo costo extra nel Dijkstra applicato **solo quando l'utente ha già dichiarato preoccupazioni pertinenti** (vertigini/salite_ripide/terreno_instabile/orientamento — stesso segnale opt-in già usato a valle in `scoreCandidates.ts`) — **zero cambiamento di comportamento per chi non le ha dichiarate**, il percorso più corto attraverso terreno tecnico resta sempre disponibile come alternativa (mai escluso, solo penalizzato) se è l'unica via. `concerns` era già calcolato e disponibile in ogni punto della pipeline (`prepareNetworkStep`, `route-build/route.ts`) tranne l'ultimo miglio verso il pathfinding stesso — thread-through, non un nuovo fetch. | `lib/routeBuilder/loopBuilder.ts`, `lib/routeBuilder/buildSteps.ts`, `app/api/route-build/route.ts`, `app/api/route-build/step/candidates/route.ts`, `components/upload/RouteBuilder.tsx` | Nuovi test unitari (`lib/routeBuilder/__tests__/loopBuilder.test.ts`, +7 casi: moltiplicatore isolato + un test end-to-end che dimostra il pathfinding scegliere davvero un percorso più lungo per evitare una scalinata quando `vertigini` è dichiarata) verdi; suite `vitest` completa (170/170) verde; nessuna verifica dal vivo contro una rete OSM reale possibile da questo sandbox — limite dichiarato. |
| 23 | ✅ **Risolto** — Confermato e circoscritto: `comfortVerdict`/`comfortNote` sono generati dall'LLM sui numeri (`distanceKm`/`elevationGainM`) che lui stesso ha stimato dal web, in un'unica passata — mai ricalcolati/ri-verificati dopo che il candidato viene risolto contro OSM/DTM reale in `handleFound` (`components/upload/RouteBuilder.tsx`), quindi la nota testuale ("dislivello superiore alla tua media recente" ecc.) può restare ancorata a un numero superato mentre le statistiche mostrate accanto (già reali a quel punto) sono corrette — esattamente la stessa forma di "due numeri accanto, uno stimato uno vero, indistinguibili" già vista in altri item di questo audit. Ri-generare il verdetto via LLM dopo la risoluzione avrebbe un costo/latenza aggiuntivi non proporzionati qui — corretto invece rilevando la divergenza: nuova `isComfortVerdictStale` (pura, testata) confronta la stima originale (ora preservata su `FoundRouteItem.estimatedDistanceKm/estimatedElevationGainM`) contro i numeri reali risolti, soglia prudente al 40% relativo (un piccolo scarto da stima web ragionevole non fa scattare nulla). Quando supera la soglia, lo step di conferma mostra un avviso esplicito sotto la nota ("Valutazione basata su una stima iniziale — i numeri reali qui sopra sono diversi, potrebbe non essere più accurata") invece di lasciare il giudizio dell'LLM apparire autorevole quanto i numeri reali accanto. Fuori scope (nessun dato da confrontare disponibile a quel punto): la lista risultati iniziale (`RouteResultCard.tsx`), dove solo la stima dell'LLM esiste ancora, prima di qualunque risoluzione. | `lib/routeBuilder/foundRoute.ts`, `components/upload/RouteBuilder.tsx` | Nuovo test unitario (`lib/routeBuilder/__tests__/foundRoute.test.ts`, 7 casi) verde; suite `vitest` completa (177/177) verde. |
| 24 | ✅ **Risolto (mirato — vedi limite dichiarato sotto)** — Confermato: `reason` diceva incondizionatamente "punto di appoggio sicuro" per qualunque hut/bivouac/shelter, indipendentemente dalla reale apertura — un pericolo reale in un'emergenza (l'Escape Engine è esattamente il percorso "GPS perso/fuori sentiero"). La soluzione completa (fonte gestionale dedicata CAI/Rifugi.net con orari/posti letto affidabili) resta un progetto multi-fase esplicitamente non ancora iniziato (`docs/rifugi-progettazione.md`: richiede prima verificare se quella fonte espone un'API pubblica, non verificabile da questo sandbox — network bloccato). Fatto quello che **è** già alla portata di questa sessione, dentro lo scope "v1 solo-OSM" che il team stesso aveva già approvato come "valore immediato, zero rischio": il tag OSM `opening_hours` grezzo era **già scaricato** su ogni POI (`lib/overpass.ts`'s `PoiItem.tags`) ma silenziosamente scartato prima di arrivare all'Escape Engine (`NavPoi`, la forma ridotta usata lì, non lo portava). Ora propagato (`NavPoi.openingHours`, zero chiamate di rete aggiuntive) e mostrato così com'è nel motivo (nessun parser della sintassi `opening_hours`, notoriamente complessa — fuori scope, mai un'interpretazione inventata). "Punto di appoggio sicuro" non compare più incondizionatamente: con orari noti, il testo li riporta e invita comunque a verificare; senza, dichiara esplicitamente "apertura non verificata: non è detto sia raggiungibile o presidiato". | `lib/navigation/types.ts`, `components/navigation/ActiveNavigationView.tsx`, `lib/navigation/escapeEngine.ts` | Nuovi test unitari (`lib/navigation/__tests__/escapeEngine.test.ts`, +3 casi) verdi; suite `vitest` completa (180/180) verde. Fuori scope, limite dichiarato: nessuna verifica di apertura realmente affidabile (richiede la fonte esterna dedicata del piano `docs/rifugi-progettazione.md`, non ancora integrata). |
| 25 | ✅ **Risolto** — Confermato: la coda `normal` non aveva né un limite di dimensione né una scadenza — in un tratto denso di POI gli annunci si accumulavano e venivano pronunciati anche minuti dopo che l'escursionista era già passato oltre. Due correttivi indipendenti, entrambi funzioni pure esportate e testate: `trimQueueOverflow` (`MAX_QUEUE_SIZE = 3` — un nuovo avviso a coda piena scarta il PIÙ VECCHIO, non il più nuovo, perché è quello meno rilevante alla posizione attuale) e `dropStaleQueueHead` (`MAX_QUEUE_AGE_MS = 60s` — un avviso rimasto in coda troppo a lungo viene saltato invece di essere pronunciato comunque, applicato a ogni `playNext()`). Il comportamento `critical` (interrompe sempre, mai accodato) resta invariato. | `lib/navigation/speech.ts` | Nuovi test unitari (`lib/navigation/__tests__/speech.test.ts`, 10 casi — le due funzioni pure isolate + un comportamento end-to-end di `speak()` con un Web Speech API finto: FIFO, limite di dimensione, interruzione `critical`, dedup) verdi; suite `vitest` completa (190/190) verde. |
| 26 | Nessun onboarding contestuale della UI di navigazione (SOS, vie d'uscita, layer, colori) | `components/onboarding/OnboardingWizard.tsx` (copre solo profilo escursionista) |
| 27 | Fix per titoli GPX multilingua (`<name><it>…</it><en>…</en>`) applicato solo a metà dei parser paralleli | `lib/gpxActivityParser.ts:26-27` vs. `lib/gpxParser.ts:71-84` |
| 28 | Nessuna stima di copertura di rete, pur essendo un prerequisito critico per tutto lo stack SOS | `components/navigation/TrailConfidenceBadge.tsx:74-77` (dichiarato assente in UI) |
| 29 | ✅ **Già risolto dal giro di quick win precedente** (non riflesso nella tabella — stesso gap di #13/#18/#19) — verificato in questa sessione: `verifyOfflinePackageChecksum` (`lib/offline/packageManager.ts:233-249`) rilegge davvero Cache Storage e confronta con `manifest.checksum`, chiamata da `ActiveNavigationView.tsx:630` prima di fidarsi del pacchetto, con un avviso "Integrità mappa offline non verificata" se il confronto fallisce. `computeChecksum` è stato reso anche order-independent (somma pura, non un hash sull'ordine di enumerazione di Cache Storage, mai garantito uguale all'ordine di download) — il difetto originale che avrebbe fatto fallire la verifica anche su un pacchetto intatto. Nessuna modifica necessaria. | `lib/offline/packageManifest.ts:99-104`, `lib/offline/packageManager.ts:233-249`, `components/navigation/ActiveNavigationView.tsx:630` | Verifica di lettura confermata in questa sessione — codice e collegamento reale, non solo la funzione definita. |
| 30 | Endpoint Diario `?all=true` scarica il markdown integrale di ogni resoconto senza paginazione — noto, documentato, non risolto (B27) | `app/api/resoconto/route.ts:326-331` |
| 31 | Beauty Score del percorso omaggio inizialmente calcolato con i pesi TEI personali dell'owner, non neutri — trovato e corretto una volta, ma segnala fragilità del principio "neutro di default" altrove | `docs/navigator-dtrek-boundary.md` §percorso omaggio |
| 32 | Link pubblico del resoconto (`/leggi/r/[activityId]`) usa l'ID in chiaro invece di un token opaco, a differenza di `/s/[token]` — noto, non risolto (B32) | `app/leggi/r/[activityId]/page.tsx` |
| 33 | `preserveDrawingBuffer` ignorato in silenzio su MapLibre 5 (cast a `any`) — lo screenshot della vista 3D (`handleCapture`) probabilmente produce un PNG nero/vuoto — noto, non risolto (B21) | `components/RouteMap3D.tsx:1728,2011` |
| 34 | Nessuna app iOS — solo `android/` in Capacitor; su iOS l'utente ha solo il PWA web, senza foreground service nativo | `capacitor.config.ts`, cartella `android/` (nessuna `ios/`) |

### P3 — Minori

| # | Problema | Dove |
|---|---|---|
| 35 | Foto scaricate a piena risoluzione anche quando mostrate come miniatura ritagliata — nessuna colonna thumbnail (V07, non risolto) | `lib/activityPhotos.ts`, `utils/shareImage/carousel.ts` |
| 36 | `StatCard` del Diario usa verdi Tailwind generici invece della palette brand DTrek (B30, cosmetico, deliberatamente rimandato) | `components/diario/types.ts:40-43` |
| 37 | Margine di stampa nativa (Ctrl+P) in conflitto con il layout `.diario-page` (B45, minore, rimandato) | `app/globals.css:107` |

### P4 — Miglioramenti

| # | Problema | Dove |
|---|---|---|
| 38 | Nessuna granularità per feedback vocale/aptico (solo un interruttore globale) — impossibile avere "solo avvisi critici, niente narrazione POI" | `ActiveNavigationView.tsx:707-710` |
| 39 | Layer "sentieri vicini" + POI entrambi attivi di default, densità visiva superflua nel primo colpo d'occhio | `ActiveNavigationView.tsx:187-188` |

---

## 7. Algoritmi — analisi critica (INPUT → LOGICA → OUTPUT → ERRORI → IMPATTO)

### 7.1 Position Engine (filtro di posizione GPS)
- **INPUT**: fix GPS grezzi (lat/lon/accuracy/velocità/bearing/timestamp).
- **LOGICA**: quality gate (coordinate finite, accuracy plausibile, timestamp non futuro/non stantio) → rigetto spike (velocità implicita oltre soglia, al netto del rumore combinato) → filtro di Kalman a velocità costante, per asse, con varianza di misura scalata sull'accuracy del fix. `sample()` estrapola in avanti fino a 5s oltre l'ultimo fix reale.
- **OUTPUT**: posizione stimata + accuratezza filtrata + flag `interpolated`/`ageMs`.
- **POSSIBILI ERRORI**: nessuno strutturale rilevato — è la parte più solida e testata del prodotto (verificato con dati GPS reali).
- **IMPATTO UTENTE**: positivo — marker fluido, degrado prevedibile su GPS scarso, nessuna posizione "fantasma" mostrata.

### 7.2 Off-Route Engine
- **INPUT**: distanza dal percorso, accuratezza GPS, bearing corrente vs. atteso, velocità.
- **LOGICA**: soglia dinamica (base 20m + slack proporzionale all'accuracy), isteresi **temporale** (non a conteggio fix) per entrare/uscire da `off_route`, trend della divergenza, stato `uncertain` distinto quando l'accuracy non permette un verdetto, `wrong_direction` valutato solo quando on-route e sopra una velocità minima.
- **OUTPUT**: `on_route`/`uncertain`/`off_route` + flag `wrong_direction`.
- **POSSIBILI ERRORI**: costanti (dwell 15s/5s, soglia 20m) calibrate su un solo test reale (Monte Cimino) — non su un dataset ampio di terreni/velocità diverse.
- **IMPATTO UTENTE**: basso rischio — architettura solida, degrado ragionato; il vero rischio è a monte (§6, P0#2, `RouteTracker` non resetta la finestra di ricerca su salti ampi).

### 7.3 Trail Score (fatica/bellezza personalizzata)
- **INPUT**: distanza, dislivello, quota, `sacScale`/`surfaces` (quasi mai valorizzati — ammesso in `lib/safetyScore.ts:238`), FC media opzionale, storico personale, Beauty Score (da TEI).
- **LOGICA**: tempo Naismith × moltiplicatori terreno/altitudine → fatica; punteggio = curva log calibrata empiricamente (`stretch` a gamma 0.6, dichiarato dall'autore come correzione ad hoc) tra bellezza e fatica.
- **OUTPUT**: 0-100 con etichetta in seconda persona ("Perfetto per te").
- **POSSIBILI ERRORI**: assenza di `sacScale`/`surfaces` reali fa ricadere il moltiplicatore-terreno su un default neutro (1.00) — **assenza di dato trattata come dato neutro/facile, non come sconosciuto**.
- **IMPATTO UTENTE**: il punteggio comunica più precisione di quanta la pipeline reale sostenga quando mancano i tag OSM di difficoltà tecnica.

### 7.4 Trail Score v2 (gate di sicurezza)
- **INPUT**: Comfort Trail Score + Safety Score.
- **LOGICA**: `score = CTS × safetyGate(safety)`, sigmoide sotto soglia 35. Se uno dei due input è `null`, ritorna `null` (non un default ottimistico) — **buona pratica**.
- **OUTPUT**: 0-100 o `null`.
- **POSSIBILI ERRORI**: eredita interamente il bias del Safety Score sottostante (§7.5) — il gate è corretto nella forma, debole nella sostanza del segnale che gate-a.
- **IMPATTO UTENTE**: un percorso davvero pericoloso (corto/ripido/esposto) può passare il gate senza penalità.

### 7.5 Safety Score
- **INPUT**: dislivello, distanza, dati fauna/pendenza opzionali.
- **LOGICA**: `D = √(2·dislivello·km)` come proxy di "tecnicità/pericolo del terreno".
- **OUTPUT**: 0-100.
- **POSSIBILI ERRORI**: il codice stesso lo ammette (`lib/safetyScore.ts:236-241`) — è una misura di fatica fisica, non di tecnicità. `refineSafetyWithSlope` corregge parzialmente con la pendenza DTM, ma solo se il chiamante gliela passa.
- **IMPATTO UTENTE**: **il falso negativo di sicurezza più rilevante del prodotto** — vedi §6, P0#3.

### 7.6 TEI / Beauty Score
- **INPUT**: POI (Overpass/PTPR/GNA/Wikidata), profilo altimetrico, uso-suolo/DTM opzionali, Natura2000 opzionale, 5 pesi utente (cultura/topografia/idrografia/fondo/geodiversità).
- **LOGICA**: 5 componenti pesate + penalità antropica moltiplicativa (asfalto, elettrodotti, strade trafficate). Default esplicitamente **neutro 5** (non 0, non 10) quando un dato manca — scelta motivata e onesta.
- **OUTPUT**: 0-10 per componente, aggregato pesato + `confidence: 'estimated'|'default'`.
- **POSSIBILI ERRORI**: pesi di default arbitrari (20/30/20/20/10), non derivati da uno studio; il fallback uso-suolo per la componente "fondo" è verosimilmente **sempre inattivo** in produzione (client mai verificato, §7.9); `confidence` sconta solo il 5% del punteggio finale — un avviso cosmetico più che sostanziale.
- **IMPATTO UTENTE**: la gestione dei dati mancanti è la più onesta di tutto il sistema di scoring, ma l'interfaccia non comunica mai esplicitamente "5 perché non valutato" vs "5 perché genuinamente medio".

### 7.7 Trail Confidence
- **INPUT**: Trail Score (peso 0.6), penalità meteo+clima (peso 0.4), correttivo community (max +0.1, mai un componente alla pari).
- **LOGICA**: media pesata dei componenti presenti; nessun segnale → 0.5/"media" con motivo esplicito "dati insufficienti".
- **OUTPUT**: 0-1 + etichetta alta/media/bassa + `factors[]`.
- **POSSIBILI ERRORI**: (a) confonde concettualmente "mi si addice" con "è affidabile" — §6 P1#17; (b) eredita il bias ottimistico dei fallback meteo/clima (penalità 0 su errore rete, indistinguibile da "verificato buono") — §6 P0#6; (c) etichetta "media" invece di "sconosciuta" quando i dati mancano — §6 P1#18.
- **IMPATTO UTENTE**: il nome del prodotto promette più di quanto il calcolo v1 misuri oggi — il codice stesso lo dichiara ("più leggera della definizione a 7 segnali della roadmap").

### 7.8 Route Builder (grafo OSM + Dijkstra)
- **INPUT**: bbox, punto di partenza, tipo percorso, lunghezza target, rete Overpass.
- **LOGICA**: grafo nodo-arco puro camminabile; Dijkstra minimizza solo la distanza; classificatore euristico "probabilità sentiero escursionistico" quando mancano relation OSM curate, tarato su un solo caso reale.
- **OUTPUT**: candidati percorso, poi scored/filtrati.
- **POSSIBILI ERRORI**: nessun peso di pericolo/pendenza nel routing stesso (solo a valle, §6 P2#22); classificatore non generalizzato (§6 P2#21); "tetto morbido" di 45s con `Promise.race` non cancella davvero il calcolo abbandonato — spreco di budget Overpass/DTM riconosciuto nel codice ma non risolto.
- **IMPATTO UTENTE**: un percorso "su misura" può includere tratti tecnicamente impegnativi senza segnalarlo, a meno che l'utente non abbia già dichiarato preoccupazioni specifiche nel profilo.

### 7.9 Client dati ambientali (DTM/Natura2000/Uso Suolo)
- **INPUT**: bbox, coordinate.
- **LOGICA**: doppio failure-mode dichiarato — "non configurato" (eccezione) vs "nessuna copertura" (`null` silenzioso) — con circuit breaker condiviso (3 fallimenti → 60s cooldown).
- **OUTPUT**: profilo altimetrico reale, flag area protetta, classe uso-suolo — o `null`/stima geometrica.
- **POSSIBILI ERRORI**: rate limit DTM (50/24h) indistinguibile da "nessuna copertura" (§6 P1#11); Natura2000 e uso-suolo **mai verificati contro una risposta reale** in questa codebase (§6 P1#12, ammesso testualmente nei commenti).
- **IMPATTO UTENTE**: rischio concreto di fallimento silenzioso in produzione, non coperto da alcun contatore di errore visibile all'utente finale.

### 7.10 Escape Engine
- **INPUT**: posizione corrente, progresso sul percorso, trail graph OSM persistito, POI noti.
- **LOGICA**: 4 opzioni in ordine (torna sul percorso → alternativa via grafo → strada più vicina → POI sicuro), Dijkstra semplice O(n²) accettabile per un calcolo on-demand; ogni opzione porta sempre un `reason` esplicito (invariante testato).
- **OUTPUT**: fino a 4 `EscapeOption` con distanza, sicurezza stimata, motivo.
- **POSSIBILI ERRORI**: sicurezza stimata da distanza+tipo tag OSM, non da un vero calcolo di dislivello (dichiarato, motivato dal costo/rate-limit DTM); nessuna verifica di apertura reale dei rifugi (§6 P2#24); **irraggiungibile durante `gps_lost`** (§6 P0#1) — il difetto più grave dell'intero sistema di navigazione.
- **IMPATTO UTENTE**: funzionalità distintiva e ben progettata nella forma, resa inutile proprio nello scenario per cui è stata costruita.

---

## 8. UX outdoor — punteggi per fase (0-10)

| Fase | Punteggio | Motivazione sintetica |
|---|---|---|
| Ricerca | 6 | Doppio motore di scoperta (AI+web / OSM builder) innovativo ma poco distinto per l'utente; numeri non sempre verificati nel percorso AI. |
| Scelta percorso | 6 | Scoring granulare e ben motivato concettualmente, ma il gate di sicurezza ha un proxy debole per terreno tecnico. |
| Preparazione | 6.5 | Offline readiness ben progettato; manca una checklist esplicita pre-partenza e la stima di copertura rete. |
| Navigazione (UX schermo) | 6 | Motore sottostante eccellente; testo critico a 15px, nessuna modalità sole forte, layer di default troppo densi. |
| Gestione deviazione | 5.5 | Banner ben calibrato, ma Escape Engine irraggiungibile proprio nello scenario peggiore (GPS perso). |
| Consultazione POI | 6 | Icone/tap funzionano bene; acqua non verificata, ombra assente, nessuna fonte/data mostrata. |
| Gestione offline | 6.5 | Architettura readiness solida (hard vs soft requirement); checksum mai verificato, meteo mai offline. |
| Sicurezza | 5 | SOS onesto, ma chiusure sentiero assenti, copertura rete assente, dead-man's switch assente, Escape Engine irraggiungibile in emergenza combinata. |
| Fine percorso | 7.5 | Diario/Resoconto/PDF/"Vette" — il pezzo più maturo e testato del prodotto, mesi di bug-fix reali documentati. |

---

## 9. Confronto con i concorrenti

| Funzione | DTrek | Concorrente migliore | Gap | Priorità |
|---|---|---|---|---|
| Navigazione turn-by-turn offline | Motore sofisticato (Kalman + off-route multi-fattore, testato su GPS reale), ma solo su app Android separata, nessun iOS, nessun wake lock | Komoot/Garmin: nativa iOS+Android, schermo sempre acceso durante navigazione | Nessun iOS; niente wake lock | Alta |
| Comunicazione di emergenza | Solo tel/SMS 112 dipendenti da rete cellulare | Garmin (ecosistema inReach): messaggistica satellitare bidirezionale, SOS globale senza copertura cellulare | Nessuna opzione satellitare | Alta (se risolta, è un vero differenziatore) |
| Chiusure sentiero | Assente | Outdooractive/AllTrails: segnalazioni community, in alcuni casi enti ufficiali | Gap totale | Alta |
| Volume/maturità database percorsi | Costruzione live via OSM+Overpass ovunque + AI web search, ma zero utenti reali oggi (`ai_usage_log`: 0 righe) | Wikiloc: milioni di tracce caricate da escursionisti reali, anni di storico | DTrek non ha ancora massa critica di percorsi verificati sul campo | Alta |
| Mappe offline | Un solo stile raster (Voyager), tile+trail graph+POI, readiness check esplicito | Gaia GPS/Komoot: mappe vettoriali multi-layer offline (topo, satellite, catasto) | Un solo layer offline | Media |
| Personalizzazione percorso | Molto granulare: 5 pesi TEI (cultura/topografia/idrografia/fondo/geodiversità) + sforzo/durata + fitness | Komoot: "sport type" + livello fitness semplice | — | **Vantaggio DTrek** |
| Narrazione AI del percorso | "Giulia": guida AI narrata, arricchimento POI con Wikipedia/note condivise | Nessun concorrente dei 6 ha un equivalente diretto | — | **Vantaggio DTrek / USP potenziale** |
| Trasparenza dell'incertezza | Trail Confidence + `factors[]` espliciti, "Provvisorio" quando i dati sono stimati — ma solo aggregato per l'intero percorso | Nessun concorrente espone esplicitamente un indicatore di affidabilità | DTrek è concettualmente più avanti, ma va esteso al dato puntuale (§10) | Media — **opportunità** |
| Acqua/ombra | Acqua presente ma non verificata (conflazione tipi); ombra esplicitamente non implementata (decisione onesta, documentata) | Nessun concorrente stima automaticamente affidabilità acqua/ombra oggi | Nessuno fa meglio in modo automatico — spazio libero | Media-alta — **opportunità USP** |
| Community/social | Live-share di gruppo, resoconto/diario condivisibile, PDF editoriali di alta qualità | Strava/Komoot: community enorme, follow, kudos | Nessun social graph reale | Bassa priorità ora |
| Prezzo/modello business | Trial 30gg o 2+2, BYOK alternativo, Paddle implementato ma mai testato con un pagamento reale | Komoot: regioni gratuite + pacchetto mondiale one-off; AllTrails: abbonamento consolidato | Modello non ancora validato con utenti reali | Alta (business, non tecnica) |

---

## 10. Fiducia e incertezza — come DTrek comunica "non lo so"

Il prodotto ha già gli embrioni giusti: `confidence: 'estimated'|'default'` in TEI, `factors[]` espliciti in Trail Confidence, `degradedMissing[]` nell'Offline Readiness Check. **Questo è più di quanto facciano Komoot/AllTrails/Wikiloc oggi** — nessuno dei sei concorrenti espone esplicitamente un indicatore di affidabilità del dato.

Ma il sistema attuale ha due difetti strutturali:
1. **Aggregazione eccessiva**: Trail Confidence è un solo badge per l'intera escursione, non un'indicazione per singolo dato (una fonte d'acqua, un rifugio, un marker di pericolo).
2. **Bias sistematico "fallimento = ok"**: quando una chiamata di rete fallisce (meteo, clima, community), il default è quasi sempre "nessuna penalità" — indistinguibile da "verificato, tutto bene" — invece di un terzo stato esplicito "sconosciuto".

**Proposta concreta** (estensione naturale di ciò che già esiste, non una funzione nuova da inventare): ogni dato puntuale critico (fonte d'acqua, rifugio, marker di pericolo, previsione meteo, tratto di sentiero) dovrebbe portare quattro campi, non tre:
- **Affidabilità**: `alta` / `media` / `bassa` / **`sconosciuta`** (oggi manca il quarto stato — un fallimento di rete oggi produce "media/bassa", mai "sconosciuta", perché il default numerico è quasi sempre calcolato come se il dato ci fosse).
- **Fonte**: OSM / community DTrek / AI (stimato) / verificato sul campo.
- **Data** dell'ultimo aggiornamento/verifica.
- **Condizioni di validità**: es. "solo in stagione estiva", "verificato con neve assente".

Questo concetto — "sapere distinguere affidabile da presunto da sconosciuto", non "conoscere più sentieri" — è probabilmente **la vera USP disponibile per DTrek** (approfondito in §13).

---

## 11. Test di semplicità

- **Schermata di navigazione**: rimuovendo il 30% degli elementi di default (layer sentieri-vicini + POI entrambi accesi, frecce di direzione da 11px quasi invisibili, terza taglia di controlli a 40px accanto a 36px/44px) **l'app migliorerebbe** — meno densità visiva nel colpo d'occhio critico, senza perdere funzionalità (restano disponibili dietro toggle).
- **Sistema Premium/Badge**: tredici sessioni di iterazione documentate (`docs/navigator-dtrek-boundary.md`) sull'icona del badge Premium (da Sparkles a Gem custom sfaccettato) — segnale di investimento sproporzionato su un dettaglio estetico rispetto a gap di sicurezza ancora aperti (Escape Engine irraggiungibile, chiusure sentiero assenti). Non è uno spreco in sé, ma è un segnale di priorità da rivedere.
- **Hub di scoperta percorsi**: due percorsi paralleli ("Esistenti" AI+web vs "Su misura" OSM builder) con numeri di affidabilità molto diversa presentati nella stessa gerarchia visiva — semplificare distinguendo chiaramente in UI quale dei due sta mostrando dati verificati vs stimati migliorerebbe la fiducia, non la complessità percepita.
- **Onboarding**: già ben progettato (3 passi, sempre saltabile) — non necessita semplificazione, necessita **estensione** verso la UI di navigazione (mancante, non ridondante).

---

## 12. Performance

| Area | Verificato | Esito |
|---|---|---|
| Startup/bundle | `next.config.js` con `optimizePackageImports` per lucide-react/recharts; maplibre-gl/leaflet caricati via `import()` dinamico nella maggior parte dei punti | Buona disciplina generale; `NavigationMapLibre.tsx` importa `maplibre-gl` in modo statico a livello di modulo — va verificato se il componente che lo consuma è a sua volta dietro `next/dynamic({ssr:false})`, altrimenti la libreria pesante finisce nel bundle anche per chi non naviga mai. |
| GPX 5km / 50km / migliaia di punti | `downsampleTracks` a 400 punti per il rendering, `downsamplePolyline` a 60 per le preview; ma il calcolo di distanza/dislivello itera sempre sui punti grezzi non ridotti, con parsing DOM via `querySelector` ripetuto per nodo | File molto grandi (50km, GPS 1Hz) caricati interamente in memoria (`file.text()`) prima del parsing — nessuno streaming, nessun limite di dimensione (§6 P1#14). |
| Decine di percorsi caricati | `MapRouteThumb` non testato con un numero molto grande di card contemporaneamente (dichiarato dal team stesso in `docs/navigation-engine-roadmap.md`) | Rischio di troppe richieste `/api/tile` in parallelo su una lista lunga — cache 24h presente ma impatto non misurato. |
| Centinaia di POI | Nessun test di carico trovato per `PoiSpatialIndex`/rendering marker su una mappa densa | Non verificabile in questa sessione senza ambiente browser reale — flag come area da testare. |
| Sync/offline | Outbox coalescente ben progettata, ma retry infiniti senza backoff (§6 P1#15); Service Worker con strategie di cache differenziate per tipo di richiesta, gestione aggiornamento robusta (basata su un incidente reale già risolto) | Solido nell'insieme, con un vero buco di osservabilità (nessuna UI per "sync fallita"). |
| Endpoint pesanti noti | `?all=true` del Diario scarica tutto il markdown senza paginazione (B27, noto, non risolto) | Confermato problema di performance reale e documentato dal team. |
| Test automatici | 49/49 passati in questa sessione, **133s totali**, di cui ~132s nei 5 test su dati GPS reali (dichiaratamente lenti per design — rispettano il tempo reale) | Nessun test di performance/carico (bundle size, tempi di parsing su file grandi) nella suite attuale. |

---

## 13. Report finale

### 13.1 Verdetto generale

**58 / 100**

Non è un punteggio "quanto è bello il codice" — è: quanto è pronto, oggi, come strumento *principale* di navigazione per un'escursione reale di 20km in zona sconosciuta. Il motore di tracking meriterebbe da solo un punteggio nell'80-90; i gap di fiducia dei dati e di UX outdoor lo trascinano indietro.

### 13.2 Punteggi (0-100)

| Categoria | Punteggio |
|---|---|
| UX | 58 |
| Navigazione (motore) | 78 |
| Affidabilità dei dati/contenuti | 55 |
| Sicurezza | 48 |
| Offline | 68 |
| Performance | 62 |
| Scoperta percorsi | 60 |
| Qualità dati | 50 |
| Algoritmi | 62 |
| Innovazione | 72 |
| Potenziale commerciale | 45 |

### 13.3 Top 10 problemi (per gravità)

1. ✅ **Risolto** — Escape Engine irraggiungibile proprio durante GPS perso — l'emergenza combinata peggiore.
2. ✅ **Risolto** — `RouteTracker` non resetta la finestra di ricerca su salti ampi di posizione — rischio di aggancio al segmento sbagliato su tornanti.
3. ✅ **Risolto** — Safety Score sottostimava sistematicamente ferrate/creste corte ed esposte (ammesso nel codice).
4. ✅ **Risolto** — Acqua: nessuna distinzione tra sorgente/fontanella/pozzo, nessuna verifica di stato.
5. Nessun sistema di chiusura sentiero.
6. ✅ **Risolto** — Fallimenti di rete su meteo/clima/community letti come "condizioni buone" invece di "sconosciuto".
7. ✅ **Risolto** — Nessun wake lock durante la navigazione attiva.
8. SOS/live-share senza dead-man's switch.
9. ✅ **Risolto** — Next.js 14.2.3 con CVE attive, incluse critiche (aggiornato a 14.2.35).
10. Tratti esposti/guadi mai generati dal motore DTrek, solo da testo di GPX importati da terzi.

### 13.4 Top 10 funzioni mancanti (per valore reale)

1. Sistema di chiusure sentiero (community + fonti ufficiali).
2. Verifica/freschezza delle fonti d'acqua (tipo + stato + data).
3. Stima di copertura di rete lungo il percorso.
4. Wake lock configurabile durante la navigazione.
5. Dead-man's switch sulla condivisione live.
6. Rilevamento nativo di tratti esposti/guadi da dati geometrici (non solo testo importato).
7. Verifica di apertura reale dei rifugi (integrazione CAI/Rifugi.net — già progettata in `docs/rifugi-progettazione.md`, mai implementata).
8. Modalità alto contrasto/sole forte.
9. Onboarding contestuale della UI di navigazione (non solo del profilo escursionista).
10. Comunicazione satellitare di emergenza (anche solo assistendo l'uso del Satellite SOS nativo del telefono).

### 13.5 Top 10 punti di forza (solo meritati)

1. Position Engine con filtro di Kalman reale, testato su GPS registrato sul campo.
2. Off-Route Engine multi-fattore con isteresi temporale, non un singolo threshold ingenuo.
3. Framework di simulazione GPS (replay GPX, scenari sintetici) — infrastruttura di test rara in questa categoria di prodotto.
4. Offline Readiness Check con distinzione esplicita hard/soft requirement.
5. TEI/Beauty Score: default "neutro" onesto per dati mancanti, invece di 0 o 10.
6. Trail Score v2: ritorna `null` invece di un valore ottimistico quando manca un input — disciplina rara.
7. SOS: 4 livelli onestamente etichettati per affidabilità decrescente, nessun falso senso di sicurezza attivo.
8. Diario/Resoconto/PDF: iterazione reale su bug reali, documentata estesamente, qualità editoriale alta.
9. Architettura a due app (DTrek/Navigator) con motivazione tecnica e di permessi solida, non un accidente.
10. Personalizzazione percorso a 5 assi (TEI) più granulare di qualunque concorrente analizzato.

### 13.6 Confronto con i concorrenti — sintesi

- **Dove DTrek è migliore**: personalizzazione del percorso (TEI a 5 assi), narrazione AI del percorso (nessun concorrente ha un equivalente), embrione di trasparenza dell'incertezza (Trail Confidence + factors) più avanzato concettualmente di qualunque concorrente.
- **Dove DTrek è peggiore**: volume/maturità del database percorsi (zero utenti reali oggi), comunicazione di emergenza (nessuna opzione satellitare vs Garmin), chiusure sentiero (assenti vs presenti altrove), mappe offline (un solo layer vs multi-layer).
- **Dove può diventare migliore**: trasformare Trail Confidence da badge aggregato a sistema di fiducia per-dato (nessun concorrente lo fa); acqua/ombra verificate (nessun concorrente lo fa in modo automatico oggi); Escape Engine reso davvero affidabile (funzionalità unica se risolto il gap P0).

### 13.7 Red flags — impedirebbero un rilascio pubblico

- Escape Engine irraggiungibile in emergenza combinata (P0#1).
- Assenza totale di sistema di chiusura sentiero (P0#5).
- Bias "fallimento rete = condizioni buone" su meteo/clima (P0#6).
- CVE critiche attive su Next.js 14.2.3 (P0#9) — va aggiornato prima di qualunque lancio pubblico, non è negoziabile su un prodotto che gestisce posizione GPS e dati personali.
- Nessuna verifica reale di acqua/rifugi presentati come dato di sicurezza.

### 13.8 Quick win (poco sviluppo, grande impatto)

**Stato: tutti e 10 implementati** (branch `claude/dtrek-hiking-audit-9yvsim`, typecheck/build/lint/suite `vitest` — 50/50 — verificati dopo ogni modifica).

1. ✅ Aggiunto `navigator.wakeLock.request('screen')` durante la navigazione attiva (`ActiveNavigationView.tsx`), con toggle "Mantieni lo schermo acceso" nel pannello Dettagli (`NavStatsSheet.tsx`) per chi preferisce risparmiare batteria.
2. ✅ "Vie d'uscita" ora raggiungibili anche durante `gps_lost` (usa l'ultima posizione nota, mai azzerata) e da un pulsante proattivo sempre visibile nella rotaia azioni, non solo dal banner off-route.
3. ✅ `spring`/`drinking_water`/`well` distinti con etichette diverse ("Sorgente naturale (non verificata)" / "Acqua potabile" / "Pozzo (potabilità non garantita)") invece di un'unica etichetta, più propagazione del flag OSM `seasonal`/`intermittent` quando presente.
4. ✅ Dead-band di rumore (0.5m) applicata anche a `gpxParser.ts`, `serverGpxParser.ts`, `kmlParser.ts` (prima solo su attività/FIT).
5. ✅ Testo dell'istruzione di svolta e del riepilogo distanza/ETA portato a 20px con sfondo pieno semi-opaco (non più solo ombra); aggiunta l'etichetta "arrivo" prima dell'orario.
6. ✅ Target di tocco uniformati a 44px (`InstructionBanner.tsx`, `NavBottomStrip.tsx`, `NavLayerRail.tsx`) — pausa/stop/chiudi/audio/layer ora alla pari dei controlli secondari della rotaia.
7. ✅ Fallback di errore rete meteo/clima ora distinto esplicitamente (`WeatherSignal.unavailable`/`ClimateSignal.unavailable`) da una penalità 0 verificata — propagato come segnale assente (non "favorevole") in Trail Confidence e come avviso "non disponibile" in `CurrentConditionsNotice.tsx`.
8. ✅ Etichetta Trail Confidence ora `sconosciuta` (badge grigio neutro, distinto da "bassa") quando non c'è alcun segnale di base, invece di "media".
9. ✅ Aggiunta `verifyOfflinePackageChecksum()` — verifica reale contro Cache Storage prima di fidarsi del pacchetto, non solo scrittura; corretto anche un difetto trovato nell'implementazione originale (`computeChecksum` era order-dependent, quindi non avrebbe mai potuto verificare nulla in modo affidabile — reso order-independent).
10. ✅ Next.js aggiornato da 14.2.3 a 14.2.35 (stessa minor, nessuna migrazione breaking) — `npm audit` conferma **0 vulnerabilità critiche** residue (prima: 1 critica + 13 alte, ora: 0 critiche + 14 alte, le rimanenti richiedono una migrazione a Next 15, fuori scope di un quick win).

### 13.9 Roadmap proposta

**IMMEDIATO** (pre-qualunque test con utenti reali all'aperto): quick win 1, 2, 3, 7, 8, 10 sopra — sono tutti fix mirati, non riprogettazioni.

**PRE-RELEASE**: sistema di chiusura sentiero (anche solo community, MVP); verifica/freschezza acqua; stima copertura di rete (anche approssimata, da dati OSM di densità antenne/urbanizzazione); modalità alto contrasto; onboarding contestuale della UI di navigazione; aggiornamento Next.js e audit di sicurezza completo delle dipendenze.

**V1.1**: rilevamento nativo di esposizione/guadi da dati geometrici; verifica apertura reale rifugi (integrazione CAI/Rifugi.net, già progettata); dead-man's switch sulla condivisione live; granularità del feedback vocale/aptico; test di carico su GPX molto grandi e liste di percorsi lunghe.

**V2**: sistema di fiducia per-dato esteso (affidabilità/fonte/data/condizioni per ogni informazione critica, non solo aggregato); Trail Confidence v2 (i 7 segnali della roadmap interna, inclusa qualità GPS live e copertura rete osservata); app iOS.

**FUTURO**: integrazione/assistenza a comunicazione satellitare di emergenza; guida AI come compagno vocale in tempo reale (non solo testo di pianificazione); piano di rientro proattivo multi-segnale (meteo + passo osservato + batteria).

### 13.10 USP

**"DTrek non promette di conoscere più sentieri di chiunque altro — promette di dirti sempre, per ogni informazione, quanto puoi fidartene."**

Nessuno dei sei concorrenti analizzati espone oggi un sistema di fiducia esplicito e granulare (affidabilità/fonte/data/condizioni) per acqua, rifugi, tratti pericolosi, chiusure. DTrek ha già gli embrioni giusti (Trail Confidence, `confidence` in TEI, Offline Readiness) — nessun altro prodotto del settore parte da questo principio architetturale. Costruirci sopra un vero sistema di fiducia per-dato (§10) è l'unica direzione che trasforma un motore di tracking già eccellente in un prodotto che un escursionista esperto sceglierebbe **anche avendo già Komoot** — non perché "fa di più", ma perché è l'unico che ammette onestamente cosa non sa.

### 13.11 Verdetto finale

**SOLO CON RISERVE.**

Userei DTrek per **pianificare** un'escursione di 20km in zona sconosciuta — la personalizzazione del percorso, la guida AI, il Trail Score sono realmente utili e superiori a molto di ciò che offrono i concorrenti su questo fronte. Userei DTrek Navigator per **tracciare** l'escursione — il motore di posizione/deviazione è genuinamente affidabile, testato su dati reali, meglio ingegnerizzato di quanto ci si aspetti.

Ma **non lo userei come unico strumento di sicurezza** su un percorso davvero sconosciuto, per quattro ragioni concrete che questo audit ha verificato nel codice, non ipotizzato: (1) l'Escape Engine — l'unica vera funzione di emergenza distintiva del prodotto — è irraggiungibile esattamente nello scenario più critico (GPS perso); (2) non esiste alcun modo di sapere se il sentiero è chiuso; (3) acqua e rifugi sono presentati con più certezza di quanta i dati sottostanti ne abbiano davvero; (4) l'intero stack di emergenza dipende dalla rete cellulare, senza alcuna alternativa né un meccanismo che avvisi qualcuno se smetto di muovermi. Porterei con me anche una mappa cartacea o un dispositivo con comunicazione satellitare indipendente — non per sfiducia generica nel prodotto, ma perché il codice stesso, letto con attenzione, dice onestamente dove non è ancora pronto.
