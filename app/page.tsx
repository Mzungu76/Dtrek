'use client'
import { useEffect, useState, useMemo, useRef } from 'react'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import RouteThumb from '@/components/RouteThumb'
import { getAllActivities, type ActivityMeta } from '@/lib/blobStore'
import { getAllPlanned, updatePlannedMeta, type PlannedHikeMeta } from '@/lib/plannedStore'
import { ctsLabel } from '@/lib/trailScore'
import { formatDuration } from '@/lib/tcxParser'
import { findAnniversaries } from '@/lib/stats'
import type { ResocontoStatus } from '@/app/api/resoconto-status/route'
import { format, isSameDay, getDaysInMonth } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  Mountain, Upload, Heart, Route, Clock, Flame, TrendingUp,
  ChevronLeft, ChevronRight, Loader2, CalendarDays, LayoutGrid, CalendarClock, ArrowUpDown, PartyPopper,
  Car, Navigation,
} from 'lucide-react'
import { fetchDrivingInfo, formatDrivingDuration, getUserStartingPoint, getTrailStartPoint, googleMapsDirectionsUrl, originMatches } from '@/lib/drivingInfo'
const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

function getLeadingEmpty(year: number, month: number): number {
  const dow = new Date(year, month, 1).getDay()
  return dow === 0 ? 6 : dow - 1
}

// ── Unified sort (Calendario/Lista) ─────────────────────────────────────────────
// Un solo insieme di opzioni invece dei due gruppi separati (Registrate/Pianificate)
// che c'erano prima — le opzioni disponibili si adattano al filtro tipo attivo.

type SortKey = 'date' | 'km' | 'dplus' | 'cts' | 'rating' | 'suitability'
type TypeFilter = 'all' | 'done' | 'planned'

const SORT_OPTIONS: Record<TypeFilter, { id: SortKey; label: string }[]> = {
  all:     [{ id: 'date', label: 'Data' }, { id: 'km', label: 'Km' }, { id: 'dplus', label: 'D+' }, { id: 'cts', label: 'CTS' }],
  done:    [{ id: 'date', label: 'Data' }, { id: 'km', label: 'Km' }, { id: 'dplus', label: 'D+' }, { id: 'rating', label: 'Voto' }, { id: 'cts', label: 'CTS' }],
  planned: [{ id: 'date', label: 'Data' }, { id: 'km', label: 'Km' }, { id: 'dplus', label: 'D+' }, { id: 'suitability', label: 'Adatta' }, { id: 'cts', label: 'CTS' }],
}

// ── Shared month navigation — una sola implementazione per Calendario e Lista ──

function MonthNav({ label, canPrev, canNext, onPrev, onNext, compact = false }: {
  label: string; canPrev: boolean; canNext: boolean; onPrev: () => void; onNext: () => void; compact?: boolean
}) {
  const btnSize = compact ? 'px-2.5 py-1.5 text-sm' : 'px-3 py-2 text-sm'
  return (
    <div className={`flex items-center justify-between ${compact ? '' : 'mb-4'}`}>
      <button onClick={onPrev} disabled={!canPrev}
        className={`flex items-center gap-1 ${btnSize} rounded-xl bg-white border border-stone-200 hover:border-forest-400 disabled:opacity-30 transition-all shadow-sm text-stone-600 font-medium`}>
        <ChevronLeft className="w-4 h-4" /> {!compact && <span className="hidden sm:inline">Prec.</span>}
      </button>
      <p className={`font-semibold text-stone-800 capitalize ${compact ? 'text-sm sm:text-base' : 'text-base sm:text-lg'}`}>{label}</p>
      <button onClick={onNext} disabled={!canNext}
        className={`flex items-center gap-1 ${btnSize} rounded-xl bg-white border border-stone-200 hover:border-forest-400 disabled:opacity-30 transition-all shadow-sm text-stone-600 font-medium`}>
        {!compact && <span className="hidden sm:inline">Succ.</span>} <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  )
}

// ── Completed activity card ───────────────────────────────────────────────────

interface CardProps {
  activity: ActivityMeta
  date: Date
  extra?: number
  showFullDate?: boolean
  compact?: boolean   // true in the 7-col calendar → shows dot on mobile
  // multi-hike navigation
  dotCount?: number
  dotActive?: number
  onDotClick?: (idx: number) => void
  reportStatus?: ResocontoStatus
}

function reportBadge(status?: ResocontoStatus): { label: string; className: string } | null {
  if (status === 'narrato') return { label: 'Narrato', className: 'bg-forest-600 text-white' }
  if (status === 'parziale') return { label: 'Parziale', className: 'bg-amber-500 text-white' }
  return { label: 'Da narrare', className: 'bg-stone-300 text-stone-700' }
}

