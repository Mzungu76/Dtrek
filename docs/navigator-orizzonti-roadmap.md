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

### Fase 1 — Live location sharing via link pubblico — non ancora fatto

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
  ADD COLUMN last_live_lat DOUBLE PRECISION,
  ADD COLUMN last_live_lon DOUBLE PRECISION,
  ADD COLUMN last_live_ts TIMESTAMPTZ,
  ADD COLUMN last_live_accuracy_m DOUBLE PRECISION;
CREATE INDEX idx_nav_sessions_share_token ON hike_navigation_sessions (share_token)
  WHERE share_token IS NOT NULL;
```
Una singola riga aggiornata in-place (non uno storico di fix) — tiene il costo di scrittura
basso ed è tutto ciò che serve a un viewer che vuole solo "dov'è adesso".

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

**Decisioni aperte** (default v1 proposto, non bloccante):
- **Polling vs Realtime pubblico**: v1 = polling. Supabase Realtime con RLS-gated
  `postgres_changes` non è adatto a un viewer anonimo senza `auth.uid()` — un canale
  "pubblico" richiederebbe una policy `SELECT USING (true)` che esporrebbe l'intera riga a
  chiunque si sottoscriva, non solo a chi ha il token. Da rivalutare se la latenza del polling
  risulta inadeguata in pratica.
- **Scadenza del link a sessione conclusa**: resta valido in sola lettura (ultima posizione
  nota) o si disattiva da solo? Non deciso — il revoke manuale resta comunque sempre
  disponibile.
- **Frequenza di scrittura**: 15-20s è un compromesso esplicito su "quanto è live il live", da
  confermare con l'uso reale.
- Verificare che il testo UI del toggle non assomigli a un upsell — vincolo esistente di
  `docs/navigator-dtrek-boundary.md` (Navigator non vende nulla al suo interno).

### Fase 2 — SOS / azione di emergenza — non ancora fatto

Nessun pattern `tel:`/`sms:`/112 esiste oggi nel codice — lavoro nuovo, che riusa solo la
posizione già disponibile in `ActiveNavigationView.tsx`.

**File nuovi**:
- `lib/navigation/sos.ts` — funzione pura `buildEmergencyLinks(lastFix)`: genera `tel:112` e
  `sms:112?body=...` con coordinate leggibili + link Google Maps (apre nativamente sia su
  Android che iOS, nessuna dipendenza nuova).
- `components/navigation/SosButton.tsx` — sempre raggiungibile in 1 tap durante navigazione
  attiva (non dentro un menu nascosto), apre uno sheet con "Chiama 112" / "Invia SMS con
  posizione".

**Log opzionale**: nessuna nuova tabella — un evento `type: 'sos_triggered'` sulla tabella
`hike_navigation_events` già esistente, tramite la stessa coda già usata per gli altri eventi.

**Decisioni aperte**:
- **Deep-link (`tel:112`, un tap in più per confermare) vs chiamata diretta** (richiederebbe
  il permesso Android `CALL_PHONE`, oggi assente dal manifest): v1 = deep-link, più sicuro e
  senza nuovo permesso invasivo.
- **112 è fisso** per v1 (target Italia/UE) — non gestisce automaticamente numeri di emergenza
  esteri.
- Se il testo dell'SMS debba includere anche il link di condivisione live (Fase 1) quando
  attivo — piccola sinergia tra le due fasi, da valutare insieme.

### Fase 3 — Suite di test automatici (vitest) — non ancora fatto

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
  navigation; batteria bassa → battery_save; altrimenti trekking) + isteresi temporale (8s) via
  `vi.useFakeTimers()`.

**Decisioni aperte**:
- CI: aggiungere `npm test` a un workflow GitHub Actions (esiste già
  `.github/workflows/build-navigator-apk.yml` come precedente) — non deciso se bloccante sui PR
  da subito.
- Se estendere nello stesso giro anche a `mapMatcher.ts`/`positionEngine.ts` (filtro di
  Kalman) o rimandare — la roadmap esistente li segnala già come "non testato", ma questa fase
  prioritizza solo i tre moduli sopra.

## Orizzonte 2 — Colmare il gap di mercato — non ancora fatto

### Fase 4 — Community layer leggero — non ancora fatto

Oggi `lib/trailConditions/` è **100% calcolato** da dati esterni (meteo/suolo), esplicitamente
documentato come "mai scrive su Supabase" — zero segnale inserito da un utente reale. Il
precedente più vicino, `trail_difficulty_markers` (marker di pericolo puntuale, public-read),
era pensato per alimentare un `lib/si/signals/communitySignals.ts` che però **non è mai stato
scritto** — solo referenziato nei commenti/migrazioni. Questa fase lo implementa davvero.

**Schema**:
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

-- Consumo pubblico SOLO aggregato — mai righe individuali (esporrebbero identità/comportamento):
CREATE VIEW trail_completions_public AS
SELECT osm_relation_id,
       COUNT(*) FILTER (WHERE completed_at > NOW() - INTERVAL '30 days') AS completions_30d,
       COUNT(*) AS completions_total
FROM trail_completions WHERE osm_relation_id IS NOT NULL
GROUP BY osm_relation_id;
```
Le note testuali restano lette solo tramite una funzione server-side dedicata (come
`weatherSignals.ts`), mai tramite PostgREST diretto — permette di applicare moderazione anche
in lettura, non solo alla scrittura.

