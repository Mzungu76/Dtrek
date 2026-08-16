# Piano dei test — DTrek

Due parti: cosa esiste oggi (Navigator, Fase 3 di `docs/navigator-orizzonti-roadmap.md`) e cosa
sarebbe utile aggiungere per il resto dell'app, che oggi non ha copertura automatica di nessun
tipo. La seconda parte è una **proposta**, non lavoro già fatto — va trattata come backlog da
prioritizzare, non come un elenco di file che esistono già.

## Come eseguire i test oggi

```bash
npm install
npm test          # una tantum, stesso comando usato in CI
npm run test:watch  # per lavorarci sopra
```

In CI: `.github/workflows/ci.yml` esegue `npm test` (insieme a lint e typecheck) a ogni push su
`main` e a ogni pull request — risultato visibile come segno di spunta sul commit/PR e nella
scheda **Actions** del repository, senza bisogno di un terminale locale.

## 1. Test esistenti — motore di navigazione (`lib/navigation/__tests__/`)

Framework: **vitest**. 45 test in 6 file, tutti su moduli puri o eseguibili headless (nessuna
dipendenza da rete/Supabase/DOM per i primi tre, gli altri toccano funzioni pure aggiunte via via
dalle fasi successive della roadmap) — vedi Fase 3 della roadmap per il perché di questa
priorità.

| Suite | Cosa verifica |
|---|---|
| `offRouteEngine.test.ts` | I due esempi numerici già documentati nel codice (accuracy 5m + distanza crescente da 25m → OFF ROUTE dopo il dwell di default; accuracy 35m + distanza 20m → UNCERTAIN anche su un solo campione); rientro sul percorso prima che il dwell scada; `sanityDistanceM` (una distanza troppo grande per essere solo rumore GPS non resta UNCERTAIN per sempre); `wrong_direction` con isteresi temporale e soglia minima di velocità; azzeramento immediato di `wrong_direction` quando si esce da `on_route`. |
| `escapeEngine.test.ts` | `computeEscapeOptions()` su un grafo sentieri sintetico a 3 nodi: l'opzione "torna sul percorso" è sempre presente anche senza grafo/POI; le 4 tipologie compaiono nell'ordine dichiarato dallo spec quando grafo e POI sono disponibili; ogni opzione porta sempre un `reason` non vuoto (invariante esplicito); le opzioni che dipendono dal grafo sono omesse quando il grafo manca; l'opzione POI sicuro è omessa senza un POI di tipo rilevante; una via di qualità migliore (path/track) è preferita a una strada quando entrambe sono raggiungibili; con dislivello ripido noto sul grafo, un'opzione viene declassata di sicurezza (Fase 7). |
| `locationModeDecider.test.ts` | `decideLocationMode()`: tabella di priorità dichiarata (off_route/wrong_direction vince su tutto, incluso batteria scarica; bivio vicino, velocità sostenuta o accuracy scarsa scelgono `navigation`; batteria bassa e non in carica sceglie `battery_save` solo se nient'altro è urgente; batteria sconosciuta non è mai trattata come scarica). `LocationModeDecider`: passaggio immediato a `emergency` senza dwell; isteresi temporale di 8s per gli altri cambi; un blip che rientra prima del dwell non scatta nulla; un cambio di segnale desiderato durante l'attesa fa ripartire il conteggio; nessuna ripetizione dello stesso cambio una volta applicato. |
| `weatherLookahead.test.ts` | `projectWeatherAtEta()` (Fase 11): nessun avviso quando l'ETA cade nella stessa fascia oraria di "adesso" o senza dati; avviso solo quando le condizioni all'ETA peggiorano oltre le soglie di pioggia/vento. |
| `trailConfidence.test.ts` | `computeTrailConfidence()` (Fase 8): pesi dichiarati fra Trail Score e meteo/clima; bonus community limitato al tetto massimo; `factors` mai vuoto; soglie di etichetta (alta/media/bassa). |
| `realRouteSimulation.test.ts` | Vedi §3 sotto — l'unica suite che guida `NavigationEngine` per intero (non un singolo motore isolato), con fix GPS realmente registrati su un'escursione vera: percorso pulito (mai off_route), deviazione+rientro (transita davvero `navigating → uncertain → off_route → navigating`), GPS perso e ripristinato (`gpsLost`/`gpsRecovered`, distanza non corrotta), vie di fuga (`computeEscapeOptions()` su un grafo sintetico ancorato al percorso reale — vedi §3 per perché non un vero dump OSM). |

**Non coperto** (segnalato anche nella roadmap): `mapMatcher.ts` e `positionEngine.ts` (il
filtro di Kalman) restano senza test diretti/isolati — `positionEngine.ts` è ora almeno
esercitato indirettamente da `realRouteSimulation.test.ts`, ma senza asserzioni sui suoi
comportamenti interni (spike rejection, estrapolazione, ecc.), che restano non prioritizzati.

## 2. Proposta — test per il resto dell'app

DTrek va ben oltre Navigator: pianificazione percorsi, punteggi (Trail Score, Safety Score,
Beauty Score), import file, sincronizzazione, paywall/entitlement, generazione guide AI.
Nessuna di queste aree ha oggi una sola riga di test automatico. La lista sotto è ordinata per
priorità reale, non alfabetica — le prime voci sono aree dove **è già successo un incidente
concreto** in questo stesso repository (documentato in `docs/navigator-dtrek-boundary.md`), non
rischi ipotetici.

### Priorità alta — aree con un incidente reale già avvenuto

- **`lib/dtrekEntitlement.ts` (paywall/trial)** — c'è già stato un bug per cui il periodo di
  prova non dava mai accesso reale all'AI (la chiave condivisa veniva concessa solo a
  premium/BYOK, mai a un trial attivo, contraddicendo il piano). Test mirati: i due tetti
  indipendenti (percorsi/resoconti) che non si bloccano a vicenda; `trialExpired` che scatta
  solo quando **entrambi** i tetti sono esauriti o sono passati i 30 giorni, qualunque arrivi
  prima; il bypass `is_owner` che vince sempre; BYOK che sblocca tutto, non solo il costo AI.
