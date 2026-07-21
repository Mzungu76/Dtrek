'use client'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Compass, BookMarked, BookOpen, User, Home } from 'lucide-react'
import { getProfile } from '@/lib/userProfile'
import { getBrowserSupabase } from '@/lib/supabaseBrowser'
import { getUserSettingsCached } from '@/lib/sync/userSettingsStore'
import type { User as SupabaseUser, Session, AuthChangeEvent } from '@supabase/supabase-js'

// 4 tab principali del nuovo posizionamento: Bacheca (centro di controllo:
// statistiche + badge + AI discreta — sezione di apertura dell'app), Guide
// (import GPX → guida turistica AI), Resoconti (escursioni concluse: dati +
// racconto), Diario (libro impaginato).
// Il Profilo non è un tab alla pari ma un'icona persistente (vedi ProfileAvatar).
export const NAV_LINKS = [
  { href: '/bacheca',    label: 'Bacheca',    icon: Home       },
  { href: '/guida',      label: 'Guide',      icon: Compass    },
  { href: '/resoconto',  label: 'Resoconti',  icon: BookOpen   },
  { href: '/diario',     label: 'Diario',     icon: BookMarked },
]

export function isActive(href: string, path: string) {
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
    getUserSettingsCached()
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

export function ProfileAvatar({ size = 32, iconSize = 16 }: { size?: number; iconSize?: number }) {
  const path = usePathname()
  const { user, faceUrl } = useAvatar()
  const initials = (user?.user_metadata?.display_name as string | undefined ?? user?.email ?? '?')[0].toUpperCase()
  const active = isActive('/profilo', path)

  return (
    <Link
      href="/profilo"
      className={`flex items-center justify-center rounded-full border-2 overflow-hidden shrink-0 transition-all ${
        active ? 'border-forest-500' : 'border-stone-200 hover:border-forest-400'
      }`}
      style={{ width: size, height: size }}
      title="Profilo"
    >
      {faceUrl
        ? <img src={faceUrl} alt="Profilo" className="w-full h-full object-cover" />
        : user
          ? <span className="w-full h-full flex items-center justify-center bg-forest-600 text-white text-xs font-bold">{initials}</span>
          : <User style={{ width: iconSize, height: iconSize }} className="text-stone-400" />
      }
    </Link>
  )
}

// Altezza riservata dalla MobileTopBar fissa in alto — le pagine "normali" (non a schermo
// intero) applicano questa classe al loro contenitore per non finire sotto la barra.
// Un'unica costante per restare "uniformi" (punto 4): cambiarla qui la cambia ovunque.
export const MOBILE_TOPBAR_SPACER = 'pt-[calc(env(safe-area-inset-top,0px)+60px)] md:pt-0'

// ── Desktop top bar ──────────────────────────────────────────────────────────

function DesktopNav() {
  const path = usePathname()

  return (
    <nav className="hidden md:block sticky top-0 z-50 bg-white/90 backdrop-blur-sm border-b border-stone-200 shadow-sm">
      <div className="max-w-[1400px] mx-auto px-4 flex items-center justify-between h-14">
        <Link href="/guida" className="flex items-center gap-2 group shrink-0">
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
          <ProfileAvatar />
        </div>
      </div>
    </nav>
  )
}

// ── Mobile: barra unica in alto, discreta, coerente con HubNavBar ───────────────
// Sostituisce la vecchia tab bar flottante in basso (punto 4): stessa forma a pillola +
// avatar di HubNavBar (Bacheca/Guida/Resoconto/Diario), ma fissa in cima e più compatta,
// così ogni sezione dell'app condivide la stessa barra invece di due stili diversi.

function MobileTopBar() {
  const path = usePathname()
  return (
    <nav
      className="md:hidden fixed z-40 inset-x-0 top-0 flex items-center gap-2 px-3"
      style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)', paddingBottom: 8 }}
    >
      <div className="flex-1 flex items-center justify-around bg-forest-900/95 backdrop-blur-md rounded-full px-1.5 py-1 shadow-[0_4px_16px_rgba(0,0,0,0.2)]">
        {NAV_LINKS.map(({ href, label, icon: Icon }) => {
          const active = isActive(href, path)
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-2xl transition-colors ${
                active ? 'text-white' : 'text-forest-300'
              }`}
            >
              <Icon className="w-4 h-4" strokeWidth={2} />
              <span className="text-[9px] font-bold leading-none">{label}</span>
            </Link>
          )
        })}
      </div>
      <div className="shrink-0 bg-forest-900/95 backdrop-blur-md rounded-full p-1 shadow-[0_4px_16px_rgba(0,0,0,0.2)]">
        <ProfileAvatar size={32} iconSize={14} />
      </div>
    </nav>
  )
}

// ── Navbar ─────────────────────────────────────────────────────────────────────

export default function Navbar() {
  return (
    <>
      <DesktopNav />
      <MobileTopBar />
    </>
  )
}
