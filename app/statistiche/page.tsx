'use client'
import { useEffect, useState, useMemo, useCallback } from 'react'
import Navbar from '@/components/Navbar'
import StatCard from '@/components/StatCard'
import RouteThumb from '@/components/RouteThumb'
import { getAllActivities, getActivityById, computeGlobalStats, type ActivityMeta, type StoredActivity } from '@/lib/blobStore'
import { getAllPlanned, type PlannedHikeMeta } from '@/lib/plannedStore'
import { exportAllActivitiesToExcel } from '@/utils/exportExcel'
import PdfExportButton from '@/components/PdfExportButton'
import { formatDuration, msToKmh } from '@/lib/tcxParser'
import {
  formatPaceMinkm, difficultyIndex, caloriesPerHour,
  getPersonalRecords, computeStreaks, haversineM, COMPARISON_COLORS,
} from '@/lib/stats'
import { computeTrainingLoad, activityStress, currentForm } from '@/lib/trainingLoad'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, ScatterChart, Scatter, ZAxis,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend,
  ReferenceLine,
} from 'recharts'
import {
  FileSpreadsheet, TrendingUp, Mountain, Heart, Route, Flame, Clock,
  Loader2, Trophy, Zap, Target, CalendarDays, Activity, GitCommitHorizontal,
  ChevronUp, Check, Share2, Brain, BarChart2, Shuffle,
} from 'lucide-react'
import ShareModal from '@/components/ShareModal'

// ── Types ──────────────────────────────────────────────────────────────────────
type Tab = 'panoramica' | 'grafici' | 'confronta' | 'forma'
type CompareMode = 'completate' | 'pianificate'

