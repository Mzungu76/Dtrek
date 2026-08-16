# Dtrek Navigator — Orizzonti 1/2/3: roadmap verso "il miglior navigatore mai concepito"

Compagno di `docs/navigation-engine-analysis.md` e `docs/navigation-engine-roadmap.md` (che
documentano le 8 fasi già completate del motore di navigazione). Questo file parte da
un'analisi comparativa Dtrek Navigator vs Komoot vs AllTrails: il motore di navigazione vero
e proprio (fuori-percorso multi-fattore, Escape Engine, batteria adattiva, offline readiness
check) è già più sofisticato di quello dei due leader di mercato su più assi tecnici. Quello
che manca non è un motore più intelligente — è tutto ciò che rende un navigatore *affidabile
davanti a testimoni*: condivisione posizione/SOS nel momento peggiore, una community che
alimenta fiducia e scoperta, copertura iOS, e un collaudo automatico delle soglie che oggi
sono solo "stime ragionevoli, mai verificate" (parole della roadmap esistente).

Stesso principio delle fasi precedenti: ogni fase resta testabile/rivedibile da sola, senza
dover aspettare le fasi successive. Tre orizzonti, in ordine di quanto contano per chi cammina
davvero — non in ordine di quanto sono facili da costruire.

## Orizzonte 1 — Sicurezza (priorità massima) — non ancora fatto

Il divario più grave rispetto a Komoot e AllTrails, e quello col miglior rapporto
valore/costo: l'app ha già un'architettura di condivisione a link pubblico riusabile quasi
as-is.

### Fase 1 — Live location sharing via link pubblico — ✅ landed (v1)

**Riuso**: il pattern esiste già, usato due volte nel repo — `activities.share_token UUID
UNIQUE` (`app/api/share/route.ts`, POST crea via `crypto.randomUUID()`, GET/DELETE
owner-scoped) letto pubblicamente da `lib/sharePublic.ts:fetchPublicActivity(token)` col
**client service-role** (bypassa RLS, il token stesso è l'unico controllo d'accesso), servito
da `app/s/[token]/page.tsx`. Stessa cosa per `user_settings.diary_token` → `/leggi/d/[token]`.
Questa fase applica lo stesso schema a una sessione di navigazione attiva.

**Perché non basta riusare `hike_navigation_track` così com'è**: quella tabella esiste già
(`supabase/migrations/add_navigation_system.sql`) ma è alimentata da una coda locale
(`lib/navigation/navigationStore.ts`: `queueTrackFix`/`drainTrackQueue`) svuotata ogni ~30s —
esplicitamente documentata nel codice come "NOT the real-time source of truth". Un
visualizzatore live ha bisogno di un canale a bassa latenza separato, non del percorso di
sync esistente.

**Schema**:
```sql
ALTER TABLE hike_navigation_sessions
  ADD COLUMN share_token UUID UNIQUE,
  ADD COLUMN share_enabled_at TIMESTAMPTZ,
  ADD COLUMN share_token_expires_at TIMESTAMPTZ,
  ADD COLUMN last_live_lat DOUBLE PRECISION,
  ADD COLUMN last_live_lon DOUBLE PRECISION,
  ADD COLUMN last_live_ts TIMESTAMPTZ,
  ADD COLUMN last_live_accuracy_m DOUBLE PRECISION;
CREATE INDEX idx_nav_sessions_share_token ON hike_navigation_sessions (share_token)
  WHERE share_token IS NOT NULL;
```
Una singola riga aggiornata in-place (non uno storico di fix) — tiene il costo di scrittura
basso ed è tutto ciò che serve a un viewer che vuole solo "dov'è adesso".

**Scadenza/revoca — non lasciata come "decisione aperta", è parte del design v1**: un link
pubblico di posizione non deve poter restare valido a tempo indeterminato. Default proposto:
`share_token_expires_at` impostato a `share_enabled_at + 12h` alla creazione (copre una
giornata di escursione lunga con margine), rinnovabile con un altro tap se la navigazione
prosegue oltre; `app/api/navigation/share/[token]/route.ts` (GET pubblico) verifica sempre
`share_token_expires_at > now()` prima di restituire la posizione, non solo la presenza del
token. Il revoke manuale (`DELETE`) resta sempre disponibile e immediato, indipendentemente
dalla scadenza.

**File nuovi**:
- `app/api/navigation/share/route.ts` — stesso shape di `app/api/share/route.ts`: `POST
  {sessionId}` crea/riusa il token (owner-scoped), `DELETE ?sessionId=` lo revoca. Verifica in
  più che la sessione sia effettivamente quella attiva dell'utente.
- `lib/navigation/liveLocationPublish.ts` — chiamata dal client ogni ~15-20s mentre
  navigazione attiva + condivisione abilitata: `UPDATE hike_navigation_sessions SET
  last_live_lat=..., last_live_ts=... WHERE id=$sessionId AND user_id=auth.uid()` via client
  autenticato normale (la RLS `nav_sessions_owner` già esistente copre questo `UPDATE`, nessuna
  nuova policy di scrittura).
- `lib/liveSharePublic.ts` — `fetchLiveSession(token)`, stesso principio di `sharePublic.ts`
  col client service-role: legge solo `last_live_*` + titolo dell'hike collegato, mai dati
  privati.
- `app/api/navigation/share/[token]/route.ts` — GET pubblico, nessuna auth, valida la forma
  UUID (stesso `UUID_RE` di `sharePublic.ts`) prima di interrogare.
- `app/s/live/[token]/page.tsx` — pagina pubblica, nessun login, polling ogni 10-15s verso la
  route sopra.
- `components/navigation/LiveShareToggle.tsx` — dentro `ActiveNavigationView.tsx`/
  `NavBottomSheet.tsx`: attiva/disattiva + copia link.

**Due frequenze distinte, non un unico "polling" generico** — da tenere separate in ogni
riferimento successivo nel documento:
- **Scrittura (GPS → server)**: ~15-20s, lato client in `liveLocationPublish.ts`.
- **Lettura (viewer → server)**: ~10-15s, lato pagina pubblica in `app/s/live/[token]`.
Entrambe pensate come **configurabili** (costanti, non valori hard-coded sparsi), e nessuna
delle due promette una precisione temporale superiore al fix GPS realmente disponibile in
quel momento — un viewer che "legge" ogni 10s non vede una posizione più fresca di quella che
il telefono del camminatore ha effettivamente scritto l'ultima volta, che dipende a sua volta
dalla modalità batteria (`locationModeDecider.ts`) attiva in quel momento.