- **Punteggi "neutri" (Beauty Score del percorso omaggio)** — bug reale: un percorso pensato
  come neutro per chiunque veniva calcolato con i pesi TEI personali di chi lo creava invece dei
  pesi di default. Test: qualunque funzione che calcola un punteggio "condiviso"/"di default"
  deve usare sempre `DEFAULT_TEI_WEIGHTS`, mai le preferenze salvate del chiamante — a
  prescindere da chi la invoca.
- **Import GPX (`lib/gpxParser.ts`)** — bug reale: i GPX con `<name>` multilingua (tipico delle
  esportazioni CAI, un figlio per lingua) producevano titoli concatenati ("SI Z17SI Z17...").
  Test: fixture GPX con `<name>` multilingua, con `<name>` a testo semplice, e senza `<name>`
  affatto → titolo sempre corretto.
- **`clone_row_for_user` (funzione SQL generica di clonazione)** — bug reale: rimuoveva
  `created_at`/`updated_at` senza rimpiazzarli, violando un vincolo NOT NULL. Più difficile da
  testare in unit-test puro (è SQL, non TypeScript) — candidato per un test di integrazione contro
  un progetto Supabase locale/di test, non per vitest.

### Priorità media — logica pura, mai verificata, ad alto impatto

- **Punteggi di percorso**: `lib/trailScore.ts` (Naismith/Munter, già usato anche da
  `paceAssistant.ts`), `lib/safetyScore.ts`, `lib/beautyScore.ts`, `lib/tei.ts` — funzioni pure,
  input/output deterministici, facili da testare con casi noti (es. un percorso pianeggiante di
  10km vs. uno con 1500m D+ deve dare un tempo Naismith prevedibile).
- **`lib/geoUtils.ts`** (`haversineM`, `bearingDeg`, `minDistToTrack`) — usata ovunque nel
  motore di navigazione e nei punteggi; un errore qui si propaga silenziosamente in decine di
  moduli. Vale la pena verificarla isolatamente con coppie di coordinate note (es. distanza
  Roma-Milano, bearing cardinali esatti).
