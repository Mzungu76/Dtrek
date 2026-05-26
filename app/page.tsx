'use client'
import { useEffect, useState, useMemo, useRef } from 'react'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import RouteThumb from '@/components/RouteThumb'
import { getAllActivities, type ActivityMeta } from '@/lib/blobStore'
import { formatDuration } from '@/lib/tcxParser'
import { format, isSameDay, getDaysInMonth } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  Mountain, Upload, Heart, Route, Clock, Flame, TrendingUp,
  ChevronLeft, ChevronRight, Loader2, CalendarDays, LayoutGrid,
} from 'lucide-react'

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

function getLeadingEmpty(year: number, month: number): number {
  const dow = new Date(year, month, 1).getDay()
  return dow === 0 ? 6 : dow - 1
}

interface CardProps {
  activity: ActivityMeta
  date: Date
  extra?: number
  showFullDate?: boolean
}

function ActivityCard({ activity, date, extra = 0, showFullDate = false }: CardProps) {
  const isToday = isSameDay(date, new Date())
  return (
    <Link
      href={`/escursione/${encodeURIComponent(activity.id)}`}
      className="aspect-square bg-white rounded-2xl border border-stone-200 shadow-sm hover:border-forest-400 hover:shadow-md transition-all overflow-hidden flex flex-col group"
    >
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
        <span
          className={`absolute top-2 right-2 text-[10px] font-bold rounded-full px-1.5 py-0.5 shadow-sm whitespace-nowrap
            ${isToday ? 'bg-terra-500 text-white' : 'bg-white/90 text-stone-600'}`}
        >
          {showFullDate ? format(date, 'd MMM', { locale: it }) : format(date, 'd')}
        </span>
        {extra > 0 && (
          <span className="absolute top-2 left-2 text-[10px] font-bold bg-forest-600 text-white rounded-full px-1.5 py-0.5">
            +{extra}
          </span>
        )}
      </div>
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
          <span className="flex items-center gap-0.5 text-red-400">
            <Heart className="w-2.5 h-2.5" />{activity.avgHeartRate} bpm
          </span>
        </div>
        <div className="flex items-center gap-0.5 text-[10px] mt-0.5 text-terra-500">
          <Flame className="w-2.5 h-2.5" />{activity.calories} kcal
        </div>
      </div>
    </Link>
  )
}

