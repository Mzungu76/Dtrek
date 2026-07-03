'use client'

export interface SectionTabItem {
  id: string
  label: string
}

interface SectionTabsProps {
  tabs: SectionTabItem[]
  active: string
  onChange: (id: string) => void
}

/**
 * Tab/ancore interne sticky per sezionare le pagine di dettaglio lunghe
 * (Escursione, Programma) in gruppi navigabili, in stile editoriale
 * (etichette maiuscole Barlow Condensed, filo sottile) invece delle
 * pillole colorate della tab bar di Statistiche. Piano di
 * ristrutturazione, Parte 2.3/3.4.
 */
export default function SectionTabs({ tabs, active, onChange }: SectionTabsProps) {
  return (
    <div className="sticky top-14 z-30 bg-stone-50/95 backdrop-blur-sm border-b border-stone-200">
      <nav className="max-w-6xl mx-auto px-3 sm:px-4 flex gap-6 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`shrink-0 py-3 font-barlow font-bold uppercase tracking-wide text-xs border-b-2 transition-colors ${
              active === t.id
                ? 'text-forest-700 border-forest-600'
                : 'text-stone-400 border-transparent hover:text-stone-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
