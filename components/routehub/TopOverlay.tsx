'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { List } from 'lucide-react'
import { NAV_LINKS, isActive } from '@/components/Navbar'
import type { StatPill } from './types'

interface Props {
  title: string
  statPills: StatPill[]
  onOpenList: () => void
}

export default function TopOverlay({ title, statPills, onOpenList }: Props) {
  const path = usePathname()

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20">
      <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-black/70 to-transparent" />

      <div className="relative px-3 sm:px-4 pt-[calc(env(safe-area-inset-top,0px)+10px)]">
        <div className="flex items-center gap-2">
          <div className="pointer-events-auto flex-1 flex items-center justify-around bg-forest-900/90 backdrop-blur-md rounded-full px-2 py-1.5 shadow-lg max-w-xs">
            {NAV_LINKS.map(({ href, label, icon: Icon }) => {
              const active = isActive(href, path ?? '')
              return (
                <Link key={href} href={href} className={`flex flex-col items-center gap-0.5 px-2.5 py-0.5 ${active ? 'text-white' : 'text-forest-300'}`}>
                  <Icon className="w-4 h-4" strokeWidth={2} />
                  <span className="text-[8px] font-bold leading-none">{label}</span>
                </Link>
              )
            })}
          </div>
          <button
            onClick={onOpenList}
            title="Vedi elenco"
            className="pointer-events-auto shrink-0 w-9 h-9 rounded-full bg-black/45 border border-white/15 backdrop-blur-md flex items-center justify-center text-stone-100"
          >
            <List className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-3 flex flex-nowrap gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {statPills.map(({ icon: Icon, label }) => (
            <span key={label} className="pointer-events-auto shrink-0 flex items-center gap-1.5 bg-black/45 backdrop-blur-md text-white text-[11px] font-semibold whitespace-nowrap px-2.5 py-1.5 rounded-full border border-white/10">
              <Icon className="w-3 h-3" /> {label}
            </span>
          ))}
        </div>

        <p className="mt-3 font-display text-xl sm:text-2xl font-bold text-white" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>
          {title}
        </p>
      </div>
    </div>
  )
}
