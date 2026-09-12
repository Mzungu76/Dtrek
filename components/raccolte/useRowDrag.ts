'use client'
import { useRef, useState } from 'react'

// Trascinamento reale (non le sole frecce su/giù usate altrove in app, vedi il README dei mockup
// in docs/mockup-raccolte-controlcenter/) per riordinare una lista di righe TUTTE della stessa
// altezza — Raccolte fra loro, o i Diari dentro UNA raccolta. Niente misurazione del DOM durante
// il trascinamento (niente getBoundingClientRect ad ogni frame): l'indice di destinazione si
// ricava dallo spostamento verticale diviso l'altezza nota di una riga, un'approssimazione sicura
// perché ogni riga di un dato livello ha sempre la stessa altezza fissa. La cattura del puntatore
// (setPointerCapture sulla maniglia) instrada da sola i move/up successivi allo stesso elemento,
// senza bisogno di listener su window.
interface DragState { index: number; startY: number; deltaY: number }

export function useRowDrag(rowHeight: number, length: number, onCommit: (from: number, to: number) => void) {
  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)

  function clamp(i: number) { return Math.max(0, Math.min(length - 1, i)) }

  function start(index: number, e: React.PointerEvent<HTMLElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    const state: DragState = { index, startY: e.clientY, deltaY: 0 }
    dragRef.current = state
    setDrag(state)
  }
  function move(e: React.PointerEvent<HTMLElement>) {
    if (!dragRef.current) return
    const next = { ...dragRef.current, deltaY: e.clientY - dragRef.current.startY }
    dragRef.current = next
    setDrag(next)
  }
  function end() {
    const state = dragRef.current
    dragRef.current = null
    setDrag(null)
    if (!state) return
    const to = clamp(state.index + Math.round(state.deltaY / rowHeight))
    if (to !== state.index) onCommit(state.index, to)
  }

  return {
    dragIndex: drag?.index ?? null,
    dropIndex: drag ? clamp(drag.index + Math.round(drag.deltaY / rowHeight)) : null,
    deltaY: drag?.deltaY ?? 0,
    start, move, end,
  }
}
