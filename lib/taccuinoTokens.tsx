// Fonte unica di verità per la direzione "taccuino topografico" — variante approvata dall'utente
// dopo il mockup (docs/diario-a-libro-piano.md, Fase 17) per succedere gradualmente alla
// pergamena calda di components/libro/BookPage.tsx. Non sostituisce nulla da sola: è il file che
// ogni pagina o componente riscritto in questo stile importerà, un pezzo alla volta, invece di
// ridefinire gli stessi valori localmente come è successo per la pergamena (vedi il commento in
// cima a BookPage.tsx) — questa volta la palette nasce già centralizzata.
//
// Separato da lib/designTokens.ts (non aggiunto lì) perché quel file serve l'intera app, oggi
// ancora nella sua estetica corrente — mescolarci una direzione non ancora applicata da nessuna
// parte lo confonderebbe. Quando il taccuino avrà preso il posto della pergamena ovunque, questi
// token potranno confluire lì.
//
// Il font a mano è self-hosted da next/font (app/layout.tsx, variabile --font-caveat) con lo
// stesso meccanismo degli altri — mai scrivere il nome letterale del font in un fontFamily al di
// fuori di qui, si comporterebbe come un font non caricato (stesso principio spiegato in
// designTokens.ts per gli altri font del brand). Caveat sostituisce Kalam, provato per primo in
// Fase 17 (git history) — stesso ruolo, tratto diverso, ancora in valutazione.
import { useId } from 'react'
import { TERRA } from './designTokens'

export const FONT_VAR_HAND = '--font-caveat'
/** Titoli e annotazioni scritte a mano — corpo del testo resta su FONT.lora (designTokens.ts):
 *  professionalità e precisione del contenuto, non tutto scritto a mano allo stesso modo. */
export const FONT_HAND = `var(${FONT_VAR_HAND}), cursive`

/** Carta — Fase 31, palette esatta fornita dall'utente per il "Travel Journal" contemporaneo
 *  (non più la pergamena calda approssimata a mano di Fase 17-30): sfondo tenue, quasi nessuna
 *  variazione percepibile, mai una "macchia" visibile come tale — la texture vera vive in
 *  `TaccuinoPaperTexture` come rumore quasi impercettibile, non come due chiazze scure. */
export const TACCUINO_PAPER = {
  base:   '#F2E8D2',
  /** Variante più chiara — zone "in luce" (piega, evidenziature leggere), mai lo sfondo pagina. */
  light:  '#F6EEDC',
  /** Sfondo di una "card incollata" — mappe, ricerca — leggermente più scuro della pagina stessa. */
  card:       '#E9DDBF',
  cardBorder: '#D8C7A3',
  /** Linee di livello disegnate a mano sullo sfondo pagina, molto tenui. */
  contourLine: '#987C5B',
  /** Evidenziatore — striscia calda dietro una riga "importante" (es. un percorso con un
   *  Reportage), sempre con un'opacità in coda (`${highlight}66` ecc.), mai a piena tinta: deve
   *  restare una pennellata di evidenziatore su carta, non un riquadro colorato. */
  highlight: '#E9DDBF',
} as const

/** Toni di inchiostro — il testo "stampato" (narrativo, professionale) e quello scritto a mano
 *  (titoli, etichette, annotazioni) sono volutamente due toni diversi, come in un vero taccuino
 *  dove il contenuto di base è preciso e le note a margine sono personali. `typed` non è mai nero
 *  puro (Fase 31, richiesta esplicita): un quasi-nero caldo resta coerente con la carta invece di
 *  "bucarla" con un contrasto da schermo. */
export const TACCUINO_INK = {
  typed:     '#29231E',
  hand:      '#806746',
  handMuted: '#987C5B',
  mapSepia:   '#3d2b1f',
  mapContour: '#C8B99F',
} as const

/** Accento funzionale (stati attivi, CTA) — la stessa scala terra del brand, non un colore nuovo:
 *  il taccuino è una nuova ambientazione per l'app esistente, non un brand a sé. */
