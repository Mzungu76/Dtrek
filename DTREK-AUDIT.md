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
| 3 | Safety Score usa dislivello×distanza come proxy di pericolosità tecnica — sottostima sistematicamente ferrate/creste corte ed esposte | `lib/safetyScore.ts:236-241,345` — ammesso nel commento del codice stesso | Calcolare il safety score di un percorso breve, ripido, esposto (basso dislivello assoluto, alta tecnicità) — riceve punteggio alto. |
| 4 | Acqua: `spring`/`drinking_water`/`well` tutti presentati come "Acqua potabile", nessuna verifica di stato/stagionalità | `lib/pois/overpassSource.ts:83-111` | Ispezionare un POI di tipo `natural=spring` sulla mappa: etichetta identica a una fontanella pubblica verificata. |
| 5 | Nessun sistema di chiusura sentiero in nessuna forma verificata | `lib/trailConditions/*` (assente), unico surrogato: regex in `lib/difficultyMarkers.ts` | Grep su "chiusura/closed/frana" in `lib/trailConditions/` — nessun risultato. |
| 6 | Fallimento rete su segnali meteo/clima collassa a "nessuna penalità" = indistinguibile da "condizioni verificate buone" | `lib/trailConditions/weatherSignals.ts:47-49`, `climateSignals.ts:29-31` | Simulare un errore di fetch Open-Meteo: `totalPenalty` torna 0, la UI mostra "condizioni favorevoli". |
| 7 | Nessun wake lock durante la navigazione attiva — solo per l'export video 3D | `components/RouteMap3D.tsx:1124-1133` è l'unico uso di `wakeLock` nel repo; assente in `ActiveNavigationView.tsx` | Grep `wakeLock` in tutto il repo — un solo risultato, fuori contesto navigazione. |
| 8 | SOS/live-share interamente dipendenti da rete, nessun dead-man's switch se la posizione smette di aggiornarsi | `lib/navigation/liveLocationPublish.ts`, `components/navigation/LiveShareViewer.tsx` (stato `stale` solo visivo, nessun allarme proattivo) | Interrompere gli aggiornamenti di posizione durante una sessione live e osservare che nessun avviso raggiunge il contatto remoto oltre al badge "stale" se lo controlla manualmente. |
| 9 | Next.js 14.2.3 con CVE attive incluse di severità critica (cache poisoning, SSRF via middleware, auth bypass, DoS Server Actions/Image Optimization, XSS su CSP nonce) | `package.json:40` | `npm audit` — riportato in questa sessione, 1 pacchetto critico + multipli high. |
| 10 | Tratti esposti/guadi mai generati dal motore di navigazione DTrek — solo da testo di GPX importati da terzi | `lib/navigation/routeMoments.ts:9-17` (dichiarato esplicitamente incompleto), `lib/difficultyMarkers.ts` (solo regex su testo importato) | Costruire un percorso via Route Builder interno (nessun GPX importato) con un tratto esposto reale — nessun avviso viene generato. |

### P1 — Compromette gravemente l'esperienza

