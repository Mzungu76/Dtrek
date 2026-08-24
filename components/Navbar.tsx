'use client'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Compass, BookMarked, BookOpen, User } from 'lucide-react'
import { getProfile } from '@/lib/userProfile'
import { getBrowserSupabase } from '@/lib/supabaseBrowser'
import { getUserSettingsCached } from '@/lib/sync/userSettingsStore'
import GemStatusBadge from '@/components/premium/GemStatusBadge'
import type { User as SupabaseUser, Session, AuthChangeEvent } from '@supabase/supabase-js'

// Cutover Fase 7 di docs/diario-fulcro-piano.md — Bacheca è ritirata (i suoi contenuti unici,
// streak/andamento/territorio/curiosità, non sono stati portati altrove: decisione esplicita,
// restano solo nella cronologia git di questo branch se servissero in futuro). Diario è ora
// l'ingresso principale, prima voce della tab bar — "I miei Diari" (app/diari/page.tsx), da cui si
// arriva a ogni Percorso pianificato/vissuto e ai suoi Reportage. Percorsi e Resoconti restano
// come motori riusati dentro un Diario (GuidaHub/ResocontoHub, invariati) ma anche raggiungibili
// qui come tab a sé, per chi vuole lavorare su un percorso senza passare dal Diario che lo contiene.
export const NAV_LINKS = [
  { href: '/diari',      label: 'Diario',     icon: BookMarked },
  { href: '/guida',      label: 'Percorsi',   icon: Compass    },
  { href: '/resoconto',  label: 'Resoconti',  icon: BookOpen   },
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

// Stato Premium/prova (docs/navigator-dtrek-boundary.md) come un piccolo gioiello sull'avatar
// stesso invece di un'icona a sé (non una stella, per non richiamare l'AI) — GemStatusBadge
// legge da solo /api/dtrek-entitlement e sceglie il colore giusto. Un tap sull'avatar porta a
// /profilo, che mostra lo stato per esteso in cima (SectionAbbonamento).
export function ProfileAvatar({ size = 32, iconSize = 16 }: { size?: number; iconSize?: number }) {
  const path = usePathname()
  const { user, faceUrl } = useAvatar()
  const initials = (user?.user_metadata?.display_name as string | undefined ?? user?.email ?? '?')[0].toUpperCase()
  const active = isActive('/profilo', path)

  return (
    <Link
      href="/profilo"
      className="relative flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
      title="Profilo"
    >
      <span
        className={`flex items-center justify-center w-full h-full rounded-full border-2 overflow-hidden transition-all ${
          active ? 'border-forest-500' : 'border-stone-200 hover:border-forest-400'
        }`}
      >
        {faceUrl
          ? <img src={faceUrl} alt="Profilo" className="w-full h-full object-cover" />
          : user
            ? <span className="w-full h-full flex items-center justify-center bg-forest-600 text-white text-xs font-bold">{initials}</span>
            : <User style={{ width: iconSize, height: iconSize }} className="text-stone-400" />
        }
      </span>
      <GemStatusBadge size={16} className="absolute -bottom-1 -right-1" />
    </Link>
  )
}

// Altezza riservata dalla MobileTopBar fissa in alto — le pagine "normali" (non a schermo
// intero) applicano questa classe al loro contenitore per non finire sotto la barra.
// Un'unica costante per restare "uniformi" (punto 4): cambiarla qui la cambia ovunque.
// 56px di contenuto (h-14) sotto la status bar, +16px di margine di sicurezza: un test dal vivo
// ha mostrato il titolo di pagina toccare/nascondersi parzialmente sotto la barra con lo stretto
// necessario (56px) — un po' di respiro in più costa poco ed evita che torni a succedere.
export const MOBILE_TOPBAR_SPACER = 'pt-[calc(env(safe-area-inset-top,0px)+72px)] md:pt-0'

// ── Desktop top bar ──────────────────────────────────────────────────────────

function DesktopNav() {
  const path = usePathname()

  return (
    <nav className="hidden md:block sticky top-0 z-50 bg-white/90 backdrop-blur-sm border-b border-stone-200 shadow-sm">
      <div className="max-w-[1400px] mx-auto px-4 flex items-center justify-between h-14">
        <Link href="/diari" className="flex items-center gap-2 group shrink-0">
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

// ── Mobile: barra unica in alto, fusa con la status bar del telefono ────────────
// Un'unica fascia edge-to-edge (niente pillola flottante separata dalla status bar, niente
// gap tra le due) — lo sfondo sale a coprire anche safe-area-inset-top, così la barra di
// sistema e quella dell'app appaiono come un'unica superficie continua invece di due elementi
// scollegati. forest-600 = manifest.json theme_color (#277134), non forest-900 come il resto
// della UI: qui deve combaciare esattamente con lo sfondo che Android/iOS danno alla status bar.
//
// Esportata (non solo uso interno) perché è la STESSA barra usata dalle pagine "magazine" a
// schermo intero (Guide/Resoconto — components/routehub/HubNavBar.tsx): prima del redesign quelle
// pagine avevano una loro pillola fluttuante indipendente che è finita fuori sincrono con questa.
// Un solo componente, mai due implementazioni che possono divergere di nuovo.
// `pointer-events-auto` è sempre presente perché HubNavBar la monta dentro un antenato
// `pointer-events-none` (l'overlay trasparente sopra la foto/mappa) — innocuo qui, dove
// l'antenato è già interattivo di suo.
export function MobileNavBar({ className = '' }: { className?: string }) {
  const path = usePathname()
  return (
    <nav
      className={`pointer-events-auto bg-forest-600/95 backdrop-blur-md shadow-[0_2px_12px_rgba(0,0,0,0.18)] ${className}`}
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="flex items-center gap-1 px-3 h-14">
        <div className="flex-1 flex items-center justify-around">
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
        <ProfileAvatar size={32} iconSize={14} />
      </div>
    </nav>
  )
}

function MobileTopBar() {
  return <MobileNavBar className="md:hidden fixed z-40 inset-x-0 top-0" />
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