export const TACCUINO_ACCENT = TERRA

/**
 * Filtro SVG che dà un tratto "disegnato a mano" (leggero tremore organico) a un path/forma —
 * mai su testo o su icone piccole (sotto i ~24px il tremore le rende irriconoscibili invece che
 * "artigianali", verificato nel mockup): mappe, bordi di pagina, separatori, forme grandi.
 *
 * Va montato UNA VOLTA per pagina (dentro il primo `<svg>` che lo usa) e referenziato da
 * qualunque altro elemento con `filter="url(#ID)"`, `ID` = l'`id` restituito da `useHandWobbleId`
 * — mai un id fisso: due istanze sulla stessa pagina (es. una mappa nel Sommario e una nella
 * pagina del Percorso, se mai finissero nello stesso DOM) si scontrerebbero.
 *
 * ⚠️ Fase 23→24 — la Fase 23 aveva tolto questo filtro da `TaccuinoPaperTexture` sospettandolo
 * causa di un bug (testo invisibile nelle righe del Sommario), senza risolvere: isolato meglio in
 * Fase 24, la causa reale non era il filtro ma qualunque `<svg>` **che ricopre la pagina**
 * (`fixed`/`absolute` a piena area), con o senza questo filtro, con o senza z-index —
 * `TaccuinoPaperTexture` è stata riscritta senza SVG (sfondo CSS puro). Questo filtro resta quindi
 * sicuro dove l'avevo già descritto: una forma piccola/contenuta nel proprio riquadro (una mappa
 * in miniatura, un bordo locale) — non su un `<svg>` che ricopre l'intera pagina, a prescindere
 * dal filtro.
 */
export function useHandWobbleId(): string {
  return `hand-wobble-${useId()}`
}

export function HandWobbleFilter({ id, seed = 5, baseFrequency = 0.02, scale = 3.5 }: {
  id: string; seed?: number; baseFrequency?: number; scale?: number
}) {
  return (
    <filter id={id}>
      <feTurbulence type="fractalNoise" baseFrequency={baseFrequency} numOctaves={2} seed={seed} result="n" />
      <feDisplacementMap in="SourceGraphic" in2="n" scale={scale} />
    </filter>
  )
}

/**
 * Bordo "disegnato a mano" — un `<rect>` con lieve tremore organico (`HandWobbleFilter`), pensato
 * per sostituire un `border` CSS piatto su miniature, pulsanti e pillole (Fase 27, richiesto
 * dall'utente col mockup alla mano: "contorni... leggermente allungati come se fossero cerchiati a
 * mano"). Sicuro rispetto al bug delle Fasi 23-24: è un `<svg>` **assoluto dentro il proprio
 * elemento** (`position: relative` sul chiamante), mai `fixed`/`absolute` a piena pagina — la
 * classe di bug isolata allora riguardava solo un `<svg>` che *ricopre la pagina*, non una forma
 * piccola contenuta nel proprio riquadro (esattamente il caso d'uso per cui `HandWobbleFilter` era
 * già documentato sicuro).
 *
 * `viewBox="0 0 100 100"` con `preserveAspectRatio="none"` fa scalare il rettangolo alle
 * dimensioni reali dell'elemento (anche non quadrato) senza calcoli manuali — `vectorEffect=
 * "non-scaling-stroke"` (stesso trucco di `components/RouteThumb.tsx`) mantiene lo spessore del
 * tratto in pixel reali invece di deformarsi con lo stretch. Un `rx` alto (es. 50) su un
 * rettangolo largo produce automaticamente una pillola — la leggera ellitticità che ne risulta
 * sugli angoli (raggio non uniforme quando il riquadro non è quadrato) è parte del look "non
 * perfettamente geometrico", non un difetto da correggere.
 */
