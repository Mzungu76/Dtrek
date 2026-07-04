'use client'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'

interface Props {
  title: string
  onClose: () => void
  /** Top half — always the real map (or, for Altimetria, map + "sei qui" dot). */
  mapContent: ReactNode
  /** Bottom half — the section's own content; decides its own scroll/layout behavior. */
  children: ReactNode
}

/**
 * Shared full-screen shell for every section reachable from the side rail (Dati & punteggi,
 * Natura, POI, Sicurezza, Strumenti, Altimetria): map always on top, content below. Dumb layout
 * only — each section owns its own map/content composition and any interactive state.
 */
export default function SectionSplit({ title, onClose, mapContent, children }: Props) {
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[#0b1a24]">
      <div className="relative h-1/2 overflow-hidden shrink-0">
        {mapContent}
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/60 to-transparent pointer-events-none" />
        <div className="absolute top-[calc(env(safe-area-inset-top,0px)+16px)] inset-x-4 flex items-center justify-between pointer-events-none">
          <p className="font-display text-lg font-bold text-white pointer-events-auto" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>{title}</p>
          <button onClick={onClose} className="pointer-events-auto w-9 h-9 rounded-full bg-black/50 backdrop-blur-md border border-white/15 flex items-center justify-center text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="h-1/2 bg-[#101c26] overflow-hidden">
        {children}
      </div>
    </div>
  )
}
