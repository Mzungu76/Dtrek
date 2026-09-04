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

// Diari non è una voce come le altre: disco terracotta sollevato sopra il filo della barra
// (mockup approvato dall'utente), sempre acceso indipendentemente dalla sezione attiva — è il
// "torna a casa", non una sezione tra le altre. Icona Notebook (mai BookMarked: scelta esplicita
// dell'utente dopo revisione delle icone candidate). Niente più alone a tinta piatta attorno al
// disco: la separazione dalla barra è un vero ritaglio nello sfondo della barra (vedi
// DIARI_NOTCH_MASK sotto) — qui resta solo un'ombra morbida per dare rilievo al disco.
//
// Terzo tentativo di centraggio, e stavolta per costruzione, non per misura (i primi due — un 50%
// fisso, poi una misura via ref/getBoundingClientRect — restavano comunque fuori centro: il
// disco era il 3° di 5 elementi in un `justify-around`, la cui posizione dipende da quanto
// "pesano" le voci intorno; l'avatar Profilo non pesa come un'icona piatta, quindi quel 3°
// elemento non cade MAI esattamente al centro, quale che sia il metodo per leggerne la posizione).
// Qui il disco esce del tutto dalla fila a 5: è un <Link> a sé, `position:absolute; left:50%`
// rispetto all'intera barra — il centro è la metà esatta dello schermo, non il punto in cui la
// riga decide di metterlo. Le altre 4 voci (vedi MobileBottomBar) si dividono in due metà
// indipendenti (2 a sinistra, 2 a destra) con uno spazio vuoto riservato in mezzo, così il loro
// peso relativo smette di contare.
//
// Icona e testo restano un solo blocco (flex-col con gap, non più separati con un segnaposto
// invisibile come nel tentativo precedente): il testo non può più disallinearsi dal disco perché
// non dipende da nessun'altra misura — l'unico numero scelto a mano è RAISE_PX (quanto il disco
// sporge sopra il filo della barra), tarato una volta sola perché l'etichetta "Diari" cada alla
// stessa altezza delle altre 4 (che usano `leading-none`: l'altezza di riga del testo è sempre
// esattamente la dimensione del font, indipendente dal webfont caricato — nessun ricalcolo
// necessario, a differenza della larghezza).
const RAISED_CIRCLE_SIZE = 60
const RAISE_PX = 17 // bordo superiore del disco, px sopra il filo della barra — vedi conto sopra

function RaisedDiariButton({ href, label, icon: Icon }: (typeof NAV_LINKS)[number]) {
  return (
    <Link
      href={href}
      className="absolute left-1/2 flex -translate-x-1/2 flex-col items-center gap-1.5"
      style={{ top: -RAISE_PX }}
    >
      <span
        className="flex items-center justify-center rounded-full bg-botanico-accent text-botanico-bar-active"
        style={{ width: RAISED_CIRCLE_SIZE, height: RAISED_CIRCLE_SIZE, boxShadow: '0 10px 20px -6px rgba(192,96,61,0.55)' }}
      >
        <Icon className="w-7 h-7" strokeWidth={2} />
      </span>
      <span className="text-[11px] font-bold leading-none text-botanico-bar-active">{label}</span>
    </Link>
  )
}

// Ritaglio circolare nello sfondo della barra, in corrispondenza del disco Diari: un vero foro
// nel pannello colorato lascia vedere il contenuto reale che scorre dietro alla barra fissa,
// invece di indovinare un colore che imiti "quello che c'è sotto" (fragile, sbagliato appena lo
// sfondo pagina cambia). Raggio = metà disco + 5px di margine.
// Posizione: un valore CSS fisso, non più letto a runtime con getBoundingClientRect — dato che il
// disco è sempre esattamente al 50% orizzontale (vedi RaisedDiariButton sopra), il foro può
// centrarsi sullo stesso 50% senza doverlo rincorrere. Elimina anche il bug del ricalcolo dopo il
// caricamento dei font: qui non c'è più nulla da ricalcolare.
const NOTCH_MARGIN = 5
const NOTCH_RADIUS = RAISED_CIRCLE_SIZE / 2 + NOTCH_MARGIN
const NOTCH_CENTER_Y = RAISED_CIRCLE_SIZE / 2 - RAISE_PX
const DIARI_NOTCH_MASK = `radial-gradient(circle ${NOTCH_RADIUS}px at 50% ${NOTCH_CENTER_Y}px, transparent 0 ${NOTCH_RADIUS}px, #000 ${NOTCH_RADIUS + 1}px)`

// ── Mobile: barra unica in fondo ─────────────────────────────────────────────────
// Cinque voci raggiungibili col pollice: Mete, Navigator, Diari, Statistiche, Profilo — Diari è
// il bottone sollevato RaisedDiariButton, `position:absolute` e SEPARATO dalla fila delle altre
// quattro (vedi il commento lì sopra per il perché). Le altre 4 si dividono in due metà
// (`others.slice(0,2)` a sinistra, `others.slice(2)` + ProfileAvatar a destra) con un
// `<div className="w-16" />` vuoto in mezzo che riserva lo spazio sotto al disco, così non ci
// finiscono sotto. NAV_LINKS resta nell'ordine canonico (Diari, Mete, Navigator, Statistiche) per
// DesktopNav/MobileNavBar, che non adottano questo trattamento: solo qui Diari viene tolto dalla
// fila e ricollocato al centro.
// Non riusa <MobileNavBar/> (quella resta la pillola in alto delle pagine "magazine"
// Guide/Resoconto, invariata — components/routehub/HubNavBar.tsx): stesse voci (NAV_LINKS),
// diversa cornice, per non toccare quelle pagine finché non vengono ridisegnate.
// Sfondo e contenuto sono due livelli separati: solo il primo porta il ritaglio
// (DIARI_NOTCH_MASK), il secondo — icone, etichette, il disco stesso — resta sopra, intatto, per
// non essere anch'esso "bucato" dalla maschera. Niente backdrop-blur sul primo livello: sfocava
// anche il contenuto visto attraverso il foro invece di mostrarlo nitido.
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
      className="md:hidden fixed z-40 inset-x-0 bottom-0"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div
        className="absolute inset-0 bg-botanico-bar/95 shadow-[0_-2px_12px_rgba(0,0,0,0.18)]"
        style={{ maskImage: DIARI_NOTCH_MASK, WebkitMaskImage: DIARI_NOTCH_MASK }}
      />
      <div className="relative flex items-center h-20 px-2">
        <div className="flex flex-1 items-center justify-evenly">
          {others.slice(0, 2).map(renderFlat)}
        </div>
        <div className="w-16 flex-none" aria-hidden />
        <div className="flex flex-1 items-center justify-evenly">
          {others.slice(2).map(renderFlat)}
          <ProfileAvatar size={26} iconSize={13} label="Profilo" labelClassName="px-3 py-2 rounded-2xl" labelTextClassName="text-[11px]" />
        </div>
      </div>
      <RaisedDiariButton key={diari.href} {...diari} />
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