export function HandDrawnFrame({
  stroke, strokeWidth = 1.5, rx = 4, dashed = false, seed = 5, className = '',
}: { stroke: string; strokeWidth?: number; rx?: number; dashed?: boolean; seed?: number; className?: string }) {
  const filterId = useHandWobbleId()
  return (
    <svg
      aria-hidden="true"
      className={`absolute inset-0 w-full h-full pointer-events-none ${className}`}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      <defs><HandWobbleFilter id={filterId} seed={seed} baseFrequency={0.06} scale={1.6} /></defs>
      <rect
        x="2" y="2" width="96" height="96" rx={rx}
        fill="none" stroke={stroke} strokeWidth={strokeWidth}
        strokeDasharray={dashed ? '3 2.5' : undefined}
        filter={`url(#${filterId})`}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

/**
 * Rumore di carta quasi impercettibile — un `<rect>` di `feTurbulence` codificato come immagine
 * (mai un `<svg>` vivo nel DOM, per la classe di bug isolata in Fase 24: qui è un
 * `background-image` — una risorsa immagine rasterizzata per il browser, non un nodo SVG
 * interattivo) — piastrellato a bassa opacità dentro `TaccuinoPaperTexture`. Costruito una volta
 * sola a import-time (stringa statica), non ricalcolato a ogni render.
 */
const PAPER_NOISE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="140">`
  + `<filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch"/>`
  + `<feColorMatrix type="matrix" values="0 0 0 0 0.30  0 0 0 0 0.24  0 0 0 0 0.16  0 0 0 0.05 0"/></filter>`
  + `<rect width="100%" height="100%" filter="url(#n)"/></svg>`
// encodeURIComponent, non un'escaping a mano di # e % soltanto — gestisce anche spazi e virgolette
// senza doversi fidare che ogni browser le accetti non codificate in un data URI.
const PAPER_NOISE_URL = `data:image/svg+xml,${encodeURIComponent(PAPER_NOISE_SVG)}`

/**
 * Texture di sfondo del taccuino — tutta la pagina, dietro al contenuto. Fase 31: riscritta da
 * capo su richiesta esplicita ("l'utente deve percepire carta senza vedere chiaramente una
 * texture") — le due macchie sfumate delle fasi precedenti (Fase 17-30) erano visibili come tali,
 * l'opposto di "leggerissima variazione di tonalità". Sostituite da: (1) il colore piatto di base,
 * (2) UNA sola sfumatura di luce, ampia e a opacità bassissima, non due macchie riconoscibili, (3)
 * il rumore di `PAPER_NOISE_URL` piastrellato sopra, anch'esso a opacità bassissima.
 *
 * Fase 24 — **causa reale, finalmente isolata**, del bug "titolo/statistiche invisibili" nelle
 * righe del Sommario: qualunque `<svg>` **vivo che ricopre la pagina** (fisso o assoluto, con o
 * senza filtro, con o senza z-index) corrompeva il rendering del testo altrove nel DOM — mai
 * l'SVG in sé, sempre la sovrapposizione. Questo componente resta quindi un `<div>` con sfondo
 * CSS puro (colore + gradiente + `background-image`), mai un elemento SVG nel DOM.
 *
 * `flip` inverte il lato della sfumatura di luce (per pagine adiacenti del libro, sinistra/destra
 * sfogliando) — non identiche a specchio l'una dell'altra sarebbe stato più piatto.
 */
export function TaccuinoPaperTexture({ flip = false }: { flip?: boolean }) {
  const lightPos = flip ? '80% 15%' : '15% 10%'
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 -z-10 pointer-events-none"
      style={{
        backgroundColor: TACCUINO_PAPER.base,
        backgroundImage: `radial-gradient(ellipse 70% 55% at ${lightPos}, ${TACCUINO_PAPER.light}, transparent 60%), url("${PAPER_NOISE_URL}")`,
        backgroundSize: 'auto, 140px 140px',
        backgroundRepeat: 'no-repeat, repeat',
      }}
    />
  )
}

/**
 * Rilegatura — l'ombra e la piega fisiche al centro pagina, un lato a scelta: sinistro per una
 * pagina raggiunta "sfogliando in avanti", destro per una "all'indietro" (stessa idea del mockup,
 * pagine alternate). Per ora ogni pagina taccuino usa `side="left"`; l'alternanza vera arriverà
 * insieme al routing multi-pagina che la giustifica.
 *
 * Fase 31 — riscritta da capo su specifica dettagliata dell'utente: non più una singola sfumatura
 * nera uniforme dall'alto al basso (Fase 29), ma una composizione a più livelli che simula la
 * rilegatura fisica — (1) ombra interna, (2) linea di piega sottile, (3) piccola zona di luce
 * appena oltre, (4) ombra esterna molto più morbida, tutte in un marrone caldo TRASPARENTE
 * (`TACCUINO_INK.hand`/`TACCUINO_PAPER.light`, mai nero) — e più intensa al centro verticale della
 * pagina, non uniforme dall'alto al basso: un `mask-image` verticale (sfuma a `transparent` in
 * cima e in fondo) applicato sopra i gradienti orizzontali che compongono i livelli, invece di
 * ricalcolare quei gradienti per l'altezza — le due dimensioni restano indipendenti. Niente
 * `<svg>` (mai stata la causa del bug isolato in Fase 24, ma qui basta il CSS): un solo `<div>`,
 * `background` per i livelli orizzontali, `mask-image`/`-webkit-mask-image` per la sagoma
 * verticale. Niente anelli o punti di cucitura (discussi e scartati: "se risultano troppo
 * decorativi, eliminarli" — con la sola ombra già chiaramente una rilegatura, aggiungerli sarebbe
 * stata decorazione sopra un effetto già leggibile).
 *
 * Fase 35 — rinforzata su richiesta esplicita dell'utente dopo un confronto prima/dopo: più
 * larga (26→34px) e più scura ai due estremi (`shadowIn`/`shadowOut` quasi raddoppiati), a leggersi
 * chiaramente come rilegatura invece di un'ombra appena accennata. Il `side` (già presente,
 * Fase 21) ora viene anche alternato da chi chiama `BookPage` — vedi `spineSide` lì — per
 * simulare pagine recto/verso di un libro vero sfogliandolo tra Guida/Resoconto; il Sommario
 * resta fisso a sinistra (non passa mai `spineSide`, resta sul default).
 *
 * Fase 36 — tolta la "piccola zona di luce" (`light`, un caldo quasi-bianco): segnalata
 * esplicitamente come "riflesso bianco" indesiderato. La composizione resta comunque a più
 * livelli (ombra interna → piega → ombra esterna più morbida), solo senza lo schiarimento.
 */
export function TaccuinoSpineShadow({ side = 'left' }: { side?: 'left' | 'right' }) {
  const width = 34
  const shadowIn = 'rgba(41,35,30,0.48)'   // ombra interna, marrone-nero caldo (TACCUINO_INK.typed)
  const crease   = 'rgba(128,103,70,0.36)' // linea di piega (TACCUINO_INK.hand)
  const shadowOut = 'rgba(41,35,30,0.17)'  // ombra esterna, più morbida ma non più quasi invisibile
  const stopsLTR = [
    `${shadowIn} 0%`, `${shadowIn} 7%`, `${crease} 15%`, `${shadowOut} 30%`, 'transparent 60%',
  ].join(', ')
  const stopsRTL = [
    `${shadowIn} 100%`, `${shadowIn} 93%`, `${crease} 85%`, `${shadowOut} 70%`, 'transparent 40%',
  ].join(', ')
  const verticalMask = 'linear-gradient(to bottom, transparent 0%, black 18%, black 82%, transparent 100%)'
  return (
    <div
      aria-hidden="true"
      className={`fixed inset-y-0 z-40 pointer-events-none ${side === 'left' ? 'left-0' : 'right-0'}`}
      style={{
        width,
        background: `linear-gradient(to right, ${side === 'left' ? stopsLTR : stopsRTL})`,
        WebkitMaskImage: verticalMask,
        maskImage: verticalMask,
      }}
    />
  )
}
