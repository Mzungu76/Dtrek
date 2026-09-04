'use client'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { MapPinned, Notebook, Navigation2, Activity, CircleUser } from 'lucide-react'
import { getProfile } from '@/lib/userProfile'
import { getBrowserSupabase } from '@/lib/supabaseBrowser'
import { getUserSettingsCached } from '@/lib/sync/userSettingsStore'
import GemStatusBadge from '@/components/premium/GemStatusBadge'
import type { User as SupabaseUser, Session, AuthChangeEvent } from '@supabase/supabase-js'

// Menù inferiore (richiesta esplicita dell'utente, revisione struttura app): cinque voci fisse —
// Diari, Mete, Navigator, Statistiche, Profilo — un <Link> ciascuna, niente più azione "Nuovo"
// incassata nella barra (era qui prima, apriva NuovoDiarioSheet: la creazione di un Reportage/Meta
// resta raggiungibile dai punti di ingresso dentro le rispettive pagine, es. il FAB in /diari).
// Diario > Reportage e Mete restano due alberi paralleli, non più annidati — un Diario contiene
// solo i Reportage delle uscite già fatte; una Meta (ex "Percorso", stesso record planned_hikes,
// solo rinominato in UI) resta senza Diario finché non viene camminata. La voce "Mete" punta ancora
// a /percorsi (URL tecnico invariato, solo l'etichetta cambia). "Profilo" non è in questa lista:
// resta <ProfileAvatar/>, montato come quinta voce della barra (vedi DesktopNav/MobileBottomBar).
// Icone scelte dopo revisione mockup (vedi conversazione): Notebook invece di BookMarked (rimanda
// a un taccuino, non a un libro generico), MapPinned invece di MapPin (mappa aperta, non solo uno
// spillo), Activity invece di BarChart3 (linea di andamento, coerente con "Statistiche" come
// attività fisica più che come tabellone). Navigation2 confermata invariata.
export const NAV_LINKS = [
  { href: '/diari',       label: 'Diari',       icon: Notebook    },
  { href: '/percorsi',    label: 'Mete',        icon: MapPinned   },
  { href: '/navigatore',  label: 'Navigator',   icon: Navigation2 },
  { href: '/statistiche', label: 'Statistiche', icon: Activity    },
]

