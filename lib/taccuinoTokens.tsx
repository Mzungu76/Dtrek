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

export function HandWobbleFilter({ id, seed = 5 }: { id: string; seed?: number }) {
  return (
    <filter id={id}>
      <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves={2} seed={seed} result="n" />
      <feDisplacementMap in="SourceGraphic" in2="n" scale={3.5} />
    </filter>
  )
}
