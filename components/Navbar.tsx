'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Mountain, Upload, BarChart2, BookOpen, Map, CalendarClock } from 'lucide-react'

const NAV_LINKS = [
  { href: '/',            label: 'Diario',      icon: BookOpen      },
  { href: '/statistiche', label: 'Statistiche', icon: BarChart2     },
  { href: '/mappa',       label: 'Mappa',       icon: Map           },
  { href: '/programma',   label: 'Programma',   icon: CalendarClock },
]

function isActive(href: string, path: string) {
  return href === '/' ? path === '/' : path.startsWith(href)
}

export default function Navbar() {
  const path = usePathname()
  return (
    <>
      {/* ── Top bar ───────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-sm border-b border-stone-200 shadow-sm">
        <div className="max-w-[1400px] mx-auto px-4 flex items-center justify-between h-14">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group shrink-0">
            <Mountain className="w-6 h-6 text-forest-600 group-hover:text-forest-500 transition-colors" />
            <span className="font-display font-semibold text-lg text-stone-800 tracking-tight">
              Diario Trekking
            </span>
          </Link>

          {/* Desktop: full nav + CTA */}
          <div className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map(({ href, label, icon: Icon }) => {
              const active = isActive(href, path)
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    active ? 'bg-forest-50 text-forest-700' : 'text-stone-500 hover:text-stone-800 hover:bg-stone-100'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{label}</span>
                </Link>
              )
            })}
            <div className="w-px h-5 bg-stone-200 mx-1" />
            <Link
              href="/upload"
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                path === '/upload' ? 'bg-terra-600 text-white' : 'bg-terra-500 hover:bg-terra-400 text-white shadow-sm'
              }`}
            >
              <Upload className="w-4 h-4" />
              <span>Carica</span>
            </Link>
          </div>

          {/* Mobile: upload icon only in top-right */}
          <Link
            href="/upload"
            className={`md:hidden flex items-center justify-center w-9 h-9 rounded-xl text-sm font-semibold transition-all ${
              path === '/upload' ? 'bg-terra-600 text-white' : 'bg-terra-500 text-white shadow-sm'
            }`}
            aria-label="Carica file"
          >
            <Upload className="w-4 h-4" />
          </Link>
        </div>
      </nav>

      {/* ── Mobile bottom tab bar ────────────────────────────────────────── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-t border-stone-200 shadow-[0_-1px_4px_rgba(0,0,0,0.06)]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex items-stretch h-16">
          {NAV_LINKS.map(({ href, label, icon: Icon }) => {
            const active = isActive(href, path)
            return (
              <Link
                key={href}
                href={href}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors min-w-0 px-1
                  ${active ? 'text-forest-600' : 'text-stone-400'}`}
              >
                <Icon className={`w-5 h-5 shrink-0 ${active ? 'text-forest-600' : 'text-stone-400'}`} />
                <span className="text-[9px] font-medium leading-none truncate w-full text-center">
                  {label}
                </span>
                {active && (
                  <span className="absolute top-0 w-6 h-0.5 bg-forest-500 rounded-full -translate-y-px" />
                )}
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}
