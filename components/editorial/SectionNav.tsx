'use client'
import type { ReactNode } from 'react'

export interface NavSection {
  key: string
  title: string
  icon: ReactNode
  color: string
}

interface Props {
  sections: NavSection[]
  activeIndex: number
  onSelect: (index: number) => void
}

/**
 * Navigazione tra sezioni — un solo componente, due layout responsive che condividono
 * `sections`/`activeIndex` così le due viste non possono andare fuori sincrono:
 *  - `<md`: barra a pillole orizzontale scrollabile (comportamento identico a prima, ma non più
 *    condivisa con i controlli voce — vedi VoicePlayer.tsx).
 *  - `md+`: sommario laterale sticky — rail a sole icone a `md` (poco spazio orizzontale insieme
 *    al contenuto), icona + titolo da `lg`.
 */
export default function SectionNav({ sections, activeIndex, onSelect }: Props) {
  return (
    <>
      {/* Mobile: barra a pillole orizzontale */}
      <div
        data-hscroll
        className="md:hidden sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b px-4 py-2 flex gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden"
        style={{ borderColor: '#dcd8cc', scrollbarWidth: 'none' }}
      >
        {sections.map((s, i) => (
          <button key={s.key} onClick={() => onSelect(i)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all whitespace-nowrap shrink-0"
            style={activeIndex === i
              ? { background: s.color, color: 'white' }
              : { background: '#eeece5', color: '#8a7f6e' }
            }
          >
            <span className="[&>svg]:w-3 [&>svg]:h-3">{s.icon}</span>
            <span>{s.title.split(' ').slice(0, 3).join(' ')}</span>
          </button>
        ))}
      </div>

      {/* md+: sommario laterale sticky */}
      <aside className="hidden md:flex md:flex-col md:gap-1 md:sticky md:top-4 md:self-start md:w-14 lg:w-[220px] md:shrink-0">
        {sections.map((s, i) => {
          const active = activeIndex === i
          return (
            <button
              key={s.key}
              onClick={() => onSelect(i)}
              title={s.title}
              className="flex items-center md:justify-center lg:justify-start gap-2.5 px-2.5 lg:px-3.5 py-2.5 rounded-xl text-[13px] font-semibold transition-all text-left"
              style={active ? { background: s.color, color: 'white' } : { background: 'transparent', color: '#8a7f6e' }}
            >
              <span className="[&>svg]:w-4 [&>svg]:h-4 shrink-0">{s.icon}</span>
              <span className="hidden lg:inline truncate">{s.title}</span>
            </button>
          )
        })}
      </aside>
    </>
  )
}
