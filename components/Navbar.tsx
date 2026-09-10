'use client'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Library, Compass, Navigation2, CircleUser } from 'lucide-react'
import { getProfile } from '@/lib/userProfile'
import { getBrowserSupabase } from '@/lib/supabaseBrowser'
import { getUserSettingsCached } from '@/lib/sync/userSettingsStore'
import GemStatusBadge from '@/components/premium/GemStatusBadge'
import type { User as SupabaseUser, Session, AuthChangeEvent } from '@supabase/supabase-js'

// Menù inferiore — quattro voci fisse: Libreria, Atlante, Navigator, Profilo
// (docs/libreria-atlante-piano.md, Fase 1). Sostituisce le cinque voci precedenti
// (Diari/Mete/Navigator/Statistiche/Profilo): "Mete" sparisce come voce autonoma — cercare è
// quello che si fa dentro l'Atlante, non una sezione a sé — e Statistiche confluisce nel Diario
// (la sezione aggregata di app/diari/[id]/page.tsx), dove stanno i dati che riassume. "Diari"
// diventa "Libreria": non più lo scaffale-griglia ma la copertina del Diario in uso, con lo
// scaffale sempre in testata (vedi app/diari/page.tsx). URL tecnici invariati (/diari, /percorsi
// resta dietro le quinte per /atlante). "Profilo" non è in questa lista: resta <ProfileAvatar/>,
// montato come quinta voce della barra (vedi DesktopNav/MobileBottomBar).
export const NAV_LINKS = [
  { href: '/diari',       label: 'Libreria',    icon: Library     },
  { href: '/atlante',     label: 'Atlante',     icon: Compass     },
  { href: '/navigatore',  label: 'Navigator',   icon: Navigation2 },
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
//
// Fase 2 del riordino UI/UX (docs/diario-valutazione-ux-piano.md): default alzati da 32/16 a
// 40/18 — il caso senza `label` (solo DesktopNav, ora l'unico) è l'ultimo elemento della sua riga,
// isolato, quindi il bersaglio può crescere senza rischio di sovrapporsi a un controllo vicino.
// I chiamanti con `label` (MobileNavBar, MobileBottomBar — Fase 4) passano le proprie taglie più
// piccole esplicitamente, dove lo spazio condiviso con le altre voci della barra è più stretto.
export function ProfileAvatar({ size = 40, iconSize = 18, label, labelClassName = '', labelTextClassName = 'text-xs' }: { size?: number; iconSize?: number; label?: string; labelClassName?: string; labelTextClassName?: string }) {
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
          {/* Fase 2 del riordino UI/UX: py-1.5→py-2 — un rialzo leggero, non i 44px pieni: questa
              barra vive solo da md: in su (tablet incluso, dove il tocco è comunque frequente),
              ma l'audit non ha verifica visiva su schermo per quella fascia (docs/diario-
              valutazione-ux-piano.md), quindi qui si resta conservativi. */}
          {NAV_LINKS.map(({ href, label, icon: Icon }) => {
            const active = isActive(href, path)
            const className = `flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
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
        {/* Fase 2 del riordino UI/UX (docs/diario-valutazione-ux-piano.md): icone 16px e avatar
            20px — le più piccole di tutta l'app — alzate a 20px/22px con più padding verticale,
            per un bersaglio reale vicino ai 44px pur restando dentro i 56px della barra (h-14).
            Questa è la barra montata dalle pagine Guida/Resoconto a schermo intero
            (HubNavBar) — proprio dove capita di doverla toccare camminando. */}
        <div className="flex-1 flex items-center justify-around">
          {NAV_LINKS.map(({ href, label, icon: Icon }) => {
            const active = isActive(href, path)
            const linkClassName = `flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-2xl transition-colors ${
              active ? 'text-botanico-bar-active' : 'text-botanico-bar-inactive'
            }`
            return (
              <Link key={href} href={href} className={linkClassName}>
                <Icon className="w-5 h-5" strokeWidth={2} />
                <span className="text-xs font-bold leading-none">{label}</span>
              </Link>
            )
          })}
          <ProfileAvatar size={22} iconSize={12} label="Profilo" labelClassName="px-2.5 py-1.5 rounded-2xl" labelTextClassName="text-xs" />
        </div>
      </div>
    </nav>
  )
}

// Fase 4 del riordino UI/UX (docs/diario-valutazione-ux-piano.md): barra piatta a 4 voci — fine
// del disco sollevato per Libreria (RaisedDiariButton), del ritaglio circolare nello sfondo
// (DIARI_NOTCH_MASK) e dell'avatar Profilo flottante in un angolo a sé (FloatingProfileAvatar).
// Erano il quarto trattamento diverso provato per questa barra (pillola sempre accesa → bottone a
// sinistra → bottone centrato con ritaglio → barra piatta a 5 voci → disco sollevato): non un
// errore di questo giro, un disegno scelto e rifatto più volte — ma il risultato, verificato ora
// contro l'intera navigazione dell'app (docs/diario-valutazione-ux-piano.md §3.4), era comunque
// una terza forma di barra diversa da MobileNavBar/DesktopNav, con Profilo mai nello stesso posto
// due pagine di fila. Le quattro voci (Libreria, Atlante, Navigator, Profilo) hanno ora lo stesso
// trattamento — nessuna "sollevata" più delle altre — coerente con MobileNavBar qui sotto, che già
// tratta Profilo come quarta voce della barra invece che come icona a sé.
function MobileBottomBar() {
  const path = usePathname()

  const renderFlat = ({ href, label, icon: Icon }: (typeof NAV_LINKS)[number]) => {
    const active = isActive(href, path)
    const className = `flex flex-col items-center gap-1.5 px-3 py-2 rounded-2xl transition-colors ${
      active ? 'text-botanico-bar-active' : 'text-botanico-bar-inactive'
    }`
    return (
      <Link key={href} href={href} className={className}>
        <Icon className="w-6 h-6" strokeWidth={2} />
        <span className="text-xs font-bold leading-none">{label}</span>
      </Link>
    )
  }

  return (
    <nav
      className="md:hidden fixed z-40 inset-x-0 bottom-0 bg-botanico-bar shadow-[0_-2px_12px_rgba(0,0,0,0.18)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex items-center justify-around h-20 px-2">
        {NAV_LINKS.map(renderFlat)}
        <ProfileAvatar size={24} iconSize={14} label="Profilo" labelClassName="px-3 py-2 rounded-2xl" labelTextClassName="text-xs" />
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
