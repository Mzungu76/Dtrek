'use client'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Compass, BookMarked, PenLine, Plus, User } from 'lucide-react'
import { getProfile } from '@/lib/userProfile'
import { getBrowserSupabase } from '@/lib/supabaseBrowser'
import { getUserSettingsCached } from '@/lib/sync/userSettingsStore'
import GemStatusBadge from '@/components/premium/GemStatusBadge'
import NuovoDiarioSheet from '@/components/nuovo/NuovoDiarioSheet'
import type { User as SupabaseUser, Session, AuthChangeEvent } from '@supabase/supabase-js'

// Redesign menù globale (fase 1-3) — Diario > Percorsi > Reportage è ora la gerarchia reale
// dell'app (un Diario contiene Percorsi, un Percorso contiene i suoi Reportage): questa barra
// resta comunque piatta/trasversale, non annidata — ogni voce porta all'elenco "tutti i ..." di
// quella categoria su tutti i Diari, non dentro uno specifico. "Reportage" punta a /reportage
// (fase 2, app/reportage/page.tsx + app/api/reportage/route.ts), gemella di "Tutti i Percorsi".
// "Nuovo" non è un <Link> come le altre tre voci (vedi DesktopNav/MobileBottomBar sotto): apre
// NuovoDiarioSheet, che chiede sempre il Diario di destinazione — tab contestuale alla sezione
// attiva (nuovoTabFor), mai un default automatico silenzioso.
export const NAV_LINKS = [
  { href: '/diari',      label: 'Diario',     icon: BookMarked },
  { href: '/percorsi',   label: 'Percorsi',   icon: Compass    },
  { href: '/reportage',  label: 'Reportage',  icon: PenLine    },
  { href: '/upload',     label: 'Nuovo',      icon: Plus       },
]

