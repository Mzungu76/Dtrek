import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

interface Props {
  /** Solo per le micro-sezioni (size="sm") — ignorata per le macro-fasi, che non portano più
   *  un'icona propria: un solo livello "acceso" per schermata (piano semplificazione visiva). */
  icon?: LucideIcon
  color?: string
  children: ReactNode
  size?: 'sm' | 'md'
  className?: string
}

/**
 * Etichetta di sezione della Bacheca — due trattamenti secondo il livello, non più lo stesso per
 * entrambi (prima: icona+testo colorato+sottolineatura ovunque, 8 etichette allo stesso volume in
 * una sola pagina):
 *  - "md" (macro-fase: A breve/Da scoprire/Nel tempo) — separatore leggero, solo testo neutro e
 *    una riga che si perde a destra: orienta senza pesare.
 *  - "sm" (micro-sezione: Altre uscite, Da sapere, Il tuo territorio…) — badge tondo pieno
 *    colorato + testo neutro, stesso linguaggio deciso per l'header delle sezioni Guida
 *    (components/editorial/SectionCard.tsx).
 */
export default function SectionEyebrow({ icon: Icon, color = '#c05a17', children, size = 'sm', className = '' }: Props) {
  if (size === 'md') {
    return (
      <div className={`flex items-baseline gap-2 ${className}`}>
        <p className="font-barlow font-semibold uppercase tracking-[2px] text-[10.5px] text-stone-400 whitespace-nowrap">
          {children}
        </p>
        <div className="flex-1 h-px bg-stone-200" />
      </div>
    )
  }
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span
        className="w-[22px] h-[22px] rounded-full flex items-center justify-center shrink-0 text-white [&>svg]:w-[11px] [&>svg]:h-[11px]"
        style={{ background: color }}
      >
        {Icon && <Icon />}
      </span>
      <p className="font-semibold text-[12.5px] text-stone-800">{children}</p>
    </div>
  )
}
