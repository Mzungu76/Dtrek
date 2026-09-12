# Siti pubblici del Diario — direzione Taccuino Botanico

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

## Verifica

`tsc --noEmit` ed `eslint` puliti; nessun test automatico nuovo (le fasi sopra sono presentazione,
non logica pura da testare). Nessuna verifica a schermo possibile in questo ambiente (stesso
limite di sempre — nessuna credenziale Supabase nella sandbox).
