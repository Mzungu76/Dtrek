'use client'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { CalendarDays, BookOpen, ArrowDownToLine, LogOut, Settings, User, UploadCloud } from 'lucide-react'
import { getProfile, saveProfile } from '@/lib/userProfile'
import { getBrowserSupabase } from '@/lib/supabaseBrowser'
import { lsClearAll } from '@/lib/localStore'
import type { User as SupabaseUser, Session, AuthChangeEvent } from '@supabase/supabase-js'

// ── Context detection ─────────────────────────────────────────────────────────

function useNavContext(path: string): 'plan' | 'diary' {
  if (
    path.startsWith('/pianificazione') ||
    path.startsWith('/guida/') ||
    path.startsWith('/transizione/')
  ) return 'plan'
  return 'diary'
}

// ── Install button ─────────────────────────────────────────────────────────────

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function InstallButton({ compact = false }: { compact?: boolean }) {
  const [prompt, setPrompt]       = useState<BeforeInstallPromptEvent | null>(null)
  const [isIOS, setIsIOS]         = useState(false)
  const [installed, setInstalled] = useState(false)
  const [showIOSHint, setShowIOSHint] = useState(false)

  useEffect(() => {
    if (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone: boolean }).standalone === true
    ) { setInstalled(true); return }

    const ua = navigator.userAgent.toLowerCase()
    if (/iphone|ipad|ipod/.test(ua) && !(window as unknown as { MSStream: unknown }).MSStream) setIsIOS(true)

    const handler = (e: Event) => { e.preventDefault(); setPrompt(e as BeforeInstallPromptEvent) }
    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', () => { setInstalled(true); setPrompt(null as BeforeInstallPromptEvent | null) })
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleClick = async () => {
    if (isIOS) { setShowIOSHint((v: boolean) => !v); return }
    if (!prompt) return
    await prompt.prompt()
    const { outcome } = await prompt.userChoice
    if (outcome === 'accepted') setInstalled(true)
    setPrompt(null)
  }

  if (installed || (!prompt && !isIOS)) return null

  return (
    <div className="relative">
      <button
        onClick={handleClick}
        title="Installa l'app"
        className={
          compact
            ? 'flex items-center justify-center w-9 h-9 rounded-xl bg-forest-50 border border-forest-200 text-forest-600 hover:bg-forest-100 transition-colors'
            : 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-forest-600 bg-forest-50 border border-forest-200 hover:bg-forest-100 transition-colors'
        }
      >
        <ArrowDownToLine className="w-4 h-4 shrink-0" />
        {!compact && <span>Installa</span>}
      </button>
      {showIOSHint && (
        <div className="absolute right-0 top-12 w-64 bg-stone-900 text-white text-xs rounded-xl p-3 shadow-2xl z-50">
          <p className="font-semibold mb-1">Aggiungi alla Home Screen</p>
          <p className="text-stone-300 leading-snug">
            Tocca <strong>Condividi ⬆️</strong> in Safari, poi seleziona <strong>&quot;Aggiungi a Home&quot;</strong>.
          </p>
          <div className="absolute -top-1.5 right-4 w-3 h-3 bg-stone-900 rotate-45" />
        </div>
      )}
    </div>
  )
}

// ── User menu ──────────────────────────────────────────────────────────────────

function UserMenu({ user }: { user: SupabaseUser }) {
  const router  = useRouter()
  const [open, setOpen]       = useState(false)
  const [faceUrl, setFaceUrl] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const local = getProfile().hikerFaceDataUrl
    if (local) setFaceUrl(local)
    fetch('/api/user-settings')
      .then(r => r.json())
      .then(d => {
        if (d.hikerFaceDataUrl) {
          setFaceUrl(d.hikerFaceDataUrl)
          saveProfile({ hikerFaceDataUrl: d.hikerFaceDataUrl })
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  async function handleLogout() {
    setOpen(false)
    await getBrowserSupabase().auth.signOut()
    await lsClearAll()
    router.push('/login')
    router.refresh()
  }

  const displayName = user.user_metadata?.display_name as string | undefined
  const initials    = (displayName ?? user.email ?? '?')[0].toUpperCase()

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center justify-center w-8 h-8 rounded-full overflow-hidden border-2 border-stone-200 hover:border-forest-400 transition-all focus:outline-none"
        title={displayName ?? user.email}
      >
        {faceUrl
          ? <img src={faceUrl} alt="Profilo" className="w-full h-full object-cover" />
          : <span className="w-full h-full flex items-center justify-center bg-forest-600 text-white text-xs font-bold">{initials}</span>
        }
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-52 bg-white rounded-xl border border-stone-200 shadow-lg z-50 py-1 overflow-hidden">
          <div className="px-3 py-2.5 border-b border-stone-100">
            <p className="text-xs font-semibold text-stone-800 truncate">{displayName ?? 'Utente'}</p>
            <p className="text-xs text-stone-400 truncate mt-0.5">{user.email}</p>
          </div>
          <Link
            href="/profilo"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 text-sm text-stone-700 hover:bg-stone-50 transition-colors"
          >
            <Settings className="w-4 h-4 text-stone-400" />
            Impostazioni profilo
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Esci
          </button>
        </div>
      )}
    </div>
  )
}

