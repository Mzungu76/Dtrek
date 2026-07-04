'use client'
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { BarChart2, Leaf, Mountain, MapPin, ShieldAlert, Wrench, Map, Navigation, Star, Box, Download } from 'lucide-react'
import type { HubMode, SectionKind } from './types'

interface Props {
  mode: HubMode
  locked: boolean
  onToggleLock: () => void
  onOpenSection: (section: SectionKind) => void
  datiBadge?: ReactNode
  onNavigate?: () => void
  onOpenOffline?: () => void
  ratingBadge?: ReactNode
  onOpenRating?: () => void
  featuredLabel: string
  featuredIcon: LucideIcon
  onOpenFeatured: () => void
  onOpenMap3D?: () => void
  unlockedControls?: ReactNode
}

export const RAIL_VARIANTS = {
  glass: 'bg-black/45 border border-white/15',
  terra: 'bg-terra-500 shadow-terra-900/40',
  amber: 'bg-amber-500 shadow-amber-900/40',
} as const

export function RailButton({ onClick, title, children, variant = 'glass', badge, small }: { onClick: () => void; title: string; children: ReactNode; variant?: keyof typeof RAIL_VARIANTS; badge?: ReactNode; small?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`relative ${small ? 'w-9 h-9' : 'w-11 h-11 md:w-12 md:h-12'} rounded-full flex items-center justify-center shadow-lg backdrop-blur-md transition-transform hover:scale-105 ${RAIL_VARIANTS[variant]}`}
    >
      {children}
      {badge && (
        <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-sky-500 border-2 border-[#0b1a24] text-[9px] font-bold text-white flex items-center justify-center leading-none">
          {badge}
        </span>
      )}
    </button>
  )
}

export default function SideRails({
  mode, locked, onToggleLock, onOpenSection, datiBadge, onNavigate, onOpenOffline, ratingBadge, onOpenRating,
  featuredLabel, featuredIcon: FeaturedIcon, onOpenFeatured, onOpenMap3D, unlockedControls,
}: Props) {
  if (!locked) {
    // Sbloccata: immersione totale — restano solo il toggle mappa (per ribloccare), l'accesso 3D
    // ed eventuali controlli propri dello stage (pendenza, foto zona…).
    return (
      <>
        {unlockedControls && (
          <div className="fixed top-[calc(env(safe-area-inset-top,0px)+16px)] left-3 md:left-5 z-30 flex flex-col gap-3">
            {unlockedControls}
          </div>
        )}
        <div className="fixed top-[calc(env(safe-area-inset-top,0px)+16px)] right-3 md:right-5 z-30 flex flex-col gap-3">
          <RailButton onClick={onToggleLock} title="Blocca mappa">
            <Map className="w-[18px] h-[18px] text-terra-400" />
          </RailButton>
          {onOpenMap3D && (
            <RailButton onClick={onOpenMap3D} title="Vista 3D">
              <Box className="w-[18px] h-[18px] text-sky-300" />
            </RailButton>
          )}
        </div>
      </>
    )
  }

  return (
    <>
      <div className="fixed left-3 md:left-5 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-3">
        {mode === 'guida' && onNavigate && (
          <div className="flex flex-col items-center gap-1.5">
            <RailButton onClick={onNavigate} title="Avvia navigazione sul sentiero" variant="terra">
              <Navigation className="w-5 h-5 text-white" fill="white" />
            </RailButton>
            {onOpenOffline && (
              <RailButton onClick={onOpenOffline} title="Scarica per offline" small>
                <Download className="w-4 h-4 text-sky-200" />
              </RailButton>
            )}
          </div>
        )}
        {mode === 'resoconto' && onOpenRating && (
          <RailButton onClick={onOpenRating} title="Vota bellezza" variant={ratingBadge ? 'glass' : 'terra'}>
            {ratingBadge ?? <Star className="w-5 h-5 text-white" />}
          </RailButton>
        )}
        <RailButton onClick={onOpenFeatured} title={featuredLabel} variant="amber">
          <FeaturedIcon className="w-5 h-5 text-white" />
        </RailButton>
        <RailButton onClick={() => onOpenSection('dati')} title="Dati & punteggi" badge={datiBadge}>
          <BarChart2 className="w-5 h-5 text-amber-300" />
        </RailButton>
        <RailButton onClick={() => onOpenSection('natura')} title="Natura">
          <Leaf className="w-5 h-5 text-emerald-300" />
        </RailButton>
        <RailButton onClick={() => onOpenSection('altimetria')} title="Altimetria">
          <Mountain className="w-5 h-5 text-sky-300" />
        </RailButton>
      </div>

      <div className="fixed right-3 md:right-5 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-3">
        <RailButton onClick={() => onOpenSection('poi')} title="Punti di interesse">
          <MapPin className="w-5 h-5 text-fuchsia-300" />
        </RailButton>
        <RailButton onClick={() => onOpenSection('sicurezza')} title="Sicurezza">
          <ShieldAlert className="w-5 h-5 text-red-300" />
        </RailButton>
        <RailButton onClick={() => onOpenSection('strumenti')} title="Strumenti">
          <Wrench className="w-5 h-5 text-stone-100" />
        </RailButton>
        <RailButton onClick={onToggleLock} title="Sblocca mappa">
          <Map className="w-[18px] h-[18px] text-stone-100" />
        </RailButton>
      </div>
    </>
  )
}