export default function HomePage() {
  const [activities, setActivities] = useState<ActivityMeta[]>([])
  const [loading, setLoading]       = useState(true)
  const [monthIdx, setMonthIdx]     = useState(-1)
  const [view, setView]             = useState<'calendar' | 'list'>('calendar')
  const monthBarRef                 = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getAllActivities()
      .then(setActivities)
      .finally(() => setLoading(false))
  }, [])

  // months: earliest activity → current month
  const months = useMemo(() => {
    const now = new Date()
    const curY = now.getFullYear(), curM = now.getMonth()
    if (activities.length === 0) return [{ year: curY, month: curM }]
    const dates = activities.map(a => new Date(a.startTime))
    const minDate = new Date(Math.min(...dates.map(d => d.getTime())))
    const result: { year: number; month: number }[] = []
    let y = minDate.getFullYear(), m = minDate.getMonth()
    while (y < curY || (y === curY && m <= curM)) {
      result.push({ year: y, month: m })
      if (++m > 11) { m = 0; y++ }
    }
    return result
  }, [activities])

  // Once loading finishes, jump to the most recent (current) month
  useEffect(() => {
    if (!loading) setMonthIdx(months.length - 1)
  }, [loading]) // eslint-disable-line react-hooks/exhaustive-deps

  // Activity count per month (for the histogram bar)
  const countPerMonth = useMemo(() =>
    months.map(({ year: y, month: m }) =>
      activities.filter(a => {
        const d = new Date(a.startTime)
        return d.getFullYear() === y && d.getMonth() === m
      }).length
    )
  , [months, activities])

  const maxCount = Math.max(...countPerMonth, 1)

  // Auto-scroll the month bar to keep the active chip in view
  useEffect(() => {
    if (!monthBarRef.current || monthIdx < 0) return
    const chip = monthBarRef.current.children[monthIdx] as HTMLElement | undefined
    chip?.scrollIntoView({ inline: 'center', behavior: 'smooth', block: 'nearest' })
  }, [monthIdx])

  // Activities indexed by date key
  const actsByDate = useMemo(() => {
    const map = new Map<string, ActivityMeta[]>()
    for (const a of activities) {
      const key = format(new Date(a.startTime), 'yyyy-MM-dd')
      const arr = map.get(key) ?? []
      arr.push(a)
      map.set(key, arr)
    }
    return map
  }, [activities])

  const sortedActivities = useMemo(
    () => [...activities].sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()),
    [activities]
  )

  const safeIdx = monthIdx < 0 ? months.length - 1 : monthIdx
  const { year, month } = months[safeIdx] ?? { year: new Date().getFullYear(), month: new Date().getMonth() }

  const cells: (number | null)[] = useMemo(() => {
    const daysInMonth = getDaysInMonth(new Date(year, month))
    const leading     = getLeadingEmpty(year, month)
    const total       = Math.ceil((leading + daysInMonth) / 7) * 7
    return Array.from({ length: total }, (_, i) => {
      const d = i - leading + 1
      return d >= 1 && d <= daysInMonth ? d : null
    })
  }, [year, month])

  const monthLabel = format(new Date(year, month, 1), 'MMMM yyyy', { locale: it })

  return (
    <div className="min-h-screen bg-stone-50">
      <Navbar />

      {/* ── Header ── */}
      <div className="bg-gradient-to-br from-forest-800 to-forest-900 text-white">
        <div className="max-w-[1400px] mx-auto px-4 py-8">
          <div className="flex items-end justify-between flex-wrap gap-4">
            <div>
              <h1 className="font-display text-4xl font-semibold leading-tight">
                Il mio diario<br />
                <span className="text-forest-300">di trekking</span>
              </h1>
              <p className="text-forest-400 text-sm mt-2">
                {loading
                  ? 'Caricamento…'
                  : activities.length > 0
                    ? `${activities.length} escursion${activities.length === 1 ? 'e' : 'i'} registrat${activities.length === 1 ? 'a' : 'e'}`
                    : 'Nessuna escursione ancora'}
              </p>
            </div>

            {/* View toggle */}
            {!loading && activities.length > 0 && (
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
            )}
          </div>
        </div>
      </div>

      {/* ── Main ── */}
      <main className="max-w-[1400px] mx-auto px-4 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-24 text-stone-400 gap-3">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span>Caricamento escursioni…</span>
          </div>

        ) : activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-20 h-20 rounded-full bg-forest-50 border border-forest-200 flex items-center justify-center mb-6">
              <Mountain className="w-10 h-10 text-forest-400" />
            </div>
            <h2 className="font-display text-2xl font-semibold text-stone-700 mb-2">Inizia il tuo diario</h2>
            <p className="text-stone-400 text-sm max-w-sm mb-6">
              Carica il tuo primo file TCX per vedere il tracciato, i grafici e tutti i dati della tua escursione.
            </p>
            <Link
              href="/upload"
              className="flex items-center gap-2 px-6 py-3 bg-forest-600 hover:bg-forest-700 text-white rounded-xl font-medium transition-colors"
            >
              <Upload className="w-5 h-5" /> Carica il tuo primo TCX
            </Link>
          </div>

        ) : view === 'calendar' ? (
          /* ────────── CALENDAR VIEW ────────── */
          <div className="fade-up">

            {/* ── Month histogram bar ── */}
            {months.length > 1 && (
              <div
                ref={monthBarRef}
                className="flex gap-1 overflow-x-auto mb-5 pb-1"
                style={{ scrollbarWidth: 'none' }}
              >
                {months.map(({ year: y, month: m }, i) => {
                  const count    = countPerMonth[i]
                  const isActive = i === safeIdx
                  // Show year label when the year changes
                  const showYear = i === 0 || months[i - 1].year !== y
                  const barH = count > 0 ? Math.max(4, Math.round((count / maxCount) * 22)) : 0

                  return (
                    <button
                      key={`${y}-${m}`}
                      onClick={() => setMonthIdx(i)}
                      title={`${format(new Date(y, m, 1), 'MMMM yyyy', { locale: it })}: ${count} escursion${count !== 1 ? 'i' : 'e'}`}
                      className={`flex flex-col items-center gap-0.5 px-2 pt-1 pb-1.5 rounded-xl shrink-0 transition-all min-w-[44px]
                        ${isActive
                          ? 'bg-forest-600 text-white shadow-sm'
                          : count > 0
                            ? 'bg-white border border-stone-200 text-stone-600 hover:border-forest-300 hover:text-forest-700'
                            : 'bg-stone-50 border border-stone-100 text-stone-300 hover:border-stone-200'}`}
                    >
                      {/* Mini bar */}
                      <div className="flex items-end h-6 w-full justify-center">
                        {barH > 0 ? (
                          <div
                            className={`w-2.5 rounded-t-sm ${isActive ? 'bg-forest-300' : 'bg-forest-400'}`}
                            style={{ height: `${barH}px` }}
                          />
                        ) : (
                          <div className={`w-2.5 h-px ${isActive ? 'bg-forest-400/40' : 'bg-stone-200'}`} />
                        )}
                      </div>

                      {/* Month label */}
                      <span className="text-[10px] font-semibold leading-none whitespace-nowrap capitalize">
                        {format(new Date(y, m, 1), 'MMM', { locale: it })}
                        {showYear && (
                          <span className={`ml-0.5 text-[9px] font-normal ${isActive ? 'text-forest-200' : 'text-stone-400'}`}>
                            &apos;{String(y).slice(-2)}
                          </span>
                        )}
                      </span>

                      {/* Count badge */}
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
            <div className="flex items-center justify-between mb-5">
              <button
                onClick={() => setMonthIdx(i => Math.max(0, i - 1))}
                disabled={safeIdx === 0}
                className="flex items-center gap-1 px-3 py-2 rounded-xl bg-white border border-stone-200 hover:border-forest-400 disabled:opacity-30 transition-all shadow-sm text-stone-600 text-sm font-medium"
              >
                <ChevronLeft className="w-4 h-4" /> Prec.
              </button>

              <p className="font-semibold text-stone-800 capitalize text-lg">{monthLabel}</p>

              <button
                onClick={() => setMonthIdx(i => Math.min(months.length - 1, i + 1))}
                disabled={safeIdx === months.length - 1}
                className="flex items-center gap-1 px-3 py-2 rounded-xl bg-white border border-stone-200 hover:border-forest-400 disabled:opacity-30 transition-all shadow-sm text-stone-600 text-sm font-medium"
              >
                Succ. <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Day-of-week headers */}
            <div className="grid grid-cols-7 gap-1.5 mb-1.5">
              {DAY_LABELS.map(d => (
                <div key={d} className="text-center text-xs font-semibold text-stone-400 uppercase tracking-widest py-1">
                  {d}
                </div>
              ))}
            </div>

            {/* Month grid */}
            <div className="grid grid-cols-7 gap-1.5">
              {cells.map((dayNum, i) => {
                if (dayNum === null) return <div key={`e-${i}`} className="aspect-square" />
                const date    = new Date(year, month, dayNum)
                const key     = format(date, 'yyyy-MM-dd')
                const acts    = actsByDate.get(key) ?? []
                const act     = acts[0]
                const extra   = acts.length - 1
                const isToday = isSameDay(date, new Date())
                if (act) return <ActivityCard key={key} activity={act} date={date} extra={extra} />
                return (
                  <div
                    key={key}
                    className={`aspect-square rounded-xl border flex flex-col
                      ${isToday ? 'border-terra-200 bg-terra-50/40' : 'border-stone-100 bg-stone-50/60'}`}
                  >
                    <div className="flex justify-end p-1.5">
                      <span
                        className={`text-xs font-medium rounded-full w-5 h-5 flex items-center justify-center
                          ${isToday ? 'bg-terra-500 text-white font-bold' : 'text-stone-300'}`}
                      >
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
          <div className="fade-up">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
              {sortedActivities.map(activity => (
                <ActivityCard
                  key={activity.id}
                  activity={activity}
                  date={new Date(activity.startTime)}
                  showFullDate
                />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
