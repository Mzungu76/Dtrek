'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  AreaChart, Area, LineChart, Line, XAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  Activity, TrendingUp, Trophy, Flame, BarChart3, Loader2, Mountain, Upload,
  Route as RouteIcon, ArrowUpToLine, Layers, Zap, type LucideIcon,
} from 'lucide-react'
import Navbar from '@/components/Navbar'
import RouteThumb from '@/components/RouteThumb'
import { getAllActivities, computeGlobalStats, type ActivityMeta } from '@/lib/blobStore'
import { computeStreaks, getPersonalRecords } from '@/lib/stats'
import { computeBadges } from '@/lib/badges'
import { computeTrainingLoad, activityStress, currentForm } from '@/lib/trainingLoad'
import { computeRecoveryScore, computeEFTrend, computeFitnessScore } from '@/lib/bioMetrics'
import { pickRecoveryPhrase } from '@/lib/recoveryPhrases'
import { pickFormaPhrase } from '@/lib/formaPhrases'
import { pickStreakPhrase } from '@/lib/streakPhrases'
import { pickVolumePhrase } from '@/lib/volumePhrases'
import { fetchActivityPhotos, pickBestCoverPhoto } from '@/lib/activityPhotos'

const FALLBACK_HERO = '/stato-hero-fallback.jpg'
// Stesso trattamento su ogni foto in hero (di copertina o di fallback), reale o
// generica: leggermente desaturata/contrastata per allinearsi alla palette calda
// dell'app invece di restare una foto "a sé" scollegata dal resto.
const HERO_IMAGE_FILTER = 'saturate(0.82) contrast(1.05) brightness(0.92)'

interface GalleryItem {
  id: string
  title: string
  titleColor: string
  subtitle: string
  icon: LucideIcon
  gradientColor: string
  emoji?: string
  routePolyline?: [number, number][]
  activityId?: string
  chart?: React.ReactNode
  highlight?: boolean
}

