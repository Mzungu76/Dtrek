'use client'
// Dtrek Page Turning Engine — la parte "gesture" (Sezioni 1/3/12/15 della specifica). Corretto dopo
// la prima stesura: la richiesta non voleva un effetto che parte da solo al click con in più una
// zona di presa nascosta ai bordi — voleva che fosse IL DITO a spostare materialmente la pagina,
// agganciato dal primo istante, praticamente ovunque la si tocchi (non solo un bordo stretto e
// difficile da trovare). Il gesto ora parte da qualunque punto del contenuto reale.
//
// Perché questo non intercetta scroll/mappe/gallerie nonostante copra tutta la pagina:
// 1. Non decide nulla al primo tocco — resta "in sospeso" finché il movimento non è chiaramente
//    più orizzontale che verticale (soglia in `CONFIRM_*`): uno scroll verticale del testo lungo
//    non viene mai rubato, il browser lo gestisce nativamente dall'inizio (nessun preventDefault
//    finché non si è confermato un intento orizzontale).
// 2. Il listener sta sul contenitore del contenuto vero (non su un div separato sopra di esso), e
//    usa `e.target` — l'elemento REALE toccato, non un overlay — per riconoscere ed escludere i
//    pochi widget che hanno già un proprio gesto orizzontale (mappe Leaflet, gallerie a
//    scorrimento già marcate `data-hscroll` nel resto dell'app, il grafico altimetrico e il
//    lightbox foto marcati `data-page-turn-ignore`, link/bottoni/controlli di form): per quelli il
//    tocco iniziale viene ignorato del tutto, il loro gesto nativo resta intatto.
import { useCallback, useMemo, useRef } from 'react'
import type { HingeSide } from '@/lib/pageTurn/pageTurnMath'
import { shouldCommitRelease } from '@/lib/pageTurn/pageTurnMath'

export type PageTurnDirection = 'prev' | 'next'

/** Selettori dei widget con un proprio gesto orizzontale/di trascinamento — il tocco che parte
 *  qui non avvia mai uno sfoglio, per non rubare mappa/carosello/grafico/lightbox all'interno
 *  della pagina (Sezione 15). `.leaflet-container` è la classe che Leaflet stesso mette sulla
 *  radice di ogni mappa; `[data-hscroll]` è la stessa convenzione già usata altrove nell'app per
 *  marcare le strisce orizzontali scorrevoli (es. components/guida/widgets/PoiListWidget.tsx). */
const IGNORE_SELECTOR = [
  'a', 'button', 'input', 'textarea', 'select', '[role="button"]', '[role="slider"]',
  '.leaflet-container', '[data-hscroll]', '[data-page-turn-ignore]',
].join(', ')

/** Sotto questa distanza (px) un movimento non è ancora abbastanza deciso da essere letto come
 *  "orizzontale" — resta ambiguo, il browser può ancora vincere con uno scroll verticale. */
const CONFIRM_DISTANCE_PX = 8
/** Rapporto minimo dx/dy oltre cui un movimento ambiguo si conferma orizzontale. */
const CONFIRM_RATIO = 1.3

interface DragState {
  pointerId: number
  startX: number
  startY: number
  containerWidth: number
  lastX: number
  lastT: number
  velocityPxMs: number
  /** `null` finché l'intento orizzontale non è confermato — a quel punto si fissano direzione e
   *  cardine, mai più cambiati per il resto dello stesso gesto. */
  confirmed: { direction: PageTurnDirection; hinge: HingeSide } | null
  /** true se, una volta confermato orizzontale, quella direzione non porta da nessuna parte
   *  (`canGoNext`/`canGoPrev` false) — il gesto resta "catturato" ma non muove nulla, come una
   *  pagina che non si stacca perché non c'è un'altra pagina sotto. */
  rejected: boolean
}

interface UsePageDragOptions {
  containerRef: React.RefObject<HTMLElement>
  /** Disattiva completamente il riconoscimento del gesto — `prefers-reduced-motion` o mentre è già
   *  in corso un'animazione programmatica (click/tastiera), per non sovrapporre due sfogli. */
  disabled: boolean
  canGoPrev: boolean
  canGoNext: boolean
  onDragStart: (direction: PageTurnDirection, hinge: HingeSide) => void
  onDragProgress: (progress: number, hinge: HingeSide) => void
  onDragCommit: (direction: PageTurnDirection, hinge: HingeSide, fromProgress: number) => void
  onDragCancel: (fromProgress: number, hinge: HingeSide) => void
}

/** Cardine "naturale" di un gesto: si afferra il foglio e lo si porta verso il cardine opposto al
 *  verso del trascinamento — si trascina verso sinistra (dx negativo) per andare avanti, cardine a
 *  sinistra; verso destra per tornare indietro, cardine a destra. Indipendente dallo `spineSide`
 *  decorativo della pagina (quello resta solo per l'animazione da click, invariata per continuità
 *  — vedi BookPage.tsx): qui la direzione la decide il dito, non la rilegatura disegnata. */
