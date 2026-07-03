import type { ReactNode } from 'react'
import Kicker from './Kicker'

const SIZES = {
  sm: 'text-lg sm:text-xl',
  md: 'text-2xl sm:text-3xl',
  lg: 'text-4xl sm:text-5xl',
} as const

interface StatFigureProps {
  value: ReactNode
  label: string
  size?: keyof typeof SIZES
  className?: string
}

/**
 * "Cifra editoriale": numero grande in Playfair Display con didascalia
 * sotto in stile Kicker. Sostituisce, dove applicato, i piccoli badge
 * colorati (vedi components/StatCard.tsx) per dati chiave come
 * distanza/D+/durata/FC. Piano di ristrutturazione, Parte 3.2.
 */
export default function StatFigure({ value, label, size = 'md', className = '' }: StatFigureProps) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <span className={`font-display font-semibold text-stone-800 leading-none ${SIZES[size]}`}>
        {value}
      </span>
      <Kicker className="text-stone-400">{label}</Kicker>
    </div>
  )
}
