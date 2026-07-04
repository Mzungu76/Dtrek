'use client'
import type { ReactNode } from 'react'
import { BarChart2, Leaf, Mountain, MapPin, ShieldAlert, Wrench, Lock, Unlock, Navigation, Star } from 'lucide-react'
import type { HubMode, PopupKind } from './types'

interface Props {
  mode: HubMode
  locked: boolean
  onToggleLock: () => void
  onOpenPopup: (popup: PopupKind) => void
  onOpenAltimetria: () => void
  onNavigate?: () => void
  ratingBadge?: ReactNode
  onOpenRating?: () => void
}

function RailButton({ onClick, title, children, primary }: { onClick: () => void; title: string; children: ReactNode; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-11 h-11 md:w-12 md:h-12 rounded-full flex items-center justify-center shadow-lg backdrop-blur-md transition-transform hover:scale-105 ${
        primary ? 'bg-terra-500 shadow-terra-900/40' : 'bg-black/45 border border-white/15'
      }`}
    >
      {children}
    </button>
  )
}

export default function SideRails({ mode, locked, onToggleLock, onOpenPopup, onOpenAltimetria, onNavigate, ratingBadge, onOpenRating }: Props) {
  return (
    <>
      <div className="fixed left-3 md:left-5 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-3">
        {mode === 'guida' && onNavigate && (
          <RailButton onClick={onNavigate} title="Avvia navigazione sul sentiero" primary>
            <Navigation className="w-5 h-5 text-white" fill="white" />
          </RailButton>
        )}
        {mode === 'resoconto' && onOpenRating && (
          <RailButton onClick={onOpenRating} title="Vota bellezza" primary={!ratingBadge}>
            {ratingBadge ?? <Star className="w-5 h-5 text-white" />}
          </RailButton>
        )}
        <RailButton onClick={() => onOpenPopup('dati')} title="Dati & punteggi">
          <BarChart2 className="w-5 h-5 text-amber-300" />
        </RailButton>
        <RailButton onClick={() => onOpenPopup('natura')} title="Natura">
          <Leaf className="w-5 h-5 text-emerald-300" />
        </RailButton>
        <RailButton onClick={onOpenAltimetria} title="Altimetria">
          <Mountain className="w-5 h-5 text-sky-300" />
        </RailButton>
      </div>

      <div className="fixed right-3 md:right-5 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-3">
        <RailButton onClick={() => onOpenPopup('poi')} title="Punti di interesse">
          <MapPin className="w-5 h-5 text-fuchsia-300" />
        </RailButton>
        <RailButton onClick={() => onOpenPopup('sicurezza')} title="Sicurezza">
          <ShieldAlert className="w-5 h-5 text-red-300" />
        </RailButton>
        <RailButton onClick={() => onOpenPopup('strumenti')} title="Strumenti">
          <Wrench className="w-5 h-5 text-stone-100" />
        </RailButton>
        <RailButton onClick={onToggleLock} title={locked ? 'Sblocca mappa' : 'Blocca mappa'}>
          {locked
            ? <Lock className="w-[18px] h-[18px] text-stone-100" />
            : <Unlock className="w-[18px] h-[18px] text-terra-400" />}
        </RailButton>
      </div>
    </>
  )
}