// ── Navbar ─────────────────────────────────────────────────────────────────────

export default function Navbar() {
  const path = usePathname()
  const ctx  = useNavContext(path)
  const [user, setUser] = useState<SupabaseUser | null>(null)

  useEffect(() => {
    const supabase = getBrowserSupabase()
    supabase.auth.getUser().then(({ data }: { data: { user: SupabaseUser | null } }) => setUser(data.user))
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => setUser(session?.user ?? null)
    )
    return () => subscription.unsubscribe()
  }, [])

  const isPlanifica = path === '/pianificazione' || path.startsWith('/pianificazione/')
  const isDiario    = path === '/diario' || path.startsWith('/diario/')

  const fabColor = ctx === 'plan' ? '#1C5F8A' : '#2d5c38'
  const fabHover = ctx === 'plan' ? '#0D3B5E' : '#1a3320'

  return (
    <>
      {/* ── Desktop top bar ──────────────────────────────────────────── */}
      <nav className="hidden md:block sticky top-0 z-50 bg-white/90 backdrop-blur-sm border-b border-stone-200 shadow-sm">
        <div className="max-w-[1400px] mx-auto px-4 flex items-center justify-between h-14">
          <Link href="/pianificazione" className="flex items-center gap-2 group shrink-0">
            <Image src="/icon-192.png" alt="DTrek" width={28} height={28} className="rounded-md" />
            <span className="font-display font-semibold text-lg text-stone-800 tracking-tight">
              DTrek
            </span>
          </Link>

          <div className="flex items-center gap-1">
            <Link
              href="/pianificazione"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                isPlanifica
                  ? 'text-white'
                  : 'text-stone-500 hover:text-stone-800 hover:bg-stone-100'
              }`}
              style={isPlanifica ? { background: '#1C5F8A' } : {}}
            >
              <CalendarDays className="w-4 h-4" />
              <span>Pianifica</span>
            </Link>
            <Link
              href="/diario"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                isDiario
                  ? 'text-white'
                  : 'text-stone-500 hover:text-stone-800 hover:bg-stone-100'
              }`}
              style={isDiario ? { background: '#2d5c38' } : {}}
            >
              <BookOpen className="w-4 h-4" />
              <span>Diario</span>
            </Link>
            <div className="w-px h-5 bg-stone-200 mx-1" />
            <Link
              href="/upload"
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-semibold text-white shadow-sm transition-all"
              style={{ background: fabColor }}
            >
              <UploadCloud className="w-4 h-4" />
              <span>Carica GPS</span>
            </Link>
            <div className="w-px h-5 bg-stone-200 mx-1" />
            <InstallButton />
            {user ? (
              <UserMenu user={user} />
            ) : (
              <Link href="/profilo" className="flex items-center justify-center w-8 h-8 rounded-full border-2 border-stone-200 hover:border-amber-300 transition-all">
                <User className="w-4 h-4 text-stone-400" />
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* ── Mobile bottom tab bar (3 items + FAB) ───────────────────── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-t border-stone-200 shadow-[0_-1px_8px_rgba(0,0,0,0.08)]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex items-stretch h-[60px]">

          {/* Pianifica */}
          <Link
            href="/pianificazione"
            className="flex-1 flex flex-col items-center justify-center gap-0.5 relative transition-colors"
            style={{ color: isPlanifica ? '#1C5F8A' : '#a9a18e' }}
          >
            {isPlanifica && (
              <span
                className="absolute top-0 left-1/2 -translate-x-1/2 w-8 rounded-b-full"
                style={{ height: '3px', background: '#1C5F8A' }}
              />
            )}
            <CalendarDays className="w-5 h-5 shrink-0" />
            <span className="text-[9px] font-medium leading-none">Pianifica</span>
          </Link>

          {/* FAB centrale */}
          <div className="flex-1 flex items-center justify-center">
            <Link
              href="/upload"
              className="w-[46px] h-[46px] rounded-full flex items-center justify-center transition-colors"
              style={{
                background: fabColor,
                marginTop: '-18px',
                boxShadow: '0 4px 18px rgba(0,0,0,0.30)',
              }}
              aria-label="Carica traccia GPS"
              onMouseOver={e => { (e.currentTarget as HTMLElement).style.background = fabHover }}
              onMouseOut={e => { (e.currentTarget as HTMLElement).style.background = fabColor }}
            >
              <UploadCloud className="w-5 h-5 text-white" />
            </Link>
          </div>

          {/* Diario */}
          <Link
            href="/diario"
            className="flex-1 flex flex-col items-center justify-center gap-0.5 relative transition-colors"
            style={{ color: isDiario ? '#2d5c38' : '#a9a18e' }}
          >
            {isDiario && (
              <span
                className="absolute top-0 left-1/2 -translate-x-1/2 w-8 rounded-b-full"
                style={{ height: '3px', background: '#4a9e5c' }}
              />
            )}
            <BookOpen className="w-5 h-5 shrink-0" />
            <span className="text-[9px] font-medium leading-none">Diario</span>
          </Link>

        </div>
      </nav>
    </>
  )
}
