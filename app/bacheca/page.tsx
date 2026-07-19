'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { AreaChart, Area, LineChart, Line, XAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { TrendingUp, Flame, BarChart3, Loader2, Mountain, Upload, ArrowRight } from 'lucide-react'
import HubNavBar from '@/components/routehub/HubNavBar'
import RouteThumb from '@/components/RouteThumb'
import { TrailScoreGaugeBadge } from '@/components/TrailScoreGaugeBadge'
import InfoButton from '@/components/stats/InfoButton'
import GuideOverlay from '@/components/stats/GuideOverlay'
import TileIllustration, { type IllustrationKind } from '@/components/bacheca/TileIllustration'
import {
  HeatmapPanel, AnnualBarChart, MonthlyBarChart, SeasonalBarChart, WeekdayBarChart,
  DistanceHistogramChart, AltitudeBarChart, altitudeBands, FcTrendChart, DistanceVsGainScatter,
  TssBarChart, ZoneFcBarChart, EfTrendChart, IevTrendChart, CalorieBarChart, ScoreEvolutionChart,
  hasScoreEvolutionData, CHART_TICK, CHART_GRID,
} from '@/components/bacheca/ChartPanels'
import { getAllActivities, computeGlobalStats, type ActivityMeta } from '@/lib/blobStore'
import { useCtsUpdated } from '@/lib/sync/useCtsUpdated'
import { computeStreaks, getPersonalRecords, formatPaceMinkm, difficultyIndex } from '@/lib/stats'
import { formatDuration } from '@/lib/tcxParser'
import { computeBadges } from '@/lib/badges'
import { computeTrainingLoad, activityStress, currentForm } from '@/lib/trainingLoad'
import { computeRecoveryScore, computeEFTrend, computeIEVTrend, computeFitnessScore, computeVO2maxEstimate } from '@/lib/bioMetrics'
import { getUserSettingsCached } from '@/lib/sync/userSettingsStore'
import { pickRecoveryPhrase } from '@/lib/recoveryPhrases'
import { pickFormaPhrase } from '@/lib/formaPhrases'
import { pickVolumePhrase } from '@/lib/volumePhrases'
import { fetchActivityPhotos, pickBestCoverPhoto } from '@/lib/activityPhotos'

const FALLBACK_HERO = '/stato-hero-fallback.jpg'
// Stessi valori esatti usati da RouteHub.tsx per una copertina-foto (Resoconto).
const HERO_IMAGE_FILTER = 'saturate(1.25) contrast(1.08) brightness(0.85)'
const HERO_TINT_GRADIENT = 'linear-gradient(160deg, rgba(129,54,25,0.35) 0%, rgba(28,71,36,0.3) 55%, rgba(7,24,36,0.45) 100%)'

type Visual = 'ring' | 'chart' | 'plain'

interface GalleryItem {
  id: string
  title: string
  subtitle: string
  illustration: IllustrationKind
  gradientColor: string
  badgeText: string
  visual: Visual
  ringValue?: number
  emoji?: string
  routePolyline?: [number, number][]
  activityId?: string
  chart?: React.ReactNode
  highlight?: boolean
  /** Ancora in TabGuida.tsx — mostra il bottoncino "i" nell'hero quando presente. */
  guideSection?: string
}

