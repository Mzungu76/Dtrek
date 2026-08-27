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
 * Texture di sfondo del taccuino — carta invecchiata (due macchie sfumate) + linee di livello
 * disegnate a mano, tutta la pagina, dietro al contenuto. Verificata nel mockup
 * (`taccuino-canvas/SommarioTaccuino.dc.html`/`Main.dc.html`, non nel repo) — prima di questo
 * componente il tema "taccuino" di `BookPage.tsx` usava solo due `radial-gradient` CSS piatti al
 * posto di questa texture, un'approssimazione troppo debole: da lì l'utente ha segnalato che il
 * risultato a schermo non assomigliava al mockup.
 *
 * `fixed` (non `absolute`) come `BookSpineShadow`: il guscio di `BookPage.tsx` non è
 * `position:relative`, `fixed` evita di doverlo aggiungere e con `preserveAspectRatio="xMidYMid
 * slice"` copre il viewport a qualunque altezza di contenuto senza deformare le curve. Z-index
 * negativo esplicito: un elemento `fixed` senza z-index dipinge comunque sopra il contenuto in
 * flusso normale (regola CSS nota) — va sotto per restare uno sfondo.
 *
 * `flip` inverte la posizione delle due macchie (in alto-a-sinistra/basso-a-destra o viceversa) —
 * per quando pagine adiacenti del libro (sinistra/destra sfogliando) avranno ciascuna la propria
 * istanza: non identiche a specchio l'una dell'altra sarebbe stato più piatto.
 */
export function TaccuinoPaperTexture({ flip = false }: { flip?: boolean }) {
  const filterId = useHandWobbleId()
  const stain1 = flip ? { cx: 85, cy: 8 } : { cx: 20, cy: 10 }
  const stain2 = flip ? { cx: 10, cy: 85 } : { cx: 90, cy: 70 }
  return (
    <svg
      aria-hidden="true"
      className="fixed inset-0 -z-10 pointer-events-none"
      width="100%" height="100%"
      viewBox="0 0 390 844"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <HandWobbleFilter id={filterId} seed={flip ? 11 : 7} baseFrequency={0.018} scale={4} />
        <radialGradient id={`${filterId}-s1`} cx={`${stain1.cx}%`} cy={`${stain1.cy}%`} r="42%">
          <stop offset="0%" stopColor={TACCUINO_PAPER.stain1} stopOpacity={0.5} />
          <stop offset="100%" stopColor={TACCUINO_PAPER.stain1} stopOpacity={0} />
        </radialGradient>
        <radialGradient id={`${filterId}-s2`} cx={`${stain2.cx}%`} cy={`${stain2.cy}%`} r="40%">
          <stop offset="0%" stopColor={TACCUINO_PAPER.stain2} stopOpacity={0.48} />
          <stop offset="100%" stopColor={TACCUINO_PAPER.stain2} stopOpacity={0} />
        </radialGradient>
      </defs>
      <rect width="390" height="844" fill={TACCUINO_PAPER.base} />
      <rect width="390" height="844" fill={`url(#${filterId}-s1)`} />
      <rect width="390" height="844" fill={`url(#${filterId}-s2)`} />
      <g filter={`url(#${filterId})`} fill="none" stroke={TACCUINO_PAPER.contourLine} strokeWidth={1} opacity={0.32}>
        <path d="M-20 120 Q80 90 180 130 T420 100" />
        <path d="M-20 180 Q90 150 190 190 T420 165" />
        <path d="M-20 700 Q100 670 210 705 T420 680" />
        <path d="M-20 750 Q100 725 220 755 T420 735" />
      </g>
    </svg>
  )
}

/**
 * "Piega" del taccuino — come `BookSpineShadow` (bordo curvato invece di un gradiente lineare
 * statico) ma disegnata a mano con lo stesso filtro tremore, un lato a scelta: sinistro per una
 * pagina raggiunta "sfogliando in avanti", destro per una "all'indietro" (stessa idea del mockup,
 * pagine alternate). Per ora ogni pagina taccuino usa `side="left"`; l'alternanza vera arriverà
 * insieme al routing multi-pagina che la giustifica.
 */
export function TaccuinoSpineShadow({ side = 'left' }: { side?: 'left' | 'right' }) {
  const filterId = useHandWobbleId()
  const width = side === 'left' ? 22 : 26
  const d = side === 'left'
    ? 'M0 0 Q18 70 10 170 Q2 270 16 390 Q26 470 8 570 Q-4 670 14 750 Q22 800 0 844'
    : 'M26 0 Q6 60 14 160 Q22 260 8 380 Q-4 460 12 560 Q24 660 6 740 Q-2 800 26 844'
  return (
    <svg
      aria-hidden="true"
      className={`fixed inset-y-0 z-40 pointer-events-none ${side === 'left' ? 'left-0' : 'right-0'}`}
      width={width} height="100%"
      viewBox={`0 0 ${width} 844`}
      preserveAspectRatio="none"
    >
      <defs>
        <HandWobbleFilter id={filterId} seed={side === 'left' ? 11 : 7} baseFrequency={0.018} scale={4} />
      </defs>
      <path d={d} fill="none" stroke="rgba(0,0,0,0.13)" strokeWidth={side === 'left' ? 9 : 10} filter={`url(#${filterId})`} />
    </svg>
  )
}
