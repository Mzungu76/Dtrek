'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getProfile, clearProfile } from '@/lib/userProfile'
import { getBrowserSupabase } from '@/lib/supabaseBrowser'
import { lsClearAll } from '@/lib/localStore'
import { getAllActivities } from '@/lib/blobStore'
import { getUserSettingsCached } from '@/lib/sync/userSettingsStore'
import { useCtsUpdated } from '@/lib/sync/useCtsUpdated'
import { flush, hasPendingChanges } from '@/lib/sync/syncEngine'
import { computeStreaks } from '@/lib/stats'
import { computeCurrentBadges } from '@/lib/badges'
import SectionAbbonamento from '@/components/profilo/SectionAbbonamento'
import GemStatusBadge from '@/components/premium/GemStatusBadge'
import { TACCUINO_PAPER, TACCUINO_INK, TACCUINO_ACCENT, TACCUINO_ACCENT_TINT, TaccuinoPaperTexture } from '@/lib/taccuinoTokens'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import {
  BarChart2, Trophy, Mountain, Compass, Settings, Sparkles, ArrowDownToLine,
  Info, LogOut, ChevronRight, User as UserIcon, X,
} from 'lucide-react'

interface Row {
  href?: string
  onClick?: () => void
  icon: React.ReactNode
  iconBg: string
  label: string
  sub: string
  danger?: boolean
}

