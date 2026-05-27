'use client'
import { useEffect, useState, useMemo, useCallback } from 'react'
import Navbar from '@/components/Navbar'
import StatCard from '@/components/StatCard'
import { getAllActivities, getActivityById, computeGlobalStats, type ActivityMeta, type StoredActivity } from '@/lib/blobStore'
import { exportAllActivitiesToExcel } from '@/utils/exportExcel'
import { formatDuration, msToKmh } from '@/lib/tcxParser'
import {
  formatPaceMinkm, difficultyIndex, caloriesPerHour,
  getPersonalRecords, computeStreaks, haversineM, COMPARISON_COLORS,
} from '@/lib/stats'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, ScatterChart, Scatter, ZAxis,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend,
} from 'recharts'
import {
  FileSpreadsheet, TrendingUp, Mountain, Heart, Route, Flame, Clock,
  Loader2, Trophy, Zap, Target, CalendarDays, Activity, GitCommitHorizontal,
  ChevronUp, Check, Share2,
} from 'lucide-react'
import ShareModal from '@/components/ShareModal'

// ── Types ──────────────────────────────────────────────────────────────────────
type Tab = 'panoramica' | 'grafici' | 'confronta'

// ── Heatmap component ──────────────────────────────────────────────────────────
function ActivityHeatmap({ activities, year }: { activities: ActivityMeta[]; year: number }) {
  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const a of activities) {
      const key = format(new Date(a.startTime), 'yyyy-MM-dd')
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return map
  }, [activities])

  const cells = useMemo(() => {
    const jan1 = new Date(year, 0, 1)
    const dec31 = new Date(year, 11, 31)
    // Pad to Monday
    const start = new Date(jan1)
    const dow = start.getDay()
    start.setDate(start.getDate() - (dow === 0 ? 6 : dow - 1))
    const all: Date[] = []
    const d = new Date(start)
    while (d <= dec31) { all.push(new Date(d)); d.setDate(d.getDate() + 1) }
    // Pad to complete last week
    while (all.length % 7 !== 0) { all.push(new Date(d)); d.setDate(d.getDate() + 1) }
    return all
  }, [year])

  const weeks = cells.length / 7
  const monthLabels = useMemo(() => {
    const labels: { label: string; col: number }[] = []
    let lastMonth = -1
    cells.forEach((d, i) => {
      if (d.getFullYear() === year && d.getMonth() !== lastMonth) {
        lastMonth = d.getMonth()
        labels.push({ label: format(d, 'MMM', { locale: it }), col: Math.floor(i / 7) })
      }
    })
    return labels
  }, [cells, year])

  const colorClass = (count: number, inYear: boolean) => {
    if (!inYear) return 'bg-transparent'
    if (count === 0) return 'bg-stone-100 hover:bg-stone-200'
    if (count === 1) return 'bg-forest-200 hover:bg-forest-300'
    if (count === 2) return 'bg-forest-400 hover:bg-forest-500'
    return 'bg-forest-600 hover:bg-forest-700'
  }

  return (
    <div className="overflow-x-auto pb-2">
      {/* Month labels */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${weeks}, 12px)`, gap: '2px', marginBottom: '4px' }}>
        {Array.from({ length: weeks }, (_, col) => {
          const lbl = monthLabels.find(l => l.col === col)
          return <div key={col} className="text-[10px] text-stone-400">{lbl?.label ?? ''}</div>
        })}
      </div>
      <div className="flex gap-1">
        {/* Day labels */}
        <div className="flex flex-col gap-0.5 mr-1">
          {['L', '', 'M', '', 'G', '', 'S'].map((d, i) => (
            <div key={i} className="text-[10px] text-stone-400 w-3 h-3 flex items-center justify-center">{d}</div>
          ))}
        </div>
        {/* Grid: 7 rows × N weeks (column flow) */}
        <div style={{
          display: 'grid',
          gridTemplateRows: 'repeat(7, 12px)',
          gridTemplateColumns: `repeat(${weeks}, 12px)`,
          gridAutoFlow: 'column',
          gap: '2px',
        }}>
          {cells.map((day, i) => {
            const key = format(day, 'yyyy-MM-dd')
            const count = counts.get(key) ?? 0
            const inYear = day.getFullYear() === year
            return (
              <div
                key={i}
                title={inYear ? `${format(day, 'dd MMM yyyy', { locale: it })}: ${count} escursion${count !== 1 ? 'i' : 'e'}` : ''}
                className={`rounded-sm transition-colors cursor-default ${colorClass(count, inYear)}`}
              />
            )
          })}
        </div>
      </div>
      <div className="flex items-center gap-1.5 mt-2">
        <span className="text-[10px] text-stone-400">Meno</span>
        {['bg-stone-100', 'bg-forest-200', 'bg-forest-400', 'bg-forest-600'].map(c => (
          <div key={c} className={`w-3 h-3 rounded-sm ${c}`} />
        ))}
        <span className="text-[10px] text-stone-400">Di più</span>
      </div>
    </div>
  )
}

// ── Record card ────────────────────────────────────────────────────────────────
function RecordCard({ label, value, sub, icon, href }: {
  label: string; value: string; sub?: string; icon: React.ReactNode; href?: string
}) {
  const inner = (
    <div className="bg-white rounded-xl border border-stone-200 p-4 flex items-start gap-3 hover:border-forest-300 transition-colors">
      <div className="text-terra-500 mt-0.5">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-stone-400 uppercase tracking-wide font-medium">{label}</p>
        <p className="font-display text-lg font-semibold text-stone-800 leading-tight truncate">{value}</p>
        {sub && <p className="text-xs text-stone-500 truncate mt-0.5">{sub}</p>}
      </div>
    </div>
  )
  if (href) return <a href={href}>{inner}</a>
  return inner
}

// ── Elevation profile builder ──────────────────────────────────────────────────
function buildElevProfile(activity: StoredActivity, samples = 60): { pct: number; alt: number }[] {
  const pts = activity.trackPoints.filter(p => p.lat !== undefined && p.lon !== undefined && p.altitudeMeters !== undefined)
  if (pts.length < 2) return []
  const cumDist: number[] = [0]
  for (let i = 1; i < pts.length; i++) {
    cumDist.push(cumDist[i - 1] + haversineM(pts[i - 1].lat!, pts[i - 1].lon!, pts[i].lat!, pts[i].lon!))
  }
  const total = cumDist[cumDist.length - 1]
  if (total === 0) return []
  return Array.from({ length: samples }, (_, s) => {
    const target = (s / (samples - 1)) * total
    let idx = cumDist.findIndex(d => d >= target)
    if (idx < 0) idx = cumDist.length - 1
    return { pct: Math.round(s / (samples - 1) * 100), alt: Math.round(pts[idx].altitudeMeters!) }
  })
}

// ── HR zone calculator ─────────────────────────────────────────────────────────
const ZONE_NAMES = ['Z1 Recupero', 'Z2 Aerobico', 'Z3 Soglia', 'Z4 Lattato', 'Z5 VO₂max']
const ZONE_COLORS = ['#93c5fd', '#6ee7b7', '#fde047', '#fb923c', '#f87171']
const ZONE_THRESHOLDS = [0.6, 0.7, 0.8, 0.9, 1.0]

function computeHRZones(activity: StoredActivity): { name: string; pct: number; color: string }[] {
  const maxHR = activity.maxHeartRate || 190
  const pts = activity.trackPoints.filter(p => p.heartRateBpm !== undefined)
  if (pts.length === 0) return []
  const counts = [0, 0, 0, 0, 0]
  for (const p of pts) {
    const ratio = p.heartRateBpm! / maxHR
    const zone = ratio < 0.6 ? 0 : ratio < 0.7 ? 1 : ratio < 0.8 ? 2 : ratio < 0.9 ? 3 : 4
    counts[zone]++
  }
  const total = counts.reduce((a, b) => a + b, 0)
  return ZONE_NAMES.map((name, i) => ({
    name, color: ZONE_COLORS[i], pct: total > 0 ? Math.round(counts[i] / total * 100) : 0,
  }))
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function StatistichePage() {
  const [activities, setActivities]   = useState<ActivityMeta[]>([])
  const [loading, setLoading]         = useState(true)
  const [tab, setTab]                 = useState<Tab>('panoramica')
  const [heatmapYear, setHeatmapYear] = useState(new Date().getFullYear())
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [fullData, setFullData]       = useState<Map<string, StoredActivity>>(new Map())
  const [loadingFull, setLoadingFull] = useState(false)
  const [shareKind, setShareKind]     = useState<'stats' | 'comparison' | null>(null)

  useEffect(() => {
    getAllActivities().then(setActivities).finally(() => setLoading(false))
  }, [])

  const stats   = computeGlobalStats(activities)
  const records = useMemo(() => getPersonalRecords(activities), [activities])
  const streaks = useMemo(() => computeStreaks(activities), [activities])

  const years = useMemo(() => {
    if (activities.length === 0) return [new Date().getFullYear()]
    const ys = Array.from(new Set(activities.map(a => new Date(a.startTime).getFullYear()))).sort()
    if (!ys.includes(new Date().getFullYear())) ys.push(new Date().getFullYear())
    return ys
  }, [activities])

  const monthlyData = useMemo(() =>
    activities.reduce((acc, a) => {
      const month = format(new Date(a.startTime), 'MMM yy', { locale: it })
      const ex = acc.find(d => d.month === month)
      if (ex) { ex.km += a.distanceMeters / 1000; ex.gain += a.elevationGain; ex.count++ }
      else acc.push({ month, km: a.distanceMeters / 1000, gain: a.elevationGain, count: 1 })
      return acc
    }, [] as { month: string; km: number; gain: number; count: number }[])
      .map(d => ({ ...d, km: Math.round(d.km * 10) / 10, gain: Math.round(d.gain) }))
      .slice(-12)
  , [activities])

  const fcTrend = useMemo(() =>
    [...activities]
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
      .map(a => ({ data: format(new Date(a.startTime), 'dd/MM'), fc: a.avgHeartRate, km: +(a.distanceMeters / 1000).toFixed(1) }))
  , [activities])

  const scatterData = useMemo(() =>
    activities.map(a => ({
      km: +(a.distanceMeters / 1000).toFixed(2),
      gain: Math.round(a.elevationGain),
      title: a.title ?? 'Escursione',
      id: a.id,
    }))
  , [activities])

  // ── Comparison ───────────────────────────────────────────────────────────────
  const selectedMeta = useMemo(() => activities.filter(a => selectedIds.has(a.id)), [activities, selectedIds])

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else if (next.size < 4) next.add(id)
      return next
    })
  }

  const loadFullData = useCallback(async () => {
    setLoadingFull(true)
    const map = new Map<string, StoredActivity>(Array.from(fullData.entries()))
    const ids = Array.from(selectedIds)
    for (const id of ids) {
      if (!map.has(id)) {
        const a = await getActivityById(id)
        if (a) map.set(id, a)
      }
    }
    setFullData(map)
    setLoadingFull(false)
  }, [selectedIds, fullData])

  const radarData = useMemo(() => {
    if (selectedMeta.length < 2) return []
    const metrics = [
      { label: 'Distanza', get: (a: ActivityMeta) => a.distanceMeters / 1000 },
      { label: 'Dislivello', get: (a: ActivityMeta) => a.elevationGain },
      { label: 'FC Media', get: (a: ActivityMeta) => a.avgHeartRate },
      { label: 'Velocità', get: (a: ActivityMeta) => a.avgSpeedMs * 3.6 },
      { label: 'Calorie', get: (a: ActivityMeta) => a.calories },
      { label: 'Durata', get: (a: ActivityMeta) => a.totalTimeSeconds / 3600 },
    ]
    return metrics.map(m => {
      const vals = selectedMeta.map(a => m.get(a))
      const mx = Math.max(...vals) || 1
      const row: Record<string, any> = { metric: m.label }
      selectedMeta.forEach((a, i) => { row[`a${i}`] = Math.round(vals[i] / mx * 100) })
      return row
    })
  }, [selectedMeta])

  const elevProfiles = useMemo(() => {
    if (selectedMeta.length < 2) return []
    return selectedMeta.map(m => {
      const full = fullData.get(m.id)
      return full ? buildElevProfile(full) : []
    })
  }, [selectedMeta, fullData])

  const elevMerged = useMemo(() => {
    if (elevProfiles.every(p => p.length === 0)) return []
    return Array.from({ length: 60 }, (_, i) => {
      const pct = Math.round(i / 59 * 100)
      const row: Record<string, any> = { pct }
      elevProfiles.forEach((profile, pi) => {
        if (profile.length > 0) {
          const idx = Math.min(Math.round(i * (profile.length - 1) / 59), profile.length - 1)
          row[`a${pi}`] = profile[idx]?.alt
        }
      })
      return row
    })
  }, [elevProfiles])

  const hrZones = useMemo(() => {
    return selectedMeta.map(m => {
      const full = fullData.get(m.id)
      return full ? computeHRZones(full) : []
    })
  }, [selectedMeta, fullData])

  const allFullLoaded = selectedMeta.length >= 2 && selectedMeta.every(m => fullData.has(m.id))

  // ── Tab nav ───────────────────────────────────────────────────────────────────
  const TABS: { id: Tab; label: string }[] = [
    { id: 'panoramica', label: 'Panoramica' },
    { id: 'grafici',    label: 'Grafici' },
    { id: 'confronta',  label: 'Confronto' },
  ]

  return (
    <div className="min-h-screen bg-stone-50 pb-20 md:pb-0">
      <Navbar />
      <main className="max-w-6xl mx-auto px-3 sm:px-4 py-5 sm:py-8 fade-up">

        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-5 sm:mb-6 flex-wrap">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-semibold text-stone-800">Statistiche</h1>
            <p className="text-stone-500 text-sm mt-1">
              {loading ? 'Caricamento…' : `${stats.totalActivities} escursioni registrate`}
            </p>
          </div>
          {!loading && activities.length > 0 && (
            <div className="flex gap-2">
              <button
                onClick={() => setShareKind('stats')}
                className="flex items-center gap-1.5 px-3 py-2 bg-forest-700 text-white rounded-xl text-sm hover:bg-forest-600 transition-colors"
              >
                <Share2 className="w-4 h-4" /> <span className="hidden sm:inline">Condividi</span>
              </button>
              <button
                onClick={() => exportAllActivitiesToExcel(activities as any)}
                className="flex items-center gap-1.5 px-3 py-2 bg-forest-700 text-white rounded-xl text-sm hover:bg-forest-600 transition-colors"
              >
                <FileSpreadsheet className="w-4 h-4" /> <span className="hidden sm:inline">Esporta Excel</span>
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 text-stone-400 gap-3">
            <Loader2 className="w-6 h-6 animate-spin" /><span>Caricamento dati…</span>
          </div>
        ) : activities.length === 0 ? (
          <div className="text-center py-24 text-stone-400">
            <Mountain className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium">Nessuna escursione ancora</p>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex gap-1 bg-stone-100 rounded-xl p-1 mb-6 sm:mb-8 w-full sm:w-fit">
              {TABS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex-1 sm:flex-none px-3 sm:px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                    tab === t.id ? 'bg-white shadow-sm text-forest-700' : 'text-stone-500 hover:text-stone-700'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── PANORAMICA ──────────────────────────────────────────────────── */}
            {tab === 'panoramica' && (
              <div className="space-y-8">
                {/* Global stats */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <StatCard label="Distanza totale"   value={`${stats.totalDistanceKm.toFixed(1)} km`}                         color="forest" icon={<Route className="w-3.5 h-3.5"/>} />
                  <StatCard label="Tempo totale"      value={formatDuration(stats.totalTimeSeconds)}                            color="terra"  icon={<Clock className="w-3.5 h-3.5"/>} />
                  <StatCard label="Calorie totali"    value={`${stats.totalCalories.toLocaleString('it')} kcal`}               color="red"    icon={<Flame className="w-3.5 h-3.5"/>} />
                  <StatCard label="Dislivello totale" value={`${Math.round(stats.totalElevationGain).toLocaleString('it')} m`} color="forest" icon={<Mountain className="w-3.5 h-3.5"/>} />
                  <StatCard label="FC media storica"  value={`${stats.avgHeartRate} bpm`}                                      color="red"    icon={<Heart className="w-3.5 h-3.5"/>} />
                  <StatCard label="Quota max mai"     value={`${Math.round(stats.highestAlt)} m`}                              color="blue"   icon={<TrendingUp className="w-3.5 h-3.5"/>} />
                </div>

                {/* Streak */}
                <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
                  <h3 className="font-medium text-stone-700 mb-4 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-forest-600" /> Continuità
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                    {[
                      { label: 'Streak attuale (giorni)', value: streaks.currentDays },
                      { label: 'Record streak (giorni)',  value: streaks.longestDays },
                      { label: 'Streak attuale (settimane)', value: streaks.currentWeeks },
                      { label: 'Record streak (settimane)', value: streaks.longestWeeks },
                      { label: 'Giorni attivi totali',   value: streaks.totalActiveDays },
                      { label: 'Settimane attive totali',value: streaks.totalActiveWeeks },
                    ].map(({ label, value }) => (
                      <div key={label} className="text-center">
                        <p className="font-display text-3xl font-bold text-forest-700">{value}</p>
                        <p className="text-xs text-stone-400 mt-1 leading-tight">{label}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Personal records */}
                <div>
                  <h3 className="font-medium text-stone-700 mb-3 flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-terra-500" /> Record personali
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {records.longestKm && (
                      <RecordCard label="Più lunga" icon={<Route className="w-4 h-4"/>}
                        value={`${(records.longestKm.distanceMeters/1000).toFixed(2)} km`}
                        sub={records.longestKm.title ?? 'Escursione'}
                        href={`/escursione/${encodeURIComponent(records.longestKm.id)}`}
                      />
                    )}
                    {records.highestGain && (
                      <RecordCard label="Più dislivello" icon={<Mountain className="w-4 h-4"/>}
                        value={`${Math.round(records.highestGain.elevationGain)} m D+`}
                        sub={records.highestGain.title ?? 'Escursione'}
                        href={`/escursione/${encodeURIComponent(records.highestGain.id)}`}
                      />
                    )}
                    {records.fastestPace && (
                      <RecordCard label="Passo più veloce" icon={<Zap className="w-4 h-4"/>}
                        value={formatPaceMinkm(records.fastestPace.distanceMeters, records.fastestPace.totalTimeSeconds)}
                        sub={records.fastestPace.title ?? 'Escursione'}
                        href={`/escursione/${encodeURIComponent(records.fastestPace.id)}`}
                      />
                    )}
                    {records.highestAlt && (
                      <RecordCard label="Quota massima" icon={<ChevronUp className="w-4 h-4"/>}
                        value={`${Math.round(records.highestAlt.altitudeMax)} m slm`}
                        sub={records.highestAlt.title ?? 'Escursione'}
                        href={`/escursione/${encodeURIComponent(records.highestAlt.id)}`}
                      />
                    )}
                    {records.longestDuration && (
                      <RecordCard label="Più lunga (durata)" icon={<Clock className="w-4 h-4"/>}
                        value={formatDuration(records.longestDuration.totalTimeSeconds)}
                        sub={records.longestDuration.title ?? 'Escursione'}
                        href={`/escursione/${encodeURIComponent(records.longestDuration.id)}`}
                      />
                    )}
                    {records.mostCalories && (
                      <RecordCard label="Più calorie" icon={<Flame className="w-4 h-4"/>}
                        value={`${records.mostCalories.calories} kcal`}
                        sub={records.mostCalories.title ?? 'Escursione'}
                        href={`/escursione/${encodeURIComponent(records.mostCalories.id)}`}
                      />
                    )}
                    {records.highestHR && (
                      <RecordCard label="FC massima registrata" icon={<Heart className="w-4 h-4"/>}
                        value={`${records.highestHR.maxHeartRate} bpm`}
                        sub={records.highestHR.title ?? 'Escursione'}
                        href={`/escursione/${encodeURIComponent(records.highestHR.id)}`}
                      />
                    )}
                    {records.highestDifficulty && (
                      <RecordCard label="Più difficile (D+/km)" icon={<Target className="w-4 h-4"/>}
                        value={`${difficultyIndex(records.highestDifficulty.elevationGain, records.highestDifficulty.distanceMeters)} m/km`}
                        sub={records.highestDifficulty.title ?? 'Escursione'}
                        href={`/escursione/${encodeURIComponent(records.highestDifficulty.id)}`}
                      />
                    )}
                  </div>
                </div>

                {/* Table */}
                <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-stone-100">
                    <h3 className="font-medium text-stone-700">Tutte le escursioni</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-stone-50 text-stone-500 text-xs uppercase tracking-wider">
                        <tr>
                          {['Data','Titolo','Distanza','Durata','Passo','D+/km','FC media','Calorie','Cal/h'].map(h => (
                            <th key={h} className="px-4 py-3 text-left font-medium whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {activities.map(a => (
                          <tr key={a.id} className="hover:bg-stone-50 cursor-pointer transition-colors"
                            onClick={() => window.location.href = `/escursione/${encodeURIComponent(a.id)}`}>
                            <td className="px-4 py-3 text-stone-500 whitespace-nowrap">{format(new Date(a.startTime), 'dd/MM/yy')}</td>
                            <td className="px-4 py-3 font-medium text-stone-700 max-w-[180px] truncate">{a.title ?? 'Escursione'}</td>
                            <td className="px-4 py-3 font-mono text-stone-600">{(a.distanceMeters/1000).toFixed(2)} km</td>
                            <td className="px-4 py-3 font-mono text-stone-600">{formatDuration(a.totalTimeSeconds)}</td>
                            <td className="px-4 py-3 font-mono text-terra-600">{formatPaceMinkm(a.distanceMeters, a.totalTimeSeconds)}</td>
                            <td className="px-4 py-3 font-mono text-forest-600">{difficultyIndex(a.elevationGain, a.distanceMeters)} m/km</td>
                            <td className="px-4 py-3 font-mono text-red-600">{a.avgHeartRate} bpm</td>
                            <td className="px-4 py-3 font-mono text-terra-600">{a.calories} kcal</td>
                            <td className="px-4 py-3 font-mono text-stone-500">{caloriesPerHour(a.calories, a.totalTimeSeconds)} kcal/h</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ── GRAFICI ─────────────────────────────────────────────────────── */}
            {tab === 'grafici' && (
              <div className="space-y-6">
                {/* Annual heatmap */}
                <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-medium text-stone-700 flex items-center gap-2">
                      <CalendarDays className="w-4 h-4 text-forest-600" /> Attività annuale
                    </h3>
                    <div className="flex gap-1">
                      {years.map(y => (
                        <button key={y} onClick={() => setHeatmapYear(y)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                            y === heatmapYear ? 'bg-forest-100 text-forest-700' : 'text-stone-400 hover:text-stone-600'
                          }`}>{y}</button>
                      ))}
                    </div>
                  </div>
                  <ActivityHeatmap activities={activities} year={heatmapYear} />
                </div>

                {/* Monthly km + D+ */}
                <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
                  <h3 className="font-medium text-stone-700 mb-4">Distanza e dislivello mensili</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthlyData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e8e4dc" />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} />
                        <YAxis yAxisId="km" orientation="left" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} unit=" km" width={48} />
                        <YAxis yAxisId="gain" orientation="right" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} unit=" m" width={52} />
                        <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e8e4dc', fontSize: 12 }}
                          formatter={(v: any, name: string) => [name === 'km' ? `${v} km` : `${v} m`, name === 'km' ? 'Distanza' : 'Dislivello']} />
                        <Legend formatter={(v: string) => v === 'km' ? 'Distanza (km)' : 'Dislivello D+ (m)'} wrapperStyle={{ fontSize: 12 }} />
                        <Bar yAxisId="km" dataKey="km" fill="#378d44" radius={[4,4,0,0]} />
                        <Bar yAxisId="gain" dataKey="gain" fill="#c05a17" radius={[4,4,0,0]} opacity={0.8} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* FC fitness trend */}
                <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
                  <h3 className="font-medium text-stone-700 mb-1">Trend fitness (FC media)</h3>
                  <p className="text-xs text-stone-400 mb-4">Se la FC media scende nel tempo mantenendo distanze simili, stai migliorando.</p>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={fcTrend} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e8e4dc" />
                        <XAxis dataKey="data" tick={{ fontSize: 11 }} tickLine={false} />
                        <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} unit=" bpm" width={60} />
                        <Tooltip formatter={(v: number) => [`${v} bpm`, 'FC media']} contentStyle={{ borderRadius: 8, border: '1px solid #e8e4dc', fontSize: 12 }} />
                        <Line type="monotone" dataKey="fc" stroke="#C0392B" strokeWidth={2} dot={{ r: 4, fill: '#C0392B' }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Scatter km vs D+ */}
                <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
                  <h3 className="font-medium text-stone-700 mb-1">Distanza vs Dislivello</h3>
                  <p className="text-xs text-stone-400 mb-4">In alto a destra le escursioni più impegnative; in basso a sinistra le più facili.</p>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e8e4dc" />
                        <XAxis type="number" dataKey="km" name="Distanza" unit=" km" tick={{ fontSize: 11 }} tickLine={false} />
                        <YAxis type="number" dataKey="gain" name="Dislivello" unit=" m" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={56} />
                        <ZAxis range={[60, 60]} />
                        <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ borderRadius: 8, border: '1px solid #e8e4dc', fontSize: 12 }}
                          content={({ payload }) => {
                            if (!payload?.length) return null
                            const d = payload[0].payload
                            return (
                              <div className="bg-white border border-stone-200 rounded-lg p-2 text-xs shadow">
                                <p className="font-medium text-stone-700 mb-1">{d.title}</p>
                                <p className="text-forest-700">{d.km} km</p>
                                <p className="text-terra-600">↑ {d.gain} m</p>
                              </div>
                            )
                          }} />
                        <Scatter data={scatterData} fill="#378d44" fillOpacity={0.75}
                          onClick={(d: any) => window.location.href = `/escursione/${encodeURIComponent(d.id)}`}
                          style={{ cursor: 'pointer' }} />
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {/* ── CONFRONTO ───────────────────────────────────────────────────── */}
            {tab === 'confronta' && (
              <div className="space-y-6">
                <div>
                  <p className="text-sm text-stone-500 mb-4">Seleziona da 2 a 4 escursioni per confrontarle.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
                    {activities.map(a => {
                      const sel = selectedIds.has(a.id)
                      const disabled = !sel && selectedIds.size >= 4
                      return (
                        <button key={a.id} disabled={disabled}
                          onClick={() => toggleSelect(a.id)}
                          className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all
                            ${sel ? 'border-forest-400 bg-forest-50' : 'border-stone-200 bg-white hover:border-stone-300'}
                            ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                        >
                          <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0
                            ${sel ? 'bg-forest-600 border-forest-600' : 'border-stone-300'}`}>
                            {sel && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-stone-700 truncate">{a.title ?? 'Escursione'}</p>
                            <p className="text-xs text-stone-400">{format(new Date(a.startTime), 'dd MMM yy', { locale: it })} · {(a.distanceMeters/1000).toFixed(1)} km · ↑{Math.round(a.elevationGain)} m</p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {selectedMeta.length >= 2 && (
                  <div className="space-y-6">
                    {/* Stats table */}
                    <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
                      <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
                        <h3 className="font-medium text-stone-700">Confronto statistiche</h3>
                        <button
                          onClick={() => setShareKind('comparison')}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-forest-700 text-white rounded-lg text-xs hover:bg-forest-600 transition-colors"
                        >
                          <Share2 className="w-3.5 h-3.5" /> Condividi
                        </button>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-stone-50">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs text-stone-400 uppercase tracking-wide font-medium">Metrica</th>
                              {selectedMeta.map((a, i) => (
                                <th key={a.id} className="px-4 py-3 text-left text-xs font-medium" style={{ color: COMPARISON_COLORS[i] }}>
                                  {a.title ?? 'Escursione'}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-stone-100">
                            {[
                              { label: 'Data', fmt: (a: ActivityMeta) => format(new Date(a.startTime), 'dd/MM/yyyy') },
                              { label: 'Distanza', fmt: (a: ActivityMeta) => `${(a.distanceMeters/1000).toFixed(2)} km` },
                              { label: 'Durata', fmt: (a: ActivityMeta) => formatDuration(a.totalTimeSeconds) },
                              { label: 'Passo medio', fmt: (a: ActivityMeta) => formatPaceMinkm(a.distanceMeters, a.totalTimeSeconds) },
                              { label: 'Dislivello ↑', fmt: (a: ActivityMeta) => `${Math.round(a.elevationGain)} m` },
                              { label: 'Dislivello ↓', fmt: (a: ActivityMeta) => `${Math.round(a.elevationLoss)} m` },
                              { label: 'Indice difficoltà', fmt: (a: ActivityMeta) => `${difficultyIndex(a.elevationGain, a.distanceMeters)} m/km` },
                              { label: 'Quota massima', fmt: (a: ActivityMeta) => `${Math.round(a.altitudeMax)} m` },
                              { label: 'FC media', fmt: (a: ActivityMeta) => `${a.avgHeartRate} bpm` },
                              { label: 'FC massima', fmt: (a: ActivityMeta) => `${a.maxHeartRate} bpm` },
                              { label: 'Velocità media', fmt: (a: ActivityMeta) => `${msToKmh(a.avgSpeedMs)} km/h` },
                              { label: 'Calorie', fmt: (a: ActivityMeta) => `${a.calories} kcal` },
                              { label: 'Calorie/ora', fmt: (a: ActivityMeta) => `${caloriesPerHour(a.calories, a.totalTimeSeconds)} kcal/h` },
                            ].map(({ label, fmt }) => (
                              <tr key={label}>
                                <td className="px-4 py-2.5 text-stone-500 font-medium text-xs">{label}</td>
                                {selectedMeta.map((a, i) => (
                                  <td key={a.id} className="px-4 py-2.5 font-mono text-stone-700 text-xs" style={{ borderLeft: `3px solid ${COMPARISON_COLORS[i]}20` }}>
                                    {fmt(a)}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Radar chart */}
                    <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
                      <h3 className="font-medium text-stone-700 mb-4">Radar confronto (normalizzato 0-100)</h3>
                      <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                          <RadarChart data={radarData}>
                            <PolarGrid />
                            <PolarAngleAxis dataKey="metric" tick={{ fontSize: 12 }} />
                            <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
                            {selectedMeta.map((a, i) => (
                              <Radar key={a.id} name={a.title ?? `Escursione ${i+1}`}
                                dataKey={`a${i}`} stroke={COMPARISON_COLORS[i]}
                                fill={COMPARISON_COLORS[i]} fillOpacity={0.15} strokeWidth={2} />
                            ))}
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                            <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e8e4dc', fontSize: 12 }} />
                          </RadarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Elevation overlay + HR zones (load on demand) */}
                    <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-medium text-stone-700">Profili altimetrici sovrapposti + Zone FC</h3>
                        {!allFullLoaded && (
                          <button onClick={loadFullData} disabled={loadingFull}
                            className="flex items-center gap-2 px-4 py-2 bg-forest-600 text-white rounded-lg text-sm hover:bg-forest-700 transition-colors disabled:opacity-60">
                            {loadingFull ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mountain className="w-3.5 h-3.5" />}
                            Carica dati GPS
                          </button>
                        )}
                      </div>
                      {!allFullLoaded ? (
                        <p className="text-sm text-stone-400 text-center py-8">
                          Clicca "Carica dati GPS" per visualizzare i profili altimetrici e le zone cardiache.
                        </p>
                      ) : (
                        <div className="space-y-6">
                          {elevMerged.length > 0 && (
                            <div className="h-56">
                              <p className="text-xs text-stone-400 mb-2">X: % percorso completato · Y: quota (m slm)</p>
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={elevMerged} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#e8e4dc" />
                                  <XAxis dataKey="pct" unit="%" tick={{ fontSize: 10 }} tickLine={false} />
                                  <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} unit=" m" width={52} />
                                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e8e4dc', fontSize: 12 }} />
                                  {selectedMeta.map((a, i) => (
                                    elevProfiles[i].length > 0 && (
                                      <Line key={a.id} type="monotone" dataKey={`a${i}`}
                                        name={a.title ?? `Escursione ${i+1}`}
                                        stroke={COMPARISON_COLORS[i]} strokeWidth={2} dot={false} />
                                    )
                                  ))}
                                  <Legend wrapperStyle={{ fontSize: 12 }} />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          )}
                          {/* HR Zones */}
                          {hrZones.some(z => z.length > 0) && (
                            <div>
                              <p className="text-xs font-medium text-stone-500 mb-3 uppercase tracking-wide">Zone frequenza cardiaca (% del tempo)</p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {selectedMeta.map((a, i) => (
                                  hrZones[i].length > 0 && (
                                    <div key={a.id}>
                                      <p className="text-xs font-medium mb-2" style={{ color: COMPARISON_COLORS[i] }}>{a.title ?? `Escursione ${i+1}`}</p>
                                      <div className="space-y-1.5">
                                        {hrZones[i].map(z => (
                                          <div key={z.name} className="flex items-center gap-2">
                                            <span className="text-xs text-stone-500 w-24 shrink-0">{z.name}</span>
                                            <div className="flex-1 bg-stone-100 rounded-full h-3">
                                              <div className="h-3 rounded-full transition-all" style={{ width: `${z.pct}%`, backgroundColor: z.color }} />
                                            </div>
                                            <span className="text-xs text-stone-500 w-8 text-right">{z.pct}%</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {selectedIds.size === 0 && (
                  <div className="text-center py-12 text-stone-400">
                    <GitCommitHorizontal className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">Seleziona almeno 2 escursioni dalla lista per iniziare il confronto.</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {shareKind === 'stats' && (
        <ShareModal kind="stats" activities={activities} onClose={() => setShareKind(null)} />
      )}
      {shareKind === 'comparison' && (
        <ShareModal kind="comparison" activities={selectedMeta} onClose={() => setShareKind(null)} />
      )}
    </div>
  )
}
