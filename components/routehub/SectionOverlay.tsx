'use client'
import { useEffect, useState, type ReactNode, type Ref } from 'react'
import { X, Box } from 'lucide-react'

interface Props {
  title: string
  onClose: () => void
  /** Opens the fullscreen 3D map view for this route — shown as a small pill over the docking strip. */
  on3D?: () => void
  /** Chips (POI toggle, etc.) shown in the docking strip, next to the close button. */
  mapHeaderActions?: ReactNode
  /** Resoconto only: horizontal photo strip shown first, above everything else in the body. */
  heroPhotos?: ReactNode
  /** Attaches to the actual scrolling element (not `children`'s own wrapper) — needed by sections
   *  that track scroll position (e.g. `useCenteredItem`, to sync a highlighted POI/marker on the
   *  map with what's centered in the list). */
  scrollRef?: Ref<HTMLDivElement>
  /** The section's own content — grafici, punteggi, liste. Decides its own scroll/layout. */
  children: ReactNode
}

/**
 * Glass bottom-sheet shared by every section reachable from the side rail (Dati & punteggi, Natura,
 * POI, Sicurezza, Strumenti, Meteo, Guida Turistica/Racconto). Unlike the old SectionSplit, this
 * component owns no map of its own — the real map/photo stage lives underneath, always mounted, and
 * shows through the docking strip and the dimmed area above the sheet.
 */
export default function SectionOverlay({ title, onClose, on3D, mapHeaderActions, heroPhotos, scrollRef, children }: Props) {
  const [entered, setEntered] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(id)
  }, [])

  return (
    <div className="absolute inset-0 flex flex-col justify-end">
      <div className="relative h-16 shrink-0 pointer-events-none">
        <div className="absolute top-[calc(env(safe-area-inset-top,0px)+16px)] inset-x-4 flex items-center justify-between gap-2">
          <p className="flex-1 min-w-0 font-display text-lg font-bold text-white truncate pointer-events-auto" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>
            {title}
          </p>
          <div className="flex items-center gap-2 pointer-events-auto shrink-0">
            {mapHeaderActions}
            {on3D && (
              <button
                onClick={on3D}
                title="Vista 3D"
                className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-black/50 backdrop-blur-md border border-white/15 text-white text-xs font-semibold"
              >
                <Box className="w-3.5 h-3.5 shrink-0" /> 3D
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Chiudi"
              className="shrink-0 w-9 h-9 rounded-full bg-black/50 backdrop-blur-md border border-white/15 flex items-center justify-center text-white"
            >
              <X className="w-4 h-4 shrink-0" />
            </button>
          </div>
        </div>
      </div>

      <div
        className={`relative h-[78vh] max-h-[calc(100%-72px)] rounded-t-[28px] bg-black/55 backdrop-blur-xl border-t border-white/10 shadow-[0_-8px_32px_rgba(0,0,0,0.35)] overflow-hidden transition-transform duration-300 ease-out ${entered ? 'translate-y-0' : 'translate-y-full'}`}
      >
        <div className="absolute top-2 inset-x-0 flex justify-center pointer-events-none z-10">
          <div className="w-10 h-1.5 rounded-full bg-white/30" />
        </div>
        <div className="h-full overflow-hidden pt-4">
          <div ref={scrollRef} className="h-full md:max-w-2xl md:mx-auto overflow-y-auto">
            {heroPhotos}
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
