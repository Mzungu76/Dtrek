# Siti pubblici del Diario — direzione Taccuino Botanico

⚠️ **Nota (settembre 2026) — scelta deliberata, diversa dallo stile dell'app privata.** L'app
privata è tornata il 10 settembre allo stile pre-taccuino (terra/forest/stone,
`lib/designTokens.ts`, commit `73b2efa`). I mockup di questo piano sono stati fatti due giorni
dopo senza saperlo, e per un momento questo documento è stato marcato come abbandonato per lo
stesso motivo — salvo poi scoprire, chiedendo direttamente, che l'utente vuole comunque questa
direzione per i SOLI siti pubblici (`/leggi/*`), come identità propria e distinta dall'app privata
che li genera: non un errore da correggere, una scelta di prodotto confermata due volte. Non
riportare queste pagine allo stile editoriale di `lib/designTokens.ts` senza una richiesta
esplicita e altrettanto diretta in tal senso.

Seguito di `docs/raccolte-pubblicazione-piano.md`: il modello (Percorso=articolo, Diario=volume,
Raccolta=collana, Profilo=indice) resta quello. Questo piano riguarda solo lo **stile** delle
pagine pubbliche del Diario (`/leggi/d/[token]` e le sue sottopagine) — non tocca Raccolta,
Reportage standalone né alcuna schermata privata dell'app.

Mockup: `docs/mockup-siti-pubblici-diario/` (canvas pubblicato, link nella conversazione che li ha
creati). Direzione scelta: **D**, poi integrata con il conta-pagine di C e due aggiunte
("percorso disegnato a mano", "il taccuino che si apre").

## Cosa è verificato reale e cosa no

- **Verificato, riuso diretto**: `lib/taccuinoTokens.tsx` (`TaccuinoPaperTexture`,
  `TaccuinoSpineShadow`, `HandDrawnFrame`) — file reale, mai montato da nessuna schermata finora.
  `components/diario/DiarioCover.tsx` — la copertina verde/terracotta, in produzione da sempre.
  `components/diario/ProgressChart.tsx` — supporta già `photoMarkers`, usato oggi solo dal libro
  privato (`DiarioReportPage.tsx`), non dal sito pubblico.
- **Non verificato / non esiste**: nessuna pagina pubblica oggi usa la carta del taccuino — il
  sito pubblico resta nello stile editoriale verde/terracotta di `SiteChrome.tsx`. Questo piano è
  la prima implementazione reale di quella direzione, non un porting.

## Fasi

**Fase 1 — Fondamenta condivise** (`app/globals.css`, nuovo `components/leggi/`)
- `@keyframes draw-path` / `@keyframes fade-marker` in `globals.css`, sul modello delle altre
  animazioni già lì (`dtrekArrowPulse`, ecc.).
- `components/leggi/PageProgressPill.tsx` — la pillola fluttuante con etichetta + barra di
  avanzamento, presa dal mockup C e integrata in D.
- Nessuna modifica a `lib/taccuinoTokens.tsx`: si importa così com'è.

**Fase 2 — Sommario pubblico** (`app/leggi/d/[token]/DiaryPublicView.tsx`)
- Sfondo e rilegatura del taccuino al posto dello sfondo `bg-stone-50` attuale.
- Righe con `RouteSketch` esistente (nessuna modifica al componente) dentro una cornice disegnata
  a mano (`HandDrawnFrame`) e con l'animazione "a penna" via la classe CSS di Fase 1.

**Fase 3 — Pagina di un'escursione** (`app/leggi/d/[token]/EntryArticle.tsx`, `e/[n]/page.tsx`)
- Stessa carta. `PageProgressPill` in fondo. Marker delle foto sul grafico del profilo altimetrico
  (passare `photoMarkers` a `ProgressChart`, già supportato — additivo, il resto del componente non
  cambia). Cornice disegnata a mano sulla mappa del percorso.

**Fase 4 — profilo pubblico "scaffale" e apertura** ✅ **COMPLETATA**
- `app/u/[slug]/page.tsx` riscritta: il primo Diario pubblicato in copertina a piena pagina (stessa
  identità scura di `/diario` in app, stesso sfondo topografico di `DiarioCover.tsx`), gli altri
  come dorsi sotto, Raccolte minori, Reportage ridotti a un link in fondo — struttura del mockup D,
  dati disponibili. **Deviazione dal piano**: `fetchPublicProfile` non espone km/dislivello/
  conteggio per Diario, solo titolo/sottotitolo/copertina — recuperarli per ognuno richiederebbe
  una query aggregata nuova; le tessere secondarie mostrano quindi solo il titolo, non le
  statistiche del mockup.
