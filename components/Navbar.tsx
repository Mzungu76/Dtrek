'use client'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Upload, BookMarked, CalendarDays, Compass, User, Plus } from 'lucide-react'
import { getProfile } from '@/lib/userProfile'
import { getBrowserSupabase } from '@/lib/supabaseBrowser'
import type { User as SupabaseUser, Session, AuthChangeEvent } from '@supabase/supabase-js'

const NAV_LINKS = [
  { href: '/',          label: 'Diario',    icon: BookMarked  },
  { href: '/programma', label: 'Programma', icon: CalendarDays },
  { href: '/esplora',   label: 'Esplora',   icon: Compass      },
  { href: '/profilo',   label: 'Profilo',   icon: User         },
]

function isActive(href: string, path: string) {
  return href === '/' ? path === '/' : path.startsWith(href)
}

// ── Avatar (desktop + tab bar icon) ─────────────────────────────────────────────

function useAvatar() {
  const [user, setUser]       = useState<SupabaseUser | null>(null)
  const [faceUrl, setFaceUrl] = useState<string | null>(null)

  useEffect(() => {
    const supabase = getBrowserSupabase()
    supabase.auth.getUser().then(({ data }: { data: { user: SupabaseUser | null } }) => setUser(data.user))
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => setUser(session?.user ?? null)
    )
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const local = getProfile().hikerFaceDataUrl
    if (local) setFaceUrl(local)
    fetch('/api/user-settings')
      .then(r => r.json())
      .then(d => { if (d.hikerFaceDataUrl) setFaceUrl(d.hikerFaceDataUrl) })
      .catch(() => {})
    const onProfileUpdated = () => {
      const updated = getProfile().hikerFaceDataUrl
      if (updated !== undefined) setFaceUrl(updated ?? null)
    }
    window.addEventListener('dtrek:profile-updated', onProfileUpdated)
    return () => window.removeEventListener('dtrek:profile-updated', onProfileUpdated)
  }, [])

  return { user, faceUrl }
}

// ── Desktop top bar ──────────────────────────────────────────────────────────

function DesktopNav() {
  const path = usePathname()
  const { user, faceUrl } = useAvatar()
  const initials = (user?.user_metadata?.display_name as string | undefined ?? user?.email ?? '?')[0].toUpperCase()

  return (
    <nav className="hidden md:block sticky top-0 z-50 bg-white/90 backdrop-blur-sm border-b border-stone-200 shadow-sm">
      <div className="max-w-[1400px] mx-auto px-4 flex items-center justify-between h-14">
        <Link href="/" className="flex items-center gap-2 group shrink-0">
          <Image src="/icon-192.png" alt="DTrek" width={28} height={28} className="rounded-md" />
          <span className="font-display font-semibold text-lg text-stone-800 tracking-tight">
            Diario Trekking
          </span>
        </Link>

        <div className="flex items-center gap-1">
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
            href="/profilo"
            className="flex items-center justify-center w-8 h-8 rounded-full border-2 border-stone-200 hover:border-forest-400 transition-all overflow-hidden"
            title="Profilo"
          >
            {faceUrl
              ? <img src={faceUrl} alt="Profilo" className="w-full h-full object-cover" />
              : user
                ? <span className="w-full h-full flex items-center justify-center bg-forest-600 text-white text-xs font-bold">{initials}</span>
                : <User className="w-4 h-4 text-stone-400" />
            }
          </Link>
          <Link
            href="/upload"
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-all ml-1 ${
              path === '/upload' ? 'bg-terra-600 text-white' : 'bg-terra-500 hover:bg-terra-400 text-white shadow-sm'
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>Carica</span>
          </Link>
        </div>
      </div>
    </nav>
  )
}

// ── Mobile: discreet floating "Carica" quick action ─────────────────────────────

function CaricaFab() {
  return (
    <Link
      href="/upload"
      aria-label="Carica un'escursione"
      title="Carica"
      className="md:hidden fixed z-40 flex items-center justify-center w-9 h-9 rounded-full bg-terra-500 text-white shadow-lg shadow-terra-900/20 active:scale-95 transition-transform"
      style={{ right: 16, top: 'calc(env(safe-area-inset-top, 0px) + 14px)' }}
    >
      <Plus className="w-[18px] h-[18px]" strokeWidth={2.5} />
    </Link>
  )
}

// ── Mobile: floating pill tab bar ────────────────────────────────────────────────

function MobileTabBar() {
  const path = usePathname()
  return (
    <nav
      className="md:hidden fixed z-40 left-4 right-4 bottom-0"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 14px)' }}
    >
      <div className="flex items-center justify-around bg-forest-900/95 backdrop-blur-md rounded-[28px] px-2 py-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.25)]">
        {NAV_LINKS.map(({ href, label, icon: Icon }) => {
          const active = isActive(href, path)
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-2xl transition-colors ${
                active ? 'text-white' : 'text-forest-300'
              }`}
            >
              <Icon className="w-[19px] h-[19px]" strokeWidth={2} />
              <span className="text-[9px] font-bold leading-none">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

// ── Navbar ─────────────────────────────────────────────────────────────────────

export default function Navbar() {
  return (
    <>
      <DesktopNav />
      <CaricaFab />
      <MobileTabBar />
    </>
  )
}
