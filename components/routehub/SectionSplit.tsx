'use client'
import type { ReactNode } from 'react'
import { X, Box } from 'lucide-react'

interface Props {
  title: string
  onClose: () => void
  /** Top half — always the real, interactive map (or, for Altimetria, map + "sei qui" dot). */
  mapContent: ReactNode
  /** Bottom half — the section's own content; decides its own scroll/layout behavior. */
  children: ReactNode
  /** Opens the fullscreen 3D map view for this route — shown as a small button over the map half. */
  on3D?: () => void
}

/**
 * Shared full-screen shell for every section reachable from the side rail (Dati & punteggi,
 * Natura, POI, Sicurezza, Strumenti, Altimetria, Meteo): map always on top, content below. Dumb
 * layout only — each section owns its own map/content composition and any interactive state.
 */
export default function SectionSplit({ title, onClose, mapContent, children, on3D }: Props) {
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-stone-50">
      <div className="relative h-[calc(50%+16px)] overflow-hidden shrink-0 bg-[#0b1a24]">
        {mapContent}
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/60 to-transparent pointer-events-none" />
        <div className="absolute top-[calc(env(safe-area-inset-top,0px)+16px)] inset-x-4 flex items-center justify-between gap-2 pointer-events-none">
          <p className="flex-1 min-w-0 font-display text-lg font-bold text-white truncate pointer-events-auto" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>{title}</p>
          <button
            onClick={onClose}
            aria-label="Chiudi"
            className="pointer-events-auto shrink-0 grow-0 basis-9 w-9 h-9 rounded-full bg-black/50 backdrop-blur-md border border-white/15 flex items-center justify-center text-white"
          >
            <X className="w-4 h-4 shrink-0" />
          </button>
        </div>
        {on3D && (
          <button
            onClick={on3D}
            title="Vista 3D"
            className="absolute bottom-6 right-3 flex items-center gap-1.5 px-3 py-2 rounded-full bg-black/50 backdrop-blur-md border border-white/15 text-white text-xs font-semibold"
          >
            <Box className="w-3.5 h-3.5 shrink-0" /> 3D
          </button>
        )}
      </div>
      <div className="relative flex-1 min-h-0 -mt-4 rounded-t-[28px] bg-stone-50 shadow-[0_-8px_24px_rgba(0,0,0,0.18)] overflow-hidden">
        <div className="absolute top-2 inset-x-0 flex justify-center pointer-events-none">
          <div className="w-10 h-1.5 rounded-full bg-stone-300" />
        </div>
        <div className="h-full overflow-hidden pt-4">
          <div className="h-full md:max-w-2xl md:mx-auto">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