- Apertura come transizione di navigazione: **transizione cross-documento nativa del browser**
  (`@view-transition { navigation: auto; }`, stessa regola dichiarata sia in
  `app/u/[slug]/page.tsx` sia in `DiaryPublicView.tsx`, più un `view-transition-name` condiviso
  sulla copertina) invece della View Transitions API `document.startViewTransition` ipotizzata nel
  piano — quella serve per aggiornamenti nello stesso documento (SPA), qui si naviga davvero da una
  pagina a un'altra. **Zero JavaScript**: dove il browser non supporta la funzione (la maggior
  parte oggi), la regola non ha alcun effetto e la navigazione resta quella di sempre — lo stesso
  miglioramento progressivo richiesto, ottenuto in CSS puro invece che con uno script.

**Fase 5 — coerenza con la Raccolta** ✅ **COMPLETATA**

Segnalato dall'utente dopo la Fase 4: un'escursione dentro un volume di una Raccolta pubblicata
(`/leggi/c/[token]/v/[vi]/e/[n]`) riusa già `EntryArticle.tsx` — quindi mostrava la card in stile
taccuino incorniciata da una `SiteChrome` e uno sfondo rimasti nella vecchia palette editoriale.
Estesa la stessa carta/rilegatura a tutte le pagine della Raccolta:
`app/leggi/c/[token]/SiteChrome.tsx` (testata), `CollectionPublicView.tsx` (frontespizio/indice
volumi), `v/[vi]/page.tsx` (indice di un volume, incluso lo schizzo del percorso al posto del
gradiente per le escursioni senza foto), `v/[vi]/e/[n]/page.tsx` (telaio + `PageProgressPill`
relativa al volume, non all'intera raccolta). `DtrekCallout`/`SiteFooter` erano già coerenti: quel
file li riesporta da `app/leggi/d/[token]/SiteChrome.tsx`, già in taccuino dalla Fase 2.

**Fase 6/7 — bug reale "testo invisibile" nella Raccolta, trovato e corretto** ✅ **COMPLETATA**

Segnalato dall'utente con uno screenshot da una preview Vercel reale: la home della Raccolta
mostrava le card dei volumi senza testo né sfondo, "molto diverso dal mockup approvato". Prima
verifica a schermo mai fatta finora su questa direzione (le fasi precedenti erano state validate
solo con `tsc`/`eslint`, mai con un browser reale) — questa sandbox aveva nel frattempo credenziali
Supabase fittizie e Chromium (Playwright) disponibili, quindi per la prima volta si è potuto
riprodurre il bug con un browser vero invece di leggere solo il codice.

- **Fase 6 (diagnosi parziale)**: bisezionato a mano disattivando pezzi della pagina, isolata la
  grana verticale di `TaccuinoPaperTexture` (tre `repeating-linear-gradient` a passo fine) come
  causa. Rimossa. Verificata su `CollectionPublicView` con uno screenshot: il testo tornava
  visibile. Sembrava risolto.
- **Fase 7 (diagnosi vera)**: verificando anche `DiaryPublicView` (stessa `TaccuinoPaperTexture`,
  già "corretta"), lo stesso sintomo si è ripresentato nella sezione Numeri — con la grana già
  rimossa. Bisezione ripetuta con uno screenshot dell'elemento isolato (non dell'intera pagina, per
  escludere artefatti di stitching): il colpevole non erano i gradienti ma il componente stesso,
  un `<div>` `fixed inset-0 -z-10`. Anche ridotto a un `<div>` con solo `backgroundColor` piatto
  (niente vignettatura, niente nuvolato) continuava a corrompere il rendering di testo/sfondi
  altrove nel DOM; `absolute` invece di `fixed` e la rimozione dello `z-index` negativo non
  cambiavano nulla. La Fase 6 aveva quindi diagnosticato correttamente il sintomo su un caso ma
  sbagliato la causa: non è il pattern disegnato sopra, è l'esistenza stessa di un elemento
  `fixed`/`absolute inset-0` separato che ricopre la pagina — la stessa classe di bug isolata a
  suo tempo in Fase 24 (lì un `<svg>`), qui riprodotta senza SVG e senza alcun pattern ripetuto.
- **Fix**: `TaccuinoPaperTexture` (componente) → `taccuinoPaperBackgroundStyle()` (funzione che
  restituisce uno `style`), da spargere sul contenitore radice che ogni pagina ha già, non più su
  un elemento a parte. `background-attachment: fixed` riproduce la stessa resa visiva
  ("atmosfera" ancorata al viewport) di `position: fixed`, verificato che non riproduce il bug.
  Aggiornati tutti i chiamanti reali: `DiaryPublicView.tsx`, `CollectionPublicView.tsx`,
  `e/[n]/page.tsx` (Diario e Raccolta), `v/[vi]/page.tsx`. `TaccuinoSpineShadow` non è coinvolta
  (è larga solo 34px, non ricopre la pagina) e resta un componente separato invariato.
  `TaccuinoRuledLines`, non ancora montata da nessuna pagina reale, resta con lo stesso rischio
  (usa `absolute inset-0`) — annotato nel suo commento per una verifica dedicata al primo uso vero.