// ── Heatmap ────────────────────────────────────────────────────────────────────
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
    const start = new Date(jan1)
    const dow = start.getDay()
    start.setDate(start.getDate() - (dow === 0 ? 6 : dow - 1))
    const all: Date[] = []
    const d = new Date(start)
    while (d <= dec31) { all.push(new Date(d)); d.setDate(d.getDate() + 1) }
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
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${weeks}, 12px)`, gap: '2px', marginBottom: '4px' }}>
        {Array.from({ length: weeks }, (_, col) => {
          const lbl = monthLabels.find(l => l.col === col)
          return <div key={col} className="text-[10px] text-stone-400">{lbl?.label ?? ''}</div>
        })}
      </div>
      <div className="flex gap-1">
        <div className="flex flex-col gap-0.5 mr-1">
          {['L', '', 'M', '', 'G', '', 'S'].map((d, i) => (
            <div key={i} className="text-[10px] text-stone-400 w-3 h-3 flex items-center justify-center">{d}</div>
          ))}
        </div>
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
function RecordCard({ label, value, sub, icon, href, polyline }: {
  label: string; value: string; sub?: string; icon: React.ReactNode; href?: string; polyline?: [number, number][]
}) {
  const inner = (
    <div className="bg-white rounded-xl border border-stone-200 p-4 hover:border-forest-300 transition-colors h-full">
      <div className="flex items-start gap-3">
        <div className="text-terra-500 mt-0.5 shrink-0">{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-stone-400 uppercase tracking-wide font-medium">{label}</p>
          <p className="font-display text-xl font-bold text-stone-800 leading-tight mt-0.5">{value}</p>
          {sub && <p className="text-xs text-stone-700 font-semibold truncate mt-1.5 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-forest-400 shrink-0" />{sub}
          </p>}
        </div>
        {polyline && polyline.length > 1 && (
          <div className="w-14 h-14 rounded-xl bg-forest-50 border border-forest-100 overflow-hidden shrink-0">
            <RouteThumb polyline={polyline} color="#2d7a3d" strokeWidth={2.5} />
          </div>
        )}
      </div>
    </div>
  )
  if (href) return <a href={href} className="block h-full">{inner}</a>
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
const ZONE_NAMES  = ['Z1 Recupero', 'Z2 Aerobico', 'Z3 Soglia', 'Z4 Lattato', 'Z5 VO₂max']
const ZONE_COLORS = ['#93c5fd', '#6ee7b7', '#fde047', '#fb923c', '#f87171']

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
  const [activities,        setActivities]        = useState<ActivityMeta[]>([])
  const [loading,           setLoading]           = useState(true)
  const [tab,               setTab]               = useState<Tab>('panoramica')
  const [heatmapYear,       setHeatmapYear]       = useState(new Date().getFullYear())
  const [selectedIds,       setSelectedIds]       = useState<Set<string>>(new Set())
  const [fullData,          setFullData]          = useState<Map<string, StoredActivity>>(new Map())
  const [loadingFull,       setLoadingFull]       = useState(false)
  const [shareKind,         setShareKind]         = useState<'stats' | 'comparison' | null>(null)
  // Planned comparison
  const [compareMode,       setCompareMode]       = useState<CompareMode>('completate')
  const [plannedMetas,      setPlannedMetas]      = useState<PlannedHikeMeta[]>([])
  const [selectedPlannedIds, setSelectedPlannedIds] = useState<Set<string>>(new Set())
  const [loadingPlanned,    setLoadingPlanned]    = useState(false)

  useEffect(() => {
    getAllActivities().then(setActivities).finally(() => setLoading(false))
  }, [])

  // Load planned hikes when switching to that compare mode
  useEffect(() => {
    if (tab === 'confronta' && compareMode === 'pianificate' && plannedMetas.length === 0) {
      setLoadingPlanned(true)
      getAllPlanned().then(setPlannedMetas).finally(() => setLoadingPlanned(false))
    }
  }, [tab, compareMode, plannedMetas.length])

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

  // ── New chart data ─────────────────────────────────────────────────────────
  const weekdayData = useMemo(() => {
    const labels = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']
    const counts = [0, 0, 0, 0, 0, 0, 0]
    for (const a of activities) {
      const dow = new Date(a.startTime).getDay()
      counts[dow === 0 ? 6 : dow - 1]++
    }
    return labels.map((day, i) => ({ day, count: counts[i] }))
  }, [activities])

  const annualData = useMemo(() => {
    const map = new Map<number, { year: number; km: number; gain: number; count: number }>()
    for (const a of activities) {
      const y = new Date(a.startTime).getFullYear()
      const ex = map.get(y) ?? { year: y, km: 0, gain: 0, count: 0 }
      ex.km += a.distanceMeters / 1000; ex.gain += a.elevationGain; ex.count++
      map.set(y, ex)
    }
    return Array.from(map.values()).sort((a, b) => a.year - b.year)
      .map(d => ({ year: String(d.year), km: Math.round(d.km), gain: Math.round(d.gain), count: d.count }))
  }, [activities])

  const distHistogram = useMemo(() => [
    { label: '0–5 km',   count: activities.filter(a => a.distanceMeters < 5000).length },
    { label: '5–10 km',  count: activities.filter(a => a.distanceMeters >= 5000  && a.distanceMeters < 10000).length },
    { label: '10–15 km', count: activities.filter(a => a.distanceMeters >= 10000 && a.distanceMeters < 15000).length },
    { label: '15–20 km', count: activities.filter(a => a.distanceMeters >= 15000 && a.distanceMeters < 20000).length },
    { label: '20+ km',   count: activities.filter(a => a.distanceMeters >= 20000).length },
  ], [activities])

  const weeklyVolumeData = useMemo(() => {
    const out: { week: string; km: number; gain: number }[] = []
    for (let i = 15; i >= 0; i--) {
      const end   = new Date(); end.setDate(end.getDate() - i * 7)
      const start = new Date(end); start.setDate(start.getDate() - 6)
      const wActs = activities.filter(a => {
        const d = new Date(a.startTime); return d >= start && d <= end
      })
      out.push({
        week: format(start, 'dd/MM', { locale: it }),
        km:   Math.round(wActs.reduce((s, a) => s + a.distanceMeters / 1000, 0) * 10) / 10,
        gain: Math.round(wActs.reduce((s, a) => s + a.elevationGain, 0)),
      })
    }
    return out
  }, [activities])

  const weeklyAvg = useMemo(() => {
    const active = weeklyVolumeData.filter(w => w.km > 0)
    if (active.length === 0) return null
    return {
      avgKm:   Math.round(active.reduce((s, w) => s + w.km, 0) / active.length * 10) / 10,
      maxKm:   Math.max(...active.map(w => w.km)),
      avgGain: Math.round(active.reduce((s, w) => s + w.gain, 0) / active.length),
      maxGain: Math.max(...active.map(w => w.gain)),
      activeWeeks: active.length,
    }
  }, [weeklyVolumeData])

  const monthlyProgressData = useMemo(() => {
    const last6: { month: string; km: number; gain: number; esc: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i)
      const y = d.getFullYear(); const m = d.getMonth()
      const mActs = activities.filter(a => {
        const ad = new Date(a.startTime); return ad.getFullYear() === y && ad.getMonth() === m
      })
      last6.push({
        month: format(new Date(y, m, 1), 'MMM yy', { locale: it }),
        km:    Math.round(mActs.reduce((s, a) => s + a.distanceMeters / 1000, 0) * 10) / 10,
        gain:  Math.round(mActs.reduce((s, a) => s + a.elevationGain, 0)),
        esc:   mActs.length,
      })
    }
    return last6
  }, [activities])

  // ── Comparison (completate) ────────────────────────────────────────────────
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

  // ── Comparison (pianificate) ───────────────────────────────────────────────
  const togglePlannedSelect = (id: string) => {
    setSelectedPlannedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else if (next.size < 4) next.add(id)
      return next
    })
  }

  const selectedPlannedMeta = useMemo(() =>
    plannedMetas.filter(h => selectedPlannedIds.has(h.id)),
    [plannedMetas, selectedPlannedIds]
  )

  const plannedRadarData = useMemo(() => {
    if (selectedPlannedMeta.length < 2) return []
    const metrics = [
      { label: 'Distanza',    get: (h: PlannedHikeMeta) => h.distanceMeters / 1000 },
      { label: 'Dislivello',  get: (h: PlannedHikeMeta) => h.elevationGain },
      { label: 'Durata stim.', get: (h: PlannedHikeMeta) => h.estimatedTimeSeconds / 3600 },
      { label: 'Quota max',   get: (h: PlannedHikeMeta) => h.altitudeMax },
      { label: 'D+/km',       get: (h: PlannedHikeMeta) => difficultyIndex(h.elevationGain, h.distanceMeters) },
      { label: 'Bellezza',    get: (h: PlannedHikeMeta) => (h.cachedBeautyScore?.overall ?? 0) * 10 },
    ]
    return metrics.map(m => {
      const vals = selectedPlannedMeta.map(h => m.get(h))
      const mx = Math.max(...vals, 1)
      const row: Record<string, any> = { metric: m.label }
      selectedPlannedMeta.forEach((h, i) => { row[`a${i}`] = Math.round(vals[i] / mx * 100) })
      return row
    })
  }, [selectedPlannedMeta])

  // ── Training load (Forma) ─────────────────────────────────────────────────
  const trainingLoadData = useMemo(() => {
    const events = activities.map(a => ({
      date:   format(new Date(a.startTime), 'yyyy-MM-dd'),
      stress: activityStress(a.distanceMeters, a.elevationGain, a.totalTimeSeconds),
    }))
    return computeTrainingLoad(events, 90)
  }, [activities])

  const latestForm = useMemo(() => {
    if (trainingLoadData.length === 0) return null
    const last = trainingLoadData[trainingLoadData.length - 1]
    return { ...last, status: currentForm(last.tsb) }
  }, [trainingLoadData])

  // ── Tab nav ───────────────────────────────────────────────────────────────
  const TABS: { id: Tab; label: string }[] = [
    { id: 'panoramica', label: 'Panoramica' },
    { id: 'grafici',    label: 'Grafici' },
    { id: 'confronta',  label: 'Confronto' },
    { id: 'forma',      label: 'Forma' },
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
              <PdfExportButton
                variant="stats"
                data={activities as any}
                label="PDF Statistiche"
                className="flex items-center gap-1.5 px-3 py-2 bg-forest-700 text-white rounded-xl text-sm hover:bg-forest-600 transition-colors"
              />
              <PdfExportButton
                variant="map"
                data={activities as any}
                label="PDF Mappa"
                className="flex items-center gap-1.5 px-3 py-2 bg-forest-700 text-white rounded-xl text-sm hover:bg-forest-600 transition-colors"
              />
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
                      { label: 'Settimane attive totali', value: streaks.totalActiveWeeks },
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
                        polyline={records.longestKm.routePolyline}
                        href={`/escursione/${encodeURIComponent(records.longestKm.id)}`}
                      />
                    )}
                    {records.highestGain && (
                      <RecordCard label="Più dislivello" icon={<Mountain className="w-4 h-4"/>}
                        value={`${Math.round(records.highestGain.elevationGain)} m D+`}
                        sub={records.highestGain.title ?? 'Escursione'}
                        polyline={records.highestGain.routePolyline}
                        href={`/escursione/${encodeURIComponent(records.highestGain.id)}`}
                      />
                    )}
                    {records.fastestPace && (
                      <RecordCard label="Passo più veloce" icon={<Zap className="w-4 h-4"/>}
                        value={formatPaceMinkm(records.fastestPace.distanceMeters, records.fastestPace.totalTimeSeconds)}
                        sub={records.fastestPace.title ?? 'Escursione'}
                        polyline={records.fastestPace.routePolyline}
                        href={`/escursione/${encodeURIComponent(records.fastestPace.id)}`}
                      />
                    )}
                    {records.highestAlt && (
                      <RecordCard label="Quota massima" icon={<ChevronUp className="w-4 h-4"/>}
                        value={`${Math.round(records.highestAlt.altitudeMax)} m slm`}
                        sub={records.highestAlt.title ?? 'Escursione'}
                        polyline={records.highestAlt.routePolyline}
                        href={`/escursione/${encodeURIComponent(records.highestAlt.id)}`}
                      />
                    )}
                    {records.longestDuration && (
                      <RecordCard label="Più lunga (durata)" icon={<Clock className="w-4 h-4"/>}
                        value={formatDuration(records.longestDuration.totalTimeSeconds)}
                        sub={records.longestDuration.title ?? 'Escursione'}
                        polyline={records.longestDuration.routePolyline}
                        href={`/escursione/${encodeURIComponent(records.longestDuration.id)}`}
                      />
                    )}
                    {records.mostCalories && (
                      <RecordCard label="Più calorie" icon={<Flame className="w-4 h-4"/>}
                        value={`${records.mostCalories.calories} kcal`}
                        sub={records.mostCalories.title ?? 'Escursione'}
                        polyline={records.mostCalories.routePolyline}
                        href={`/escursione/${encodeURIComponent(records.mostCalories.id)}`}
                      />
                    )}
                    {records.highestHR && (
                      <RecordCard label="FC massima registrata" icon={<Heart className="w-4 h-4"/>}
                        value={`${records.highestHR.maxHeartRate} bpm`}
                        sub={records.highestHR.title ?? 'Escursione'}
                        polyline={records.highestHR.routePolyline}
                        href={`/escursione/${encodeURIComponent(records.highestHR.id)}`}
                      />
                    )}
                    {records.highestDifficulty && (
                      <RecordCard label="Più difficile (D+/km)" icon={<Target className="w-4 h-4"/>}
                        value={`${difficultyIndex(records.highestDifficulty.elevationGain, records.highestDifficulty.distanceMeters)} m/km`}
                        sub={records.highestDifficulty.title ?? 'Escursione'}
                        polyline={records.highestDifficulty.routePolyline}
                        href={`/escursione/${encodeURIComponent(records.highestDifficulty.id)}`}
                      />
                    )}
                  </div>
                </div>

                {/* Peak bagging shortcut */}
                <a href="/vette"
                  className="flex items-center gap-4 bg-gradient-to-r from-forest-700 to-forest-800 text-white rounded-2xl p-5 hover:from-forest-600 hover:to-forest-700 transition-all">
                  <Mountain className="w-8 h-8 text-forest-300 shrink-0" />
                  <div>
                    <p className="font-semibold text-lg">Vette Conquistate</p>
                    <p className="text-forest-300 text-sm">Visualizza tutte le cime raggiunte durante le tue escursioni →</p>
                  </div>
                </a>

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

                {/* Annual comparison (km + D+ per year) */}
                {annualData.length > 1 && (
                  <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
                    <h3 className="font-medium text-stone-700 mb-1 flex items-center gap-2">
                      <BarChart2 className="w-4 h-4 text-forest-600" /> Confronto annuale
                    </h3>
                    <p className="text-xs text-stone-400 mb-4">Distanza totale e dislivello anno per anno.</p>
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={annualData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e8e4dc" />
                          <XAxis dataKey="year" tick={{ fontSize: 12 }} tickLine={false} />
                          <YAxis yAxisId="km"   orientation="left"  tick={{ fontSize: 11 }} tickLine={false} axisLine={false} unit=" km" width={52} />
                          <YAxis yAxisId="gain" orientation="right" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} unit=" m"  width={56} />
                          <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e8e4dc', fontSize: 12 }}
                            formatter={(v: any, name: string) => [
                              name === 'km' ? `${v} km` : `${v} m`,
                              name === 'km' ? 'Distanza' : 'Dislivello D+',
                            ]} />
                          <Legend formatter={(v: string) => v === 'km' ? 'Distanza (km)' : 'Dislivello D+ (m)'} wrapperStyle={{ fontSize: 12 }} />
                          <Bar yAxisId="km"   dataKey="km"   fill="#378d44" radius={[4,4,0,0]} />
                          <Bar yAxisId="gain" dataKey="gain" fill="#c05a17" radius={[4,4,0,0]} opacity={0.8} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

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

                {/* Weekday distribution */}
                <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
                  <h3 className="font-medium text-stone-700 mb-1">Distribuzione per giorno della settimana</h3>
                  <p className="text-xs text-stone-400 mb-4">In quale giorno esci di più?</p>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={weekdayData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e8e4dc" vertical={false} />
                        <XAxis dataKey="day" tick={{ fontSize: 12, fontWeight: 600 }} tickLine={false} />
                        <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={28} allowDecimals={false} />
                        <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e8e4dc', fontSize: 12 }}
                          formatter={(v: any) => [v, 'Escursioni']} />
                        <Bar dataKey="count" fill="#378d44" radius={[6,6,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Distance distribution histogram */}
                <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
                  <h3 className="font-medium text-stone-700 mb-1">Distribuzione per lunghezza</h3>
                  <p className="text-xs text-stone-400 mb-4">Quante escursioni rientrano in ciascuna fascia di distanza?</p>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={distHistogram} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e8e4dc" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} />
                        <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={28} allowDecimals={false} />
                        <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e8e4dc', fontSize: 12 }}
                          formatter={(v: any) => [v, 'Escursioni']} />
                        <Bar dataKey="count" fill="#c05a17" radius={[6,6,0,0]} opacity={0.85} />
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
                {/* Mode toggle */}
                <div className="flex items-center gap-2">
                  <div className="flex gap-1 bg-stone-100 rounded-xl p-1">
                    <button onClick={() => { setCompareMode('completate'); setSelectedIds(new Set()); setSelectedPlannedIds(new Set()) }}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${compareMode === 'completate' ? 'bg-white shadow-sm text-forest-700' : 'text-stone-500 hover:text-stone-700'}`}>
                      <Activity className="w-3.5 h-3.5" /> Completate
                    </button>
                    <button onClick={() => { setCompareMode('pianificate'); setSelectedIds(new Set()); setSelectedPlannedIds(new Set()) }}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${compareMode === 'pianificate' ? 'bg-white shadow-sm text-sky-700' : 'text-stone-500 hover:text-stone-700'}`}>
                      <Shuffle className="w-3.5 h-3.5" /> Pianificate
                    </button>
                  </div>
                </div>

                {/* ── Completate mode ── */}
                {compareMode === 'completate' && (
                  <>
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
                        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
                          <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
                            <h3 className="font-medium text-stone-700">Confronto statistiche</h3>
                            <button onClick={() => setShareKind('comparison')}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-forest-700 text-white rounded-lg text-xs hover:bg-forest-600 transition-colors">
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
                            <p className="text-sm text-stone-400 text-center py-8">Clicca "Carica dati GPS" per visualizzare i profili altimetrici e le zone cardiache.</p>
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
                  </>
                )}

                {/* ── Pianificate mode ── */}
                {compareMode === 'pianificate' && (
                  <>
                    {loadingPlanned ? (
                      <div className="flex items-center justify-center py-16 gap-3 text-stone-400">
                        <Loader2 className="w-5 h-5 animate-spin" /><span>Caricamento escursioni pianificate…</span>
                      </div>
                    ) : (
                      <>
                        <div>
                          <p className="text-sm text-stone-500 mb-4">Seleziona da 2 a 4 escursioni pianificate per confrontarle.</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
                            {plannedMetas.map(h => {
                              const sel      = selectedPlannedIds.has(h.id)
                              const disabled = !sel && selectedPlannedIds.size >= 4
                              return (
                                <button key={h.id} disabled={disabled}
                                  onClick={() => togglePlannedSelect(h.id)}
                                  className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all
                                    ${sel ? 'border-sky-400 bg-sky-50' : 'border-stone-200 bg-white hover:border-stone-300'}
                                    ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                                >
                                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0
                                    ${sel ? 'bg-sky-600 border-sky-600' : 'border-stone-300'}`}>
                                    {sel && <Check className="w-3 h-3 text-white" />}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-stone-700 truncate">{h.title}</p>
                                    <p className="text-xs text-stone-400">
                                      {(h.distanceMeters/1000).toFixed(1)} km · ↑{Math.round(h.elevationGain)} m
                                      {h.cachedBeautyScore && ` · ★ ${h.cachedBeautyScore.overall.toFixed(1)}`}
                                    </p>
                                  </div>
                                </button>
                              )
                            })}
                          </div>
                        </div>

                        {selectedPlannedMeta.length >= 2 && (
                          <div className="space-y-6">
                            {/* Comparison table */}
                            <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
                              <div className="px-5 py-4 border-b border-stone-100">
                                <h3 className="font-medium text-stone-700">Confronto statistiche — Escursioni pianificate</h3>
                              </div>
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead className="bg-stone-50">
                                    <tr>
                                      <th className="px-4 py-3 text-left text-xs text-stone-400 uppercase tracking-wide font-medium">Metrica</th>
                                      {selectedPlannedMeta.map((h, i) => (
                                        <th key={h.id} className="px-4 py-3 text-left text-xs font-medium" style={{ color: COMPARISON_COLORS[i] }}>
                                          {h.title}
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-stone-100">
                                    {[
                                      { label: 'Data pianif.',    fmt: (h: PlannedHikeMeta) => h.plannedDate ? format(new Date(h.plannedDate), 'dd/MM/yyyy') : '—' },
                                      { label: 'Distanza',        fmt: (h: PlannedHikeMeta) => `${(h.distanceMeters/1000).toFixed(2)} km` },
                                      { label: 'Durata stim.',    fmt: (h: PlannedHikeMeta) => formatDuration(h.estimatedTimeSeconds) },
                                      { label: 'Dislivello ↑',   fmt: (h: PlannedHikeMeta) => `${Math.round(h.elevationGain)} m` },
                                      { label: 'Dislivello ↓',   fmt: (h: PlannedHikeMeta) => `${Math.round(h.elevationLoss)} m` },
                                      { label: 'Quota max',       fmt: (h: PlannedHikeMeta) => `${Math.round(h.altitudeMax)} m` },
                                      { label: 'Indice diff.',    fmt: (h: PlannedHikeMeta) => `${difficultyIndex(h.elevationGain, h.distanceMeters)} m/km` },
                                      { label: 'Difficoltà',      fmt: (h: PlannedHikeMeta) => h.assessment?.difficulty ?? '—' },
                                      { label: 'Adatta a te',     fmt: (h: PlannedHikeMeta) => h.assessment ? `${h.assessment.suitabilityScore}%` : '—' },
                                      { label: 'Bellezza',        fmt: (h: PlannedHikeMeta) => h.cachedBeautyScore ? `${h.cachedBeautyScore.overall.toFixed(1)}/10` : '—' },
                                    ].map(({ label, fmt }) => (
                                      <tr key={label}>
                                        <td className="px-4 py-2.5 text-stone-500 font-medium text-xs">{label}</td>
                                        {selectedPlannedMeta.map((h, i) => (
                                          <td key={h.id} className="px-4 py-2.5 font-mono text-stone-700 text-xs capitalize" style={{ borderLeft: `3px solid ${COMPARISON_COLORS[i]}20` }}>
                                            {fmt(h)}
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
                                  <RadarChart data={plannedRadarData}>
                                    <PolarGrid />
                                    <PolarAngleAxis dataKey="metric" tick={{ fontSize: 12 }} />
                                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
                                    {selectedPlannedMeta.map((h, i) => (
                                      <Radar key={h.id} name={h.title}
                                        dataKey={`a${i}`} stroke={COMPARISON_COLORS[i]}
                                        fill={COMPARISON_COLORS[i]} fillOpacity={0.15} strokeWidth={2} />
                                    ))}
                                    <Legend wrapperStyle={{ fontSize: 12 }} />
                                    <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e8e4dc', fontSize: 12 }} />
                                  </RadarChart>
                                </ResponsiveContainer>
                              </div>
                            </div>
                          </div>
                        )}

                        {selectedPlannedIds.size === 0 && plannedMetas.length === 0 && (
                          <div className="text-center py-12 text-stone-400">
                            <Mountain className="w-10 h-10 mx-auto mb-2 opacity-30" />
                            <p className="text-sm">Nessuna escursione pianificata trovata. Carica prima un file GPX.</p>
                          </div>
                        )}
                        {selectedPlannedIds.size === 0 && plannedMetas.length > 0 && (
                          <div className="text-center py-12 text-stone-400">
                            <GitCommitHorizontal className="w-10 h-10 mx-auto mb-2 opacity-40" />
                            <p className="text-sm">Seleziona almeno 2 escursioni pianificate per il confronto.</p>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── FORMA ───────────────────────────────────────────────────────── */}
            {tab === 'forma' && (
              <div className="space-y-6">
                {/* Current form status */}
                {latestForm && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
                      <p className="text-xs text-stone-400 uppercase tracking-wide font-medium mb-1 flex items-center gap-1.5">
                        <Brain className="w-3.5 h-3.5" /> Stato forma attuale
                      </p>
                      <p className="text-2xl font-bold mt-1" style={{ color: latestForm.status.color }}>
                        {latestForm.status.label}
                      </p>
                      <p className="text-xs text-stone-500 mt-1">{latestForm.status.description}</p>
                    </div>
                    <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
                      <p className="text-xs text-stone-400 uppercase tracking-wide font-medium mb-1">CTL — Fitness (τ=42gg)</p>
                      <p className="text-2xl font-bold text-forest-700">{latestForm.ctl.toFixed(1)}</p>
                      <p className="text-xs text-stone-500 mt-1">Carico cronico accumulato</p>
                    </div>
                    <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
                      <p className="text-xs text-stone-400 uppercase tracking-wide font-medium mb-1">ATL — Fatica (τ=7gg)</p>
                      <p className="text-2xl font-bold text-terra-600">{latestForm.atl.toFixed(1)}</p>
                      <p className="text-xs text-stone-500 mt-1">Carico acuto recente</p>
                    </div>
                  </div>
                )}

                {/* Weekly averages summary */}
                {weeklyAvg && (
                  <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
                    <h3 className="font-medium text-stone-700 mb-4 flex items-center gap-2">
                      <Activity className="w-4 h-4 text-forest-600" /> Medie settimanali (ultime 16 settimane)
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      {[
                        { label: 'Km medi/settimana',  value: `${weeklyAvg.avgKm} km` },
                        { label: 'Settimana migliore',  value: `${weeklyAvg.maxKm} km` },
                        { label: 'D+ medi/settimana',   value: `${weeklyAvg.avgGain} m` },
                        { label: 'Settimane attive',    value: `${weeklyAvg.activeWeeks}/16` },
                      ].map(({ label, value }) => (
                        <div key={label} className="text-center">
                          <p className="font-display text-2xl font-bold text-forest-700">{value}</p>
                          <p className="text-xs text-stone-400 mt-1 leading-tight">{label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Weekly volume chart */}
                <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
                  <h3 className="font-medium text-stone-700 mb-1">Volume settimanale — ultime 16 settimane</h3>
                  <p className="text-xs text-stone-400 mb-4">Km percorsi e dislivello per settimana.</p>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={weeklyVolumeData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e8e4dc" />
                        <XAxis dataKey="week" tick={{ fontSize: 10 }} tickLine={false} interval={1} />
                        <YAxis yAxisId="km"   orientation="left"  tick={{ fontSize: 10 }} tickLine={false} axisLine={false} unit=" km" width={44} />
                        <YAxis yAxisId="gain" orientation="right" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} unit=" m"  width={48} />
                        <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e8e4dc', fontSize: 12 }}
                          formatter={(v: any, name: string) => [name === 'km' ? `${v} km` : `${v} m`, name === 'km' ? 'Distanza' : 'Dislivello D+']} />
                        <Legend formatter={(v: string) => v === 'km' ? 'Distanza (km)' : 'Dislivello D+ (m)'} wrapperStyle={{ fontSize: 12 }} />
                        <Bar yAxisId="km"   dataKey="km"   fill="#378d44" radius={[3,3,0,0]} />
                        <Bar yAxisId="gain" dataKey="gain" fill="#c05a17" radius={[3,3,0,0]} opacity={0.8} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Monthly progression table */}
                <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-stone-100">
                    <h3 className="font-medium text-stone-700">Progressione mensile — ultimi 6 mesi</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-stone-50 text-stone-500 text-xs uppercase tracking-wider">
                        <tr>
                          {['Mese', 'Escursioni', 'Distanza', 'Dislivello'].map(h => (
                            <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {monthlyProgressData.map((m, i) => {
                          const isLatest = i === monthlyProgressData.length - 1
                          return (
                            <tr key={m.month} className={isLatest ? 'bg-forest-50' : ''}>
                              <td className="px-4 py-3 font-medium text-stone-700 capitalize">{m.month}</td>
                              <td className="px-4 py-3 font-mono text-stone-600">{m.esc}</td>
                              <td className="px-4 py-3 font-mono text-forest-700">{m.km} km</td>
                              <td className="px-4 py-3 font-mono text-terra-600">{m.gain.toLocaleString('it')} m</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* ATL/CTL/TSB chart */}
                <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
                  <h3 className="font-medium text-stone-700 mb-1 flex items-center gap-2">
                    <Brain className="w-4 h-4 text-forest-600" /> Training Load — ultimi 90 giorni
                  </h3>
                  <p className="text-xs text-stone-400 mb-4">
                    CTL (fitness, verde) · ATL (fatica, arancio) · TSB (forma, blu — positivo = fresco, negativo = affaticato)
                  </p>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trainingLoadData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e8e4dc" />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 10 }}
                          tickLine={false}
                          tickFormatter={d => format(new Date(d), 'dd/MM')}
                          interval={13}
                        />
                        <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={36} />
                        <Tooltip
                          contentStyle={{ borderRadius: 8, border: '1px solid #e8e4dc', fontSize: 12 }}
                          labelFormatter={d => format(new Date(d as string), 'dd MMM yyyy', { locale: it })}
                          formatter={(v: any, name: string) => {
                            const labels: Record<string, string> = { ctl: 'Fitness (CTL)', atl: 'Fatica (ATL)', tsb: 'Forma (TSB)' }
                            return [v, labels[name] ?? name]
                          }}
                        />
                        <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 4" />
                        <Line type="monotone" dataKey="ctl" stroke="#378d44" strokeWidth={2} dot={false} name="ctl" />
                        <Line type="monotone" dataKey="atl" stroke="#c05a17" strokeWidth={2} dot={false} name="atl" />
                        <Line type="monotone" dataKey="tsb" stroke="#0ea5e9" strokeWidth={2} dot={false} name="tsb" />
                        <Legend wrapperStyle={{ fontSize: 12 }}
                          formatter={(v: string) => ({ ctl: 'Fitness (CTL)', atl: 'Fatica (ATL)', tsb: 'Forma (TSB)' }[v] ?? v)} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Daily stress bars */}
                <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
                  <h3 className="font-medium text-stone-700 mb-4">Carico giornaliero (TSS stimato)</h3>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={trainingLoadData.filter(d => d.stress > 0)} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e8e4dc" />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false}
                          tickFormatter={d => format(new Date(d), 'dd/MM')} />
                        <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={36} />
                        <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e8e4dc', fontSize: 12 }}
                          labelFormatter={d => format(new Date(d as string), 'dd MMM', { locale: it })}
                          formatter={(v: any) => [v, 'Stress (TSS)']} />
                        <Bar dataKey="stress" fill="#378d44" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Explanation */}
                <div className="bg-sky-50 rounded-2xl border border-sky-100 p-5 text-sm text-sky-800 space-y-2">
                  <p className="font-semibold">Come leggere questi grafici</p>
                  <p><strong>CTL (Fitness)</strong> sale lentamente con l'allenamento costante — rappresenta la capacità aerobica accumulata.</p>
                  <p><strong>ATL (Fatica)</strong> sale velocemente dopo un'uscita impegnativa e scende in pochi giorni di riposo.</p>
                  <p><strong>TSB (Forma)</strong> = CTL − ATL. Positivo significa che sei fresco e pronto; negativo che sei affaticato. Il picco di forma si ottiene dopo alcuni giorni di recupero prima di un evento importante.</p>
                  <p className="text-xs text-sky-600">I valori TSS sono stimati da distanza, dislivello e durata. Per maggiore precisione usa dati di potenza o FC (funzionalità futura).</p>
                </div>
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
