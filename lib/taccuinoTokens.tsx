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

/** Carta invecchiata — sfondo pagina e le due macchie/ombreggiature che le danno profondità. */
export const TACCUINO_PAPER = {
  base:    '#f2e8d5',
  stain1:  '#e2d2a8',
  stain2:  '#d9c79a',
  /** Sfondo di una "card incollata" — mappe, foto — leggermente più scuro della pagina stessa. */
  card:       '#e9dcb8',
  cardBorder: '#c9b78c',
  /** Linee di livello disegnate a mano sullo sfondo pagina, molto tenui. */
  contourLine: '#b09a6e',
  /** Evidenziatore — striscia calda dietro una riga "importante" (es. un percorso con un
   *  Reportage), sempre con un'opacità in coda (`${highlight}66` ecc.), mai a piena tinta: deve
   *  restare una pennellata di evidenziatore su carta, non un riquadro colorato. */
  highlight: '#e9d4ae',
} as const

/** Toni di inchiostro — il testo "stampato" (narrativo, professionale) e quello scritto a mano
 *  (titoli, etichette, annotazioni) sono volutamente due toni diversi, come in un vero taccuino
 *  dove il contenuto di base è preciso e le note a margine sono personali. */
export const TACCUINO_INK = {
  typed:     '#2c2420',
  hand:      '#4a3728',
  handMuted: '#8a6a4a',
  mapSepia:   '#3d2b1f',
  mapContour: '#a68a5c',
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
 * Texture di sfondo del taccuino — carta invecchiata (due macchie sfumate), tutta la pagina,
 * dietro al contenuto. Verificata nel mockup (`taccuino-canvas/SommarioTaccuino.dc.html`/
 * `Main.dc.html`, non nel repo).
 *
 * Fase 24 — **causa reale, finalmente isolata**, del bug "titolo/statistiche invisibili" nelle
 * righe del Sommario (segnalato di nuovo dopo la Fase 23, che aveva tolto solo il filtro
 * `HandWobbleFilter` da qui senza risolvere). Isolato con una A/B/C sulla STESSA pagina (non due
 * caricamenti separati, per escludere qualunque differenza di timing/ambiente): con
 * `TaccuinoPaperTexture` montato, il testo delle colonne vicine spariva — comprese etichette
 * semplici, senza font/colori taccuino — mentre immagini e icone nelle stesse righe restavano
 * visibili; `TaccuinoSpineShadow` montato da solo, nessun problema. Confermato NON essere lo
 * z-index (negativo, zero, o assente — stesso risultato), non `position:fixed` in sé
 * (`position:absolute` stesso risultato) — è specificamente **un elemento `<svg>` live che
 * ricopre la pagina** (fisso o assoluto, con o senza filtro, con o senza z-index) a corrompere il
 * rendering del testo altrove nel DOM. Lo stesso identico contenuto come `<svg>` statico (in
 * flusso normale, non sovrapposto) non causa nulla — conferma che il problema è la
 * SOVRAPPOSIZIONE via SVG, non l'SVG in sé.
 *
 * Corretto sostituendo l'SVG con un `<div>` e uno sfondo **CSS puro** (`radial-gradient`,
 * nessun elemento SVG) — stesso principio già provato altrove nell'app (es. l'utility Tailwind
 * `bg-topography`, un'immagine di sfondo invece di un SVG vivo nel DOM). Le linee di livello
 * disegnate (i quattro tracciati organici) sono state tolte in questo passaggio, non riportate
 * come immagine di sfondo: prima la stabilità del testo, l'abbellimento può tornare in un
 * secondo momento con un `background-image` (mai un altro `<svg>` overlay).
 *
 * `flip` inverte la posizione delle due macchie (in alto-a-sinistra/basso-a-destra o viceversa) —
 * per quando pagine adiacenti del libro (sinistra/destra sfogliando) avranno ciascuna la propria
 * istanza: non identiche a specchio l'una dell'altra sarebbe stato più piatto.
 */
export function TaccuinoPaperTexture({ flip = false }: { flip?: boolean }) {
  const stain1Pos = flip ? '85% 8%' : '20% 10%'
  const stain2Pos = flip ? '10% 85%' : '90% 70%'
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 -z-10 pointer-events-none"
      style={{
        background: `radial-gradient(ellipse at ${stain1Pos}, ${TACCUINO_PAPER.stain1} 0%, transparent 45%),`
          + `radial-gradient(ellipse at ${stain2Pos}, ${TACCUINO_PAPER.stain2} 0%, transparent 50%),`
          + TACCUINO_PAPER.base,
      }}
    />
  )
}

/**
 * "Piega" del taccuino — come `BookSpineShadow` (bordo curvato invece di un gradiente lineare
 * statico) ma disegnata a mano con lo stesso filtro tremore, un lato a scelta: sinistro per una
 * pagina raggiunta "sfogliando in avanti", destro per una "all'indietro" (stessa idea del mockup,
 * pagine alternate). Per ora ogni pagina taccuino usa `side="left"`; l'alternanza vera arriverà
 * insieme al routing multi-pagina che la giustifica.
 *
 * Fase 27 — striscia allargata e sfumata invece della sola linea sottile: un `<div>` con
 * `background: linear-gradient(...)` (CSS puro, dietro) dà la caduta morbida d'ombra verso il
 * centro pagina vista nel mockup, la linea organica sopra (ora di nuovo col `HandWobbleFilter` —
 * verificato sicuro in Fase 24, questa striscia stretta non è mai stata la causa del bug) resta il
 * dettaglio "disegnato a matita" della piega vera e propria, non più l'unica fonte d'ombra.
 */
export function TaccuinoSpineShadow({ side = 'left' }: { side?: 'left' | 'right' }) {
  const width = side === 'left' ? 34 : 38
  const d = side === 'left'
    ? 'M0 0 Q18 70 10 170 Q2 270 16 390 Q26 470 8 570 Q-4 670 14 750 Q22 800 0 844'
    : 'M26 0 Q6 60 14 160 Q22 260 8 380 Q-4 460 12 560 Q24 660 6 740 Q-2 800 26 844'
  const filterId = useHandWobbleId()
  return (
    <div
      aria-hidden="true"
      className={`fixed inset-y-0 z-40 pointer-events-none ${side === 'left' ? 'left-0' : 'right-0'}`}
      style={{ width }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: side === 'left'
            ? 'linear-gradient(to right, rgba(0,0,0,0.16) 0%, rgba(0,0,0,0.05) 55%, transparent 100%)'
            : 'linear-gradient(to left, rgba(0,0,0,0.16) 0%, rgba(0,0,0,0.05) 55%, transparent 100%)',
        }}
      />
      <svg width={width} height="100%" viewBox={`0 0 ${width - 12} 844`} preserveAspectRatio="none" className="absolute inset-0">
        <defs><HandWobbleFilter id={filterId} seed={3} baseFrequency={0.015} scale={3} /></defs>
        <path d={d} fill="none" stroke="rgba(0,0,0,0.15)" strokeWidth={side === 'left' ? 9 : 10} filter={`url(#${filterId})`} />
      </svg>
    </div>
  )
}