**File nuovi**:
- `supabase/migrations/add_trail_completions.sql`
- `lib/community/moderation.ts` — v1 volutamente minimale: rate-limit per `user_id` (Upstash,
  già una dipendenza del progetto), cap di lunghezza (280 caratteri, client+server), lista
  statica di parole bandite (italiano, case-insensitive) — niente ML. Funzione pura
  `moderateNote(text): {ok, reason?}`.
- `app/api/trails/completions/route.ts` — `POST {activityId, note?}` (autenticato, verifica
  ownership, risolve `osm_relation_id` riusando `findTrailForPolyline` già esistente in
  `lib/trailConditions/matchTrail.ts`), `GET ?osm_relation_id=` pubblico.
- `lib/si/signals/communitySignals.ts` — implementazione reale, alimentata sia da
  `trail_difficulty_markers` (già esistente) sia da `trail_completions_public` (nuovo).
- `app/api/trails/conditions/route.ts` — **esteso**, non riscritto: aggiunge una sezione
  `community` alla risposta JSON esistente, mantenendo l'invariante "mai scrive" della route
  attuale.

**UI**: prompt opt-in post-navigazione (mai automatico) — estensione di
`EndHikeReviewDialog.tsx` o simile.

**Decisioni aperte**:
- Dedup dei completamenti (stesso utente/stesso sentiero/stesso weekend conta una volta o
  N?) — impatta la query aggregata.
- Fallback quando `osm_relation_id` non risolve — se `polyline_hash` va usato per un
  fuzzy-match nell'aggregato pubblico.
- Valore numerico del rate-limit (es. 3 note/giorno/utente) — scelta di prodotto, non tecnica.

### Fase 5 — Target iOS (Capacitor) — non ancora fatto

Nessuna cartella `ios/` esiste oggi. Due sotto-fasi distinte, non un blocco unico:

1. **Scaffold Capacitor** (`npx cap add ios`, comando manuale non eseguibile da questa
   sessione) — equivalente Xcode project di `android/`. `capacitor.config.ts` probabilmente
   non richiede modifiche strutturali (`server.url` è già cross-platform), da verificare se
   serve un blocco `ios: { ... }` analogo a quello Android esistente.
2. **Riscrittura Swift del plugin `NativeLocation`** (oggi solo Kotlin in
   `android/app/src/main/java/com/dtrek/navigator/nativelocation/`) — il vero lavoro nativo:
   `CLLocationManager` al posto di `FusedLocationProviderClient`, background location
   capability + `Info.plist` (`NSLocationAlwaysAndWhenInUseUsageDescription`,
   `UIBackgroundModes: [location]`) al posto del foreground service Android. `lib/native/
   nativeLocationPlugin.ts` (contratto TS) dovrebbe restare invariato se l'implementazione
   Swift rispetta la stessa interfaccia (`start`/`stop`/`setMode`/`getPendingFixes`).

**Decisioni aperte**:
- Ordine di lavoro: lo scaffold è rapido, la riscrittura Swift è il costo reale — vanno
  pianificati come due milestone separate.
- Pubblicazione su App Store Connect richiede un account developer Apple a pagamento, distinto
  da Play Console — passo manuale, come già annotato per Android in
  `docs/guida-pubblicazione-dtrek-navigator.md`.