// Confine di segmento esplicito (non solo startsWith): da quando "Percorsi" punta a /percorsi,
// un semplice startsWith avrebbe acceso il tab anche su /percorsi-per-te, rotta distinta.
export function isActive(href: string, path: string) {
  return href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`)
}

// "Nuovo" (fase 3) — contestuale alla sezione attiva: dentro Percorsi crea un percorso da
// pianificare (tab=gpx), ovunque altrove crea un Reportage/Resoconto (tab=activity, il default di
// app/upload/page.tsx). Stesso confine di segmento di isActive, per lo stesso motivo.
function nuovoTabFor(path: string): 'activity' | 'gpx' {
  return path === '/percorsi' || path.startsWith('/percorsi/') ? 'gpx' : 'activity'
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

// Altezza riservata dalla MobileBottomBar fissa in fondo — le pagine "normali" (non a schermo
// intero) applicano questa classe al loro contenitore per non finire sotto la barra. Un'unica
// costante per restare "uniformi": cambiarla qui la cambia ovunque. 64px di contenuto (h-16) +
// safe-area-bottom, stesso principio di BOTTOM_BAR_SPACER in components/libro/BookPage.tsx.
export const MOBILE_BOTTOMBAR_SPACER = 'pb-[calc(env(safe-area-inset-bottom,0px)+64px)] md:pb-0'

// ── Desktop top bar ──────────────────────────────────────────────────────────

function DesktopNav() {
  const path = usePathname()
  const [nuovoOpen, setNuovoOpen] = useState(false)

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
            const className = `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              active ? 'bg-forest-50 text-forest-700' : 'text-stone-500 hover:text-stone-800 hover:bg-stone-100'
            }`
            if (href === '/upload') {
              return (
                <button key={href} type="button" onClick={() => setNuovoOpen(true)} className={className}>
                  <Icon className="w-4 h-4" />
                  <span>{label}</span>
                </button>
              )
            }
            return (
              <Link key={href} href={href} className={className}>
                <Icon className="w-4 h-4" />
                <span>{label}</span>
              </Link>
            )
          })}
          <div className="w-px h-5 bg-stone-200 mx-1" />
          <ProfileAvatar />
        </div>
      </div>
      <NuovoDiarioSheet open={nuovoOpen} onClose={() => setNuovoOpen(false)} tab={nuovoTabFor(path)} />
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
  const [nuovoOpen, setNuovoOpen] = useState(false)
  return (
    <nav
      className={`pointer-events-auto bg-forest-600/95 backdrop-blur-md shadow-[0_2px_12px_rgba(0,0,0,0.18)] ${className}`}
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="flex items-center gap-1 px-3 h-14">
        <div className="flex-1 flex items-center justify-around">
          {NAV_LINKS.map(({ href, label, icon: Icon }) => {
            const active = isActive(href, path)
            const linkClassName = `flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-2xl transition-colors ${
              active ? 'text-white' : 'text-forest-300'
            }`
            if (href === '/upload') {
              return (
                <button key={href} type="button" onClick={() => setNuovoOpen(true)} className={linkClassName}>
                  <Icon className="w-4 h-4" strokeWidth={2} />
                  <span className="text-[9px] font-bold leading-none">{label}</span>
                </button>
              )
            }
            return (
              <Link key={href} href={href} className={linkClassName}>
                <Icon className="w-4 h-4" strokeWidth={2} />
                <span className="text-[9px] font-bold leading-none">{label}</span>
              </Link>
            )
          })}
        </div>
        <ProfileAvatar size={32} iconSize={14} />
      </div>
      <NuovoDiarioSheet open={nuovoOpen} onClose={() => setNuovoOpen(false)} tab={nuovoTabFor(path)} />
    </nav>
  )
}

// ── Mobile: barra unica in fondo (redesign fase 1) ──────────────────────────────
// Sposta la navigazione principale in basso, raggiungibile col pollice — l'avatar Profilo non ci
// vive più dentro (era l'unico modo per raggiungere Profilo su mobile, ora un'icona a sé,
// FloatingProfileAvatar sotto): 4 voci pari, nessuna eccezione di forma per l'ultima.
// Non riusa <MobileNavBar/> (quella resta la pillola in alto delle pagine "magazine"
// Guide/Resoconto, invariata — components/routehub/HubNavBar.tsx): stesse voci (NAV_LINKS),
// diversa cornice, per non toccare quelle pagine finché non vengono ridisegnate.
function MobileBottomBar() {
  const path = usePathname()
  const [nuovoOpen, setNuovoOpen] = useState(false)
  return (
    <nav
      className="md:hidden fixed z-40 inset-x-0 bottom-0 bg-forest-600/95 backdrop-blur-md shadow-[0_-2px_12px_rgba(0,0,0,0.18)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex items-center justify-around h-16 px-2">
        {NAV_LINKS.map(({ href, label, icon: Icon }) => {
          const active = isActive(href, path)
          const className = `flex flex-col items-center gap-1 px-3 py-1.5 rounded-2xl transition-colors ${
            active ? 'text-white' : 'text-forest-300'
          }`
          if (href === '/upload') {
            return (
              <button key={href} type="button" onClick={() => setNuovoOpen(true)} className={className}>
                <Icon className="w-5 h-5" strokeWidth={2} />
                <span className="text-[10px] font-bold leading-none">{label}</span>
              </button>
            )
          }
          return (
            <Link key={href} href={href} className={className}>
              <Icon className="w-5 h-5" strokeWidth={2} />
              <span className="text-[10px] font-bold leading-none">{label}</span>
            </Link>
          )
        })}
      </div>
      <NuovoDiarioSheet open={nuovoOpen} onClose={() => setNuovoOpen(false)} tab={nuovoTabFor(path)} />
    </nav>
  )
}

// Profilo non è più una voce della barra (resta un'icona a parte, come sull'avatar desktop) —
// fluttuante invece che incassata in una barra fissa in alto, perché quella barra non esiste
// più su mobile: stesso <ProfileAvatar/> di sempre, solo montato qui invece che dentro
// MobileTopBar. Sopra la MobileBottomBar (z-40) ma non ci si sovrappone: angoli opposti.
function FloatingProfileAvatar() {
  return (
    <div
      className="md:hidden fixed z-40 right-4 rounded-full bg-white/90 backdrop-blur-sm shadow-[0_2px_8px_rgba(0,0,0,0.18)] p-0.5"
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
    >
      <ProfileAvatar size={36} iconSize={16} />
    </div>
  )
}

// ── Navbar ─────────────────────────────────────────────────────────────────────

export default function Navbar() {
  return (
    <>
      <DesktopNav />
      <MobileBottomBar />
      <FloatingProfileAvatar />
    </>
  )
}