| # | Problema | Dove |
|---|---|---|
| 11 | Rate limit DTM (50 chiamate/24h) indistinguibile da "nessuna copertura genuina" per l'utente finale — degrada silenziosamente a quota stimata | `lib/dtm/dtmClient.ts:57-65,60-61` |
| 12 | Tre client geo esterni (Natura2000, uso-suolo, in parte DTM) dichiarati nel codice stesso "mai verificati contro una risposta reale" | `lib/natura2000/natura2000Client.ts:12-15`, `lib/usosuolo/usoSuoloClient.ts`, `openTopographyClient.ts:6-9` |
| 13 | Nessuna dead-band di rumore sull'elevazione per import file/URL/KML (presente solo per attività/FIT) | `lib/gpxParser.ts:123-126`, `lib/serverGpxParser.ts:60-63`, `lib/kmlParser.ts:94-98` |
| 14 | Nessun limite di dimensione file in tutta la catena di import (client e fetch-da-URL) | `components/upload/GpxUploader.tsx`, `lib/gpxSourceFetch.ts:48` |
| 15 | Outbox di sync senza backoff/dead-letter — `attempts`/`lastError` definiti ma mai scritti, retry infiniti silenziosi | `lib/localStore.ts:18-19,133` |
| 16 | `Math.max(...array)`/`Math.min(...array)` con spread su array potenzialmente enormi — rischio di stack overflow su tracce/FIT molto lunghi, fix già applicato in un file gemello ma non ovunque | `lib/gpxActivityParser.ts:81-82,94,98`; `app/api/parse-fit/route.ts:136,140,142` (contro il pattern corretto in `lib/gpxParser.ts:132-135`) |
| 17 | "Trail Confidence" confonde "mi si addice" (Trail Score personale, 60% del peso) con "è affidabile/sicuro" — un percorso sicuro ma faticoso riceve un'etichetta che legge come avviso di sicurezza | `lib/navigation/trailConfidence.ts` |
| 18 | Default senza segnali = punteggio 0.5 → etichetta "media" (non "sconosciuto"), pur con `factors` che dice "dati insufficienti" — testo ed etichetta in disaccordo | `lib/navigation/trailConfidence.ts:68-75` |
| 19 | Target di tocco incoerenti: i controlli più usati in cammino (pausa/stop/chiudi/audio) sono 36px, i secondari 44px — al contrario di ciò che serve con guanti | `InstructionBanner.tsx:30,52,77,82`, `NavBottomStrip.tsx:17,43,53` |
| 20 | Nessuna modalità alto contrasto/sole forte | `InstructionBanner.tsx:66`, `NavBottomStrip.tsx:48` |

### P2 — Problemi importanti

| # | Problema | Dove |
|---|---|---|
| 21 | Classificatore euristico "probabilità sentiero" tarato su un solo caso di test reale ("Nera Montoro") — generalizzabilità non verificata | `lib/routeBuilder/hikingProbability.ts:754-756` |
| 22 | Route Builder: Dijkstra minimizza solo distanza, nessun costo per gradini/pendenza/tipo sentiero nel routing stesso — penalità solo a valle e solo se l'utente ha dichiarato preoccupazioni | `lib/routeBuilder/loopBuilder.ts:128-155`, `scoreCandidates.ts:181-189` |
| 23 | `route-search` (AI): "comfort verdict" generato da LLM anche su numeri distanza/dislivello stimati dal web, non sempre verificati contro OSM | `app/api/route-search/route.ts` |
| 24 | Rifugi/bivacchi come "POI sicuro" nell'Escape Engine senza verifica di apertura reale — gap noto e documentato dal team | `docs/rifugi-progettazione.md:5-9`, `lib/navigation/escapeEngine.ts:55,279` |
| 25 | Coda vocale `normal` (POI/momenti) senza limite/scadenza — accumulo di annunci "in ritardo" in tratti densi di POI | `lib/navigation/speech.ts` |
| 26 | Nessun onboarding contestuale della UI di navigazione (SOS, vie d'uscita, layer, colori) | `components/onboarding/OnboardingWizard.tsx` (copre solo profilo escursionista) |
| 27 | Fix per titoli GPX multilingua (`<name><it>…</it><en>…</en>`) applicato solo a metà dei parser paralleli | `lib/gpxActivityParser.ts:26-27` vs. `lib/gpxParser.ts:71-84` |
| 28 | Nessuna stima di copertura di rete, pur essendo un prerequisito critico per tutto lo stack SOS | `components/navigation/TrailConfidenceBadge.tsx:74-77` (dichiarato assente in UI) |
| 29 | Checksum del pacchetto offline calcolato ma mai verificato prima di fidarsi dei dati scaricati | `lib/offline/packageManifest.ts:92-97` |
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
3. Safety Score sottostima sistematicamente ferrate/creste corte ed esposte (ammesso nel codice).
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