- **`lib/trailConditions/weatherSignals.ts` / `climateSignals.ts`** — penalità calcolate da
  soglie numeriche esplicite (pioggia ultimi 7gg, temperatura media del mese) già documentate
  nei tipi (`WeatherSignal`, `ClimateSignal`) — input/output facilmente tabellabili.
- **Verifica firma webhook Paddle** (`lib/paddle.ts`) — HMAC-SHA256 a tempo costante: un test
  con firma valida, firma alterata di un carattere, e payload manomesso è economico da scrivere
  e protegge un endpoint che sposta soldi.
- **Sync engine** (`lib/sync/syncEngine.ts`, `pullEngine.ts`) — logica di outbox/retry/merge tra
  dispositivi; più costosa da testare (richiede simulare fallimenti di rete/conflitti), ma è
  l'area che ha già causato il guasto reale descritto in cima al `README.md` ("mesi di
  PATCH/POST falliti in silenzio").

### Priorità bassa/da valutare

- **Moderazione community** (Fase 4, non ancora costruita) — quando `lib/community/
  moderation.ts` esisterà, `moderateNote()` sarà un candidato naturale (funzione pura,
  deterministica).
- **Formattazione/paginazione PDF** (`lib/pdfPaginate.ts`, `guideSections.ts`) — utile ma più
  difficile da asserire senza uno snapshot/golden-file test, area meno critica per la sicurezza.

## 3. Test di simulazione "utente reale" — percorsi eseguiti come in un'uscita vera

Il repository ha già l'infrastruttura giusta per questo, costruita per un altro scopo (test
interattivo manuale, `?simulate=off_route`) ma riusabile as-is per asserzioni automatiche:

- `lib/navigation/simulation/gpxReplay.ts` — trasforma una traccia GPX reale in una sequenza di
  fix GPS, rispettando i timestamp originali.
- `lib/navigation/simulation/scenarioBuilder.ts` — primitive componibili: `walkAlongRoute`
  (cammino pulito), `injectDeviation`, `injectPoorAccuracy`, `injectGpsLoss`, `injectSpike`.
- `lib/navigation/simulation/presetScenarios.ts` — scenari pronti (`clean`, `off_route`,
  `wrong_direction`, `uncertain`, `gps_lost`, `spike`).
- `NavigationEngine` (`lib/navigation/navigationEngine.ts`) non ha alcuna dipendenza diretta da
  IndexedDB/localStore o da React — le uniche importazioni sono moduli di calcolo puro più
  `LocationSource`, che accetta già un `locationProviderFactory` iniettabile (è così che
  `?simulate=` funziona oggi).

### Fatto — `lib/navigation/__tests__/realRouteSimulation.test.ts`

Confermato in pratica (non più solo sulla carta): `NavigationEngine` gira headless sotto
vitest/Node senza mock aggiuntivi oltre al `locationProviderFactory` già previsto — nessuna
dipendenza da Capacitor/browser lo blocca all'istanziazione o all'uso.

Il test rigioca fix GPS **realmente registrati** durante un'escursione vera, scaricati con una
query diretta sul database Supabase (account owner, tabella `activities`, id
`fit_20260809062332_14178_15173` — "Faggeta del Cimino"), salvati come fixture in
`lib/navigation/__tests__/fixtures/faggeta-cimino.json` (`route_polyline` + `track_points`, forma
identica a quella del database). Verifica che lo stato non entri mai in `off_route`/
`wrong_direction` sui primi minuti reali dell'uscita.

**Scoperta emersa scrivendolo, non ipotizzata in anticipo**: `PositionEngine.checkFixQuality()`
rifiuta come "stale fix" qualunque fix con `ts` più vecchio di 30s rispetto al vero `Date.now()`
al momento dell'ingest (guardia anti-replay/anti-spoofing) — quindi una traccia con i suoi
timestamp originali (registrata giorni prima) viene scartata fix per fix se riprodotta così
com'è. Il test la ribasa "a ora" comprimendo gli intervalli di un fattore 15x (vedi
`rebaseFixesToNowCompressed` in `lib/navigation/__tests__/helpers/realTrackFixture.ts`).

