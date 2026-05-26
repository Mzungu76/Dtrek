'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Mountain, Upload, BarChart2, BookOpen, Map } from 'lucide-react'

const links = [
  { href: '/',             label: 'Diario',      icon: BookOpen   },
  { href: '/upload',       label: 'Carica TCX',  icon: Upload     },
  { href: '/statistiche',  label: 'Statistiche', icon: BarChart2  },
  { href: '/mappa',        label: 'Mappa',       icon: Map        },
]

export default function Navbar() {
  const path = usePathname()
  return (
    <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-sm border-b border-stone-200 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-14">
        <Link href="/" className="flex items-center gap-2 group">
          <Mountain className="w-6 h-6 text-forest-600 group-hover:text-forest-500 transition-colors" />
          <span className="font-display font-semibold text-lg text-stone-800 tracking-tight">
            Diario Trekking
          </span>
        </Link>

        <div className="flex items-center gap-1">
          {links.map(({ href, label, icon: Icon }) => {
            const active = path === href
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  active
                    ? 'bg-forest-50 text-forest-700'
                    : 'text-stone-500 hover:text-stone-800 hover:bg-stone-100'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