// Bacheca (ex "Stato") — sezione di apertura dell'app (vedi app/page.tsx e public/manifest.json):
// sintesi completa di tutte le statistiche/grafici già calcolati dall'app (non solo un riepilogo
// curato — vedi le card di "Andamento" portate qui una per una), con AI riservata solo ai cambi di
// fascia (non ancora cablata: qui gira sempre il banco di frasi pre-scritte — vedi lib/*Phrases.ts).
//
// Architettura fixed-schermo-intero allineata a Guida (components/routehub/): stessi valori di
// filtro/tinta foto di RouteHub.tsx, HubNavBar al posto del Navbar normale, illustrazioni piatte
// disegnate a mano (components/bacheca/TileIllustration.tsx) al posto delle icone lucide nude sulla
// filmstrip, e InfoButton+GuideOverlay riusati identici a /statistiche per spiegare ogni parametro
// (stesso contenuto di TabGuida.tsx, zero testo nuovo da scrivere). Ogni grafico vive in
// components/bacheca/ChartPanels.tsx, con lo stesso stile chiaro-su-scuro pensato per stare in
// sovraimpressione sulla foto scurita invece che su una card bianca come in /statistiche.
export default function BachecaPage() {
  const [activities, setActivities] = useState<ActivityMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [coverPhotos, setCoverPhotos] = useState<Record<string, string>>({})
  const [ambientPhotos, setAmbientPhotos] = useState<string[]>([])
  const [photoIndex, setPhotoIndex] = useState(0)
  const [selectedId, setSelectedId] = useState('recovery')
  const [guideOpen, setGuideOpen] = useState(false)
  const [guideAnchor, setGuideAnchor] = useState<string | null>(null)
  const [userSettings, setUserSettings] = useState<{ hrMax?: number | null; derivedFCmax?: number; hrRest?: number | null; userWeightKg?: number }>({})

  useEffect(() => {
    getAllActivities().then(setActivities).finally(() => setLoading(false))
  }, [])

  useCtsUpdated(() => { getAllActivities().then(setActivities) })

  useEffect(() => {
    getUserSettingsCached()
      .then(d => setUserSettings({
        hrMax: d.hrMax ?? null, derivedFCmax: d.derivedFCmax ?? 0,
        hrRest: d.hrRest ?? null, userWeightKg: d.userWeightKg ?? 0,
      }))
      .catch(() => {})
  }, [])
  const maxHR = userSettings.hrMax ?? userSettings.derivedFCmax ?? 190

  const openGuide = (section: string) => { setGuideAnchor(section); setGuideOpen(true) }

  const streaks = useMemo(() => computeStreaks(activities), [activities])
  const badges  = useMemo(() => computeBadges(activities, streaks), [activities, streaks])
  const personalRecords = useMemo(() => getPersonalRecords(activities), [activities])
  const globalStats = useMemo(() => computeGlobalStats(activities), [activities])
  const hasEnoughHistory = activities.length >= 3

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
  const lowHistoryNote = 'Servono almeno 3 uscite per un quadro affidabile — continua a caricare le tue attività.'

  const efTrend  = useMemo(() => computeEFTrend(activities), [activities])
  const ievTrend = useMemo(() => computeIEVTrend(activities), [activities])
  const fitnessInfo = useMemo(() => computeFitnessScore(activities), [activities])
  const efSubtitle = !fitnessInfo.hasData
    ? 'Efficienza aerobica nel tempo.'
    : fitnessInfo.trend === 'up'   ? `In crescita del ${fitnessInfo.trendPct}% nelle ultime settimane.`
    : fitnessInfo.trend === 'down' ? `In calo del ${fitnessInfo.trendPct}% nelle ultime settimane.`
    : 'Stabile nelle ultime settimane.'
  const vo2max = useMemo(() => computeVO2maxEstimate(maxHR, userSettings.hrRest ?? 55), [maxHR, userSettings.hrRest])

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

  const annualYearsCount = useMemo(() => new Set(activities.map(a => new Date(a.startTime).getFullYear())).size, [activities])
  const hasHRData = useMemo(() => activities.some(a => a.avgHeartRate > 0), [activities])

  // Pillole persistenti (sempre visibili, non legate alla selezione) — analoghe a km/D+/quota di
  // Guida: qui sempre il valore live di Stato forma/Streak/Volume.
  const statPills = [
    { icon: TrendingUp, label: forma.label },
    { icon: Flame, label: `${streaks.currentWeeks} sett.` },
    { icon: BarChart3, label: `${currentWeekKm} km/sett.` },
  ]

  const galleryItems = useMemo<GalleryItem[]>(() => {
    const items: GalleryItem[] = [
      {
        id: 'recovery', title: recovery.label, subtitle: hasEnoughHistory ? recoveryPhrase : lowHistoryNote,
        illustration: 'pulse', gradientColor: recovery.color, badgeText: `${recovery.score}`,
        visual: 'ring', ringValue: recovery.score, guideSection: 'recovery-score',
      },
      {
        id: 'badge',
        title: nearestBadge?.name ?? 'Tutti sbloccati',
        subtitle: nearestBadge
          ? `${nearestBadge.progressCurrent?.toLocaleString('it')}${nearestBadge.progressUnit ? ` ${nearestBadge.progressUnit}` : ''} / ${nearestBadge.progressTarget?.toLocaleString('it')}${nearestBadge.progressUnit ? ` ${nearestBadge.progressUnit}` : ''} (${nearestBadge.progressPct}%)`
          : 'Niente male.',
        illustration: 'trophy', gradientColor: '#f59e0b', emoji: nearestBadge?.icon,
        badgeText: nearestBadge ? `${nearestBadge.progressPct}%` : '100%',
        visual: 'ring', ringValue: nearestBadge?.progressPct ?? 100,
        highlight: badgeIsClose, guideSection: 'badge',
      },
      {
        id: 'forma', title: forma.label, subtitle: hasEnoughHistory ? formaPhrase : lowHistoryNote,
        illustration: 'trend', gradientColor: forma.color, badgeText: forma.label, visual: 'chart', guideSection: 'training-load',
        chart: hasEnoughHistory && trainingLoadData.length > 0 ? (
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={trainingLoadData}>
              <CartesianGrid vertical={false} stroke={CHART_GRID} />
              <XAxis dataKey="date" tick={CHART_TICK} tickFormatter={d => format(new Date(d), 'd/M')} minTickGap={40} />
              <Tooltip contentStyle={{ background: 'rgba(15,15,15,0.88)', border: 'none', borderRadius: 8, fontSize: 12 }} labelStyle={{ color: '#fff' }} itemStyle={{ color: '#fff' }} labelFormatter={d => format(new Date(d), 'd MMM', { locale: it })} />
              <Line type="monotone" dataKey="ctl" name="Fitness (CTL)" stroke="#8cc894" strokeWidth={2} dot={false} isAnimationActive animationDuration={900} />
              <Line type="monotone" dataKey="atl" name="Fatica (ATL)" stroke="#e9ab64" strokeWidth={2} dot={false} isAnimationActive animationDuration={900} />
            </LineChart>
          </ResponsiveContainer>
        ) : undefined,
      },
      {
        id: 'volume', title: `${currentWeekKm} km`, subtitle: volumePhrase ?? 'Volume di questa settimana.',
        illustration: 'bars', gradientColor: '#378d44', badgeText: `${currentWeekKm} km`, visual: 'chart', guideSection: 'volume-settimanale',
        chart: (
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={weeklyVolume}>
              <defs>
                <linearGradient id="volFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8cc894" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#8cc894" stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke={CHART_GRID} />
              <XAxis dataKey="week" tick={CHART_TICK} />
              <Tooltip contentStyle={{ background: 'rgba(15,15,15,0.88)', border: 'none', borderRadius: 8, fontSize: 12 }} labelStyle={{ color: '#fff' }} itemStyle={{ color: '#fff' }} formatter={(v: number) => [`${v} km`, 'Volume']} />
              <Area type="monotone" dataKey="km" stroke="#8cc894" strokeWidth={2} fill="url(#volFill)" isAnimationActive animationDuration={900} />
            </AreaChart>
          </ResponsiveContainer>
        ),
      },
      {
        id: 'tss', title: 'Carico giornaliero', subtitle: 'TSS stimato da distanza, dislivello e durata, ultimi 90 giorni.',
        illustration: 'bars', gradientColor: '#378d44', badgeText: 'TSS', visual: 'chart', guideSection: 'tss',
        chart: <TssBarChart activities={activities} />,
      },
    ]

    if (efTrend.length >= 3) {
      items.push({
        id: 'efficienza', title: 'Efficienza aerobica', subtitle: efSubtitle,
        illustration: 'trend', gradientColor: '#378d44', badgeText: fitnessInfo.hasData ? `${fitnessInfo.score}` : '–',
        visual: 'ring', ringValue: fitnessInfo.hasData ? fitnessInfo.score : undefined, guideSection: 'fitness-score',
      })
      items.push({
        id: 'ef-nel-tempo', title: 'EF nel tempo', subtitle: 'Efficienza aerobica grezza e tendenza, uscita per uscita.',
        illustration: 'trend', gradientColor: '#378d44', badgeText: 'EF', visual: 'chart', guideSection: 'ef-aerobica',
        chart: <EfTrendChart activities={activities} />,
      })
    }

    if (ievTrend.length >= 2) {
      items.push({
        id: 'iev-nel-tempo', title: 'Efficienza verticale', subtitle: 'Indice di efficienza in salita (IEV) nel tempo.',
        illustration: 'trend', gradientColor: '#c05a17', badgeText: 'IEV', visual: 'chart', guideSection: 'iev',
        chart: <IevTrendChart activities={activities} />,
      })
    }

    items.push({
      id: 'heatmap', title: 'Attività annuale', subtitle: 'Calendario delle uscite, un anno alla volta.',
      illustration: 'calendar', gradientColor: '#a9a18e', badgeText: `${activities.length}`, visual: 'chart', guideSection: 'heatmap',
      chart: <HeatmapPanel activities={activities} />,
    })

    if (annualYearsCount > 1) {
      items.push({
        id: 'confronto-annuale', title: 'Confronto annuale', subtitle: 'Distanza e dislivello totali, anno per anno.',
        illustration: 'bars', gradientColor: '#378d44', badgeText: `${annualYearsCount} anni`, visual: 'chart', guideSection: 'confronto-annuale',
        chart: <AnnualBarChart activities={activities} />,
      })
    }

    items.push({
      id: 'mensile', title: 'Andamento mensile', subtitle: 'Distanza e dislivello, ultimi 12 mesi.',
      illustration: 'bars', gradientColor: '#378d44', badgeText: '12 mesi', visual: 'chart',
      chart: <MonthlyBarChart activities={activities} />,
    })

    if (activities.length >= 4) {
      items.push({
        id: 'stagionale', title: 'Analisi stagionale', subtitle: 'Km e dislivello medi per stagione.',
        illustration: 'seasons', gradientColor: '#f59e0b', badgeText: '4 stagioni', visual: 'chart', guideSection: 'stagionale',
        chart: <SeasonalBarChart activities={activities} />,
      })
    }

    items.push({
      id: 'giorno-settimana', title: 'Giorno preferito', subtitle: 'In quale giorno della settimana esci di più.',
      illustration: 'bars', gradientColor: '#8cc894', badgeText: 'Sett.', visual: 'chart',
      chart: <WeekdayBarChart activities={activities} />,
    })

    items.push({
      id: 'lunghezza', title: 'Distribuzione lunghezza', subtitle: 'Quante escursioni per fascia di distanza.',
      illustration: 'bars', gradientColor: '#e08d3c', badgeText: 'Km', visual: 'chart',
      chart: <DistanceHistogramChart activities={activities} />,
    })

    if (altitudeBands(activities).length > 1) {
      items.push({
        id: 'quota-distribuzione', title: 'Distribuzione quota', subtitle: 'Fino a che quota arrivi più spesso.',
        illustration: 'mountain', gradientColor: '#0284c7', badgeText: 'Quota', visual: 'chart', guideSection: 'altimetrica',
        chart: <AltitudeBarChart activities={activities} />,
      })
    }

    if (hasHRData) {
      items.push({
        id: 'fc-trend', title: 'Trend FC media', subtitle: 'Se scende nel tempo a parità di distanza, stai migliorando.',
        illustration: 'pulse', gradientColor: '#f87171', badgeText: 'bpm', visual: 'chart', guideSection: 'fc-trend',
        chart: <FcTrendChart activities={activities} />,
      })
      items.push({
        id: 'zone-fc', title: 'Zone di frequenza', subtitle: 'Minuti trascorsi in ogni zona cardiaca, Z1–Z5.',
        illustration: 'pulse', gradientColor: '#7dd3fc', badgeText: 'Zone', visual: 'chart', guideSection: 'zone-fc',
        chart: <ZoneFcBarChart activities={activities} maxHR={maxHR} />,
      })
    }

    if (activities.length >= 2) {
      items.push({
        id: 'distanza-dislivello', title: 'Distanza vs dislivello', subtitle: 'In alto a destra le uscite più impegnative.',
        illustration: 'route', gradientColor: '#8cc894', badgeText: 'Km/D+', visual: 'chart',
        chart: <DistanceVsGainScatter activities={activities} />,
      })
    }

    if (hasScoreEvolutionData(activities)) {
      items.push({
        id: 'score-evoluzione', title: 'Evoluzione punteggi', subtitle: 'Trail Score, soddisfazione e voto nel tempo (media mobile).',
        illustration: 'trend', gradientColor: '#8cc894', badgeText: 'Score', visual: 'chart', guideSection: 'score-evolution',
        chart: <ScoreEvolutionChart activities={activities} />,
      })
    }

    if (userSettings.hrRest) {
      items.push({
        id: 'vo2max', title: `${vo2max} ml/kg/min`, subtitle: 'VO₂max stimato dalla formula Uth-Sørensen (FC max / FC riposo).',
        illustration: 'pulse', gradientColor: '#f87171', badgeText: 'VO₂max', visual: 'plain', guideSection: 'vo2max',
      })
    }

    if (userSettings.userWeightKg && activities.some(a => a.calories > 0)) {
      items.push({
        id: 'calorie-metabolismo', title: 'Efficienza metabolica', subtitle: 'Calorie bruciate per kg di peso corporeo, per ora — ultime uscite.',
        illustration: 'pulse', gradientColor: '#e9ab64', badgeText: 'kcal/kg/h', visual: 'chart', guideSection: 'calorie-metabolismo',
        chart: <CalorieBarChart activities={activities} weightKg={userSettings.userWeightKg} />,
      })
    }

    const recordDefs: {
      key: 'longestKm' | 'highestGain' | 'highestAlt' | 'fastestPace' | 'highestDifficulty' | 'mostCalories' | 'longestDuration' | 'highestHR'
      label: string; illustration: IllustrationKind; guideSection?: string
      ok: (a: ActivityMeta) => boolean; sub: (a: ActivityMeta) => string; badge: (a: ActivityMeta) => string
    }[] = [
      { key: 'longestKm', label: 'Percorso più lungo', illustration: 'route', guideSection: 'records', ok: a => a.distanceMeters > 0,
        sub: a => `${(a.distanceMeters / 1000).toFixed(1)} km`, badge: a => `${(a.distanceMeters / 1000).toFixed(1)} km` },
      { key: 'highestGain', label: 'Maggior dislivello', illustration: 'mountain', guideSection: 'records', ok: a => a.elevationGain > 0,
        sub: a => `${Math.round(a.elevationGain)} m D+`, badge: a => `${Math.round(a.elevationGain)} m` },
      { key: 'highestAlt', label: 'Quota più alta', illustration: 'mountain', guideSection: 'records', ok: a => a.altitudeMax > 0,
        sub: a => `${Math.round(a.altitudeMax)} m`, badge: a => `${Math.round(a.altitudeMax)} m` },
      { key: 'fastestPace', label: 'Passo più veloce', illustration: 'route', guideSection: 'passo', ok: a => a.distanceMeters > 0 && a.totalTimeSeconds > 0,
        sub: a => formatPaceMinkm(a.distanceMeters, a.totalTimeSeconds), badge: a => formatPaceMinkm(a.distanceMeters, a.totalTimeSeconds) },
      { key: 'highestDifficulty', label: 'Indice difficoltà più alto', illustration: 'mountain', guideSection: 'difficolta', ok: a => a.distanceMeters > 0,
        sub: a => `${difficultyIndex(a.elevationGain, a.distanceMeters)} m/km`, badge: a => `${difficultyIndex(a.elevationGain, a.distanceMeters)}` },
      { key: 'mostCalories', label: 'Più calorie bruciate', illustration: 'pulse', guideSection: 'records', ok: a => a.calories > 0,
        sub: a => `${Math.round(a.calories)} kcal`, badge: a => `${Math.round(a.calories)} kcal` },
      { key: 'longestDuration', label: 'Uscita più lunga', illustration: 'trophy', guideSection: 'records', ok: a => a.totalTimeSeconds > 0,
        sub: a => formatDuration(a.totalTimeSeconds), badge: a => formatDuration(a.totalTimeSeconds) },
      { key: 'highestHR', label: 'FC massima registrata', illustration: 'pulse', guideSection: 'records', ok: a => a.maxHeartRate > 0,
        sub: a => `${Math.round(a.maxHeartRate)} bpm`, badge: a => `${Math.round(a.maxHeartRate)} bpm` },
    ]
    for (const def of recordDefs) {
      const act = personalRecords[def.key]
      if (!act || !def.ok(act)) continue
      items.push({
        id: `record-${def.key}`,
        title: act.title,
        subtitle: `${def.label} · ${def.sub(act)} · ${format(new Date(act.startTime), 'd MMM yyyy', { locale: it })}`,
        illustration: def.illustration, gradientColor: '#378d44', badgeText: def.badge(act), visual: 'plain',
        guideSection: def.guideSection,
        routePolyline: act.routePolyline && act.routePolyline.length > 1 ? act.routePolyline : undefined,
        activityId: act.id,
      })
    }

    if (globalStats.totalActivities > 0) {
      items.push({
        id: 'totali', title: `${globalStats.totalDistanceKm.toFixed(0)} km`,
        subtitle: `${globalStats.totalActivities} escursioni · ${Math.round(globalStats.totalElevationGain)} m D+ totali`,
        illustration: 'backpack', gradientColor: '#978e7a', badgeText: `${globalStats.totalActivities} usc.`, visual: 'plain', guideSection: 'kpi',
      })
      items.push({
        id: 'giorni-attivi', title: `${streaks.totalActiveDays} giorni`,
        subtitle: `${streaks.totalActiveWeeks} settimane attive in totale`,
        illustration: 'calendar', gradientColor: '#a9a18e', badgeText: `${streaks.totalActiveDays}`, visual: 'plain', guideSection: 'streak',
      })
    }

    return items
  }, [
    activities, recovery, hasEnoughHistory, recoveryPhrase, forma, formaPhrase, trainingLoadData,
    nearestBadge, badgeIsClose, currentWeekKm, volumePhrase, weeklyVolume,
    efTrend, ievTrend, efSubtitle, fitnessInfo, personalRecords, globalStats, streaks,
    annualYearsCount, hasHRData, maxHR, userSettings, vo2max,
  ])

  const selected = galleryItems.find(g => g.id === selectedId) ?? galleryItems[0]
  const ambientPhoto = ambientPhotos.length > 0 ? ambientPhotos[photoIndex % ambientPhotos.length] : FALLBACK_HERO
  const heroPhoto = (selected?.activityId && coverPhotos[selected.activityId]) || ambientPhoto

  if (loading) {
    return (
      <div className="fixed inset-0 bg-[#0b1a24] overflow-hidden">
        <div className="absolute inset-x-0 top-0 z-20 px-3 sm:px-4 pt-[calc(env(safe-area-inset-top,0px)+10px)]">
          <HubNavBar />
        </div>
        <div className="absolute inset-0 flex items-center justify-center text-stone-400 gap-3">
          <Loader2 className="w-6 h-6 animate-spin" /><span>Caricamento…</span>
        </div>
      </div>
    )
  }

  if (activities.length === 0) {
    return (
      <div className="fixed inset-0 overflow-hidden bg-forest-900">
        <img src={FALLBACK_HERO} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ filter: HERO_IMAGE_FILTER }} />
        <div className="absolute inset-0 pointer-events-none mix-blend-multiply" style={{ background: HERO_TINT_GRADIENT }} />
        <div className="absolute inset-0 bg-black/35 pointer-events-none" />
        <div className="absolute inset-x-0 top-0 z-20 px-3 sm:px-4 pt-[calc(env(safe-area-inset-top,0px)+10px)]">
          <HubNavBar />
        </div>
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center px-6">
          <div className="w-20 h-20 rounded-full bg-white/10 border border-white/25 flex items-center justify-center mb-6 backdrop-blur-sm">
            <Mountain className="w-10 h-10 text-white/80" />
          </div>
          <h2 className="font-display text-2xl font-semibold text-white mb-2">La tua bacheca comincia qui</h2>
          <p className="text-white/75 text-sm max-w-sm mb-6" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.5)' }}>
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
      </div>
    )
  }

  return (
    <>
      <div className="fixed inset-0 overflow-hidden bg-forest-900 select-none">
        <img
          key={heroPhoto} src={heroPhoto} alt=""
          className="absolute inset-0 w-full h-full object-cover" draggable={false}
          style={{ filter: HERO_IMAGE_FILTER }}
        />
        <div className="absolute inset-0 pointer-events-none mix-blend-multiply" style={{ background: HERO_TINT_GRADIENT }} />
        <div className="absolute inset-0 bg-black/20 pointer-events-none" />
        <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-black/60 to-transparent pointer-events-none z-10" />
        <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/80 to-transparent pointer-events-none z-10" />

        {/* ── Top overlay: nav + pillole + carosello ── */}
        <div className="absolute inset-x-0 top-0 z-20 px-3 sm:px-4 pt-[calc(env(safe-area-inset-top,0px)+10px)]">
          <HubNavBar />
          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {statPills.map(({ icon: Icon, label }) => (
                <span key={label} className="shrink-0 flex items-center gap-1.5 bg-white text-stone-700 text-[11px] font-semibold whitespace-nowrap px-2.5 py-1.5 rounded-full shadow-sm">
                  <Icon className="w-3 h-3" /> {label}
                </span>
              ))}
            </div>
            {ambientPhotos.length > 1 && (
              <div className="flex gap-1.5 shrink-0">
                {ambientPhotos.map((_, i) => (
                  <button
                    key={i} aria-label={`Foto ${i + 1}`} onClick={() => setPhotoIndex(i)}
                    className={`h-1.5 rounded-full transition-all ${i === photoIndex % ambientPhotos.length ? 'bg-white w-4' : 'bg-white/40 w-1.5'}`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Bottom overlay: titolo/sottotitolo + anello o grafico + filmstrip ── */}
        <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-3 pb-[calc(env(safe-area-inset-bottom,0px)+10px)]">
          <div className="px-4 sm:px-10">
            <div key={selectedId} className="fade-up">
              <div className="flex items-center gap-2">
                <p className="font-display text-2xl sm:text-4xl font-black uppercase tracking-tight text-white leading-[1.05] truncate" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>
                  {selected.title}
                </p>
                {selected.guideSection && (
                  <span className="shrink-0 bg-white/85 rounded-full p-0.5">
                    <InfoButton section={selected.guideSection} onGuideLink={openGuide} />
                  </span>
                )}
              </div>
              <p className="font-body text-[13px] sm:text-sm text-white/85 leading-snug mt-1.5 max-w-md" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.55)' }}>
                {selected.subtitle}
              </p>
            </div>

            {selected.visual === 'ring' && (
              <div key={`ring-${selectedId}`} className="mt-2.5 fade-up">
                <TrailScoreGaugeBadge total={selected.ringValue ?? null} safety={null} showLabel={false} size={64} />
              </div>
            )}

            {selected.visual === 'chart' && selected.chart && (
              <div key={`chart-${selectedId}`} className="mt-3 bg-black/30 backdrop-blur-md rounded-2xl p-3 sm:p-4 max-w-xl fade-up">
                {selected.chart}
              </div>
            )}
          </div>

          <div className="flex gap-2.5 overflow-x-auto px-4 sm:px-10 pb-1" style={{ scrollSnapType: 'x proximity' }}>
            {galleryItems.map(item => (
              <FilmstripTile key={item.id} item={item} selected={item.id === selectedId} onSelect={() => setSelectedId(item.id)} />
            ))}
            <Link
              href="/statistiche"
              className="shrink-0 w-20 h-20 rounded-2xl overflow-hidden relative border-[1.5px] border-dashed border-white/40 bg-white/10 flex flex-col items-center justify-center gap-1 hover:bg-white/15 transition-colors"
              style={{ scrollSnapAlign: 'start' }}
            >
              <ArrowRight className="w-5 h-5 text-white/80" />
              <span className="text-[9px] font-bold text-white/80 leading-tight text-center px-1">Tutte le statistiche</span>
            </Link>
          </div>
        </div>
      </div>

      {guideOpen && <GuideOverlay anchor={guideAnchor} onClose={() => setGuideOpen(false)} />}
    </>
  )
}

function FilmstripTile({ item, selected, onSelect }: { item: GalleryItem; selected: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      aria-pressed={selected}
      className={`shrink-0 w-20 h-20 rounded-2xl overflow-hidden relative ${
        selected ? 'border-[3px] border-sky-400 shadow-[0_0_0_2px_rgba(56,189,248,0.35)]' : 'border-[1.5px] border-white/35'
      }`}
      style={{ scrollSnapAlign: 'start' }}
    >
      {item.routePolyline ? (
        <div className="absolute inset-0 bg-gradient-to-b from-forest-50 to-stone-50 bg-topography">
          <div className="absolute inset-1.5">
            <RouteThumb polyline={item.routePolyline} color="#2d7a3d" strokeWidth={2} />
          </div>
        </div>
      ) : (
        <div className="absolute inset-0">
          <div className="absolute inset-0" style={{ background: `linear-gradient(to bottom, ${item.gradientColor}33, #f8f7f4)` }} />
          <div className="absolute inset-0 bg-topography" />
          <div className="absolute inset-0 flex items-center justify-center">
            {item.emoji
              ? <span className="text-2xl">{item.emoji}</span>
              : <TileIllustration kind={item.illustration} tone={item.gradientColor} className="w-9 h-9" />}
          </div>
        </div>
      )}
      <div className="absolute top-1 left-1">
        <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold shadow-sm leading-none ${
          item.highlight ? 'bg-amber-400 text-amber-950' : 'bg-white/90 text-stone-800'
        }`}>
          {item.badgeText}
        </span>
      </div>
      <div className="absolute bottom-0 inset-x-0 px-1.5 pb-1 pt-3 bg-gradient-to-t from-black/75 to-transparent">
        <span className="block text-[10px] font-bold text-white truncate leading-tight">{item.title}</span>
      </div>
    </button>
  )
}