function ratingColor(n: number): string {
  if (n >= 9) return '#16a34a'
  if (n >= 7) return '#84cc16'
  if (n >= 5) return '#f97316'
  return '#ef4444'
}
function ratingLabel(n: number): string {
  if (n >= 9) return 'Eccellente'
  if (n >= 8) return 'Ottimo'
  if (n >= 7) return 'Buono'
  if (n >= 6) return 'Discreto'
  if (n >= 5) return 'Sufficiente'
  return 'Mediocre'
}

function ActivityCard({ activity, date, extra = 0, showFullDate = false, compact = false, dotCount, dotActive, onDotClick, reportStatus }: CardProps) {
  const badge = reportBadge(reportStatus)
  const isToday   = isSameDay(date, new Date())
  const dateLabel = showFullDate ? format(date, 'd MMM', { locale: it }) : format(date, 'd')
  const showDots  = dotCount && dotCount > 1
  const rating    = activity.userRating
  const rColor    = rating ? ratingColor(rating) : null
  const trailScore   = (activity as ActivityMeta & { trailScore?: number }).trailScore
  const ctsConf      = (activity as ActivityMeta & { trailScoreConfidence?: string }).trailScoreConfidence
  const ctsSuffix    = ctsConf === 'default' ? '≈' : ctsConf === 'estimated' ? '~' : ''
  const ctsData      = trailScore != null ? ctsLabel(trailScore) : null

  return (
    <Link
      href={`/escursione/${encodeURIComponent(activity.id)}`}
      className="aspect-square bg-white rounded-2xl border border-stone-200 shadow-sm hover:border-forest-400 hover:shadow-md transition-all overflow-hidden flex flex-col group"
    >
      {/* Mobile compact (only when used in calendar grid) */}
      {compact && (
        <div className={`sm:hidden w-full h-full flex flex-col items-center justify-center gap-1
          ${isToday ? 'bg-terra-50' : 'bg-forest-50'}`}>
          <span className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center
            ${isToday ? 'bg-terra-500 text-white' : 'text-forest-800'}`}>
            {format(date, 'd')}
          </span>
          {rating
            ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ backgroundColor: rColor! }}>★{rating}</span>
            : <div className="w-2 h-2 rounded-full bg-forest-500" />
          }
          {showDots && (
            <div className="flex gap-0.5">
              {Array.from({ length: dotCount }).map((_, i) => (
                <div key={i} role="button"
                  onClick={e => { e.preventDefault(); e.stopPropagation(); onDotClick?.(i) }}
                  className={`w-1 h-1 rounded-full ${i === dotActive ? 'bg-forest-700' : 'bg-forest-300'}`}
                />
              ))}
            </div>
          )}
          {!showDots && extra > 0 && <span className="text-[8px] font-bold text-forest-600">+{extra}</span>}
        </div>
      )}

      {/* Full card (always on desktop; on mobile only if not compact) */}
      <div className={`${compact ? 'hidden sm:flex' : 'flex'} flex-col flex-1 min-h-0`}>

        {/* ── Score banner — top of card, visible at first glance ── */}
        {(rating || ctsData) ? (
          <div className="flex items-center justify-between px-2.5 py-1.5 shrink-0"
            style={{ backgroundColor: (rColor ?? ctsData!.color) + '22', borderBottom: `1.5px solid ${(rColor ?? ctsData!.color)}40` }}>
            {rating && rColor
              ? <span className="text-sm font-bold leading-none" style={{ color: rColor }}>★ {rating}<span className="text-[10px] font-normal text-stone-400 ml-1">/10</span></span>
              : <span />
            }
            {ctsData && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md text-white" style={{ backgroundColor: ctsData.color }}>
                CTS {Math.round(trailScore!)}{ctsSuffix}
              </span>
            )}
          </div>
        ) : (
          <div className="h-1 shrink-0 bg-forest-100" />
        )}

        {/* Thumbnail */}
        <div className="flex-1 relative bg-gradient-to-b from-forest-50 to-stone-50 min-h-0 overflow-hidden">
          <div className="absolute inset-2">
            {activity.routePolyline && activity.routePolyline.length > 1 ? (
              <RouteThumb polyline={activity.routePolyline} color="#2d7a3d" strokeWidth={3} />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Mountain className="w-8 h-8 text-forest-200" />
              </div>
            )}
          </div>
          <span className={`absolute top-2 right-2 text-[10px] font-bold rounded-full px-1.5 py-0.5 shadow-sm whitespace-nowrap
            ${isToday ? 'bg-terra-500 text-white' : 'bg-white/90 text-stone-600'}`}>
            {dateLabel}
          </span>
          {badge && (
            <span className={`absolute top-2 left-2 text-[9px] font-bold rounded-full px-1.5 py-0.5 shadow-sm whitespace-nowrap ${badge.className}`}>
              {badge.label}
            </span>
          )}
          {/* Navigation dots */}
          {showDots && (
            <div className="absolute bottom-2 inset-x-0 flex justify-center gap-1">
              {Array.from({ length: dotCount }).map((_, i) => (
                <div key={i} role="button"
                  onClick={e => { e.preventDefault(); e.stopPropagation(); onDotClick?.(i) }}
                  className={`w-2 h-2 rounded-full border border-white/50 shadow-sm transition-colors cursor-pointer
                    ${i === dotActive ? 'bg-forest-700' : 'bg-white/80 hover:bg-forest-200'}`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="shrink-0 px-2.5 pb-2.5 pt-1.5 border-t border-stone-100">
          <p className="text-xs font-semibold text-stone-800 truncate leading-tight mb-1">
            {activity.title ?? 'Escursione'}
          </p>
          <div className="flex items-center gap-2 text-[10px] flex-wrap">
            <span className="flex items-center gap-0.5 text-forest-700 font-medium">
              <Route className="w-2.5 h-2.5" />{(activity.distanceMeters / 1000).toFixed(1)} km
            </span>
            <span className="flex items-center gap-0.5 text-forest-600">
              <TrendingUp className="w-2.5 h-2.5" />{activity.elevationGain.toFixed(0)} m
            </span>
          </div>
          <div className="flex items-center gap-2 text-[10px] mt-0.5">
            <span className="flex items-center gap-0.5 text-stone-400">
              <Clock className="w-2.5 h-2.5" />{formatDuration(activity.totalTimeSeconds)}
            </span>
            {activity.avgHeartRate > 0 && (
              <span className="flex items-center gap-0.5 text-red-400">
                <Heart className="w-2.5 h-2.5" />{activity.avgHeartRate} bpm
              </span>
            )}
          </div>
          {activity.calories > 0 && (
            <div className="flex items-center gap-0.5 text-[10px] mt-0.5 text-terra-500">
              <Flame className="w-2.5 h-2.5" />{activity.calories} kcal
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}

// ── Planned hike card ─────────────────────────────────────────────────────────

interface PlannedCardProps {
  hike: PlannedHikeMeta
  date: Date
  showFullDate?: boolean
  compact?: boolean
}

function PlannedCard({ hike, date, showFullDate = false, compact = false }: PlannedCardProps) {
  const isFuture   = date > new Date()
  const dateLabel  = showFullDate ? format(date, 'd MMM', { locale: it }) : format(date, 'd')
  const ctsScore   = (hike as PlannedHikeMeta & { cachedTrailScore?: number }).cachedTrailScore
  const ctsConf    = (hike as PlannedHikeMeta & { cachedTrailScoreConfidence?: string }).cachedTrailScoreConfidence
  const ctsSuffix  = ctsConf === 'default' ? '≈' : ctsConf === 'estimated' ? '~' : ''
  const ctsData    = ctsScore != null ? ctsLabel(ctsScore) : null

  const trailStart = getTrailStartPoint(hike)
  const cachedOriginLat = (hike as PlannedHikeMeta & { cachedDrivingOriginLat?: number }).cachedDrivingOriginLat
  const cachedOriginLon = (hike as PlannedHikeMeta & { cachedDrivingOriginLon?: number }).cachedDrivingOriginLon
  const cachedDistance  = (hike as PlannedHikeMeta & { cachedDrivingDistanceMeters?: number }).cachedDrivingDistanceMeters
  const cachedDuration  = (hike as PlannedHikeMeta & { cachedDrivingDurationSeconds?: number }).cachedDrivingDurationSeconds
  const [driving, setDriving] = useState<{ distanceMeters: number; durationSeconds: number } | null>(
    cachedDistance != null && cachedDuration != null ? { distanceMeters: cachedDistance, durationSeconds: cachedDuration } : null,
  )
  const [origin,  setOrigin]  = useState<{ lat: number; lon: number } | null>(
    cachedOriginLat != null && cachedOriginLon != null ? { lat: cachedOriginLat, lon: cachedOriginLon } : null,
  )

  useEffect(() => {
    if (!trailStart) return
    let cancelled = false
    getUserStartingPoint().then(pt => {
      if (cancelled || !pt) return
      setOrigin(pt)
      // Reuse the Supabase-cached value if it was computed from the same starting point —
      // avoids re-hitting the OSRM routing service on every card render/page load.
      if (originMatches(cachedOriginLat, cachedOriginLon, pt.lat, pt.lon) && cachedDistance != null && cachedDuration != null) {
        setDriving({ distanceMeters: cachedDistance, durationSeconds: cachedDuration })
        return
      }
      fetchDrivingInfo(pt.lat, pt.lon, trailStart[0], trailStart[1]).then(info => {
        if (cancelled) return
        setDriving(info)
        if (info) {
          updatePlannedMeta(hike.id, {
            cachedDrivingDistanceMeters: info.distanceMeters,
            cachedDrivingDurationSeconds: info.durationSeconds,
            cachedDrivingOriginLat: pt.lat,
            cachedDrivingOriginLon: pt.lon,
          }).catch(() => {})
        }
      })
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trailStart?.[0], trailStart?.[1], hike.id, cachedOriginLat, cachedOriginLon, cachedDistance, cachedDuration])

  return (
    <Link
      href={`/programma/${encodeURIComponent(hike.id)}`}
      className="aspect-square bg-white rounded-2xl border border-dashed border-sky-300 shadow-sm hover:border-sky-500 hover:shadow-md transition-all overflow-hidden flex flex-col group"
    >
      {/* Mobile compact */}
      {compact && (
        <div className="sm:hidden w-full h-full bg-sky-50 flex flex-col items-center justify-center gap-1">
          <span className="text-xs font-bold text-sky-700 w-6 h-6 rounded-full flex items-center justify-center">
            {format(date, 'd')}
          </span>
          <div className="w-2 h-2 rounded-full bg-sky-500" />
        </div>
      )}

      {/* Full card */}
      <div className={`${compact ? 'hidden sm:flex' : 'flex'} flex-col flex-1 min-h-0`}>

        {/* Top bar — CTS badge if available, otherwise thin sky bar */}
        {ctsData ? (
          <div className="flex items-center justify-end px-2.5 py-1.5 shrink-0"
            style={{ backgroundColor: ctsData.color + '22', borderBottom: `1.5px solid ${ctsData.color}40` }}>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md text-white" style={{ backgroundColor: ctsData.color }}>
              CTS {Math.round(ctsScore!)}{ctsSuffix}
            </span>
          </div>
        ) : (
          <div className="h-1 shrink-0 bg-sky-100" />
        )}

        <div className="flex-1 relative bg-gradient-to-b from-sky-50 to-stone-50 min-h-0 overflow-hidden">
          <div className="absolute inset-2">
            {hike.routePolyline && hike.routePolyline.length > 1 ? (
              <RouteThumb polyline={hike.routePolyline} color="#0284c7" strokeWidth={3} />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Mountain className="w-8 h-8 text-sky-200" />
              </div>
            )}
          </div>
          <span className="absolute top-2 right-2 text-[10px] font-bold bg-white/90 text-sky-700 rounded-full px-1.5 py-0.5 shadow-sm whitespace-nowrap">
            {dateLabel}
          </span>
          <span className="absolute top-2 left-2 text-[8px] font-bold bg-sky-600 text-white rounded-full px-1.5 py-0.5 uppercase tracking-wide">
            {isFuture ? 'Pianif.' : 'Prog.'}
          </span>
        </div>
        <div className="shrink-0 px-2.5 pb-2.5 pt-1.5 border-t border-sky-50">
          <p className="text-xs font-semibold text-sky-900 truncate leading-tight mb-1">{hike.title}</p>
          <div className="flex items-center gap-2 text-[10px] flex-wrap">
            <span className="flex items-center gap-0.5 text-sky-700 font-medium">
              <Route className="w-2.5 h-2.5" />{(hike.distanceMeters / 1000).toFixed(1)} km
            </span>
            <span className="flex items-center gap-0.5 text-sky-600">
              <TrendingUp className="w-2.5 h-2.5" />{Math.round(hike.elevationGain)} m
            </span>
          </div>
          <div className="flex items-center gap-0.5 text-[10px] mt-0.5 text-sky-400">
            <Clock className="w-2.5 h-2.5" />{formatDuration(hike.estimatedTimeSeconds)} stim.
          </div>
          {driving && origin && trailStart && (
            <div className="flex items-center justify-between gap-1 mt-1 pt-1 border-t border-sky-50">
              <span className="flex items-center gap-0.5 text-[9px] text-stone-400 truncate">
                <Car className="w-2.5 h-2.5 shrink-0" />
                {(driving.distanceMeters / 1000).toFixed(0)} km · {formatDrivingDuration(driving.durationSeconds)}
              </span>
              <a
                href={googleMapsDirectionsUrl(origin.lat, origin.lon, trailStart[0], trailStart[1])}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                title="Naviga fino al punto di partenza"
                className="shrink-0 w-4 h-4 rounded-full bg-sky-100 hover:bg-sky-200 flex items-center justify-center text-sky-600 transition-colors"
              >
                <Navigation className="w-2.5 h-2.5" />
              </a>
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [activities, setActivities] = useState<ActivityMeta[]>([])
  const [planned,    setPlanned]    = useState<PlannedHikeMeta[]>([])
  const [loading,    setLoading]    = useState(true)
  const [monthIdx,   setMonthIdx]   = useState(-1)
  const [view,       setView]       = useState<'calendar' | 'list'>('list')
  const [dayIdx,     setDayIdx]     = useState<Record<string, number>>({})
  const [sortBy,     setSortBy]     = useState<SortKey>('date')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [showAllHistory, setShowAllHistory] = useState(false)
  const [reportStatus, setReportStatus] = useState<Record<string, ResocontoStatus>>({})
  const monthBarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    Promise.all([
      getAllActivities(setActivities),
      getAllPlanned(setPlanned),
    ])
      .then(([acts, plan]) => { setActivities(acts); setPlanned(plan) })
      .finally(() => setLoading(false))
    fetch('/api/resoconto-status').then(r => r.ok ? r.json() : {}).then(setReportStatus).catch(() => {})
  }, [])

  useEffect(() => {
    const refresh = () => {
      getAllActivities(setActivities).then(setActivities).catch(() => {})
      getAllPlanned(setPlanned).then(setPlanned).catch(() => {})
    }
    window.addEventListener('cts-updated', refresh)
    return () => window.removeEventListener('cts-updated', refresh)
  }, [])

  const anniversaries = useMemo(() => findAnniversaries(activities), [activities])

  const months = useMemo(() => {
    const now = new Date()
    let curY = now.getFullYear(), curM = now.getMonth()
    for (const h of planned) {
      if (!h.plannedDate) continue
      const d = new Date(h.plannedDate)
      if (d.getFullYear() > curY || (d.getFullYear() === curY && d.getMonth() > curM)) {
        curY = d.getFullYear(); curM = d.getMonth()
      }
    }
    if (activities.length === 0 && planned.length === 0)
      return [{ year: now.getFullYear(), month: now.getMonth() }]
    const allDates = [
      ...activities.map(a => new Date(a.startTime)),
      ...planned.filter(h => h.plannedDate).map(h => new Date(h.plannedDate!)),
    ]
    const minDate = allDates.length ? new Date(Math.min(...allDates.map(d => d.getTime()))) : now
    const result: { year: number; month: number }[] = []
    let y = minDate.getFullYear(), m = minDate.getMonth()
    while (y < curY || (y === curY && m <= curM)) {
      result.push({ year: y, month: m })
      if (++m > 11) { m = 0; y++ }
    }
    return result
  }, [activities, planned])

  useEffect(() => {
    if (!loading) {
      const idx = months.findIndex(mo => mo.year === new Date().getFullYear() && mo.month === new Date().getMonth())
      setMonthIdx(idx >= 0 ? idx : months.length - 1)
    }
  }, [loading]) // eslint-disable-line react-hooks/exhaustive-deps

  const countPerMonth = useMemo(() =>
    months.map(({ year: y, month: m }) =>
      activities.filter(a => {
        const d = new Date(a.startTime)
        return d.getFullYear() === y && d.getMonth() === m
      }).length
    )
  , [months, activities])

  const maxCount = Math.max(...countPerMonth, 1)

  useEffect(() => {
    if (!monthBarRef.current || monthIdx < 0) return
    const chip = monthBarRef.current.children[monthIdx] as HTMLElement | undefined
    chip?.scrollIntoView({ inline: 'center', behavior: 'smooth', block: 'nearest' })
  }, [monthIdx])

  const actsByDate = useMemo(() => {
    const map = new Map<string, ActivityMeta[]>()
    for (const a of activities) {
      const key = format(new Date(a.startTime), 'yyyy-MM-dd')
      const arr = map.get(key) ?? []; arr.push(a); map.set(key, arr)
    }
    return map
  }, [activities])

  const plannedByDate = useMemo(() => {
    const map = new Map<string, PlannedHikeMeta[]>()
    for (const h of planned) {
      if (!h.plannedDate) continue
      const key = h.plannedDate.slice(0, 10)
      const arr = map.get(key) ?? []; arr.push(h); map.set(key, arr)
    }
    return map
  }, [planned])

  const safeIdx = monthIdx < 0 ? months.length - 1 : monthIdx
  const { year, month } = months[safeIdx] ?? { year: new Date().getFullYear(), month: new Date().getMonth() }

  const monthActivities = useMemo(() => {
    if (showAllHistory) return activities
    return activities.filter(a => {
      const d = new Date(a.startTime)
      return d.getFullYear() === year && d.getMonth() === month
    })
  }, [activities, year, month, showAllHistory])

  const monthPlanned = useMemo(() => {
    if (showAllHistory) return planned
    return planned.filter(h => {
      if (!h.plannedDate) return true
      const d = new Date(h.plannedDate)
      return d.getFullYear() === year && d.getMonth() === month
    })
  }, [planned, year, month, showAllHistory])

  // Feed unico per la vista Lista: sostituisce le due liste separate
  // (Registrate/Pianificate) con ognuna il proprio gruppo di ordinamento.
  // Il filtro tipo seleziona quali elementi entrano nel feed; l'ordinamento
  // è un solo menu, con opzioni che si adattano al filtro (SORT_OPTIONS).
  type FeedItem = { kind: 'activity'; data: ActivityMeta } | { kind: 'planned'; data: PlannedHikeMeta }

  const feed = useMemo((): FeedItem[] => {
    const items: FeedItem[] = []
    if (typeFilter !== 'planned') for (const a of monthActivities) items.push({ kind: 'activity', data: a })
    if (typeFilter !== 'done')    for (const h of monthPlanned)    items.push({ kind: 'planned', data: h })

    const dateOf  = (it: FeedItem) => it.kind === 'activity' ? new Date(it.data.startTime).getTime() : (it.data.plannedDate ? new Date(it.data.plannedDate).getTime() : 0)
    const ctsOf   = (it: FeedItem) => it.kind === 'activity'
      ? (it.data as ActivityMeta & { trailScore?: number }).trailScore ?? -1
      : (it.data as PlannedHikeMeta & { cachedTrailScore?: number }).cachedTrailScore ?? -1
    const cmp: Record<SortKey, (a: FeedItem, b: FeedItem) => number> = {
      date:        (a, b) => dateOf(b) - dateOf(a),
      km:          (a, b) => b.data.distanceMeters - a.data.distanceMeters,
      dplus:       (a, b) => b.data.elevationGain - a.data.elevationGain,
      cts:         (a, b) => ctsOf(b) - ctsOf(a),
      rating:      (a, b) => (a.kind === 'activity' ? a.data.userRating ?? 0 : -1) < (b.kind === 'activity' ? b.data.userRating ?? 0 : -1) ? 1 : -1,
      suitability: (a, b) => (a.kind === 'planned' ? a.data.assessment?.suitabilityScore ?? 0 : -1) < (b.kind === 'planned' ? b.data.assessment?.suitabilityScore ?? 0 : -1) ? 1 : -1,
    }
    return [...items].sort(cmp[sortBy] ?? cmp.date)
  }, [monthActivities, monthPlanned, typeFilter, sortBy])

  function changeTypeFilter(next: TypeFilter) {
    setTypeFilter(next)
    const validIds = SORT_OPTIONS[next].map(o => o.id) as string[]
    setSortBy(prev => (validIds.includes(prev) ? prev : 'date'))
  }

  const cells: (number | null)[] = useMemo(() => {
    const daysInMonth = getDaysInMonth(new Date(year, month))
    const leading     = getLeadingEmpty(year, month)
    const total       = Math.ceil((leading + daysInMonth) / 7) * 7
    return Array.from({ length: total }, (_, i) => {
      const d = i - leading + 1
      return d >= 1 && d <= daysInMonth ? d : null
    })
  }, [year, month])

  const monthLabel  = format(new Date(year, month, 1), 'MMMM yyyy', { locale: it })
  const totalItems  = activities.length + planned.filter(h => h.plannedDate).length
  const hasPlanDates = planned.some(h => h.plannedDate)

  return (
    // pb-20: space for mobile bottom nav; md:pb-0: hidden on desktop
    <div className="min-h-screen bg-stone-50 pb-20 md:pb-0">
      <Navbar />

      {/* ── Header ── */}
      <div className="bg-gradient-to-br from-forest-800 to-forest-900 text-white">
        <div className="max-w-[1400px] mx-auto px-4 py-6 sm:py-8">
          <div className="flex items-end justify-between flex-wrap gap-4">
            <div>
              <h1 className="font-display text-3xl sm:text-4xl font-semibold leading-tight">
                Il mio diario<br />
                <span className="text-forest-300">di trekking</span>
              </h1>
              <p className="text-forest-400 text-sm mt-2">
                {loading ? 'Caricamento…' :
                  activities.length > 0
                    ? `${activities.length} escursion${activities.length === 1 ? 'e' : 'i'} registrat${activities.length === 1 ? 'a' : 'e'}${planned.length > 0 ? ` · ${planned.length} pianificat${planned.length === 1 ? 'a' : 'e'}` : ''}`
                    : 'Nessuna escursione ancora'
                }
              </p>
            </div>

            {!loading && totalItems > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center bg-forest-700/50 rounded-xl p-1 gap-0.5">
                  <button
                    onClick={() => setView('calendar')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all
                      ${view === 'calendar' ? 'bg-white text-forest-800 shadow-sm' : 'text-forest-300 hover:text-white'}`}
                  >
                    <CalendarDays className="w-4 h-4" />
                    <span className="hidden sm:inline">Calendario</span>
                  </button>
                  <button
                    onClick={() => setView('list')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all
                      ${view === 'list' ? 'bg-white text-forest-800 shadow-sm' : 'text-forest-300 hover:text-white'}`}
                  >
                    <LayoutGrid className="w-4 h-4" />
                    <span className="hidden sm:inline">Lista</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Main ── */}
      <main className="max-w-[1400px] mx-auto px-3 sm:px-4 py-5 sm:py-8">
        {!loading && anniversaries.length > 0 && (
          <div className="mb-5 sm:mb-6 flex flex-col gap-2">
            {anniversaries.map(({ activity, yearsAgo }) => (
              <Link
                key={activity.id}
                href={`/escursione/${activity.id}`}
                className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 hover:bg-amber-100 transition-colors"
              >
                <PartyPopper className="w-5 h-5 text-amber-600 shrink-0" />
                <p className="text-sm text-amber-900">
                  <span className="font-semibold">{yearsAgo} anno{yearsAgo === 1 ? '' : 'i'} fa</span>
                  {' '}facevi <span className="font-semibold">{activity.title}</span>
                  {' '}({(activity.distanceMeters / 1000).toFixed(1)} km, {format(new Date(activity.startTime), 'd MMMM yyyy', { locale: it })})
                </p>
              </Link>
            ))}
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center py-24 text-stone-400 gap-3">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span>Caricamento escursioni…</span>
          </div>

        ) : activities.length === 0 && planned.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 rounded-full bg-forest-50 border border-forest-200 flex items-center justify-center mb-6">
              <Mountain className="w-10 h-10 text-forest-400" />
            </div>
            <h2 className="font-display text-2xl font-semibold text-stone-700 mb-2">Inizia il tuo diario</h2>
            <p className="text-stone-400 text-sm max-w-sm mb-6 px-4">
              Carica il tuo primo file TCX per registrare un&#39;escursione, o un GPX per pianificarne una futura.
            </p>
            <Link
              href="/upload"
              className="flex items-center gap-2 px-6 py-3 bg-forest-600 hover:bg-forest-700 text-white rounded-xl font-medium transition-colors"
            >
              <Upload className="w-5 h-5" /> Carica o pianifica
            </Link>
          </div>

        ) : view === 'calendar' ? (
          /* ────────── CALENDAR VIEW ────────── */
          <div className="fade-up">

            {/* Legend — mobile only shows it if there are planned hikes */}
            {hasPlanDates && (
              <div className="flex items-center gap-4 mb-3 text-xs text-stone-500">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded bg-forest-100 border border-forest-300" />
                  <span>Registrata</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded bg-sky-50 border border-dashed border-sky-300" />
                  <span>Pianificata</span>
                </div>
              </div>
            )}

            {/* Month histogram bar */}
            {months.length > 1 && (
              <div
                ref={monthBarRef}
                className="flex gap-1 overflow-x-auto mb-4 pb-1"
                style={{ scrollbarWidth: 'none' }}
              >
                {months.map(({ year: y, month: m }, i) => {
                  const count    = countPerMonth[i]
                  const isActive = i === safeIdx
                  const showYear = i === 0 || months[i - 1].year !== y
                  const barH = count > 0 ? Math.max(4, Math.round((count / maxCount) * 22)) : 0
                  const hasPlan = planned.some(h => {
                    if (!h.plannedDate) return false
                    const d = new Date(h.plannedDate)
                    return d.getFullYear() === y && d.getMonth() === m
                  })

                  return (
                    <button
                      key={`${y}-${m}`}
                      onClick={() => setMonthIdx(i)}
                      title={`${format(new Date(y, m, 1), 'MMMM yyyy', { locale: it })}: ${count} escursion${count !== 1 ? 'i' : 'e'}`}
                      className={`flex flex-col items-center gap-0.5 px-2 pt-1 pb-1.5 rounded-xl shrink-0 transition-all min-w-[40px]
                        ${isActive
                          ? 'bg-forest-600 text-white shadow-sm'
                          : count > 0
                            ? 'bg-white border border-stone-200 text-stone-600 hover:border-forest-300'
                            : hasPlan
                              ? 'bg-sky-50 border border-dashed border-sky-300 text-sky-600'
                              : 'bg-stone-50 border border-stone-100 text-stone-300'}`}
                    >
                      <div className="flex items-end h-6 w-full justify-center gap-0.5">
                        {barH > 0 ? (
                          <div
                            className={`w-2.5 rounded-t-sm ${isActive ? 'bg-forest-300' : 'bg-forest-400'}`}
                            style={{ height: `${barH}px` }}
                          />
                        ) : (
                          <div className={`w-2.5 h-px ${isActive ? 'bg-forest-400/40' : 'bg-stone-200'}`} />
                        )}
                        {hasPlan && !isActive && (
                          <div className="w-1.5 rounded-t-sm bg-sky-400" style={{ height: '8px' }} />
                        )}
                      </div>
                      <span className="text-[10px] font-semibold leading-none whitespace-nowrap capitalize">
                        {format(new Date(y, m, 1), 'MMM', { locale: it })}
                        {showYear && (
                          <span className={`ml-0.5 text-[9px] font-normal ${isActive ? 'text-forest-200' : 'text-stone-400'}`}>
                            &apos;{String(y).slice(-2)}
                          </span>
                        )}
                      </span>
                      {count > 0 && (
                        <span className={`text-[9px] font-bold leading-none ${isActive ? 'text-forest-200' : 'text-forest-500'}`}>
                          {count}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Month navigation */}
            <MonthNav
              label={monthLabel}
              canPrev={safeIdx > 0}
              canNext={safeIdx < months.length - 1}
              onPrev={() => setMonthIdx(i => Math.max(0, (i < 0 ? months.length - 1 : i) - 1))}
              onNext={() => setMonthIdx(i => Math.min(months.length - 1, (i < 0 ? months.length - 1 : i) + 1))}
            />

            {/* Day-of-week headers */}
            <div className="grid grid-cols-7 gap-1 sm:gap-1.5 mb-1 sm:mb-1.5">
              {DAY_LABELS.map(d => (
                <div key={d} className="text-center text-[9px] sm:text-xs font-semibold text-stone-400 uppercase tracking-widest py-1">
                  {d}
                </div>
              ))}
            </div>

            {/* Month grid */}
            <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
              {cells.map((dayNum, i) => {
                if (dayNum === null) return <div key={`e-${i}`} className="aspect-square" />
                const date      = new Date(year, month, dayNum)
                const key       = format(date, 'yyyy-MM-dd')
                const acts      = actsByDate.get(key) ?? []
                const curIdx    = Math.min(dayIdx[key] ?? 0, acts.length - 1)
                const act       = acts[curIdx]
                const planItems = plannedByDate.get(key) ?? []
                const planHike  = planItems[0]
                const isToday   = isSameDay(date, new Date())

                if (acts.length > 0) return (
                  <ActivityCard
                    key={key}
                    activity={act}
                    date={date}
                    compact
                    dotCount={acts.length}
                    dotActive={curIdx}
                    onDotClick={idx => setDayIdx(prev => ({ ...prev, [key]: idx }))}
                    reportStatus={reportStatus[act.id]}
                  />
                )
                if (planHike) return <PlannedCard key={key} hike={planHike} date={date} compact />

                return (
                  <div
                    key={key}
                    className={`aspect-square rounded-xl border flex flex-col
                      ${isToday ? 'border-terra-200 bg-terra-50/40' : 'border-stone-100 bg-stone-50/60'}`}
                  >
                    <div className="flex justify-end p-1 sm:p-1.5">
                      <span className={`text-[10px] sm:text-xs font-medium rounded-full w-5 h-5 flex items-center justify-center
                        ${isToday ? 'bg-terra-500 text-white font-bold' : 'text-stone-300'}`}>
                        {dayNum}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

        ) : (
          /* ────────── LIST VIEW ────────── */
          <div className="fade-up space-y-4">
            {showAllHistory ? (
              <div className="flex items-center justify-between gap-2 -mt-1">
                <p className="font-semibold text-stone-700 text-sm sm:text-base">Tutto lo storico</p>
                <button
                  onClick={() => setShowAllHistory(false)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-stone-200 hover:border-forest-400 transition-all shadow-sm text-forest-700 text-sm font-medium"
                >
                  <CalendarDays className="w-4 h-4" /> Torna al mese
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2 -mt-1">
                <div className="flex-1">
                  <MonthNav
                    label={monthLabel}
                    canPrev={safeIdx > 0}
                    canNext={safeIdx < months.length - 1}
                    onPrev={() => setMonthIdx(i => Math.max(0, (i < 0 ? months.length - 1 : i) - 1))}
                    onNext={() => setMonthIdx(i => Math.min(months.length - 1, (i < 0 ? months.length - 1 : i) + 1))}
                    compact
                  />
                </div>
                <button
                  onClick={() => setShowAllHistory(true)}
                  title="Vedi tutto lo storico"
                  className="shrink-0 flex items-center gap-1 text-xs text-forest-600 hover:text-forest-700 font-medium"
                >
                  <CalendarClock className="w-3.5 h-3.5" /> Tutte
                </button>
              </div>
            )}

            {/* Filtro tipo + ordinamento: un solo menu, le opzioni si adattano al filtro attivo */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center bg-stone-100 rounded-lg p-0.5 gap-0.5">
                {([
                  { id: 'all',     label: 'Tutte' },
                  { id: 'done',    label: 'Fatte' },
                  { id: 'planned', label: 'Programmate' },
                ] as const).map(f => (
                  <button key={f.id} onClick={() => changeTypeFilter(f.id)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all
                      ${typeFilter === f.id ? 'bg-white shadow-sm text-forest-700' : 'text-stone-400 hover:text-stone-600'}`}>
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-0.5 bg-stone-100 rounded-lg p-0.5 ml-auto">
                <ArrowUpDown className="w-3 h-3 text-stone-400 ml-1" />
                {SORT_OPTIONS[typeFilter].map(s => (
                  <button key={s.id} onClick={() => setSortBy(s.id)}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition-all
                      ${sortBy === s.id ? 'bg-white shadow-sm text-forest-700' : 'text-stone-400 hover:text-stone-600'}`}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {feed.length === 0 ? (
              <p className="text-sm text-stone-400 text-center py-12">
                Nessuna escursione {showAllHistory ? '' : 'in questo mese'}.
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                {feed.map(item => item.kind === 'activity' ? (
                  <ActivityCard
                    key={`a-${item.data.id}`}
                    activity={item.data}
                    date={new Date(item.data.startTime)}
                    showFullDate
                    reportStatus={reportStatus[item.data.id]}
                  />
                ) : (
                  <PlannedCard
                    key={`p-${item.data.id}`}
                    hike={item.data}
                    date={item.data.plannedDate ? new Date(item.data.plannedDate) : new Date()}
                    showFullDate
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