**Implementato** (branch `claude/dtrek-navigator-analysis-dld340`): esattamente lo schema sopra
(`supabase/migrations/add_navigation_live_share.sql`, non ancora mirrorata in
`supabase-schema.sql` — `hike_navigation_sessions` non lo è mai stata nemmeno prima di questa
fase, resta solo nella propria migration dedicata). Due dettagli emersi verificando il codice,
non nella formulazione originale sopra:
- **Scrittura via client browser diretto** (`getBrowserSupabase()`, `lib/supabaseBrowser.ts`),
  non tramite una API route dedicata — è il pattern già in uso in `lib/sync/realtimeSync.ts`/
  `syncEngine.ts` per scritture autenticate frequenti, non quello a coda di
  `navigationStore.ts` (pensato per la traccia storica). La lettura pubblica resta invece via
  API route col client service-role (`lib/liveSharePublic.ts` +
  `app/api/navigation/share/[token]/route.ts`), come da progetto.
- **Pagina pubblica non indicizzabile e senza anteprima social** (`robots: {index: false,
  follow: false}`, nessuna `opengraph-image.tsx`) — scelta non prevista nella formulazione
  originale, presa verificando `app/s/[token]/opengraph-image.tsx` come precedente da **non**
  replicare qui: un crawler di prefetch (WhatsApp/Telegram/iMessage) non deve generare
  traffico su un link pensato per un singolo contatto di fiducia.
- Costanti scelte per v1: scrittura ogni 18s (`ActiveNavigationView.tsx`), lettura/poll ogni
  12s (`LiveShareViewer.tsx`) — dentro gli intervalli 15-20s/10-15s sopra, non ancora
  calibrate sull'uso reale.
- `LiveShareToggle.tsx` mostra esplicitamente uno stato "non disponibile senza connessione"
  quando la sessione remota non esiste ancora (avvio offline) — non fallisce in silenzio.

**Non ancora fatto / prossimi passi concreti**:
- **Migrazione da applicare a mano** sul progetto Supabase live + `NOTIFY pgrst, 'reload
  schema';` — non eseguibile da questa sessione senza credenziali dirette.
- **Nessun test end-to-end reale**: `tsc --noEmit` e lint sono puliti, ma il flusso
  scrittura→lettura→scadenza→revoca non è stato verificato su un ambiente con Supabase vero né
  su un dispositivo Android reale con GPS.
- **Polling vs Realtime pubblico**: resta polling per entrambe le direzioni, come deciso — da
  rivalutare solo se la latenza risulta inadeguata in pratica.
- Verificare che il testo UI del toggle non assomigli a un upsell — vincolo esistente di
  `docs/navigator-dtrek-boundary.md` (Navigator non vende nulla al suo interno); una prima
  lettura del testo scritto sembra rispettarlo (parla solo di sicurezza/contatto di fiducia),
  ma non è stato rivisto da nessun altro occhio.
- **Livello 1 di "Validazione — Field Testing"** (sezione trasversale più sotto) non ancora
  eseguito per questa fase: nessuno scenario di `lib/navigation/simulation/presetScenarios.ts`
  è stato rigiocato contro il nuovo flusso di condivisione.

### Fase 2 — SOS / azione di emergenza — ✅ landed (v1)

Nessun pattern `tel:`/`sms:`/112 esiste oggi nel codice — lavoro nuovo, che riusa solo la
posizione già disponibile in `ActiveNavigationView.tsx`. **Da non progettare come "un bottone,
due deep-link"**: è una UI a livelli, dove solo il primo livello è garantito.

**Quattro livelli, in ordine di affidabilità decrescente — non equivalenti**:
1. **Chiamata 112** (`tel:112`) — l'unico canale universalmente affidabile in UE, primo tasto
   dello sheet.
2. **SMS/testo di emergenza dove supportato** (`sms:112?body=...`) — esplicitamente
   **best-effort**, non un fallback garantito: in molti paesi UE l'SMS al 112 richiede
   registrazione preventiva o è riservato a categorie specifiche di utenti, non funziona per
   il pubblico generico ovunque. Va etichettato in UI come "prova a inviare", non presentato
   con la stessa sicurezza della chiamata.
3. **Visualizzazione immediata delle coordinate a schermo** — non un'azione, uno stato sempre
   visibile appena lo sheet SOS si apre: lat/lon in chiaro + quota, leggibili e dettabili a
   voce anche se nessuna delle due azioni sopra funziona (rete assente, nessun segnale
   telefonico).
4. **Link alla posizione condivisa** (Fase 1), se già attiva — mostrato come opzione in più,
   mai come sostituto dei livelli 1-3.

**Fail-safe UI — vincolo esplicito**: il pulsante SOS e il livello 3 (coordinate a schermo)
non devono dipendere dalla salute del resto della UI di navigazione né dalla rete. Leggono
direttamente l'ultimo `GeoFix`/campione di `PositionEngine` già in memoria (lo stesso stato
usato da `ActiveNavigationView.tsx`), non da una chiamata API né da un evento che presuppone
che `NavigationEngine` sia in uno stato "sano" — deve funzionare anche in `gps_lost` o con la
UI di navigazione parzialmente degradata.

**File nuovi**:
- `lib/navigation/sos.ts` — funzioni pure separate per livello: `buildEmergencyCallLink()`,
  `buildEmergencySmsLink(lastFix)` (best-effort, non usata come unico canale), e
  `formatCoordinatesForDisplay(lastFix)` per il livello 3 (nessun link necessario, puro
  rendering).
- `components/navigation/SosButton.tsx` — sempre raggiungibile in 1 tap durante navigazione
  attiva, montato in modo da restare accessibile anche in stato `gps_lost`/degradato; lo sheet
  mostra i 4 livelli sopra, non solo due bottoni.

**Log opzionale**: nessuna nuova tabella — un evento `type: 'sos_triggered'` sulla tabella
`hike_navigation_events` già esistente, tramite la stessa coda già usata per gli altri eventi
(best-effort: se la rete manca, il log resta in coda locale come già avviene per gli altri
eventi, non blocca né ritarda i livelli 1-3).

**Implementato** (branch `claude/dtrek-navigator-analysis-dld340`): esattamente i 4 livelli
sopra. Il bottone è montato fisso in un angolo dedicato (alto a destra, sopra ogni banner
esistente — z-index più alto persino del banner "SIMULAZIONE"), non dentro `NavBottomSheet.tsx`
come inizialmente ipotizzato, proprio per restare raggiungibile indipendentemente da quale
altro foglio/banner sia aperto. `onTriggered` registra l'evento (`sos_triggered` + quale azione,
chiamata o SMS) tramite `logEvent()`, la stessa funzione già usata per tutti gli altri eventi di
navigazione — nessuna nuova coda o meccanismo di log introdotto.

**Decisioni prese per v1** (non più aperte):
- **Deep-link (`tel:112`)**, non chiamata diretta — nessun permesso Android nuovo richiesto.
- **112 fisso**, nessuna localizzazione del numero per ora.
- **SMS e link di condivisione live tenuti separati**: il testo dell'SMS include solo
  coordinate + link Google Maps (per restare breve), il link di condivisione live (quando
  attivo) compare come sezione a sé nello stesso sheet — livello 4, mai incollato dentro il
  livello 2.