- **Bug indipendente trovato durante la verifica**: `/u/[slug]` (profilo pubblico, Fase 4) non era
  nell'allowlist di `lib/publicPaths.ts` — un visitatore anonimo veniva rimandato al login,
  rendendo l'intera Fase 4 di fatto irraggiungibile. Aggiunto `/u/` a `isPublicPath` e
  `isSharedContentPath`.

**Fase 8 — fedeltà al mockup: copertina a piena pagina e righe compatte del Sommario** ✅ **COMPLETATA**

Segnalato dall'utente su screenshot reali (home e volume di una Raccolta pubblicata): risolto il
bug della Fase 6/7, lo sfondo tornava a leggersi come piatto e generico — "non ha nulla a che fare
col mockup" — perché la copertina restava una piccola card in cima alla pagina (mai a piena
pagina come in `D_Apertura.dc.html`) e le righe dell'indice erano grandi card 16:9 (mai le righe
compatte con icona di `D_Sommario.dc.html`). Riportato fedele al mockup approvato:

- **Grana della carta, reintrodotta**: la Fase 6 l'aveva rimossa sospettandola causa del bug; la
  Fase 7 ha isolato la causa reale altrove (l'elemento `fixed`/`absolute inset-0` separato, non il
  pattern disegnato sopra). Verificato con un browser reale che la grana, come `background-image`
  del contenitore radice invece che di un elemento a parte, non riproduce alcun bug — reintrodotta
  in `taccuinoPaperBackgroundStyle()` con gli stessi valori del mockup.
- **Font "a mano" (Caveat), collegato per la prima volta**: `FONT_HAND`/`INK_ABSORB_STYLE`
  esistevano in `lib/taccuinoTokens.tsx` da tempo ma la variabile CSS `--font-caveat` che
  dichiarano non era mai stata dichiarata in `app/layout.tsx` — un altro caso, come la carta
  stessa, di token scritti prima di essere davvero montati da qualcosa. Aggiunto `Caveat` da
  `next/font/google` in `app/layout.tsx` e la classe `.font-hand` in `app/globals.css`, sullo
  stesso schema di `.font-barlow`/`.font-lora`.
- **Copertina a piena pagina che "si apre"**: il mockup (`D_Apertura.dc.html`) usa un vero overlay
  (`position:absolute`/`fixed` a piena pagina, cerniera 3D via `rotateY`) — esattamente il pattern
  che la Fase 7 ha isolato come causa del bug "testo invisibile". Riprodurlo identico avrebbe
  rischiato di reintrodurlo sulle sezioni sotto (Numeri, indice). Sostituito con una tecnica
  equivalente ma sicura: la copertina resta nel **flusso normale** del documento (mai un secondo
  layer che ricopre la pagina) e si "apre" collassando la propria altezza (`max-height`) a zero con
  una dissolvenza, invece di ruotare via da sopra un Sommario già montato sotto. Stesso effetto
  percepito (si tocca, la copertina sparisce, sotto c'è il Sommario), interazione pura CSS
  (checkbox nascosto + `peer-checked:` di Tailwind, **zero JavaScript** spedito al browser — resta
  un componente SERVER), verificata sicura con lo stesso metodo (screenshot di un browser reale,
  prima e dopo il "tocco"). Applicata a `DiaryPublicView.tsx` e — un volume di una Raccolta è
  concettualmente un Diario — al volume di una Raccolta, spostato dal suo `page.tsx` in un nuovo
  `VolumeView.tsx` (Next.js rifiuta in build un file `page.tsx` con export diversi da quelli che
  riconosce).
- **Righe compatte con icona, al posto delle card 16:9**: `RouteSketch.tsx` ha ora `width`/
  `height`/`showMarkers` opzionali (default invariati per i chiamanti esistenti) per renderizzare
  la stessa proiezione lat/lon in un riquadro piccolo e quadrato invece di duplicarne la
  matematica altrove. Riga: icona 60×60 (foto di copertina se c'è, altrimenti lo schizzo animato,
  sempre dentro una `HandDrawnFrame`), titolo, statistiche — niente più il "punteggio" del mockup
  (un dato inventato, senza equivalente reale in `PublicDiaryEntry`) né la barra di ricerca/filtri
  (avrebbe richiesto JavaScript lato client per essere reale, non solo decorativa).

## Verifica

`tsc --noEmit`, `eslint` e `next build` puliti; 416/416 test esistenti (`vitest run`) ancora
verdi — nessun test automatico nuovo, le fasi di questo piano restano presentazione, non logica
pura da testare. **Fase 6/7/8**: prima verifica a schermo reale di questa direzione, con Chromium
via Playwright (anche in emulazione mobile, `devices['Pixel 5']`, per lo stesso schermo segnalato
dall'utente) — pagine reali (`DiaryPublicView`, `CollectionPublicView`, `VolumeView`) montate con
dati finti su rotte temporanee sotto `/leggi/` (cancellate a verifica conclusa), screenshot
dell'intera pagina e di singoli elementi per bisezionare ed escludere artefatti di stitching, e
dell'interazione copertina→Sommario prima e dopo un click programmatico sulla copertina.