- Se la Battery Status API (`lib/navigation/battery.ts`) si comporta allo stesso modo in WKWebView
  iOS — storicamente meno supportata di Chrome/Android, da verificare concretamente, non
  assumere parità.

### Fase 6 — Qualità voce: coda invece di cancel — non ancora fatto

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

**Decisioni aperte**:
- Classificazione esatta "critical" vs "normal" per ogni tipo di evento esistente (off-route,
  turn-by-turn, moments, POI) — richiede una vera scelta di prodotto, non solo tecnica.
- Se introdurre varietà di formulazione (non solo distanza, anche nome del prossimo POI) —
  scope più ampio del semplice accodamento, da valutare separatamente.

### Fase 7 — Escape Engine elevation-aware (cache offline) — non ancora fatto

Esattamente il piano già scritto come lavoro futuro in `docs/navigation-engine-roadmap.md`
(Fase 7 originale): niente dislivello nelle vie di fuga oggi, perché il servizio DTM esterno è
rate-limited a 50 chiamate/24h — inaccettabile da spendere in tempo reale.

**Modifiche**:
- `lib/routeBuilder/osmGraph.ts`: `GraphNode` guadagna un campo opzionale `elevM?: number`
  (oggi assente) — nessuna breaking change, i consumer esistenti lo trattano come assente
  finché non popolato.
- `lib/navigation/trailGraphStore.ts`: la serializzazione IndexedDB include `elevM` quando
  presente.
- `lib/offline/packageManager.ts` (`downloadOfflinePackage()`): dopo aver salvato il trail
  graph, una fase best-effort raggruppa i nodi in un numero minimo di bbox DTM (riuso di
  `lib/dtm/dtmCache.ts`) e popola `elevM` — **un solo tentativo per pacchetto**, mai ripetuto a
  ogni avvio navigazione.
- `packageManifest.ts`: nuovo campo opzionale `hasElevationGraph?: boolean`, degradabile in
  `offlineReadiness.ts` (mai bloccante, stessa filosofia già stabilita per il trail graph).
- `lib/navigation/escapeEngine.ts`: quando `elevM` è presente sui nodi del path calcolato,
  somma il dislivello reale per raffinare `safety` oltre al proxy attuale (lunghezza + tag
  `highway`); quando assente, fallback silenzioso al comportamento di oggi — nessuna
  regressione per pacchetti scaricati prima di questa fase.

**Decisioni aperte**:
- Costo del rate-limit a scala: se la chiave DTM è condivisa server-side, molti download
  offline nello stesso giorno potrebbero esaurirla — verificare se serve una cache
  cross-utente persistente per bbox già scaricate di recente.
