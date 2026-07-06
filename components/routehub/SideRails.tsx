'use client'
import type { ReactNode } from 'react'

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
