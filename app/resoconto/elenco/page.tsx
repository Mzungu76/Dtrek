'use client'
import { useEffect, useState, useMemo, useRef } from 'react'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import RouteThumb from '@/components/RouteThumb'
import Sheet from '@/components/ui/Sheet'
import { getAllActivities, type ActivityMeta } from '@/lib/blobStore'
import { formatDuration } from '@/lib/tcxParser'
import { findAnniversaries } from '@/lib/stats'
import type { ResocontoStatus } from '@/app/api/resoconto-status/route'
import { format, isSameDay, getDaysInMonth } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  Mountain, Upload,
  ChevronLeft, ChevronRight, Loader2, CalendarDays, LayoutList, ArrowUpDown, PartyPopper,
  SlidersHorizontal,
} from 'lucide-react'

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

function getLeadingEmpty(year: number, month: number): number {
  const dow = new Date(year, month, 1).getDay()
  return dow === 0 ? 6 : dow - 1
}

type SortKey = 'date' | 'km' | 'dplus' | 'cts' | 'rating'

const SORT_OPTIONS: { id: SortKey; label: string }[] = [
  { id: 'date', label: 'Data' }, { id: 'km', label: 'Km' }, { id: 'dplus', label: 'D+' },
  { id: 'rating', label: 'Voto' }, { id: 'cts', label: 'CTS' },
]

function MonthNav({ label, canPrev, canNext, onPrev, onNext }: {
  label: string; canPrev: boolean; canNext: boolean; onPrev: () => void; onNext: () => void
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <button onClick={onPrev} disabled={!canPrev}
        className="flex items-center gap-1 px-3 py-2 text-sm rounded-xl bg-white border border-stone-200 hover:border-forest-400 disabled:opacity-30 transition-all shadow-sm text-stone-600 font-medium">
        <ChevronLeft className="w-4 h-4" /> <span className="hidden sm:inline">Prec.</span>
      </button>
      <p className="font-semibold text-stone-800 capitalize text-base sm:text-lg">{label}</p>
      <button onClick={onNext} disabled={!canNext}
        className="flex items-center gap-1 px-3 py-2 text-sm rounded-xl bg-white border border-stone-200 hover:border-forest-400 disabled:opacity-30 transition-all shadow-sm text-stone-600 font-medium">
        <span className="hidden sm:inline">Succ.</span> <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  )
}