**Perché il test copre solo una manciata di minuti, non l'intera escursione da 4h07m**: sono
stati provati e scartati due tentativi di comprimere/accelerare l'intera traccia, per due motivi
verificati concretamente (non solo temuti):
1. Un `dt` fra fix troppo piccolo (sotto la soglia di 0.05s del filtro di Kalman) inietta rumore
   di processo sproporzionato a ogni passo; su un percorso ad anello (le due direttrici passano
   vicine in più punti) questo ha fatto perdere l'aggancio al tratto giusto del percorso, con la
   distanza percorsa calcolata che **tornava indietro** invece di crescere.
2. Anche restando sopra quella soglia, la velocità implicita fix-a-fix non può eccedere il tetto
   di plausibilità del Position Engine (~14 m/s): un percorso reale di 14km non può essere
   "riprodotto" in meno di ~17 minuti reali senza somigliare a uno spoofing GPS — che è
   esattamente ciò che quel controllo esiste per impedire. Non è un limite del test, è la stessa
   guardia che protegge un'escursione vera da un fix falsificato.

**Conseguenza pratica**: un test end-to-end sull'**intera** escursione (non solo i primi
minuti) è fattibile con la stessa tecnica, ma richiede minuti reali di esecuzione (l'ordine di
grandezza è il tempo che impiegherebbe un escursionista a percorrerla alla velocità più alta
considerata plausibile dal motore) — appartiene a una fascia di test lenta/manuale/nightly, non
alla suite veloce che gira a ogni push in CI. Resta un passo successivo naturale, non fatto qui
per restare dentro tempi di CI ragionevoli.

Scenari proposti, in ordine di valore (i primi quattro sono ora implementati, almeno in versione
ridotta — vedi sopra — l'ultimo resta proposta):

1. **Percorso pulito, dall'inizio alla fine** — **parzialmente implementato**:
   `realRouteSimulation.test.ts` copre "lo stato non è mai passato per
   `off_route`/`wrong_direction`" su fix GPS reali, ma solo sui primi minuti (vedi sopra il
   perché). Restano da fare, sulla stessa traccia: la distanza percorsa calcolata vicina alla
   lunghezza reale entro una tolleranza ragionevole sull'**intera** escursione; ogni POI vicino
   al tracciato che genera esattamente un evento `enteredPoi`; `buildActivityFromTrack` che
   produce un'attività con dislivello/durata plausibili rispetto alla traccia sorgente — tutti
   e tre richiedono la riproduzione completa (minuti reali di esecuzione), non solo la finestra
   breve già coperta.
