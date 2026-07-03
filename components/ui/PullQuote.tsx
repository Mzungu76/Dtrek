import type { ReactNode } from 'react'

interface PullQuoteProps {
  children: ReactNode
  cite?: string
  className?: string
}

/**
 * Citazione editoriale in Lora corsivo, per estratti narrativi (resoconto
 * AI, descrizioni percorso). Più grande e ariosa delle citazioni piccole
 * già in uso in resoconto/guida, per dare risalto al testo invece di
 * comprimerlo. Piano di ristrutturazione, Parte 3.2/3.0.
 */
export default function PullQuote({ children, cite, className = '' }: PullQuoteProps) {
  return (
    <blockquote className={`font-lora italic text-stone-700 text-xl sm:text-2xl leading-relaxed ${className}`}>
      “{children}”
      {cite && <footer className="mt-3 text-sm not-italic tracking-wide text-stone-400">{cite}</footer>}
    </blockquote>
  )
}