interface CardProps {
  activity: ActivityMeta
  date: Date
  extra?: number
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

function CalendarActivityCell({ activity, date, extra = 0, dotCount, dotActive, onDotClick }: CardProps) {
  const isToday = isSameDay(date, new Date())
  const rating  = activity.userRating
  const rColor  = rating ? ratingColor(rating) : null
  const showDots = dotCount && dotCount > 1

  return (
    <Link
      href={`/resoconto/${encodeURIComponent(activity.id)}`}
      className="aspect-square rounded-xl overflow-hidden flex flex-col items-center justify-center gap-1 transition-all hover:scale-[1.03]"
      style={{ background: isToday ? '#fdf6ee' : '#f1f8f2' }}
    >
      <span className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center ${isToday ? 'bg-terra-500 text-white' : 'text-forest-800'}`}>
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
    </Link>
  )
}

function FeedActivityCard({ activity, showFullDate, reportStatus }: {
  activity: ActivityMeta; showFullDate?: boolean; reportStatus?: ResocontoStatus
}) {
  const badge     = reportBadge(reportStatus)
  const rating    = activity.userRating
  const rColor    = rating ? ratingColor(rating) : null
  const date      = new Date(activity.startTime)
  const dateLabel = format(date, 'd MMM', { locale: it })

  return (
    <Link
      href={`/resoconto/${encodeURIComponent(activity.id)}`}
      className="block bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
    >
      <div className="relative h-[160px] sm:h-[180px] bg-gradient-to-b from-forest-50 to-stone-50 bg-topography">
        {activity.routePolyline && activity.routePolyline.length > 1 ? (
          <div className="absolute inset-3">
            <RouteThumb polyline={activity.routePolyline} color="#2d7a3d" strokeWidth={3} />
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Mountain className="w-10 h-10 text-forest-200" />
          </div>
        )}
        {rating && rColor ? (
          <span className="absolute top-3 left-3 text-[11px] font-bold text-white px-2.5 py-1 rounded-full shadow-sm" style={{ backgroundColor: rColor }}>
            Voto {rating}
          </span>
        ) : badge ? (
          <span className={`absolute top-3 left-3 text-[11px] font-bold px-2.5 py-1 rounded-full shadow-sm ${badge.className}`}>{badge.label}</span>
        ) : null}
        <span className="absolute top-3 right-3 text-[11px] font-bold bg-white/92 text-stone-700 px-2.5 py-1 rounded-full shadow-sm">
          {showFullDate ? dateLabel : format(date, 'd')}
        </span>
      </div>
      <div className="px-[18px] pt-4 pb-[18px]">
        <p className="text-[16px] font-bold text-forest-900 mb-2 truncate">{activity.title ?? 'Escursione'}</p>
        <div className="flex items-center gap-4 text-[13px] text-stone-500">
          <span>{(activity.distanceMeters / 1000).toFixed(1)} km</span>
          <span>{Math.round(activity.elevationGain)} m D+</span>
          <span>{formatDuration(activity.totalTimeSeconds)}</span>
        </div>
      </div>
    </Link>
  )
}

/**
 * Index del tab Resoconto: le escursioni concluse (dati/tracciato/foto,
 * generati automaticamente alla chiusura del Navigatore). I percorsi ancora
 * "in attesa" vivono nel tab Guida — qui non compaiono più.
 */
export default function ResocontoIndexPage() {
  const [activities, setActivities] = useState<ActivityMeta[]>([])
  const [loading,    setLoading]    = useState(true)
  const [monthIdx,   setMonthIdx]   = useState(-1)
  const [view,       setView]       = useState<'feed' | 'calendar'>('feed')
  const [dayIdx,     setDayIdx]     = useState<Record<string, number>>({})
  const [sortBy,     setSortBy]     = useState<SortKey>('date')
  const [showAllHistory, setShowAllHistory] = useState(false)
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)
  const [reportStatus, setReportStatus] = useState<Record<string, ResocontoStatus>>({})
  const monthBarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getAllActivities(setActivities).then(setActivities).finally(() => setLoading(false))
    fetch('/api/resoconto-status').then(r => r.ok ? r.json() : {}).then(setReportStatus).catch(() => {})
  }, [])

  useEffect(() => {
    const refresh = () => { getAllActivities(setActivities).then(setActivities).catch(() => {}) }
    window.addEventListener('cts-updated', refresh)
    return () => window.removeEventListener('cts-updated', refresh)
  }, [])

  const anniversaries = useMemo(() => findAnniversaries(activities), [activities])

  const months = useMemo(() => {
    const now = new Date()
    const curY = now.getFullYear(), curM = now.getMonth()
    if (activities.length === 0) return [{ year: curY, month: curM }]
    const allDates = activities.map(a => new Date(a.startTime))
    const minDate = new Date(Math.min(...allDates.map(d => d.getTime())))
    const result: { year: number; month: number }[] = []
    let y = minDate.getFullYear(), m = minDate.getMonth()
    while (y < curY || (y === curY && m <= curM)) {
      result.push({ year: y, month: m })
      if (++m > 11) { m = 0; y++ }
    }
    return result
  }, [activities])

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

  const safeIdx = monthIdx < 0 ? months.length - 1 : monthIdx
  const { year, month } = months[safeIdx] ?? { year: new Date().getFullYear(), month: new Date().getMonth() }

  const monthActivities = useMemo(() => {
    if (showAllHistory) return activities
    return activities.filter(a => {
      const d = new Date(a.startTime)
      return d.getFullYear() === year && d.getMonth() === month
    })
  }, [activities, year, month, showAllHistory])

  const sortedFeed = useMemo(() => {
    const cmp: Record<SortKey, (a: ActivityMeta, b: ActivityMeta) => number> = {
      date:   (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
      km:     (a, b) => b.distanceMeters - a.distanceMeters,
      dplus:  (a, b) => b.elevationGain - a.elevationGain,
      cts:    (a, b) => ((b as ActivityMeta & { trailScore?: number }).trailScore ?? -1) - ((a as ActivityMeta & { trailScore?: number }).trailScore ?? -1),
      rating: (a, b) => (b.userRating ?? 0) - (a.userRating ?? 0),
    }
    return [...monthActivities].sort(cmp[sortBy] ?? cmp.date)
  }, [monthActivities, sortBy])

  const cells: (number | null)[] = useMemo(() => {
    const daysInMonth = getDaysInMonth(new Date(year, month))
    const leading     = getLeadingEmpty(year, month)
    const total       = Math.ceil((leading + daysInMonth) / 7) * 7
    return Array.from({ length: total }, (_, i) => {
      const d = i - leading + 1
      return d >= 1 && d <= daysInMonth ? d : null
    })
  }, [year, month])

  const monthLabel   = format(new Date(year, month, 1), 'MMMM yyyy', { locale: it })
  const heroActivity = activities[0]
  const heroRoute = heroActivity?.routePolyline && heroActivity.routePolyline.length > 1 ? heroActivity.routePolyline : null

  return (
    <div className="min-h-screen bg-stone-50 pb-28 md:pb-0">
      <Navbar />

      {/* ── Hero ── */}
      <div className="relative h-[240px] sm:h-[300px] overflow-hidden bg-gradient-to-br from-forest-800 to-forest-900 bg-topography">
        {heroRoute && (
          <div className="absolute inset-0 opacity-80">
            <RouteThumb polyline={heroRoute} color="#8cc894" strokeWidth={3} />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-forest-900/15 to-forest-900/85" />
        <div className="absolute left-6 right-6 bottom-6 sm:left-10 sm:right-10 sm:bottom-8 max-w-[1400px] mx-auto sm:static sm:px-0">
          <div className="max-w-[1400px] mx-auto px-0 sm:px-4">
            <p className="text-forest-300 text-[13px] font-semibold mb-1.5">Resoconto</p>
            <h1 className="font-display text-[26px] sm:text-4xl font-bold text-white leading-tight">
              {loading ? 'Caricamento…' :
                activities.length > 0
                  ? `${activities.length} escursion${activities.length === 1 ? 'e' : 'i'} conclus${activities.length === 1 ? 'a' : 'e'}`
                  : 'Nessuna escursione conclusa'
              }
            </h1>
          </div>
        </div>
      </div>

      {/* ── Main ── */}
      <main className="max-w-[1400px] mx-auto px-4 py-5 sm:py-8">
        {!loading && anniversaries.length > 0 && (
          <div className="mb-5 sm:mb-6 flex flex-col gap-2">
            {anniversaries.map(({ activity, yearsAgo }) => (
              <Link
                key={activity.id}
                href={`/resoconto/${activity.id}`}
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

        ) : activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 rounded-full bg-forest-50 border border-forest-200 flex items-center justify-center mb-6">
              <Mountain className="w-10 h-10 text-forest-400" />
            </div>
            <h2 className="font-display text-2xl font-semibold text-stone-700 mb-2">Nessuna escursione conclusa</h2>
            <p className="text-stone-400 text-sm max-w-sm mb-6 px-4">
              Il resoconto di un&apos;escursione si genera automaticamente quando concludi una navigazione
              dal tab Guida, oppure carica direttamente un&apos;attività registrata.
            </p>
            <Link
              href="/upload?tab=activity"
              className="flex items-center gap-2 px-6 py-3 bg-forest-600 hover:bg-forest-700 text-white rounded-xl font-medium transition-colors"
            >
              <Upload className="w-5 h-5" /> Carica un&apos;escursione
            </Link>
          </div>

        ) : (
          <div className="fade-up space-y-4">

            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-bold text-stone-700 capitalize truncate">
                {showAllHistory ? 'Tutto lo storico' : monthLabel}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setView(v => v === 'feed' ? 'calendar' : 'feed')}
                  title={view === 'feed' ? 'Vedi calendario' : 'Vedi elenco'}
                  className="flex items-center justify-center w-9 h-9 rounded-full bg-white border border-stone-200 hover:border-forest-400 text-forest-700 transition-all shadow-sm"
                >
                  {view === 'feed' ? <CalendarDays className="w-4 h-4" /> : <LayoutList className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => setFilterSheetOpen(true)}
                  className="flex items-center gap-1.5 border border-stone-200 bg-white rounded-full px-3.5 py-2 text-xs font-bold text-forest-700 shadow-sm hover:border-forest-400 transition-all"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" /> Ordina
                </button>
              </div>
            </div>

            {view === 'calendar' ? (
              <div>
                {months.length > 1 && (
                  <div ref={monthBarRef} className="flex gap-1 overflow-x-auto mb-4 pb-1" style={{ scrollbarWidth: 'none' }}>
                    {months.map(({ year: y, month: m }, i) => {
                      const count    = countPerMonth[i]
                      const isActive = i === safeIdx
                      const showYear = i === 0 || months[i - 1].year !== y
                      const barH = count > 0 ? Math.max(4, Math.round((count / maxCount) * 22)) : 0

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
                                : 'bg-stone-50 border border-stone-100 text-stone-300'}`}
                        >
                          <div className="flex items-end h-6 w-full justify-center gap-0.5">
                            {barH > 0 ? (
                              <div className={`w-2.5 rounded-t-sm ${isActive ? 'bg-forest-300' : 'bg-forest-400'}`} style={{ height: `${barH}px` }} />
                            ) : (
                              <div className={`w-2.5 h-px ${isActive ? 'bg-forest-400/40' : 'bg-stone-200'}`} />
                            )}
                          </div>
                          <span className="text-[10px] font-semibold leading-none whitespace-nowrap capitalize">
                            {format(new Date(y, m, 1), 'MMM', { locale: it })}
                            {showYear && <span className={`ml-0.5 text-[9px] font-normal ${isActive ? 'text-forest-200' : 'text-stone-400'}`}>&apos;{String(y).slice(-2)}</span>}
                          </span>
                          {count > 0 && <span className={`text-[9px] font-bold leading-none ${isActive ? 'text-forest-200' : 'text-forest-500'}`}>{count}</span>}
                        </button>
                      )
                    })}
                  </div>
                )}

                <MonthNav
                  label={monthLabel}
                  canPrev={safeIdx > 0}
                  canNext={safeIdx < months.length - 1}
                  onPrev={() => setMonthIdx(i => Math.max(0, (i < 0 ? months.length - 1 : i) - 1))}
                  onNext={() => setMonthIdx(i => Math.min(months.length - 1, (i < 0 ? months.length - 1 : i) + 1))}
                />

                <div className="grid grid-cols-7 gap-1 sm:gap-1.5 mb-1 sm:mb-1.5">
                  {DAY_LABELS.map(d => (
                    <div key={d} className="text-center text-[9px] sm:text-xs font-semibold text-stone-400 uppercase tracking-widest py-1">{d}</div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
                  {cells.map((dayNum, i) => {
                    if (dayNum === null) return <div key={`e-${i}`} className="aspect-square" />
                    const date      = new Date(year, month, dayNum)
                    const key       = format(date, 'yyyy-MM-dd')
                    const acts      = actsByDate.get(key) ?? []
                    const curIdx    = Math.min(dayIdx[key] ?? 0, acts.length - 1)
                    const act       = acts[curIdx]
                    const isToday   = isSameDay(date, new Date())

                    if (acts.length > 0) return (
                      <CalendarActivityCell
                        key={key}
                        activity={act}
                        date={date}
                        dotCount={acts.length}
                        dotActive={curIdx}
                        onDotClick={idx => setDayIdx(prev => ({ ...prev, [key]: idx }))}
                        reportStatus={reportStatus[act.id]}
                      />
                    )

                    return (
                      <div key={key} className={`aspect-square rounded-xl border flex flex-col ${isToday ? 'border-terra-200 bg-terra-50/40' : 'border-stone-100 bg-stone-50/60'}`}>
                        <div className="flex justify-end p-1 sm:p-1.5">
                          <span className={`text-[10px] sm:text-xs font-medium rounded-full w-5 h-5 flex items-center justify-center ${isToday ? 'bg-terra-500 text-white font-bold' : 'text-stone-300'}`}>
                            {dayNum}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

            ) : (
              <div>
                {showAllHistory && (
                  <button
                    onClick={() => setShowAllHistory(false)}
                    className="flex items-center gap-1 px-2.5 py-1.5 mb-3 rounded-lg bg-white border border-stone-200 hover:border-forest-400 transition-all shadow-sm text-forest-700 text-sm font-medium"
                  >
                    <CalendarDays className="w-4 h-4" /> Torna al mese
                  </button>
                )}

                {sortedFeed.length === 0 ? (
                  <p className="text-sm text-stone-400 text-center py-12">
                    Nessuna escursione {showAllHistory ? '' : 'in questo mese'}.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {sortedFeed.map(activity => (
                      <FeedActivityCard
                        key={activity.id}
                        activity={activity}
                        showFullDate={showAllHistory}
                        reportStatus={reportStatus[activity.id]}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── Ordina ── */}
      <Sheet open={filterSheetOpen} onClose={() => setFilterSheetOpen(false)} title="Ordina">
        <div className="space-y-5">
          <div>
            <p className="text-xs font-bold text-stone-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <ArrowUpDown className="w-3 h-3" /> Ordina per
            </p>
            <div className="flex flex-wrap gap-2">
              {SORT_OPTIONS.map(s => (
                <button key={s.id} onClick={() => setSortBy(s.id)}
                  className={`px-3.5 py-2 rounded-full text-sm font-semibold transition-all border
                    ${sortBy === s.id ? 'bg-forest-600 border-forest-600 text-white' : 'bg-white border-stone-200 text-stone-500 hover:border-forest-300'}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          {!showAllHistory && (
            <button
              onClick={() => { setShowAllHistory(true); setFilterSheetOpen(false) }}
              className="w-full text-center text-sm font-semibold text-forest-600 hover:text-forest-700 py-2"
            >
              Vedi tutto lo storico →
            </button>
          )}
        </div>
      </Sheet>
    </div>
  )
}
