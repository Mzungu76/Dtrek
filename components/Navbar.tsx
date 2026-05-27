'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Mountain, Upload, BarChart2, BookOpen, Map } from 'lucide-react'

const NAV_LINKS = [
  { href: '/',            label: 'Diario',      icon: BookOpen  },
  { href: '/statistiche', label: 'Statistiche', icon: BarChart2 },
  { href: '/mappa',       label: 'Mappa',       icon: Map       },
]

export default function Navbar() {
  const path = usePathname()
  return (
    <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-sm border-b border-stone-200 shadow-sm">
      <div className="max-w-[1400px] mx-auto px-4 flex items-center justify-between h-14">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group shrink-0">
          <Mountain className="w-6 h-6 text-forest-600 group-hover:text-forest-500 transition-colors" />
          <span className="font-display font-semibold text-lg text-stone-800 tracking-tight">
            Diario Trekking
          </span>
        </Link>

        {/* Right side: nav links + upload CTA */}
        <div className="flex items-center gap-1">
          {NAV_LINKS.map(({ href, label, icon: Icon }) => {
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

          {/* Divider */}
          <div className="w-px h-5 bg-stone-200 mx-1" />

          {/* Upload CTA — visually distinct */}
          <Link
            href="/upload"
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-all ${
              path === '/upload'
                ? 'bg-terra-600 text-white'
                : 'bg-terra-500 hover:bg-terra-400 text-white shadow-sm'
            }`}
          >
            <Upload className="w-4 h-4" />
            <span className="hidden sm:inline">Carica TCX</span>
          </Link>
        </div>
      </div>
    </nav>
  )
}