**Non ancora fatto / prossimi passi concreti**:
- Nessun test end-to-end reale su dispositivo — `tsc --noEmit` e lint puliti, ma i link
  `tel:`/`sms:` non sono stati verificati su un telefono vero (comportamento del dialer/app SMS
  può variare per produttore Android).
- Nessuna localizzazione per chi usa l'app fuori dall'UE (numero 112 fisso).
- Livello 1 di "Validazione — Field Testing" non ancora eseguito per questa fase.

### Fase 3 — Prima infrastruttura di test automatizzato del repository (vitest) — ✅ landed (v1)

**Nota**: questa fase, a differenza delle altre due dell'Orizzonte 1, non è "solo aggiungere
file" — introduce la prima vera modifica infrastrutturale del repository: una nuova
devDependency (`vitest`), un nuovo file di configurazione (`vitest.config.ts`), un nuovo
script in `package.json`. Nessun repository che non ha mai avuto un test runner acquisisce
zero-footprint la propria prima suite — va trattata e pianificata come tale, non come
un'aggiunta puramente documentale ai moduli esistenti.

Il repo non ha mai avuto un test runner (`package.json` senza `jest`/`vitest`), ma possiede
già un framework di simulazione GPS completo costruito apposta per questo scopo
(`lib/navigation/simulation/`: `scenarioBuilder.ts`, `presetScenarios.ts`,
`simulationLocationProvider.ts`, `gpxReplay.ts`) — oggi usato solo come strumento interattivo
(`?simulate=off_route`), mai come base di asserzioni automatiche.