// Centro di Controllo — sintesi di statistiche e badge in home, con AI riservata
// solo ai cambi di fascia (non ancora cablata: qui gira sempre il banco di frasi
// pre-scritte per Recovery, Stato forma, Streak e Volume settimanale). Vedi
// lib/recoveryPhrases.ts, lib/formaPhrases.ts, lib/streakPhrases.ts e
// lib/volumePhrases.ts per il meccanismo di rotazione/bucket di ciascuna.
// Hero e card-galleria ricalcano lo schema di app/resoconto/elenco/page.tsx
// (gradiente forest + bg-topography, card rounded-3xl con thumb+titolo+sottotitolo)
// ma la selezione di una card aggiorna hero e grafico invece di navigare altrove.
export default function StatoPage() {
  const [activities, setActivities] = useState<ActivityMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [coverPhotos, setCoverPhotos] = useState<Record<string, string>>({})
  const [ambientPhotos, setAmbientPhotos] = useState<string[]>([])
  const [photoIndex, setPhotoIndex] = useState(0)
  const [selectedId, setSelectedId] = useState('recovery')

  useEffect(() => {
    getAllActivities().then(setActivities).finally(() => setLoading(false))
  }, [])

  const streaks = useMemo(() => computeStreaks(activities), [activities])
  const badges  = useMemo(() => computeBadges(activities, streaks), [activities, streaks])
  const personalRecords = useMemo(() => getPersonalRecords(activities), [activities])
  const globalStats = useMemo(() => computeGlobalStats(activities), [activities])
  const hasEnoughHistory = activities.length >= 3

  // Copertina per uscita più recente (carosello ambiente) + per le 3 attività
  // "record" (se selezionate, l'hero mostra la loro foto invece di quella ambiente).
  useEffect(() => {
    if (activities.length === 0) return
    let cancelled = false
    const sorted = [...activities].sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
    const recent = sorted.slice(0, 8)
    const recordActs = [personalRecords.longestKm, personalRecords.highestGain, personalRecords.highestAlt]
      .filter((a): a is ActivityMeta => !!a)
    const ids = Array.from(new Set([...recent, ...recordActs].map(a => a.id)))
    ;(async () => {
      const results = await Promise.all(ids.map(async id => {
        try {
          const cover = pickBestCoverPhoto(await fetchActivityPhotos(id))
          return cover ? [id, cover.url] as const : null
        } catch { return null }
      }))
      if (cancelled) return
      const map: Record<string, string> = {}
      for (const r of results) if (r) map[r[0]] = r[1]
      setCoverPhotos(map)
      setAmbientPhotos(recent.map(a => map[a.id]).filter((u): u is string => !!u))
    })()
    return () => { cancelled = true }
  }, [activities, personalRecords])

  useEffect(() => {
    if (ambientPhotos.length > 0) setPhotoIndex(Math.floor(Math.random() * ambientPhotos.length))
  }, [ambientPhotos.length])

  const trainingLoadData = useMemo(() => {
    const events = activities.map(a => ({
      date:   format(new Date(a.startTime), 'yyyy-MM-dd'),
      stress: activityStress(a.distanceMeters, a.elevationGain, a.totalTimeSeconds),
    }))
    return computeTrainingLoad(events, 90)
  }, [activities])

  const latestLoad = trainingLoadData.length > 0 ? trainingLoadData[trainingLoadData.length - 1] : null
  const tsb = latestLoad?.tsb ?? 0

  const recovery = useMemo(() => computeRecoveryScore(tsb), [tsb])
  const forma    = useMemo(() => currentForm(tsb), [tsb])
  const recoveryPhrase = useMemo(() => pickRecoveryPhrase(recovery.label, recovery.suggestion), [recovery])
  const formaPhrase    = useMemo(() => pickFormaPhrase(forma.label, forma.description), [forma])
  const streakPhrase   = useMemo(() => pickStreakPhrase(streaks.currentWeeks), [streaks.currentWeeks])
  const lowHistoryNote = 'Servono almeno 3 uscite per un quadro affidabile — continua a caricare le tue attività.'

  const efTrend = useMemo(() => computeEFTrend(activities), [activities])
  const fitnessInfo = useMemo(() => computeFitnessScore(activities), [activities])
  const efSubtitle = !fitnessInfo.hasData
    ? 'Efficienza aerobica nel tempo.'
    : fitnessInfo.trend === 'up'   ? `In crescita del ${fitnessInfo.trendPct}% nelle ultime settimane.`
    : fitnessInfo.trend === 'down' ? `In calo del ${fitnessInfo.trendPct}% nelle ultime settimane.`
    : 'Stabile nelle ultime settimane.'

  const nearestBadge = useMemo(() => {
    const locked = badges.filter(b => !b.unlocked && typeof b.progressPct === 'number')
    if (!locked.length) return null
    return locked.reduce((best, b) => (b.progressPct! > best.progressPct! ? b : best))
  }, [badges])
  const badgeIsClose = (nearestBadge?.progressPct ?? 0) >= 80

  const weeklyVolume = useMemo(() => {
    const out: { week: string; km: number }[] = []
    for (let i = 7; i >= 0; i--) {
      const end   = new Date(); end.setDate(end.getDate() - i * 7)
      const start = new Date(end); start.setDate(start.getDate() - 6)
      const wActs = activities.filter(a => { const d = new Date(a.startTime); return d >= start && d <= end })
      out.push({
        week: format(start, 'dd/MM'),
        km:   Math.round(wActs.reduce((s, a) => s + a.distanceMeters / 1000, 0) * 10) / 10,
      })
    }
    return out
  }, [activities])

  const currentWeekKm = weeklyVolume.length > 0 ? weeklyVolume[weeklyVolume.length - 1].km : 0

  const volumePhrase = useMemo(() => {
    const previous = weeklyVolume.slice(0, -1)
    if (previous.length === 0) return null
    const avgPrev = previous.reduce((s, w) => s + w.km, 0) / previous.length
    if (avgPrev <= 0) return null
    return pickVolumePhrase(((currentWeekKm - avgPrev) / avgPrev) * 100)
  }, [weeklyVolume, currentWeekKm])

  const galleryItems = useMemo<GalleryItem[]>(() => {
    const items: GalleryItem[] = [
      {
        id: 'recovery', title: recovery.label, titleColor: recovery.color,
        subtitle: hasEnoughHistory ? recoveryPhrase : lowHistoryNote,
        icon: Activity, gradientColor: recovery.color,
      },
      {
        id: 'forma', title: forma.label, titleColor: forma.color,
        subtitle: hasEnoughHistory ? formaPhrase : lowHistoryNote,
        icon: TrendingUp, gradientColor: forma.color,
        chart: hasEnoughHistory && trainingLoadData.length > 0 ? (
          <ResponsiveContainer width="100%" height={170}>
            <LineChart data={trainingLoadData}>
              <CartesianGrid vertical={false} stroke="#eeece5" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#a9a18e' }} tickFormatter={d => format(new Date(d), 'd/M')} minTickGap={40} />
              <Tooltip labelFormatter={d => format(new Date(d), 'd MMM', { locale: it })} />
              <Line type="monotone" dataKey="ctl" name="Fitness (CTL)" stroke="#277134" strokeWidth={2} dot={false} isAnimationActive animationDuration={900} />
              <Line type="monotone" dataKey="atl" name="Fatica (ATL)" stroke="#c05a17" strokeWidth={2} dot={false} isAnimationActive animationDuration={900} />
            </LineChart>
          </ResponsiveContainer>
        ) : undefined,
      },
      {
        id: 'badge',
        title: nearestBadge?.name ?? 'Tutti sbloccati',
        titleColor: '#c05a17',
        subtitle: nearestBadge
          ? `${nearestBadge.progressCurrent?.toLocaleString('it')}${nearestBadge.progressUnit ? ` ${nearestBadge.progressUnit}` : ''} / ${nearestBadge.progressTarget?.toLocaleString('it')}${nearestBadge.progressUnit ? ` ${nearestBadge.progressUnit}` : ''} (${nearestBadge.progressPct}%)`
          : 'Niente male.',
        icon: Trophy, gradientColor: '#f59e0b', emoji: nearestBadge?.icon,
        highlight: badgeIsClose,
      },
      {
        id: 'streak', title: `${streaks.currentWeeks} settimane`, titleColor: '#c05a17',
        subtitle: streakPhrase, icon: Flame, gradientColor: '#d97220',
      },
      {
        id: 'volume', title: `${currentWeekKm} km`, titleColor: '#277134',
        subtitle: volumePhrase ?? 'Volume di questa settimana.',
        icon: BarChart3, gradientColor: '#378d44',
        chart: (
          <ResponsiveContainer width="100%" height={170}>
            <AreaChart data={weeklyVolume}>
              <defs>
                <linearGradient id="volFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#378d44" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#378d44" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="#eeece5" />
              <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#a9a18e' }} />
              <Tooltip formatter={(v: number) => [`${v} km`, 'Volume']} />
              <Area type="monotone" dataKey="km" stroke="#277134" strokeWidth={2} fill="url(#volFill)" isAnimationActive animationDuration={900} />
            </AreaChart>
          </ResponsiveContainer>
        ),
      },
    ]

    if (efTrend.length >= 3) {
      items.push({
        id: 'efficienza', title: 'Efficienza aerobica', titleColor: '#20592b',
        subtitle: efSubtitle, icon: Zap, gradientColor: '#378d44',
        chart: (
          <ResponsiveContainer width="100%" height={170}>
            <LineChart data={efTrend}>
              <CartesianGrid vertical={false} stroke="#eeece5" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#a9a18e' }} tickFormatter={d => format(new Date(d), 'd/M')} minTickGap={40} />
              <Tooltip labelFormatter={d => format(new Date(d), 'd MMM', { locale: it })} />
              <Line type="monotone" dataKey="ef" stroke="#bbe0bf" strokeWidth={1.5} dot={false} isAnimationActive animationDuration={900} />
              <Line type="monotone" dataKey="efSmoothed" name="Tendenza" stroke="#277134" strokeWidth={2.5} dot={false} isAnimationActive animationDuration={900} />
            </LineChart>
          </ResponsiveContainer>
        ),
      })
    }

    const recordDefs: { key: 'longestKm' | 'highestGain' | 'highestAlt'; label: string; icon: LucideIcon; ok: (a: ActivityMeta) => boolean; sub: (a: ActivityMeta) => string }[] = [
      { key: 'longestKm', label: 'Percorso più lungo', icon: RouteIcon, ok: a => a.distanceMeters > 0,
        sub: a => `${(a.distanceMeters / 1000).toFixed(1)} km` },
      { key: 'highestGain', label: 'Maggior dislivello', icon: Mountain, ok: a => a.elevationGain > 0,
        sub: a => `${Math.round(a.elevationGain)} m D+` },
      { key: 'highestAlt', label: 'Quota più alta', icon: ArrowUpToLine, ok: a => a.altitudeMax > 0,
        sub: a => `${Math.round(a.altitudeMax)} m` },
    ]
    for (const def of recordDefs) {
      const act = personalRecords[def.key]
      if (!act || !def.ok(act)) continue
      items.push({
        id: `record-${def.key}`,
        title: act.title,
        titleColor: '#20592b',
        subtitle: `${def.label} · ${def.sub(act)} · ${format(new Date(act.startTime), 'd MMM yyyy', { locale: it })}`,
        icon: def.icon, gradientColor: '#378d44',
        routePolyline: act.routePolyline && act.routePolyline.length > 1 ? act.routePolyline : undefined,
        activityId: act.id,
      })
    }

    if (globalStats.totalActivities > 0) {
      items.push({
        id: 'totali', title: `${globalStats.totalDistanceKm.toFixed(0)} km`, titleColor: '#5e564c',
        subtitle: `${globalStats.totalActivities} escursioni · ${Math.round(globalStats.totalElevationGain)} m D+ totali`,
        icon: Layers, gradientColor: '#978e7a',
      })
    }

    return items
  }, [
    recovery, forma, hasEnoughHistory, recoveryPhrase, formaPhrase, trainingLoadData,
    nearestBadge, badgeIsClose, streaks.currentWeeks, streakPhrase, currentWeekKm, volumePhrase,
    weeklyVolume, efTrend, efSubtitle, personalRecords, globalStats,
  ])

  const selected = galleryItems.find(g => g.id === selectedId) ?? galleryItems[0]
  const ambientPhoto = ambientPhotos.length > 0 ? ambientPhotos[photoIndex % ambientPhotos.length] : FALLBACK_HERO
  const heroPhoto = (selected?.activityId && coverPhotos[selected.activityId]) || ambientPhoto

  return (
    <div className="min-h-screen bg-stone-50 pb-24 md:pb-8">
      <Navbar />

      {/* ── Hero ── */}
      <div className="relative h-[58vh] min-h-[380px] max-h-[600px] overflow-hidden bg-forest-900">
        <img
          key={heroPhoto}
          src={heroPhoto}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          style={{ filter: HERO_IMAGE_FILTER }}
        />
        <div className="absolute inset-0 bg-topography opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-b from-forest-900/20 via-forest-900/40 to-forest-900/95" />

        {!loading && activities.length > 0 && ambientPhotos.length > 1 && (
          <div className="absolute top-4 right-4 flex gap-1.5 z-10">
            {ambientPhotos.map((_, i) => (
              <button
                key={i} aria-label={`Foto ${i + 1}`} onClick={() => setPhotoIndex(i)}
                className={`h-1.5 rounded-full transition-all ${i === photoIndex % ambientPhotos.length ? 'bg-white w-4' : 'bg-white/40 w-1.5'}`}
              />
            ))}
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 px-5 sm:px-10 pb-6 sm:pb-8">
          <div className="max-w-6xl mx-auto">
            <p className="text-forest-300 text-[13px] font-semibold mb-1.5">Stato</p>

            {loading ? (
              <h1 className="text-[26px] sm:text-4xl font-bold text-white leading-tight">Caricamento…</h1>
            ) : activities.length === 0 ? (
              <>
                <h1 className="text-[26px] sm:text-4xl font-bold text-white leading-tight">Pronto per la tua prima uscita</h1>
                <p className="text-white/85 text-sm sm:text-base mt-2 max-w-md leading-relaxed">
                  Carica un&apos;escursione per iniziare a vedere qui il tuo stato.
                </p>
              </>
            ) : selected && (
              <>
                <div key={selectedId} className="fade-up">
                  <h1 className="text-[26px] sm:text-4xl font-bold leading-tight truncate" style={{ color: selected.titleColor }}>
                    {selected.title}
                  </h1>
                  <p className="text-white/85 text-sm sm:text-base mt-2 max-w-md leading-relaxed">{selected.subtitle}</p>
                </div>
                {selected.chart && (
                  <div key={`chart-${selectedId}`} className="mt-4 bg-white/95 backdrop-blur-sm rounded-2xl p-3 sm:p-4 shadow-lg max-w-xl fade-up">
                    {selected.chart}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-3 sm:px-4 py-5 sm:py-8 fade-up">
        {loading ? (
          <div className="flex items-center justify-center py-24 text-stone-400 gap-3">
            <Loader2 className="w-6 h-6 animate-spin" /><span>Caricamento dati…</span>
          </div>

        ) : activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-20 h-20 rounded-full bg-forest-50 border border-forest-200 flex items-center justify-center mb-6">
              <Mountain className="w-10 h-10 text-forest-400" />
            </div>
            <h2 className="font-display text-2xl font-semibold text-stone-700 mb-2">Il tuo stato comincia qui</h2>
            <p className="text-stone-400 text-sm max-w-sm mb-6 px-4">
              Recovery, stato forma, traguardi e streak si calcolano dalle escursioni che carichi —
              carica la prima per iniziare a vedere qualcosa qui.
            </p>
            <Link
              href="/upload?tab=activity"
              className="flex items-center gap-2 px-6 py-3 bg-forest-600 hover:bg-forest-700 text-white rounded-xl font-medium transition-colors"
            >
              <Upload className="w-5 h-5" /> Carica un&apos;escursione
            </Link>
          </div>

        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {galleryItems.map(item => (
              <GalleryCard key={item.id} item={item} selected={item.id === selectedId} onSelect={() => setSelectedId(item.id)} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

function GalleryCard({ item, selected, onSelect }: { item: GalleryItem; selected: boolean; onSelect: () => void }) {
  const Icon = item.icon
  return (
    <button
      onClick={onSelect}
      aria-pressed={selected}
      className={`text-left w-full bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-shadow ${
        selected ? 'ring-2 ring-forest-600 ring-offset-2 ring-offset-stone-50' : ''
      }`}
    >
      <div className="relative h-[160px] sm:h-[180px] overflow-hidden">
        {item.routePolyline ? (
          <div className="absolute inset-0 bg-gradient-to-b from-forest-50 to-stone-50 bg-topography">
            <div className="absolute inset-3">
              <RouteThumb polyline={item.routePolyline} color="#2d7a3d" strokeWidth={2.5} />
            </div>
          </div>
        ) : (
          <div className="absolute inset-0">
            <div className="absolute inset-0" style={{ background: `linear-gradient(to bottom, ${item.gradientColor}26, #f8f7f4)` }} />
            <div className="absolute inset-0 bg-topography" />
            <div className="absolute inset-0 flex items-center justify-center">
              {item.emoji
                ? <span className="text-4xl">{item.emoji}</span>
                : <Icon className="w-10 h-10" style={{ color: item.gradientColor }} />}
            </div>
          </div>
        )}
        {item.highlight && (
          <span className="absolute top-2.5 right-2.5 text-[10px] font-bold text-amber-700 bg-amber-100 border border-amber-300 rounded-full px-2 py-0.5">
            quasi ce l&apos;hai
          </span>
        )}
      </div>
      <div className="p-4">
        <p className="text-[16px] font-bold truncate" style={{ color: item.titleColor }}>{item.title}</p>
        <p className="text-[13px] text-stone-500 mt-1 line-clamp-2 leading-snug">{item.subtitle}</p>
      </div>
    </button>
  )
}