// Confine di segmento esplicito (non solo startsWith): da quando "Mete" punta a /percorsi, un
// semplice startsWith avrebbe acceso il tab anche su /percorsi-per-te, rotta distinta.
export function isActive(href: string, path: string) {
  return href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`)
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

// Stato Premium/prova (docs/navigator-dtrek-boundary.md) come un piccolo gioiello — GemStatusBadge
// legge da solo /api/dtrek-entitlement e sceglie il colore giusto. Un tap sull'avatar porta a
// /profilo, che mostra lo stato per esteso in cima (SectionAbbonamento).
// `label` opzionale: montata dentro NAV_LINKS-style bar (mobile top/bottom) mostra "Profilo" sotto
// l'avatar, stessa forma (flex-col, testo 9/10px bold) delle altre voci — così Profilo è una voce
// della barra come le altre, non più un'icona fluttuante a sé.
// Il gioiello sull'angolo dell'avatar (dimensione fissa 16px) andava bene sull'avatar grande di
// desktop (size=32) ma su quello piccolo della bottom bar (size=22, richiesto per stare nella
// riga con le altre icone) copriva metà foto/iniziali dell'utente — segnalato dall'utente su build
// reale. Con `label` presente il gioiello si sposta quindi a fianco del testo "Profilo" (fuori
// dall'avatar, dimensione ridotta 10px): resta visibile ma non nasconde più nulla. Senza `label`
// (avatar desktop, dove c'è spazio) resta come prima, incastonato sull'angolo dell'avatar.
export function ProfileAvatar({ size = 32, iconSize = 16, label, labelClassName = '', labelTextClassName = 'text-[10px]' }: { size?: number; iconSize?: number; label?: string; labelClassName?: string; labelTextClassName?: string }) {
  const path = usePathname()
  const { user, faceUrl } = useAvatar()
  const initials = (user?.user_metadata?.display_name as string | undefined ?? user?.email ?? '?')[0].toUpperCase()
  const active = isActive('/profilo', path)

  const avatarCircle = (
    <span
      className={`flex items-center justify-center w-full h-full rounded-full border-2 overflow-hidden transition-all ${
        active ? 'border-botanico-accent' : 'border-stone-200 hover:border-botanico-accent-2'
      }`}
    >
      {faceUrl
        ? <img src={faceUrl} alt="Profilo" className="w-full h-full object-cover" />
        : user
          ? <span className="w-full h-full flex items-center justify-center bg-botanico-accent text-white text-xs font-bold">{initials}</span>
          : <CircleUser style={{ width: iconSize, height: iconSize }} className="text-stone-400" />
      }
    </span>
  )

  if (!label) {
    return (
      <Link href="/profilo" className="relative flex items-center justify-center shrink-0" style={{ width: size, height: size }} title="Profilo">
        {avatarCircle}
        <GemStatusBadge size={16} className="absolute -bottom-1 -right-1" />
      </Link>
    )
  }

  return (
    <Link href="/profilo" className={`flex flex-col items-center gap-1 ${labelClassName}`} title="Profilo">
      <span className="flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
        {avatarCircle}
      </span>
      <span className={`flex items-center gap-1 ${labelTextClassName} font-bold leading-none ${active ? 'text-botanico-bar-active' : 'text-botanico-bar-inactive'}`}>
        {label}
        <GemStatusBadge size={11} />
      </span>
    </Link>
  )
}

// Altezza riservata dalla MobileBottomBar fissa in fondo — le pagine "normali" (non a schermo
// intero) applicano questa classe al loro contenitore per non finire sotto la barra. Un'unica
// costante per restare "uniformi": cambiarla qui la cambia ovunque. 80px di contenuto (h-20,
// alzata da 64px/h-16: icone e testo troppo piccoli, segnalato dall'utente su build reale) +
// safe-area-bottom, stesso principio di BOTTOM_BAR_SPACER in components/libro/BookPage.tsx.
export const MOBILE_BOTTOMBAR_SPACER = 'pb-[calc(env(safe-area-inset-bottom,0px)+80px)] md:pb-0'

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
            const className = `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              active ? 'bg-botanico-accent-tint text-botanico-accent' : 'text-stone-500 hover:text-stone-800 hover:bg-stone-100'
            }`
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
    </nav>
  )
}

// ── Mobile: barra unica in alto, fusa con la status bar del telefono ────────────
// Un'unica fascia edge-to-edge (niente pillola flottante separata dalla status bar, niente
// gap tra le due) — lo sfondo sale a coprire anche safe-area-inset-top, così la barra di
// sistema e quella dell'app appaiono come un'unica superficie continua invece di due elementi
// scollegati. botanico-bar = manifest.json theme_color (#5F7355, direzione "Taccuino Botanico"):
// qui deve combaciare esattamente con lo sfondo che Android/iOS danno alla status bar.
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
      className={`pointer-events-auto bg-botanico-bar/95 backdrop-blur-md shadow-[0_2px_12px_rgba(0,0,0,0.18)] ${className}`}
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="flex items-center gap-1 px-3 h-14">
        <div className="flex-1 flex items-center justify-around">
          {NAV_LINKS.map(({ href, label, icon: Icon }) => {
            const active = isActive(href, path)
            const linkClassName = `flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-2xl transition-colors ${
              active ? 'text-botanico-bar-active' : 'text-botanico-bar-inactive'
            }`
            return (
              <Link key={href} href={href} className={linkClassName}>
                <Icon className="w-4 h-4" strokeWidth={2} />
                <span className="text-[9px] font-bold leading-none">{label}</span>
              </Link>
            )
          })}
          <ProfileAvatar size={20} iconSize={10} label="Profilo" labelClassName="px-2.5 py-1 rounded-2xl" labelTextClassName="text-[9px]" />
        </div>
      </div>
    </nav>
  )
}

// ── Mobile: barra unica in fondo ─────────────────────────────────────────────────
// Tre tentativi di dare rilievo a Diari con un trattamento speciale (pillola sempre accesa,
// bottone sollevato a sinistra, poi centrato con un ritaglio nella barra) sono stati scartati
// dall'utente — l'ultimo, per quanto centrato "per costruzione", risultava comunque brutto e
// asimmetrico nell'insieme reale. Si torna quindi a 5 voci piatte, tutte con lo stesso
// trattamento grafico (icona 24px, etichetta 11px, stessa pillola su tap) — nessuna eccezione di
// forma per nessuna. Diari non è più la prima voce ma l'ultima, prima di Profilo: posizionata
// così di proposito ("dove tende tutto il resto", richiesta esplicita dell'utente) invece che
// come punto di partenza. Ordine risultante: Mete, Navigator, Statistiche, Profilo, Diari.
// NAV_LINKS resta nell'ordine canonico (Diari, Mete, Navigator, Statistiche) per DesktopNav/
// MobileNavBar, che restano invariati: solo qui l'ordine visivo viene ricomposto.
function MobileBottomBar() {
  const path = usePathname()
  const diari = NAV_LINKS.find(l => l.href === '/diari')!
  const others = NAV_LINKS.filter(l => l.href !== '/diari')

  const renderFlat = ({ href, label, icon: Icon }: (typeof NAV_LINKS)[number]) => {
    const active = isActive(href, path)
    const className = `flex flex-col items-center gap-1.5 px-3 py-2 rounded-2xl transition-colors ${
      active ? 'text-botanico-bar-active' : 'text-botanico-bar-inactive'
    }`
    return (
      <Link key={href} href={href} className={className}>
        <Icon className="w-6 h-6" strokeWidth={2} />
        <span className="text-[11px] font-bold leading-none">{label}</span>
      </Link>
    )
  }

  return (
    <nav
      className="md:hidden fixed z-40 inset-x-0 bottom-0 bg-botanico-bar/95 backdrop-blur-md shadow-[0_-2px_12px_rgba(0,0,0,0.18)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex items-center justify-around h-20 px-2">
        {others.map(renderFlat)}
        <ProfileAvatar size={26} iconSize={13} label="Profilo" labelClassName="px-3 py-2 rounded-2xl" labelTextClassName="text-[11px]" />
        {renderFlat(diari)}
      </div>
    </nav>
  )
}

// ── Navbar ─────────────────────────────────────────────────────────────────────

export default function Navbar() {
  return (
    <>
      <DesktopNav />
      <MobileBottomBar />
    </>
  )
}