export default function ProfiloPage() {
  const router = useRouter()
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [faceUrl, setFaceUrl] = useState<string | null>(null)
  const [badgeCount, setBadgeCount] = useState(0)
  const [streakWeeks, setStreakWeeks] = useState(0)
  const [installPrompt, setInstallPrompt] = useState<{ prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> } | null>(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    const supabase = getBrowserSupabase()
    supabase.auth.getUser().then(({ data }: { data: { user: SupabaseUser | null } }) => setUser(data.user))
  }, [])

  useEffect(() => {
    const local = getProfile().hikerFaceDataUrl
    if (local) setFaceUrl(local)
    getUserSettingsCached()
      .then(d => { if (d.hikerFaceDataUrl) setFaceUrl(d.hikerFaceDataUrl) })
      .catch(() => {})
    getAllActivities().then(acts => {
      const streaks = computeStreaks(acts)
      setStreakWeeks(streaks.currentWeeks)
      setBadgeCount(computeCurrentBadges(acts, streaks).length)
    }).catch(() => {})
  }, [])

  useCtsUpdated(() => {
    getAllActivities().then(acts => {
      const streaks = computeStreaks(acts)
      setStreakWeeks(streaks.currentWeeks)
      setBadgeCount(computeCurrentBadges(acts, streaks).length)
    }).catch(() => {})
  })

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true) {
      setInstalled(true)
      return
    }
    const handler = (e: Event) => { e.preventDefault(); setInstallPrompt(e as unknown as { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> }) }
    const installedHandler = () => setInstalled(true)
    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', installedHandler)
    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('appinstalled', installedHandler)
    }
  }, [])

  async function handleInstall() {
    if (!installPrompt) return
    await installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') setInstalled(true)
    setInstallPrompt(null)
  }

  async function handleLogout() {
    if (await hasPendingChanges()) {
      // Best-effort attempt to drain the outbox before wiping local storage — bounded so a
      // logout attempt while offline doesn't hang indefinitely waiting for a flush that can't succeed.
      await Promise.race([flush(), new Promise((r) => setTimeout(r, 3000))])
      if (await hasPendingChanges()) {
        const proceed = window.confirm(
          'Hai modifiche non ancora sincronizzate con il cloud. Uscire comunque? Le modifiche non sincronizzate andranno perse.'
        )
        if (!proceed) return
      }
    }
    await getBrowserSupabase().auth.signOut()
    await lsClearAll()
    clearProfile()
    router.push('/login')
    router.refresh()
  }

  const displayName = (user?.user_metadata?.display_name as string | undefined) ?? user?.email ?? 'Escursionista'

  const rows: Row[] = [
    { href: '/statistiche', icon: <BarChart2 className="w-[18px] h-[18px]" />, iconBg: TACCUINO_ACCENT_TINT, label: 'Statistiche', sub: 'Andamento, confronti, record personali' },
    { href: '/statistiche?tab=traguardi', icon: <Trophy className="w-[18px] h-[18px]" />, iconBg: TACCUINO_ACCENT_TINT, label: 'Traguardi', sub: badgeCount > 0 ? `${badgeCount} sbloccati` : 'Nessuno ancora' },
    { href: '/vette', icon: <Mountain className="w-[18px] h-[18px]" />, iconBg: TACCUINO_ACCENT_TINT, label: 'Vette raggiunte', sub: 'Le cime toccate nelle tue escursioni' },
    { href: '/profilo/cronologia-navigazione', icon: <Compass className="w-[18px] h-[18px]" />, iconBg: TACCUINO_ACCENT_TINT, label: 'Cronologia navigazione', sub: 'Le tue uscite guidate dal navigatore' },
    { href: '/profilo/impostazioni', icon: <Settings className="w-[18px] h-[18px]" />, iconBg: TACCUINO_ACCENT_TINT, label: 'Impostazioni', sub: 'Identità, indirizzo, dati biometrici, comfort score' },
    { href: '/profilo/ai', icon: <Sparkles className="w-[18px] h-[18px]" />, iconBg: TACCUINO_ACCENT_TINT, label: 'Intelligenza artificiale', sub: 'Chiave Claude personale (BYOK)' },
    ...(installed ? [] : [{ onClick: handleInstall, icon: <ArrowDownToLine className="w-[18px] h-[18px]" />, iconBg: TACCUINO_ACCENT_TINT, label: "Installa l'app", sub: 'Aggiungi alla schermata Home' }]),
    { href: '/fonti-e-crediti', icon: <Info className="w-[18px] h-[18px]" />, iconBg: TACCUINO_ACCENT_TINT, label: 'Fonti e crediti', sub: '' },
    { onClick: handleLogout, icon: <LogOut className="w-[18px] h-[18px]" />, iconBg: '#fef2f2', label: 'Esci', sub: '', danger: true },
  ]

  return (
    <div className="min-h-screen pb-8" style={{ background: TACCUINO_PAPER.base }}>
      <TaccuinoPaperTexture />
      <div className="relative pt-[calc(env(safe-area-inset-top,0px)+2rem)] pb-7 px-6 text-center">
        <button
          onClick={() => router.back()}
          aria-label="Chiudi"
          className="absolute top-[calc(env(safe-area-inset-top,0px)+12px)] right-4 w-9 h-9 rounded-full flex items-center justify-center transition-colors"
          style={{ background: TACCUINO_PAPER.card, color: TACCUINO_INK.typed }}
        >
          <X className="w-5 h-5" />
        </button>
        <div className="relative w-[84px] h-[84px] mx-auto mb-3.5">
          <div
            className="w-full h-full rounded-full overflow-hidden flex items-center justify-center"
            style={{ background: TACCUINO_ACCENT_TINT, border: `2px solid ${TACCUINO_PAPER.cardBorder}` }}
          >
            {faceUrl
              ? <img src={faceUrl} alt="" className="w-full h-full object-cover" />
              : <UserIcon className="w-9 h-9" style={{ color: TACCUINO_ACCENT[600] }} />
            }
          </div>
          <GemStatusBadge size={24} className="absolute bottom-0 right-0" />
        </div>
        <h1 className="font-display text-[21px] font-bold mb-1" style={{ color: TACCUINO_INK.typed }}>{displayName}</h1>
        <p className="text-[13px]" style={{ color: TACCUINO_INK.handMuted }}>
          {streakWeeks > 0 ? `${streakWeeks} settiman${streakWeeks === 1 ? 'a' : 'e'} di streak` : 'Inizia la tua streak'}
          {badgeCount > 0 && ` · ${badgeCount} traguardi`}
        </p>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4">
        <div className="mb-4">
          <SectionAbbonamento />
        </div>
        {rows.map((r, i) => {
          const content = (
            <>
              <div className="w-[38px] h-[38px] rounded-[11px] flex items-center justify-center shrink-0" style={{ background: r.iconBg, color: r.danger ? '#b91c1c' : TACCUINO_ACCENT[600] }}>
                {r.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold" style={{ color: r.danger ? '#b91c1c' : TACCUINO_INK.typed }}>{r.label}</p>
                {r.sub && <p className="text-xs mt-0.5" style={{ color: TACCUINO_INK.handMuted }}>{r.sub}</p>}
              </div>
              {!r.danger && <ChevronRight className="w-4 h-4 shrink-0" style={{ color: TACCUINO_INK.handMuted }} />}
            </>
          )
          const rowClass = 'flex items-center gap-3.5 py-4 px-1 text-left w-full'
          const rowStyle = { borderBottom: `1px solid ${TACCUINO_PAPER.cardBorder}` }
          return r.href ? (
            <Link key={i} href={r.href} className={rowClass} style={rowStyle}>{content}</Link>
          ) : (
            <button key={i} onClick={r.onClick} className={rowClass} style={rowStyle}>{content}</button>
          )
        })}
      </div>
    </div>
  )
}