**Setup**: `vitest` (zero-config TS/ESM, coerente con un repo senza Babel/Jest già
configurato) — `vitest.config.ts` (`environment: 'node'`, i moduli target sono già "pure,
mockable, replayable"), script `"test": "vitest run"` in `package.json`.

**Prime tre suite** (moduli già puri, zero mock di rete/Supabase necessari):
- `lib/navigation/__tests__/offRouteEngine.test.ts` — usa gli scenari già pronti
  (`off_route`/`uncertain`/`wrong_direction`) e verifica in primo luogo i due casi numerici già
  citati come "esempi della spec" nel commento del modulo (accuracy 5m + distanza 25m + trend
  crescente + 20s → OFF ROUTE; accuracy 35m + distanza 20m → UNCERTAIN) — il test a più alto
  valore/più basso rischio da scrivere per primo, perché la soglia è già documentata, solo mai
  verificata.
- `lib/navigation/__tests__/escapeEngine.test.ts` — `WalkNetwork` sintetico piccolo, verifica
  che le 4 tipologie di opzione vengano generate nell'ordine atteso e che ogni opzione porti
  sempre un `reason` non vuoto (invariante esplicito del modulo).
- `lib/navigation/__tests__/locationModeDecider.test.ts` — tabella di casi per la priorità
  dichiarata (off_route/wrong_direction → emergency; bivio vicino/velocità/accuracy scarsa →
  navigation; batteria bassa → battery_save; altrimenti trekking) + isteresi temporale.

**Implementato** (branch `claude/dtrek-navigator-analysis-dld340`): esattamente le tre suite
sopra, **28 test, tutti verdi**. Due dettagli emersi scrivendoli, diversi dalla formulazione
originale:
- **`resolve.tsconfigPaths: true` nativo di Vite** invece del plugin `vite-tsconfig-paths` —
  installato inizialmente, poi rimosso appena il warning di vitest ha segnalato il supporto
  nativo equivalente: una dipendenza in meno per lo stesso risultato.
- **Isteresi di `LocationModeDecider` testata senza `vi.useFakeTimers()`**: `update()` prende
  già `nowMs` come parametro esplicito, quindi il test avanza quel valore a mano tra una
  chiamata e l'altra — nessun mock di timer reali necessario, più semplice di quanto
  ipotizzato.
- `offRouteEngine.test.ts` nota esplicitamente che il dwell di default (`offRouteDwellMs`) è
  15s, non i "~20s" arrotondati nel commento del modulo — il test riproduce il comportamento
  reale delle soglie di default, non l'approssimazione della prosa.

**CI agganciata**: `.github/workflows/ci.yml` (già esistente per lint/typecheck su ogni push a
`main` e ogni PR) ora include anche `npm test` nello stesso job — nessun workflow separato,
stesso `npm ci` già fatto per lint/typecheck. Da qui in avanti un push/PR che rompe i test
mostra un segno rosso su GitHub, senza bisogno di un terminale locale.

**Non ancora fatto / prossimi passi concreti**:
- `mapMatcher.ts`/`positionEngine.ts` (filtro di Kalman) restano non testati, come già
  segnalato dalla roadmap originale — questa fase ha prioritizzato solo i tre moduli sopra.

## Orizzonte 2 — Colmare il gap di mercato — non ancora fatto

### Fase 4 — Community layer leggero — ✅ landed (v1)

Oggi `lib/trailConditions/` è **100% calcolato** da dati esterni (meteo/suolo), esplicitamente
documentato come "mai scrive su Supabase" — zero segnale inserito da un utente reale. Il
precedente più vicino, `trail_difficulty_markers` (marker di pericolo puntuale, public-read),
era pensato per alimentare un `lib/si/signals/communitySignals.ts` che però **non è mai stato
scritto** — solo referenziato nei commenti/migrazioni. Questa fase lo implementa davvero.

**Architettura rivista — niente `VIEW` pubblica**: una `VIEW` interrogabile via PostgREST che
deve *al tempo stesso* essere pubblica e portare contenuto che richiede moderazione a runtime
è una contraddizione architetturale, non solo un dettaglio di implementazione — o l'oggetto è
raggiungibile direttamente (e allora la moderazione in lettura non ha un punto in cui
agganciarsi) o non lo è. Si scarta quindi la `VIEW` pubblica anche solo per i conteggi, e si
adotta lo **stesso identico pattern già usato ovunque nel repo per le letture pubbliche**
(`sharePublic.ts`/`liveSharePublic.ts` della Fase 1): nessun oggetto pubblico in Postgres,
un'unica API server-side col client service-role fa sia l'aggregazione dei conteggi sia la
moderazione delle note, ogni volta che viene letta — non solo alla scrittura.

**Schema** (solo la tabella privata, nessuna vista):
```sql
CREATE TABLE trail_completions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_id       TEXT REFERENCES activities(id) ON DELETE CASCADE,
  osm_relation_id   BIGINT,              -- risolto via matchTrail.ts, nullable se non matchato
  polyline_hash     TEXT,                -- fallback quando osm_relation_id è NULL
  completed_at      TIMESTAMPTZ NOT NULL,
  note              TEXT,                -- opzionale, max 280 caratteri (enforced app-side)
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_trail_completions_osm ON trail_completions (osm_relation_id, completed_at);
CREATE INDEX idx_trail_completions_user ON trail_completions (user_id);

ALTER TABLE trail_completions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trail_completions_owner" ON trail_completions FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
-- Nessuna policy "public read": la lettura pubblica non passa mai da PostgREST/RLS su questa
-- tabella, solo dal client service-role dentro la route GET qui sotto.
```

**File nuovi**:
- `supabase/migrations/add_trail_completions.sql`
- `lib/community/moderation.ts` — **filtraggio deterministico, non moderazione**: v1
  volutamente minimale — rate-limit per `user_id` (Upstash, già una dipendenza del progetto),
  cap di lunghezza (280 caratteri, client+server), lista statica di parole bandite (italiano,
  case-insensitive). Nessun intervento umano, nessun ML, nessuna valutazione di contesto o
  intento: `moderateNote(text): {ok, reason?}` è un filtro sì/no su corrispondenza di stringa,
  non una moderazione nel senso pieno del termine. Va trattato e comunicato come tale — un
  primo argine contro lo spam/abuso più ovvio, non una garanzia di contenuto appropriato.
- `app/api/trails/completions/route.ts` — `POST {activityId, note?}` (autenticato, verifica
  ownership, risolve `osm_relation_id` riusando `findTrailForPolyline` già esistente in
  `lib/trailConditions/matchTrail.ts`, applica `moderateNote` prima di scrivere). `GET
  ?osm_relation_id=` **pubblico, col client service-role**: esegue direttamente la query di
  aggregazione (`COUNT(*) FILTER (WHERE completed_at > now() - interval '30 days')`) e ripassa
  ogni nota restituita dallo stesso filtro deterministico una seconda volta in lettura — difesa
  in profondità contro contenuto scritto prima di un aggiornamento della lista di parole
  bandite, non un secondo livello di moderazione più sofisticato del primo.
- `lib/si/signals/communitySignals.ts` — implementazione reale (oggi solo referenziata nei
  commenti/migrazioni, mai scritta), alimentata sia da `trail_difficulty_markers` (già
  esistente) sia dai conteggi/note letti tramite la route sopra — mai da un accesso diretto
  alla tabella.
- `app/api/trails/conditions/route.ts` — **esteso**, non riscritto: aggiunge una sezione
  `community` alla risposta JSON esistente, mantenendo l'invariante "mai scrive" della route
  attuale.

**UI**: prompt opt-in post-navigazione (mai automatico) — estensione di
`EndHikeReviewDialog.tsx` o simile.

**Implementato** (branch `claude/dtrek-navigator-analysis-dld340`): esattamente lo schema e
l'architettura sopra, con due dettagli emersi scrivendola:
- **`lib/si/signals/communitySignals.ts` non esiste più come percorso valido** — verificato che
  `lib/si/` non è mai stato creato in questo repo: il sistema "SI"/"CL" più ampio a cui quel
  percorso apparteneva è stato rimosso prima di questa fase (vedi il commento in cima a
  `lib/trailConditions/types.ts`, "dopo la rimozione di Affidabilità/CL"). Il nuovo collector
  vive quindi in `lib/trailConditions/communitySignals.ts`, accanto agli unici altri collector
  ancora vivi (`weatherSignals.ts`/`climateSignals.ts`), non al percorso aspirazionale citato
  nei commenti da anni.
- **`fetchCompletionsSummary`** (`lib/community/completionsSummary.ts`, nuovo) fattorizza
  l'aggregazione condivisa tra la route pubblica e il nuovo collector — non prevista come file
  a sé nella formulazione originale, emersa per non duplicare la stessa query in due posti.
- `confidenceWeight` (0..1, mai oltre 0.5) è il primo pezzo reale dell'attenuazione richiesta
  per un futuro blend in Trail Confidence (Fase 8) — cresce con `completions30d` fino a saturare
  a 5 completamenti recenti, oltre non aggiunge fiducia.
- Il testo UI del checkbox in `EndHikeReviewDialog.tsx` è stato scritto badando a non
  assomigliare a un upsell (vincolo di `docs/navigator-dtrek-boundary.md`) — una prima lettura
  sembra rispettarlo, non rivista da nessun altro occhio.

**Non ancora fatto / decisioni ancora aperte**:
- **Nessun dedup dei completamenti**: ogni salvataggio con la checkbox attiva conta come un
  completamento a sé, anche se lo stesso utente ripete lo stesso sentiero più volte nello stesso
  weekend — impatta la query aggregata (`completions30d` può essere gonfiato da un singolo
  utente molto attivo). Non risolto, resta la decisione di prodotto aperta segnalata sopra.
- **`polyline_hash` non è mai popolato né usato**: il fallback fuzzy-match per un sentiero non
  matchato a un `osm_relation_id` resta solo una colonna riservata nello schema, nessuna logica
  la scrive o la legge — un completamento senza match resta semplicemente "non aggregabile"
  pubblicamente (la riga esiste comunque, privata, nella tabella dell'utente).
- Valore del rate-limit (3 note/giorno) e la lista di parole bandite restano stime di partenza,
  non validate con uso reale.
- Nessun test end-to-end reale (checkbox → salvataggio → conteggio pubblico visibile).

### Fase 5 — Target iOS (Capacitor) — non ancora fatto

Nessuna cartella `ios/` esiste oggi. **Il traguardo "supporto iOS" non è raggiunto quando
esiste `ios/`** — il repo ha già una separazione pulita tra sorgente di posizione e motore
(`lib/native/locationSource.ts` astrae `LocationProvider` come interfaccia comune a
web/nativo), e il vero criterio di completamento è quando quell'interfaccia riceve da iOS
dati equivalenti a quelli che riceve oggi da Android — non prima. Tre sotto-fasi distinte,
non un blocco unico:

1. **Fase 5A — Scaffold Capacitor + progetto iOS** (`npx cap add ios`, comando manuale non
   eseguibile da questa sessione) — equivalente Xcode project di `android/`.
   `capacitor.config.ts` probabilmente non richiede modifiche strutturali (`server.url` è già
   cross-platform), da verificare se serve un blocco `ios: { ... }` analogo a quello Android
   esistente. **Completa solo l'installabilità della shell, non la navigazione reale** — a
   questo punto l'app gira in WebView iOS ma senza posizione in background.
2. **Fase 5B — Implementazione iOS del provider nativo di localizzazione** — riscrittura
   Swift del plugin `NativeLocation` (oggi solo Kotlin in
   `android/app/src/main/java/com/dtrek/navigator/nativelocation/`): `CLLocationManager` al
   posto di `FusedLocationProviderClient`, background location capability + `Info.plist`
   (`NSLocationAlwaysAndWhenInUseUsageDescription`, `UIBackgroundModes: [location]`) al posto
   del foreground service Android. `lib/native/nativeLocationPlugin.ts` (contratto TS) dovrebbe
   restare invariato se l'implementazione Swift rispetta la stessa interfaccia
   (`start`/`stop`/`setMode`/`getPendingFixes`) — **questo è il criterio di completamento reale
   della Fase 5**: `locationSource.ts` che funziona in modo equivalente su entrambe le
   piattaforme, non solo un'app che si apre su iPhone.
3. **Fase 5C — Background location, permessi, comportamento batteria, test su dispositivo
   reale** — verifica pratica (non assumibile da codice) che il Foreground/background
   location su iOS si comporti in modo utile quanto il Foreground Service Android con schermo
   spento per ore; disclosure App Review per `NSLocationAlwaysAndWhenInUseUsageDescription`
   (equivalente iOS della schermata di disclosure Android già segnalata come mancante nella
   roadmap esistente); verifica concreta se la Battery Status API
   (`lib/navigation/battery.ts`) si comporta allo stesso modo in WKWebView iOS — storicamente
   meno supportata che su Chrome/Android, da non dare per scontata.

**Decisioni aperte**:
- Pubblicazione su App Store Connect richiede un account developer Apple a pagamento, distinto
  da Play Console — passo manuale, come già annotato per Android in
  `docs/guida-pubblicazione-dtrek-navigator.md`.
- Se 5A/5B possono procedere in parallelo con capacità diverse (uno scaffolding, uno Swift) o
  vanno strettamente sequenziali — 5C dipende comunque da entrambe.

### Fase 6 — Qualità voce: coda invece di cancel — ✅ landed (v1)

`lib/navigation/speech.ts` oggi fa `window.speechSynthesis.cancel()` prima di ogni nuovo
avviso (scelta deliberata, non un bug — commento: "don't stack callouts if one is already
mid-sentence"). Con vento o passo sostenuto, un'istruzione può sparire a metà frase.

**Riscrittura proposta** (stessa interfaccia pubblica `speak`/`stopSpeaking`/
`isSpeechSupported`, nessun call site da riscrivere nella firma base):
- Coda interna con priorità: `speak(text, { priority: 'critical' | 'normal' })` —
  `critical` (off-route, wrong_direction, POI di sicurezza) può ancora interrompere;
  `normal` (svolte, promemoria di passo) si accoda invece di cancellare.
- Dedup: stesso testo/tipo già in coda non viene riaccodato.
- Avanzamento della coda via `onend`/`onerror`, non fire-and-forget.

**Implementato** (branch `claude/dtrek-navigator-analysis-dld340`): esattamente la coda con
priorità descritta sopra, `speak(text, { priority })`. Classificazione applicata: `critical` =
fuori percorso, direzione sbagliata, GPS perso/permesso negato, promemoria di rientro per il
buio; `normal` (default, invariato) = arrivo a un POI, moment narrativo, batteria scarica.

**Non ancora fatto**: nessun test su dispositivo reale (comportamento della coda con vento/voce
di sistema variabile per produttore); varietà di formulazione (non solo distanza, anche nome
del prossimo POI) resta fuori scope, come già segnalato.

### Fase 7 — Escape Engine elevation-aware (cache offline) — ✅ landed (v1)

Esattamente il piano già scritto come lavoro futuro in `docs/navigation-engine-roadmap.md`
(Fase 7 originale): niente dislivello nelle vie di fuga oggi, perché il servizio DTM esterno è
rate-limited a 50 chiamate/24h — inaccettabile da spendere in tempo reale.

**Modifiche**:
- `lib/routeBuilder/osmGraph.ts`: `GraphNode` guadagna un campo opzionale `elevM?: number`
  (oggi assente) — nessuna breaking change, i consumer esistenti lo trattano come assente
  finché non popolato.
- `lib/offline/packageManager.ts` (`downloadOfflinePackage()`): dopo aver salvato il trail
  graph, una fase best-effort chiama il nuovo endpoint autenticato
  `app/api/navigation/trail-graph-elevation` e applica le quote ricevute — **un solo tentativo
  per pacchetto**, mai ripetuto a ogni avvio navigazione.
- `packageManifest.ts`: nuovo campo opzionale `hasElevationGraph?: boolean`, degradabile in
  `offlineReadiness.ts` (mai bloccante, stessa filosofia già stabilita per il trail graph).
- `lib/navigation/escapeEngine.ts`: quando `elevM` è presente sui nodi del path calcolato,
  somma il dislivello reale e declassa `safety` di un livello oltre ~150 m/km di pendenza,
  aggiungendo la cifra al motivo mostrato; quando assente, fallback silenzioso al comportamento
  di oggi — nessuna regressione per pacchetti scaricati prima di questa fase.

**Semplificazione emersa scrivendolo, diversa dalla formulazione originale**: niente
"raggruppamento in un numero minimo di bbox DTM" — il bbox del trail graph persistito è già
quello ~1.1km-padded di `trailGraphStore.ts` (pensato apposta per coprire vie di fuga vicine),
abbastanza piccolo da stare in un **solo** tile DTM. `lib/dtm/graphElevation.ts` riusa quindi lo
stesso pattern "una bbox, una chiamata DTM cache-ata 180 giorni" già collaudato in
`lib/dtm/elevationEnrich.ts` per l'arricchimento dei percorsi in pianificazione — non serviva
nulla di nuovo, solo applicarlo ai nodi del grafo invece che ai punti di un tracciato.
`lib/navigation/trailGraphStore.ts` non ha richiesto **nessuna** modifica alla serializzazione
(a differenza di quanto ipotizzato sopra): salva già l'intero oggetto `GraphNode` così com'è,
quindi il nuovo campo `elevM` viene persistito automaticamente.

**Non ancora fatto / prossimi passi concreti**:
- Costo del rate-limit a scala: se molti utenti scaricano pacchetti offline nello stesso giorno
  in aree diverse, 50 chiamate/24h condivise lato server potrebbero esaurirsi — non misurato
  con traffico reale.
- `STEEP_GAIN_PER_KM = 150` (soglia di declassamento) è una stima di partenza, non calibrata su
  un caso reale — stesso caveat delle altre costanti "a stima" del motore di navigazione.
- Nessun test su un pacchetto scaricato con copertura DTM reale (solo verificato con
  `elevM` sintetico nei test automatici) né su dispositivo reale.

## Orizzonte 3 — Vision (difficile da copiare dalla concorrenza) — non ancora fatto

Qui il dettaglio resta volutamente più leggero — sono idee da specificare meglio quando gli
Orizzonti 1/2 saranno chiusi, non lavoro pronto per essere costruito subito.

### Fase 8 — Trail Confidence — ✅ landed (v1 ridotta, solo calcolo — nessun overlay live)

Probabilmente la feature più distintiva dell'intero piano — merita una definizione più
precisa di "trailScore + connettività + community". Non è la somma di segnali alla pari, è
uno **stato dinamico di affidabilità del percorso**, che combina segnali di natura molto
diversa tra loro:
- qualità geometrica del tracciato (densità di vertici, coerenza della polyline);
- qualità/copertura della rete durante la navigazione (rilevante per quanto ci si può fidare
  degli aggiornamenti live);
- affidabilità del dato OSM sottostante (tag `highway`, completezza del grafo in quell'area);
- Trail Score già calcolato in pianificazione (`lib/trailScore.ts`);
- segnale community (Fase 4) — **attenuato, non sommato alla pari**: è per natura rumoroso e
  volatile nel tempo (una nota di 6 mesi fa pesa meno di una di ieri, un solo completamento
  recente pesa meno di dieci), quindi entra nel blend con un peso ridotto e un decadimento
  temporale esplicito, non come un quinto segnale equivalente agli altri quattro;
- stato recente del tratto (segnali meteo/suolo già calcolati da `lib/trailConditions/`);
- coerenza GPS effettivamente osservata durante la navigazione stessa (quanto la posizione
  reale si è discostata/riallineata rispetto al previsto lungo quel tratto specifico).

Nuovo modulo puro `lib/navigation/trailConfidence.ts` — combina questi segnali (formula di
blend esatta da definire quando la fase viene specificata in dettaglio, non ora) in un
punteggio 0-1 per segmento/nodo, mostrato come layer colorato su
`NavigationMap.tsx`/`NavigationMapLibre.tsx` (stesso spirito del layer "sentieri vicini" già
esistente). Decisione aperta: se il blend gira offline (solo dati già nel pacchetto) o
richiede online per il pezzo community — probabilmente degradabile come il resto del
pacchetto offline.

**Implementato (v1 volutamente ridotta)** (branch `claude/dtrek-navigator-analysis-dld340`):
solo il **calcolo**, non l'overlay live sulla mappa. `computeTrailConfidence()` combina 2 dei 7
segnali elencati sopra — Trail Score già calcolato in pianificazione (peso 0.6) e il segnale
meteo/clima già calcolato da `lib/trailConditions/` (peso 0.4) — più il correttivo community
(Fase 4, mai oltre +0.1, indipendentemente dal `confidenceWeight`). Ogni risultato porta sempre
un `factors: string[]` non vuoto, stesso principio "l'utente deve sempre sapere perché"
dell'Escape Engine.

**Deliberatamente fuori scope in questo giro** (motivo: nessuna delle tre richiede solo
"scrivere una formula" — servirebbe prima nuova strumentazione live non ancora costruita in
nessuna fase precedente):
- **Qualità geometrica del tracciato** — nessun modulo esistente calcola oggi una misura di
  "densità di vertici/coerenza della polyline" riusabile.
- **Coerenza GPS osservata dal vivo** — richiederebbe una nuova metrica continua (es. quanto la
  posizione filtrata da `PositionEngine` si discosta dalla proiezione attesa lungo il tratto,
  accumulata nel tempo), non solo il verdetto istantaneo già prodotto da `offRouteEngine.ts`.
- **Qualità/copertura della rete durante la navigazione** — nessun segnale di "quanto è buona
  la connessione in questo momento" esiste oggi nel motore di navigazione.
- **Nessun overlay colorato** su `NavigationMap.tsx`/`NavigationMapLibre.tsx` — costruirlo bene
  su entrambi i renderer (Leaflet e MapLibre) è un lavoro a sé, più grande del solo calcolo.
  Stesso pattern già usato altrove in questo repo ("infrastruttura prima, consumatore dopo" —
  vedi il prerequisito trasversale sulla persistenza del trail graph nella roadmap originale):
  il modulo di calcolo è pronto e testato, l'interfaccia che lo mostra è lavoro futuro.

**Seguito — prima UI reale** (stesso branch, richiesto esplicitamente dall'utente subito dopo
il landing della v1): `components/navigation/useTrailConfidence.ts` +
`TrailConfidenceBadge.tsx` — un badge colorato (verde/ambra/rosso) nella colonna destra dei
controlli mappa, un tap apre un foglio con punteggio, motivi e una nota esplicita su cosa non
copre ancora. Riusa `/api/trails/conditions?polyline=...`, lo stesso endpoint/pattern già usato
da `components/CurrentConditionsNotice.tsx` — nessun nuovo endpoint. **Resta un solo badge per
l'intera escursione, non un overlay per segmento**: gli input disponibili (Trail Score, meteo/
clima, community) sono già aggregati sull'intero percorso in questa app, non granulari quanto
servirebbe per colorare tratti diversi in modo significativo — un vero overlay "per tratto"
richiede prima i segnali per-segmento ancora mancanti (vedi sopra), non solo una UI diversa
sullo stesso calcolo.

**Non ancora fatto**: formula di blend non validata su un caso reale (pesi 0.6/0.4/correttivo
±0.1 sono stime ragionevoli, non calibrate); nessuna decisione presa su offline vs online per
il pezzo community (ora che il punteggio è davvero consumato dal vivo, la domanda è concreta,
non più ipotetica — ma non ancora affrontata); nessun test end-to-end reale del badge.

### Fase 9 — Modalità gruppo — ✅ landed (v1)

Estensione di Fase 1 a più partecipanti: `hike_navigation_groups` (id, `created_by`,
`planned_hike_id`) + `hike_navigation_group_members` (group_id, session_id), ogni membro
pubblica la propria posizione come in Fase 1, la vista di gruppo mostra N marker.

**Decisione presa esplicitamente con l'utente** (non a stima): **link pubblico broadcast** per
guardare — chi ha il link vede tutti i partecipanti senza login, stesso modello della Fase 1.
Unirsi al gruppo per PARTECIPARE (pubblicare la propria posizione) resta invece autenticato,
come per la condivisione individuale — i due lati (guardare vs. partecipare) non sono simmetrici
per design, non un'incoerenza.

**Implementato** (branch `claude/dtrek-navigator-analysis-dld340`): esattamente lo schema sopra.
Dettagli emersi scrivendolo:
- **Nessuna colonna di posizione duplicata**: un membro del gruppo riusa `hike_navigation_
  sessions.last_live_lat/lon/ts` già scritto dal loop di pubblicazione della Fase 1 —
  `hike_navigation_group_members` collega solo "quale sessione appartiene a quale gruppo".
  Creare o unirsi a un gruppo (`onGroupActive`) attiva lo stesso `liveSharingEnabled` che già
  guida quel loop — nessun secondo meccanismo di pubblicazione.
- **Chi unisce un gruppo non è il creatore**: la RLS owner-only su `hike_navigation_groups` non
  gli permetterebbe di leggere quella riga per risolvere il token. `app/api/navigation/groups/
  join/route.ts` usa quindi il client service-role per la risoluzione token + l'insert, ma è la
  route stessa — non la RLS — a verificare che la sessione passata appartenga a chi sta
  chiamando, prima di scrivere.
- **Stato "sono nel gruppo" persistito in IndexedDB** (`lib/localStore.ts`, stessa chiave per
  hike) lato client — non richiesto esplicitamente nella formulazione originale, aggiunto perché
  altrimenti un refresh della pagina avrebbe fatto perdere all'interfaccia la consapevolezza di
  essere già iscritti (la riga in `hike_navigation_group_members` resta comunque, solo l'UI non
  lo saprebbe senza questo).
- Uscire dal gruppo o chiuderlo **non disattiva** la condivisione individuale (`liveSharingEnabled`)
  se era già attiva per conto proprio — l'unico modo di fermare del tutto la pubblicazione
  posizione resta il toggle della Fase 1 (`LiveShareToggle.tsx`, "Disattiva condivisione").
  Scelta deliberata per restare semplici: un solo interruttore booleano, mai spento
  automaticamente da un'azione di gruppo.

**Non ancora fatto**:
- **Migrazione da applicare a mano** (`supabase/migrations/add_navigation_groups.sql`) sul
  progetto Supabase live + `NOTIFY pgrst, 'reload schema';` — stesso passo manuale già
  ricorrente per ogni fase che tocca lo schema.
- Nessun test end-to-end reale (crea gruppo → unisciti da un secondo account → verifica i
  marker sulla mappa pubblica) — solo `tsc`/lint puliti.
- Nessun limite al numero di partecipanti né controllo su gruppi abbandonati (un gruppo scade
  comunque con la stessa finestra di 12h della Fase 1, rinnovabile dal creatore).

### Fase 10 — "Giulia in cammino" — ✅ landed (v1)

Nuova route `app/api/guide/live-qa/route.ts`, copia strutturale di `app/api/guide/qa/route.ts`
con `buildContext()` sostituito da una versione che riceve posizione GPS corrente, il POI più
vicino (già caricato come `NavPoi[]` in `ActiveNavigationView.tsx`) e distanza rimanente (da
`RouteProgress`) invece della guida statica. Gating riusa `resolveApiKeyAndSettings.ts`/
`lib/dtrekEntitlement.ts` as-is (basta un nuovo `AiFeature` in `lib/claudeModels.ts`). Loop
push-to-talk: STT già esistente (`lib/useSpeechDictation.ts`, oggi usato per note di campo) →
nuovo endpoint → TTS in coda (Fase 6).

**Vincolo di sicurezza esplicito, non negoziabile**: Giulia non entra nel loop di navigazione
safety-critical. Può descrivere, contestualizzare, avvisare in linguaggio naturale ("tra circa
800 metri il sentiero sembra peggiorare, secondo le segnalazioni recenti") — non può mai
emettere né influenzare un'istruzione di navigazione ("gira qui", "sei fuori percorso"), che
resta un'uscita esclusiva di `NavigationEngine`/`stateMachine.ts`. In pratica: la route
`app/api/guide/live-qa/route.ts` è **read-only** rispetto allo stato di navigazione — riceve
contesto (posizione, POI vicino, distanza residua) ma non ha alcun canale di scrittura verso
`NavigationEngine`, `offRouteEngine.ts` o `escapeEngine.ts`. Il motore decide, Giulia
interpreta e assiste — mai il contrario.

**Implementato** (branch `claude/dtrek-navigator-analysis-dld340`), con scelte diverse dalla
formulazione originale, tutte per restare più leggeri di `guide/qa`:
- **Nessuna posizione GPS nel contesto inviato al modello** — solo titolo del percorso, nome/
  distanza del POI più vicino (già ordinato da `remainingPois`) e distanza rimanente. Le
  coordinate grezze non aggiungono nulla che Giulia possa usare in una risposta breve e non
  navigazionale, e tenerle fuori dal prompt è anche coerente col vincolo di sicurezza (niente
  che assomigli a un dato di navigazione nel contesto che il modello vede).
- **Nessuna ricerca web, nessuna cronologia persistita/rigiocata** — a differenza di
  `guide/qa`: una domanda "in cammino" deve restare rapida (`max_tokens: 200` contro i 600 di
  `guide/qa`, nessun tool `web_search`), e non c'è un flusso naturale di "conversazione nel
  tempo" da salvare come per la guida pre-escursione. Ogni domanda è indipendente.
- **`liveQa` su Haiku di default** (`lib/claudeModels.ts`), non Sonnet come `guide`/`guideQa` —
  stesso trattamento economico di `questionnaire`/`caption`, coerente con "domanda breve,
  contesto minimo" del research brief originale.
- `components/navigation/GiuliaLiveQa.tsx`: un tap avvia la dettatura, un secondo tap la ferma
  e invia — nessun bottone "invia" separato, tutta l'interazione è push-to-talk. La risposta
  viene sia letta ad alta voce (`speak(text, { priority: 'normal' })`, si accoda invece di
  interrompere un avviso critico in corso) sia mostrata in un piccolo pannello, per chi
  preferisce non ascoltare.

**Decisione aperta chiusa**: il pulsante è disabilitato quando `isOnline` è `false` — "solo
online" è dichiarato esplicitamente nell'interfaccia (tooltip "Richiede connessione"), non un
degrado silenzioso scoperto a metà domanda.

**Non ancora fatto**: nessun test end-to-end reale (riconoscimento vocale del browser, qualità
della trascrizione italiana, latenza reale della risposta) — solo `tsc`/lint puliti, nessun
test automatico scritto per questa fase (il componente dipende da Web Speech API e da uno
stream di rete, entrambi difficili da testare in unit senza un browser reale).

### Fase 11 — Weather look-ahead — ✅ landed (v1)

`fetchDayHourly()` (già esistente in `lib/openmeteo.ts`, previsioni orarie fino a 16 giorni)
proiettato contro l'ETA già calcolata da `paceAssistant.ts` — nuovo modulo puro
`lib/navigation/weatherLookahead.ts` (`projectWeatherAtEta`) che pesca il bucket orario più
vicino all'ETA e lo confronta con quello più vicino ad ora, avvisando solo se le condizioni
peggiorano (pioggia/vento assenti ora ma previsti all'arrivo).

**Implementato** (branch `claude/dtrek-navigator-analysis-dld340`), con due scelte di scope
diverse dalla formulazione originale:
- **Proietta solo sull'ETA di fine percorso** (`PaceAssistant.liveEtaDate`), non su "ogni
  istruzione futura" come genericamente ipotizzato — un solo checkpoint, riusando una stima già
  calcolata, invece di costruire una nuova pipeline di ETA per-istruzione (che avrebbe anche
  moltiplicato il rumore: molte istruzioni di svolta ravvicinate avrebbero prodotto avvisi
  quasi identici).
- **Decisione aperta chiusa**: nessuna nuova chiamata Open-Meteo introdotta — `useWeatherRefresh.ts`
  (già esistente, refresh ogni 20 min per la correzione meteo live del passo) è stato esteso
  per riusare lo stesso array orario già scaricato, non un secondo hook con un fetch proprio.
- Banner dismissibile nello stesso contenitore di avvisi impilati già esistente in
  `ActiveNavigationView.tsx` (mappa offline, fauna...), si riapre da solo se il messaggio
  cambia; nessun avviso vocale (solo visivo) — scelta di scope, non nella formulazione
  originale.

**Non ancora fatto**: il primissimo controllo dopo l'avvio della navigazione può non avere
ancora un ETA disponibile (PaceAssistant non ha dati sufficienti) — si aggiorna al refresh
successivo (20 min) o alla prossima navigazione, non c'è un secondo tentativo ravvicinato per
questo caso, per non introdurre una chiamata di rete in più. Nessun test su un caso reale con
previsioni Open-Meteo vere (solo dati sintetici nei 7 test automatici).

## Validazione trasversale — Field Testing

Non è una dodicesima fase, è il filo rosso che accompagna tutte le 11: una suite automatica
(Fase 3) dimostra che il codice non è regredito, non che il comportamento sia quello giusto
quando qualcuno è davvero nei guai sul terreno. Il report comparativo che ha originato questa
roadmap segnala già come rischio concreto che le soglie di sicurezza (off-route, Escape
Engine, decisore batteria) restino "stime ragionevoli, mai verificate" — questa sezione rende
esplicito come si chiude quel rischio, in tre livelli crescenti, per ogni fase che tocca
posizionamento/sicurezza (in particolare Fasi 1, 2, 3, 5, 7):

1. **Unit/simulazione** — asserzioni automatiche (Fase 3) su moduli puri, scenari sintetici
   già pronti in `lib/navigation/simulation/presetScenarios.ts` (GPS rumoroso, perdita GPS,
   spike, deviazione, incertezza).
2. **Replay GPS** — tracce reali già registrate (`lib/navigation/simulation/gpxReplay.ts`,
   già esistente) rigiocate contro scenari non ancora coperti dai preset: sentiero parallelo
   ravvicinato, tornante stretto, attraversamento di un altro sentiero, tratto senza
   segnatura, posizione grossolanamente errata (accuracy pessima ma non abbastanza da essere
   scartata). Non richiede uscire sul campo, ma richiede tracce/scenari che oggi non esistono
   ancora nei preset.
3. **Test outdoor reale** — l'unico livello che nessun ambiente di sviluppo può sostituire
   (già annotato come mancante nella roadmap esistente per la Fase 8 originale): copertura GPS
   scarsa nel bosco, schermo spento per ore, batteria su un'intera giornata, e — specifico di
   questa nuova roadmap — verifica pratica che il link di condivisione live (Fase 1) e il
   pulsante SOS (Fase 2) restino utilizzabili con connessione dati scarsa/assente, non solo in
   condizioni di laboratorio con rete perfetta.

Ogni fase di Orizzonte 1/2 che tocca posizionamento o sicurezza dovrebbe attraversare tutti e
tre i livelli prima di essere considerata "fatta", non solo il primo.

## Decisioni aperte trasversali (consolidate)

**Chiuse** (risolte durante l'implementazione delle fasi rispettive, non più aperte):
- ~~Voce: classificazione critical/normal~~ — chiusa in Fase 6 (off-route/wrong_direction/gps_lost/rientro = critical, resto = normal).
- ~~Modalità gruppo: link broadcast vs membership autenticata~~ — chiusa esplicitamente con
  l'utente in Fase 9: link broadcast per guardare, autenticazione solo per partecipare.
- ~~Giulia in cammino: solo-online~~ — chiusa in Fase 10, dichiarata nell'interfaccia (pulsante
  disabilitato offline), non un degrado silenzioso.

**Ancora aperte**:
- Live sharing: polling (scrittura GPS ~15-20s, lettura viewer ~10-15s — due frequenze
  distinte e configurabili, non un unico numero) vs Realtime pubblico; durata esatta della
  finestra di scadenza (12h proposte come default, non ancora validata sull'uso reale — ora
  riusata anche per i gruppi in Fase 9).
- SOS: deep-link vs chiamata diretta; numero fisso 112 vs internazionalizzato; se includere il
  link di condivisione live nel testo SMS quando attiva.
- Community: granularità del dedup completamenti; fallback senza `osm_relation_id`; valore
  esatto del rate-limit.
- iOS: se 5A/5B possono procedere in parallelo; parità Battery Status API da verificare, non
  assumere. **Unica fase rimasta non iniziata di tutto il piano.**
- Se introdurre varietà di formulazione vocale oltre al semplice accodamento (Fase 6).
- Escape Engine: cache DTM cross-utente vs per-download; densità di campionamento nodi.
- Trail Confidence: formula esatta di blend (pesi 0.6/0.4/correttivo ±0.1 sono stime, non
  calibrate) e i 3 segnali rimasti fuori scope in v1 (geometria, GPS live, qualità rete) restano
  da specificare quando/se si decide di completarli.

Nessuna di queste blocca l'implementazione delle fasi già fatte — erano tutte scelte di
prodotto da chiudere durante l'implementazione della fase specifica, non prerequisiti.

## Ordine consigliato per le prossime PR

1. ✅ Fase 1 — Live location sharing via link pubblico, scadenza inclusa (il gap di sicurezza
   più grave, il più economico da costruire vista l'infrastruttura di token già esistente).
   Resta da fare solo l'applicazione della migrazione al progetto Supabase live e un test
   end-to-end reale (vedi "Non ancora fatto" della Fase 1 sopra).
2. ✅ Fase 2 — SOS/emergenza a 4 livelli, UI fail-safe (piccola, indipendente, alto valore
   percepito a costo quasi nullo). Resta da fare solo il test su dispositivo reale.
3. ✅ Fase 3 — Prima infrastruttura di test automatizzato, 28 test verdi su offRouteEngine/
   escapeEngine/locationModeDecider (livello 1 di Field Testing), agganciati a
   `.github/workflows/ci.yml` su ogni push/PR.
4. ✅ Fase 6 — Qualità voce, coda con priorità critical/normal.
5. ✅ Fase 7 — Escape Engine elevation-aware, dislivello reale nelle vie di fuga cache-ato al
   download offline.
6. ✅ Fase 4 — Community layer leggero, architettura senza view pubblica. Il dedup dei
   completamenti resta una decisione di prodotto ancora aperta (vedi sopra).
7. Fase 5A/5B — Target iOS, scaffold + provider nativo (il più costoso in tempo/lavoro nativo;
   5C — collaudo reale — segue solo a valle, non è bloccante per iniziare 5A/5B in parallelo se
   c'è capacità).
8. ✅ Fase 11 — Weather look-ahead, proiezione all'ETA stimato riusando il refresh meteo già
   esistente.
9. ✅ Fase 10 — "Giulia in cammino", push-to-talk in navigazione, read-only rispetto al motore.
10. ✅ Fase 8 — Trail Confidence (v1 ridotta, solo calcolo — nessun overlay live sulla mappa).
11. ✅ Fase 9 — Modalità gruppo, link pubblico broadcast per guardare + partecipazione
    autenticata.

**Unica fase non ancora iniziata di tutto il piano: Fase 5 (target iOS)** — richiede
scaffolding Capacitor nativo e una riscrittura Swift, non tentata in questa sessione (nessun
macOS/Xcode disponibile).

In parallelo a ogni fase di Orizzonte 1/2 che tocca posizionamento o sicurezza: applicare i
tre livelli della sezione "Validazione trasversale — Field Testing" sopra, non solo scrivere
la fase e passare alla successiva.