function directionForDelta(dx: number): { direction: PageTurnDirection; hinge: HingeSide } {
  return dx < 0 ? { direction: 'next', hinge: 'left' } : { direction: 'prev', hinge: 'right' }
}

export function usePageDrag({
  containerRef, disabled, canGoPrev, canGoNext,
  onDragStart, onDragProgress, onDragCommit, onDragCancel,
}: UsePageDragOptions) {
  const dragRef = useRef<DragState | null>(null)

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const target = e.target as HTMLElement | null
    if (target?.closest(IGNORE_SELECTOR)) return
    const container = containerRef.current
    if (!container) return
    const width = container.getBoundingClientRect().width
    if (width <= 0) return

    dragRef.current = {
      pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, containerWidth: width,
      lastX: e.clientX, lastT: e.timeStamp, velocityPxMs: 0, confirmed: null, rejected: false,
    }
    // Niente `setPointerCapture` né `preventDefault` qui: finché l'intento non è confermato
    // orizzontale (vedi handlePointerMove) il browser deve restare libero di scorrere la pagina
    // verticalmente come farebbe senza questo hook — è esattamente il motivo per cui l'area di
    // presa può essere "tutta la pagina" senza rompere lo scroll del testo lungo.
  }, [disabled, containerRef])

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return

    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY

    if (!drag.confirmed) {
      const dist = Math.hypot(dx, dy)
      if (dist < CONFIRM_DISTANCE_PX) return // ancora troppo poco per dire alcunché
      if (Math.abs(dx) < Math.abs(dy) * CONFIRM_RATIO) {
        // Chiaramente più verticale che orizzontale: non è uno sfoglio, è uno scroll — lascialo
        // fare al browser e smetti di seguire questo puntatore per il resto del gesto.
        dragRef.current = null
        return
      }
      const { direction, hinge } = directionForDelta(dx)
      const available = direction === 'next' ? canGoNext : canGoPrev
      drag.confirmed = { direction, hinge }
      drag.rejected = !available
      if (!available) return // catturato ma non c'è una pagina in quella direzione: non si muove
      e.currentTarget.setPointerCapture(e.pointerId)
      onDragStart(direction, hinge)
    }

    if (drag.rejected) return
    e.preventDefault()
    const rawDelta = drag.confirmed.direction === 'next' ? -dx : dx
    const progress = Math.min(1, Math.max(0, rawDelta / drag.containerWidth))

    const dt = e.timeStamp - drag.lastT
    if (dt > 0) drag.velocityPxMs = (e.clientX - drag.lastX) / dt
    drag.lastX = e.clientX
    drag.lastT = e.timeStamp

    onDragProgress(progress, drag.confirmed.hinge)
  }, [canGoNext, canGoPrev, onDragStart, onDragProgress])

  const endDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    dragRef.current = null
    if (!drag.confirmed || drag.rejected) return // mai stato uno sfoglio vero: nulla da chiudere
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* già rilasciato */ }

    const dx = e.clientX - drag.startX
    const rawDelta = drag.confirmed.direction === 'next' ? -dx : dx
    const progress = Math.min(1, Math.max(0, rawDelta / drag.containerWidth))
    const velocity = drag.confirmed.direction === 'next' ? -drag.velocityPxMs : drag.velocityPxMs

    if (shouldCommitRelease(progress, velocity)) {
      onDragCommit(drag.confirmed.direction, drag.confirmed.hinge, progress)
    } else {
      onDragCancel(progress, drag.confirmed.hinge)
    }
  }, [onDragCommit, onDragCancel])

  const handlePointerCancel = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    dragRef.current = null
    if (!drag.confirmed || drag.rejected) return
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* già rilasciato */ }
    // Un `pointercancel` (il sistema si riprende il gesto) non porta con sé una posizione finale
    // affidabile quanto un rilascio normale — si riparte dall'ultima posizione nota invece che da
    // 0, altrimenti il ritorno elastico scatterebbe da un punto sbagliato.
    const rawDelta = drag.confirmed.direction === 'next' ? -(drag.lastX - drag.startX) : (drag.lastX - drag.startX)
    const progress = Math.min(1, Math.max(0, rawDelta / drag.containerWidth))
    onDragCancel(progress, drag.confirmed.hinge)
  }, [onDragCancel])

  return useMemo(() => ({
    dragSurfaceProps: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: endDrag,
      onPointerCancel: handlePointerCancel,
      // `pan-y`, non `none`: il browser resta libero di scorrere verticalmente da subito (nessun
      // ritardo, nessun'attesa su JS) — è la disambiguazione orizzontale qui sopra a decidere se
      // e quando questo gesto diventa "nostro", mai un `touch-action` che blocchi lo scroll a priori.
      style: { touchAction: 'pan-y' as const },
    },
  }), [handlePointerDown, handlePointerMove, endDrag, handlePointerCancel])
}
