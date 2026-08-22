import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

interface Props {
  icon: LucideIcon
  color: string
  children: ReactNode
  size?: 'sm' | 'md'
  className?: string
}

/**
 * Etichetta di sezione con icona colorata + sottolineatura, stesso trattamento editoriale delle
 * sezioni della guida (components/editorial/SectionCard.tsx: icona + eyebrow colorata + riga
 * d'accento) — prima in Bacheca ogni sezione era solo testo maiuscolo, senza alcun rimando visivo
 * al contenuto che introduceva né coerenza con lo stile delle schede percorso.
 */
export default function SectionEyebrow({ icon: Icon, color, children, size = 'sm', className = '' }: Props) {
  return (
    <div className={className}>
      <div className="flex items-center gap-1.5">
        <Icon className={size === 'sm' ? 'w-3 h-3 shrink-0' : 'w-3.5 h-3.5 shrink-0'} style={{ color }} />
        <p
          className={`font-barlow font-extrabold uppercase tracking-[1.5px] ${size === 'sm' ? 'text-[11px]' : 'text-[13px]'}`}
          style={{ color }}
        >
          {children}
        </p>
      </div>
      <div className="mt-1 h-[2px] w-7 rounded-full" style={{ background: color }} />
    </div>
  )
}
