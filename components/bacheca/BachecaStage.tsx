'use client'
import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import HubNavBar from '@/components/routehub/HubNavBar'

// Stessa distanza/soglia di RouteCarousel.tsx/RoutePage.tsx (OPEN_DRAG_DISTANCE_PX /
// CLOSE_DRAG_DISTANCE_PX) — coerenza di sensazione col resto dell'app, anche se qui è
// un'implementazione minima a sé (vedi il commento sul componente più sotto).
const DRAG_DISTANCE_PX = 220
const DRAG_LOCK_PX = 8

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max)
}

interface Props {
  /** Sfondo di Schermo 1 (foto/mappa/gradiente) — l'unica superficie che risponde al trascinamento
   *  verso l'alto. Riempie sempre l'intero schermo: dimensioni/posizionamento interni restano a
   *  chi lo passa. */
  background: ReactNode
  /** Testo/CTA/galleria in basso su Schermo 1 — un fratello dello sfondo, non annidato dentro:
   *  come in RouteHub.tsx, questo evita che il touch-none del trascinamento rompa lo scroll
   *  orizzontale nativo della galleria (touch-action è l'intersezione con ogni antenato, un
   *  discendente non può "riaccenderlo" — vedi il commento in RouteHub.tsx). Sfuma e smette di
   *  intercettare i tocchi mentre Schermo 2 sale. */
  chrome: ReactNode
  /** Contenuto di Schermo 2 — scorre normalmente una volta aperto. */
  detail: ReactNode
  detailTitle: string
}

/**
 * Copertina a schermo pieno + foglio che sale sul resto della Bacheca al trascinamento verso
 * l'alto — stesso meccanismo già in produzione per Guida/Resoconto (RouteCarousel.tsx +
 * RoutePage.tsx, dietro RouteHub.tsx), riscritto qui in versione minima invece di riusare quei
 * componenti: portano dietro un carosello orizzontale multi-percorso, tab a pillole e un menu
 * "Strumenti" sempre presente che qui non avrebbero contenuto (Bacheca ha un solo percorso in
 * copertina e un solo Schermo 2 aggregato, non uno per percorso). Stessa distanza/soglia di
 * trascinamento per restare coerente al tatto.
 */
export default function BachecaStage({ background, chrome, detail, detailTitle }: Props) {
  const [progress, setProgress] = useState(0) // 0 = chiuso, 1 = aperto
  const [animate, setAnimate] = useState(false)
  const dragging = useRef(false)
  const mode = useRef<'open' | 'close' | null>(null)
  const startY = useRef(0)
  const startTime = useRef(0)
  const lastDy = useRef(0)
  const moved = useRef(false)

  const onDown = (which: 'open' | 'close') => (e: ReactPointerEvent<HTMLElement>) => {
    dragging.current = true
    mode.current = which
    startY.current = e.clientY
    startTime.current = performance.now()
    lastDy.current = 0
    moved.current = false
    setAnimate(false)
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onMove = (e: ReactPointerEvent<HTMLElement>) => {
    if (!dragging.current) return
    const dy = e.clientY - startY.current
    lastDy.current = dy
    if (Math.abs(dy) > DRAG_LOCK_PX) moved.current = true
    const p = mode.current === 'open'
      ? clamp(-dy / DRAG_DISTANCE_PX, 0, 1)
      : clamp(1 - Math.max(0, dy) / DRAG_DISTANCE_PX, 0, 1)
    setProgress(p)
  }
  const onUp = () => {
    if (!dragging.current) return
    dragging.current = false
    // Tap senza trascinare sulla maniglia di chiusura = chiusura istantanea (come
    // RoutePage.tsx's handleClosePointerUp), non "nessun progresso fatto".
    if (!moved.current) {
      if (mode.current === 'close') { setAnimate(true); setProgress(0) }
      mode.current = null
      return
    }
    const elapsed = Math.max(1, performance.now() - startTime.current)
    const velocity = -lastDy.current / elapsed // px/ms, positivo = verso l'alto
    const wasOpening = mode.current === 'open'
    const threshold = wasOpening
      ? (velocity > 0.5 ? 0.15 : 0.5)
      : (velocity < -0.5 ? 0.85 : 0.5)
    setAnimate(true)
    setProgress(prev => (prev > threshold ? 1 : 0))
    mode.current = null
  }

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#0b1a24] select-none">
      <div
        className="absolute inset-0 touch-none cursor-grab active:cursor-grabbing"
        onPointerDown={progress < 1 ? onDown('open') : undefined}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {background}
      </div>

      <div
        className="absolute inset-x-0 bottom-0 z-10 transition-opacity ease-out"
        style={{ opacity: 1 - progress, pointerEvents: progress > 0.5 ? 'none' : 'auto', transitionDuration: animate ? '320ms' : '0ms' }}
      >
        {chrome}
        <div className="flex justify-center pb-[calc(env(safe-area-inset-bottom,0px)+8px)] pt-1">
          <button onClick={() => { setAnimate(true); setProgress(1) }} aria-label="Apri il resto della Bacheca" className="p-1.5 -m-1.5 rounded-full">
            <ChevronUp className="w-5 h-5 text-white/60 animate-bounce" strokeWidth={2.5} />
          </button>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20">
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/55 to-transparent" />
        <HubNavBar />
      </div>

      <div
        className="absolute inset-0 bg-[#fdfcfa] flex flex-col shadow-[0_-8px_24px_rgba(0,0,0,0.18)] z-30"
        style={{
          transform: `translateY(${(1 - progress) * 100}%)`,
          transition: animate ? 'transform 320ms cubic-bezier(.2,.8,.2,1)' : 'none',
        }}
      >
        <div className="shrink-0 flex items-center gap-2.5 px-4 pt-[calc(env(safe-area-inset-top,0px)+10px)] pb-2.5 border-b border-stone-100">
          <button
            onPointerDown={onDown('close')}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            aria-label="Chiudi"
            className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-600 touch-none cursor-grab active:cursor-grabbing shrink-0"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
          <p className="font-display text-[15px] font-bold text-stone-900 truncate">{detailTitle}</p>
        </div>
        <div className="flex-1 overflow-y-auto pb-10">{detail}</div>
      </div>
    </div>
  )
}
