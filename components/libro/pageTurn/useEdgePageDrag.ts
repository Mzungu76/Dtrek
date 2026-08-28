'use client'
// Dtrek Page Turning Engine — solo la parte "gesture" (Sezione 3/12/15 della specifica): riconosce
// un trascinamento che parte dal bordo libero della pagina, lo trasforma in un `flipProgress`
// 0→1 dal vivo, e decide al rilascio se completare lo sfoglio o tornare indietro. Non sa nulla di
// CSS, di React state del motore, né di navigazione — riceve tre callback e le chiama, tutta la
// fisica del movimento vive in `lib/pageTurn/pageTurnMath.ts`.
//
// Zona di presa volutamente stretta (Sezione 15, "evitare che il drag della pagina venga
// interpretato dalla mappa"): il gesto parte SOLO da una striscia sottile ai bordi sinistro/destro
// dell'area contenuto — ovunque altro sulla pagina (mappa, gallerie a scorrimento, grafico
// altimetrico) continua a ricevere i propri gesti nativi indisturbato, perché non c'è nessun
// listener nostro lì sopra.
import { useCallback, useMemo, useRef } from 'react'
import type { HingeSide } from '@/lib/pageTurn/pageTurnMath'
import { EDGE_GRAB_PX, shouldCommitRelease } from '@/lib/pageTurn/pageTurnMath'

export type PageTurnDirection = 'prev' | 'next'

interface DragState {
  pointerId: number
  edge: PageTurnDirection
  hinge: HingeSide
  startX: number
  containerWidth: number
  lastX: number
  lastT: number
  velocityPxMs: number
}

interface UseEdgePageDragOptions {
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

/** Cardine "naturale" di un gesto: si afferra il bordo libero e lo si porta verso il cardine
 *  opposto — bordo destro afferrato ⇒ cardine a sinistra (si va avanti), bordo sinistro afferrato
 *  ⇒ cardine a destra (si torna indietro). Indipendente dallo `spineSide` decorativo della pagina
 *  (quello resta solo per l'animazione da click, invariata per continuità — vedi BookPage.tsx). */
const HINGE_FOR_EDGE: Record<PageTurnDirection, HingeSide> = { next: 'left', prev: 'right' }

export function useEdgePageDrag({
  containerRef, disabled, canGoPrev, canGoNext,
  onDragStart, onDragProgress, onDragCommit, onDragCancel,
}: UseEdgePageDragOptions) {
  const dragRef = useRef<DragState | null>(null)

  const handlePointerDown = useCallback((edge: PageTurnDirection) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return
    if (edge === 'prev' && !canGoPrev) return
    if (edge === 'next' && !canGoNext) return
    // Solo il tasto sinistro per il mouse — il destro/centrale restano al browser (menu contestuale, ecc.)
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const container = containerRef.current
    if (!container) return
    const width = container.getBoundingClientRect().width
    if (width <= 0) return

    e.currentTarget.setPointerCapture(e.pointerId)
    const hinge = HINGE_FOR_EDGE[edge]
    dragRef.current = {
      pointerId: e.pointerId, edge, hinge, startX: e.clientX, containerWidth: width,
      lastX: e.clientX, lastT: e.timeStamp, velocityPxMs: 0,
    }
    onDragStart(edge, hinge)
  }, [disabled, canGoPrev, canGoNext, containerRef, onDragStart])

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    e.preventDefault()
    const dx = e.clientX - drag.startX
    // Trascinare dal bordo destro verso sinistra (dx negativo) avanza; dal bordo sinistro verso
    // destra (dx positivo) avanza (nel proprio verso) — normalizzato così `progress` è sempre ≥0
    // nella direzione "in avanti per quel bordo", mai bisogno di segni diversi altrove.
    const rawDelta = drag.edge === 'next' ? -dx : dx
    const progress = Math.min(1, Math.max(0, rawDelta / drag.containerWidth))

    const dt = e.timeStamp - drag.lastT
    if (dt > 0) drag.velocityPxMs = (e.clientX - drag.lastX) / dt
    drag.lastX = e.clientX
    drag.lastT = e.timeStamp

    onDragProgress(progress, drag.hinge)
  }, [onDragProgress])

  const endDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    dragRef.current = null
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* già rilasciato */ }

    const dx = e.clientX - drag.startX
    const rawDelta = drag.edge === 'next' ? -dx : dx
    const progress = Math.min(1, Math.max(0, rawDelta / drag.containerWidth))
    const velocity = drag.edge === 'next' ? -drag.velocityPxMs : drag.velocityPxMs

    if (shouldCommitRelease(progress, velocity)) {
      onDragCommit(drag.edge, drag.hinge, progress)
    } else {
      onDragCancel(progress, drag.hinge)
    }
  }, [onDragCommit, onDragCancel])

  const handlePointerCancel = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    dragRef.current = null
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* già rilasciato */ }
    // Un `pointercancel` (il sistema si riprende il gesto, es. uno swipe di navigazione del
    // sistema operativo) non porta con sé una posizione finale affidabile quanto un rilascio
    // normale — si riparte dall'ultima posizione nota invece che da 0, altrimenti il ritorno
    // elastico scatterebbe da un punto sbagliato invece di quello in cui si trovava davvero.
    const rawDelta = drag.edge === 'next' ? -(drag.lastX - drag.startX) : (drag.lastX - drag.startX)
    const progress = Math.min(1, Math.max(0, rawDelta / drag.containerWidth))
    onDragCancel(progress, drag.hinge)
  }, [onDragCancel])

  return useMemo(() => ({
    startEdgeProps: {
      onPointerDown: handlePointerDown('prev'),
      onPointerMove: handlePointerMove,
      onPointerUp: endDrag,
      onPointerCancel: handlePointerCancel,
      style: { touchAction: 'none' as const, width: EDGE_GRAB_PX },
    },
    endEdgeProps: {
      onPointerDown: handlePointerDown('next'),
      onPointerMove: handlePointerMove,
      onPointerUp: endDrag,
      onPointerCancel: handlePointerCancel,
      style: { touchAction: 'none' as const, width: EDGE_GRAB_PX },
    },
  }), [handlePointerDown, handlePointerMove, endDrag, handlePointerCancel])
}