- Densità di campionamento: ogni nodo del grafo (potenzialmente centinaia, `MAX_VISITED_NODES
  =600` nell'Escape Engine) vs. un sottoinsieme interpolato — impatta quante bbox servono per
  download.
- Se rendere questo un'opzione esplicita nel download offline esistente
  (`OfflinePackageDownloader.tsx`) o sempre-attivo.

## Orizzonte 3 — Vision (difficile da copiare dalla concorrenza) — non ancora fatto

Qui il dettaglio resta volutamente più leggero — sono idee da specificare meglio quando gli
Orizzonti 1/2 saranno chiusi, non lavoro pronto per essere costruito subito.

### Fase 8 — Trail Confidence live overlay — non ancora fatto (vision)

Combina `lib/trailScore.ts` (già esistente) + connettività del trail graph persistito
(`trailGraphStore.ts`) + il nuovo segnale community (Fase 4) in un punteggio 0-1 per
segmento/nodo, mostrato come layer colorato su `NavigationMap.tsx`/`NavigationMapLibre.tsx`
(stesso spirito del layer "sentieri vicini" già esistente). Nuovo modulo puro
`lib/navigation/trailConfidence.ts`. Decisione aperta: se il blend gira offline (solo dati già
nel pacchetto) o richiede online per il pezzo community — probabilmente degradabile come il
resto del pacchetto offline.

### Fase 9 — Modalità gruppo — non ancora fatto (vision)

Estensione di Fase 1 a più partecipanti: `hike_navigation_groups` (id, `created_by`,
`planned_hike_id`) + `hike_navigation_group_members` (group_id, session_id), ogni membro
pubblica la propria posizione come in Fase 1, la vista di gruppo mostra N marker. **Decisione
aperta grossa, non solo di dettaglio**: link pubblico broadcast (chiunque col link vede tutti,
come Fase 1) o membership autenticata reciproca ("unisciti al gruppo" esplicito per ogni
partecipante) — sono due modelli di sicurezza sostanzialmente diversi, da scegliere prima di
progettare lo schema RLS definitivo.

### Fase 10 — "Giulia in cammino" — non ancora fatto (vision)

Nuova route `app/api/guide/live-qa/route.ts`, copia strutturale di `app/api/guide/qa/route.ts`
con `buildContext()` sostituito da una versione che riceve posizione GPS corrente, il POI più
vicino (già caricato come `NavPoi[]` in `ActiveNavigationView.tsx`) e distanza rimanente (da
`RouteProgress`) invece della guida statica. Gating riusa `resolveApiKeyAndSettings.ts`/
`lib/dtrekEntitlement.ts` as-is (basta un nuovo `AiFeature` in `lib/claudeModels.ts`). Loop
push-to-talk: STT già esistente (`lib/useSpeechDictation.ts`, oggi usato per note di campo) →
nuovo endpoint → TTS in coda (Fase 6). **Decisione aperta**: il riconoscimento vocale via Web
Speech API richiede probabilmente connessione dati — questa feature è verosimilmente
solo-online, da dichiarare esplicitamente vista la natura "in cammino, spesso senza rete" del
contesto.

### Fase 11 — Weather look-ahead — non ancora fatto (vision)

`fetchDayHourly()` (già esistente in `lib/openmeteo.ts`, previsioni orarie fino a 16 giorni)
proiettato contro l'ETA per segmento già calcolata da `paceAssistant.ts` — nuovo modulo puro
`lib/navigation/weatherLookahead.ts` che stima l'ora di arrivo a ogni istruzione futura e pesca
il bucket orario corrispondente, avvisando se le condizioni attese peggiorano rispetto ad ora.
Decisione aperta: ogni quanto ri-triggerare la proiezione durante la navigazione (non ad ogni
fix) per non consumare quota Open-Meteo inutilmente.

## Decisioni aperte trasversali (consolidate)

- Live sharing: polling (10-15s) vs Realtime pubblico; scadenza del link a sessione conclusa;
  frequenza di scrittura posizione.
- SOS: deep-link vs chiamata diretta; numero fisso 112 vs internazionalizzato.
- Community: granularità del dedup completamenti; fallback senza `osm_relation_id`; valore
  esatto del rate-limit.
- iOS: sequenziamento scaffold vs riscrittura Swift; parità Battery Status API.
- Voce: classificazione critical/normal per tipo di evento esistente.
- Escape Engine: cache DTM cross-utente vs per-download; densità di campionamento nodi.
- Modalità gruppo: link broadcast vs membership autenticata — la più grossa, va chiusa prima
  di scrivere schema/RLS.
- Giulia in cammino: solo-online da dichiarare esplicitamente.

Nessuna di queste blocca l'inizio della Fase 1 — sono tutte scelte di prodotto da chiudere
durante l'implementazione della fase specifica, non prerequisiti.

## Ordine consigliato per le prossime PR

1. Fase 1 — Live location sharing via link pubblico (il gap di sicurezza più grave, il più
   economico da costruire vista l'infrastruttura di token già esistente).
2. Fase 2 — SOS/emergenza (piccola, indipendente, alto valore percepito a costo quasi nullo).
3. Fase 3 — Bootstrap suite di test automatici (protegge tutto il lavoro già fatto e quello
   futuro sulle soglie di sicurezza — va chiusa presto, non alla fine).
4. Fase 6 — Qualità voce (piccola, indipendente, migliora subito l'esperienza quotidiana).
5. Fase 7 — Escape Engine elevation-aware (chiude un limite già documentato e atteso).
6. Fase 4 — Community layer leggero (il pezzo di maggior investimento di prodotto
   dell'Orizzonte 2, richiede decisioni di moderazione/dedup prima di partire).
7. Fase 5 — Target iOS (il più costoso in tempo/lavoro nativo, sequenziato per ultimo
   nell'Orizzonte 2 ma non bloccato da nulla — può partire in parallelo se c'è capacità).
8. Fasi 8-11 (Orizzonte 3) — da specificare meglio una volta chiusi gli Orizzonti 1/2, non da
   iniziare prima.
