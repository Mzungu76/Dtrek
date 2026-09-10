'use client'
import { useEffect, useRef, useState, type ReactNode, type Ref, type MutableRefObject } from 'react'

interface Props {
  children: ReactNode
  /** Wraps the scrollable element — usually just `relative` plus layout classes (width/margin). */
  className?: string
  /** Classes for the scrollable element itself (must include the `overflow-x-auto` that made it
   *  scrollable in the first place). */
  scrollClassName?: string
  /** Tailwind `from-*` color matching the background right behind the fade, so it blends in
   *  instead of reading as a gray box — e.g. `from-stone-100` for a tab bar on a stone-100 pill,
   *  `from-white` for a white table card. */
  fadeFromClassName?: string
  /** Optional extra style for the scrollable element (e.g. hiding the native scrollbar). */
  scrollStyle?: React.CSSProperties
  /** Extra ref onto the scrollable element itself, for a caller that already needs to read/scroll
   *  it directly (e.g. RoutePage.tsx's pillBarRef, which scrolls the active tab into view). */
  scrollRef?: Ref<HTMLDivElement>
}

function mergeRefs<T>(...refs: (Ref<T> | undefined)[]) {
  return (el: T | null) => {
    for (const ref of refs) {
      if (!ref) continue
      if (typeof ref === 'function') ref(el)
      else (ref as MutableRefObject<T | null>).current = el
    }
  }
}

/**
 * UX-AUDIT.md P-H8 — un tab bar o una tabella scrollabili orizzontalmente si tagliano di netto al
 * bordo dello schermo senza alcun indizio visivo (confermato da screenshot: "Tr…" per "Traguardi"
 * in Statistiche, "Distanz…" nella tabella "Tutte le escursioni", "In si…" per "In sintesi" nei
 * tab di Guida/Resoconto) — un utente può non accorgersi che c'è altro da scorrere. Aggiunge una
 * sfumatura sul bordo che sta ancora tagliando contenuto, sparisce quando quel lato è già in fondo
 * (mai un indizio "fantasma" quando non c'è altro da vedere in quella direzione). Componente
 * unico condiviso invece di ripetere la stessa logica di scroll in ogni punto (pattern sistemico,
 * l'audit chiedeva esplicitamente una correzione centralizzabile).
 */
export default function ScrollFadeContainer({ children, className = '', scrollClassName = '', fadeFromClassName = 'from-white', scrollStyle, scrollRef }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [showLeft, setShowLeft] = useState(false)
  const [showRight, setShowRight] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    function update() {
      const el2 = el!
      setShowLeft(el2.scrollLeft > 4)
      setShowRight(el2.scrollLeft < el2.scrollWidth - el2.clientWidth - 4)
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    // Il ResizeObserver sul contenitore non si accorge se cambia solo lo scrollWidth interno (es.
    // un tab in più) senza che la sua box cambi — un secondo giro dopo il primo paint copre quel
    // caso senza dover osservare ogni singolo figlio.
    const raf = requestAnimationFrame(update)
    return () => { el.removeEventListener('scroll', update); ro.disconnect(); cancelAnimationFrame(raf) }
  }, [])

  return (
    <div className={`relative ${className}`}>
      <div ref={mergeRefs(ref, scrollRef)} className={scrollClassName} style={scrollStyle}>{children}</div>
      {showLeft && (
        <div className={`pointer-events-none absolute left-0 inset-y-0 w-6 bg-gradient-to-r ${fadeFromClassName} to-transparent`} />
      )}
      {showRight && (
        <div className={`pointer-events-none absolute right-0 inset-y-0 w-6 bg-gradient-to-l ${fadeFromClassName} to-transparent`} />
      )}
    </div>
  )
}