2. **Deviazione e rientro** — **implementato**: `realRouteSimulation.test.ts` inietta una
   deviazione (`injectDeviation`) su una finestra di fix GPS realmente registrati e verifica che
   lo stato transiti `navigating → uncertain → off_route → navigating` nell'ordine giusto,
   rispettando i tempi di dwell reali di `offRouteEngine.ts` (già verificati isolatamente in §1,
   qui si conferma l'integrazione end-to-end su dati veri). Nota tecnica: su un sentiero reale
   che curva, una deviazione con crescita troppo lenta produce un `distanceToRouteM` che oscilla
   invece di crescere in modo sostenuto, e l'Off-Route Engine (a ragione) non dichiara mai
   `off_route` — serve una crescita per passo abbastanza marcata da dominare la curvatura
   naturale del sentiero, restando comunque sotto la soglia di velocità plausibile del Position
   Engine (vedi il commento sul test).
3. **GPS perso e ripristinato** — **implementato**: `realRouteSimulation.test.ts` rimuove 7 fix
   reali consecutivi (`injectGpsLoss`) e verifica che `gpsLost` scatti, `gpsRecovered` segua, e
   che la distanza percorsa non si azzeri né esploda al ripristino. Nota tecnica: a differenza
   dell'Off-Route Engine, il timer GPS-perso (`GPS_LOST_MS`, 15s) è sull'orologio di sistema
   reale, riarmato a ogni fix — non sui timestamp (compressi) dei fix — quindi il vuoto iniettato
   deve tradursi in un vero ritardo di consegna oltre 15s reali, non solo in un salto nei
   timestamp compressi (vedi il commento sul test per come si è calcolato quanti fix rimuovere).
   Effetto collaterale osservato, non cercato: sui fix realmente registrati, il salto di
   posizione al rientro genera talvolta anche un `wrong_direction` transitorio (rumore GPS reale
   a bassa velocità vicino alla partenza) — legittimo comportamento del motore su dati rumorosi
   veri, non asserito da questo test perché fuori dal suo scopo.
4. **Vie di fuga durante un percorso reale** — **implementato, con uno scostamento dichiarato
   dal piano originale**: nel punto di massima deviazione dello scenario #2, invoca
   `computeEscapeOptions()` e verifica che "torna sul percorso" sia sempre proposta (più, come
   bonus, che le altre tre tipologie vengano trovate correttamente quando disponibili). Il piano
   prevedeva "il trail graph realmente scaricato per quell'area" via `fetchWalkNetwork()`
   (Overpass API) — verificato in questa sessione che **non è praticabile da questo ambiente**:
   il proxy di rete rifiuta con 403 esplicito (non un timeout) tutti gli endpoint Overpass/
   Nominatim configurati, e il grafo sentieri, quando l'app lo scarica davvero, resta solo in
   IndexedDB sul dispositivo (`lib/navigation/trailGraphStore.ts`), mai su Supabase — non esiste
   da nessuna parte un grafo già scaricato per quest'area recuperabile da qui. Scelta fatta con
   l'utente: un `WalkNetwork` sintetico ancorato alla geometria reale del percorso (route_polyline
   come dorsale, due diramazioni sintetiche - sentiero e strada - più un rifugio sintetico vicino
   al punto deviato) invece di un vero dump OSM. Esercita comunque la logica reale di
   `computeEscapeOptions()` (Dijkstra, classificazione per qualità highway, dislivello) — solo la
   rete sentieri sottostante non è OSM autentico. Un test con un grafo OSM davvero scaricato
   resta possibile fuori da questo ambiente (es. in locale, o passando un dump del grafo).
5. **Batteria in calo durante un'intera uscita** — alimenta `LocationModeDecider` con la stessa
   sequenza temporale di uno scenario lungo (`clean`, alcune ore) e un livello di batteria che
   scende gradualmente, verificando che le transizioni di modalità avvengano nell'ordine e nei
   tempi attesi senza mai "sfarfallare".

Schema indicativo (non implementazione pronta all'uso — da verificare/adattare quando si scrive
davvero il primo di questi test):

```ts
import { describe, it, expect } from 'vitest'
import { NavigationEngine } from '@/lib/navigation/navigationEngine'
import { gpxToFixes } from '@/lib/navigation/simulation/gpxReplay'
import { walkAlongRoute } from '@/lib/navigation/simulation/scenarioBuilder'

describe('percorso pulito end-to-end (simulazione)', () => {
  it('non entra mai in off_route su una traccia reale senza deviazioni', async () => {
    const fixes = walkAlongRoute(await gpxToFixes('fixtures/traccia-esempio.gpx'))
    const engine = new NavigationEngine({ /* routePolyline, pois, ... */ })
    const states: string[] = []
    engine.on('stateChanged', (s) => states.push(s.state))
    for (const fix of fixes) engine.handleFix(fix) // o l'equivalente ingresso pubblico dell'engine
    expect(states).not.toContain('off_route')
  })
})
```

**Cosa serve prima di scrivere questi test sul serio**: una traccia GPX reale/rappresentativa
da usare come fixture (non generabile da questa sessione), e la conferma pratica che
`NavigationEngine` si istanzi e giri fuori da un browser senza mock aggiuntivi oltre al
location provider già previsto.
