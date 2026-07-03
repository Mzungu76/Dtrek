import type { ElementType, ReactNode } from 'react'

interface KickerProps {
  children: ReactNode
  as?: ElementType
  className?: string
}

/**
 * Etichetta editoriale maiuscola (stile "kicker" da rivista), usata sopra
 * titoli di pagina/sezione al posto di header generici. Vedi piano di
 * ristrutturazione, Parte 3.2 — estratta dal pattern già in uso in
 * diario/resoconto/guida (font-barlow uppercase tracking-wide).
 */
export default function Kicker({ children, as: Tag = 'p', className = '' }: KickerProps) {
  return (
    <Tag className={`font-barlow font-bold uppercase tracking-wide text-stone-500 text-xs ${className}`}>
      {children}
    </Tag>
  )
}
