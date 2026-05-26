'use client'
import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import RouteThumb from '@/components/RouteThumb'
import { getAllActivities, type ActivityMeta } from '@/lib/blobStore'
import { formatDuration } from '@/lib/tcxParser'
import { format, isSameDay } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  Mountain, Upload, Heart, Route, Clock, Flame, TrendingUp,
  ChevronLeft, ChevronRight, Loader2,
} from 'lucide-react'

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

function getMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

export default function HomePage() {
  const [activities, setActivities] = useState<ActivityMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [weekIdx, setWeekIdx] = useState(-1) // -1 = not yet initialized

  useEffect(() => {
    getAllActivities()
      .then(setActivities)
      .finally(() => setLoading(false))
  }, [])

  // All weeks from earliest activity to current week
  const weeks = useMemo(() => {
    const now = new Date()
    const currentMonday = getMonday(now)
    if (activities.length === 0) return [currentMonday]
    const dates = activities.map(a => new Date(a.startTime))
    const minDate = new Date(Math.min(...dates.map(d => d.getTime())))
    const earliest = getMonday(minDate)
    const allWeeks: Date[] = []
    let d = new Date(earliest)
    while (d <= currentMonday) {
      allWeeks.push(new Date(d))
      d.setDate(d.getDate() + 7)
    }
    return allWeeks
  }, [activities])

  // Start at the most recent week
  useEffect(() => {
    if (weekIdx === -1 && weeks.length > 0) {
      setWeekIdx(weeks.length - 1)
    }
  }, [weeks, weekIdx])

  // Activities grouped by date (yyyy-MM-dd → list)
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

  const safeWeekIdx = weekIdx < 0 ? weeks.length - 1 : weekIdx
  const currentMonday = weeks[safeWeekIdx] ?? getMonday(new Date())
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(currentMonday, i))
  const weekLabel = `${format(weekDays[0], 'd MMM', { locale: it })} – ${format(weekDays[6], 'd MMM yyyy', { locale: it })}`

  // Dot pagination: show up to 13 dots; beyond that show "X / Y"
  const maxDots = 13
  const showDots = weeks.length <= maxDots

  return (
    <div className="min-h-screen bg-stone-50">
      <Navbar />

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
            <Link
              href="/upload"
              className="flex items-center gap-2 px-5 py-2.5 bg-terra-500 hover:bg-terra-400 text-white rounded-xl font-medium text-sm transition-colors shadow-lg"
            >
              <Upload className="w-4 h-4" /> Carica TCX
            </Link>
          </div>
        </div>
      </div>

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
            <h2 className="font-display text-2xl font-semibold text-stone-700 mb-2">
              Inizia il tuo diario
            </h2>
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
        ) : (
          <div className="fade-up">
            {/* Week navigation */}
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => setWeekIdx(i => Math.max(0, i - 1))}
                disabled={safeWeekIdx === 0}
                className="flex items-center gap-1 px-3 py-2 rounded-xl bg-white border border-stone-200 hover:border-forest-400 disabled:opacity-30 transition-all shadow-sm text-stone-600 text-sm font-medium"
              >
                <ChevronLeft className="w-4 h-4" /> Prec.
              </button>

              <div className="text-center">
                <p className="font-semibold text-stone-700 capitalize">{weekLabel}</p>
                {!showDots && (
                  <p className="text-xs text-stone-400 mt-0.5">Settimana {safeWeekIdx + 1} di {weeks.length}</p>
                )}
              </div>

              <button
                onClick={() => setWeekIdx(i => Math.min(weeks.length - 1, i + 1))}
                disabled={safeWeekIdx === weeks.length - 1}
                className="flex items-center gap-1 px-3 py-2 rounded-xl bg-white border border-stone-200 hover:border-forest-400 disabled:opacity-30 transition-all shadow-sm text-stone-600 text-sm font-medium"
              >
                Succ. <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 gap-2 mb-2">
              {DAY_LABELS.map(day => (
                <div key={day} className="text-center text-xs font-semibold text-stone-400 uppercase tracking-widest py-1">
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-2">
              {weekDays.map(day => {
                const key = format(day, 'yyyy-MM-dd')
                const dayActs = actsByDate.get(key) ?? []
                const activity = dayActs[0]
                const extra = dayActs.length - 1
                const isToday = isSameDay(day, new Date())

                if (activity) {
                  return (
                    <Link
                      key={key}
                      href={`/escursione/${encodeURIComponent(activity.id)}`}
                      className="aspect-square bg-white rounded-2xl border border-stone-200 shadow-sm hover:border-forest-400 hover:shadow-md transition-all overflow-hidden flex flex-col group"
                    >
                      {/* Route thumbnail area */}
                      <div className="flex-1 relative bg-gradient-to-b from-forest-50 to-stone-50 min-h-0 overflow-hidden">
                        <div className="absolute inset-2">
                          {activity.routePolyline && activity.routePolyline.length > 1 ? (
                            <RouteThumb
                              polyline={activity.routePolyline}
                              color="#2d7a3d"
                              strokeWidth={3}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Mountain className="w-10 h-10 text-forest-200" />
                            </div>
                          )}
                        </div>
                        {/* Day number badge */}
                        <span
                          className={`absolute top-2 right-2 text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center shadow-sm
                            ${isToday ? 'bg-terra-500 text-white' : 'bg-white/90 text-stone-600'}`}
                        >
                          {format(day, 'd')}
                        </span>
                        {/* Multiple activities badge */}
                        {extra > 0 && (
                          <span className="absolute top-2 left-2 text-[10px] font-bold bg-forest-600 text-white rounded-full px-1.5 py-0.5">
                            +{extra}
                          </span>
                        )}
                      </div>

                      {/* Info section */}
                      <div className="shrink-0 px-2.5 pb-2.5 pt-1.5 border-t border-stone-100">
                        <p className="text-xs font-semibold text-stone-800 truncate leading-tight mb-1">
                          {activity.title ?? 'Escursione'}
                        </p>
                        <div className="flex items-center gap-2 text-[10px] flex-wrap">
                          <span className="flex items-center gap-0.5 text-forest-700 font-medium">
                            <Route className="w-2.5 h-2.5" />
                            {(activity.distanceMeters / 1000).toFixed(1)} km
                          </span>
                          <span className="flex items-center gap-0.5 text-forest-600">
                            <TrendingUp className="w-2.5 h-2.5" />
                            {activity.elevationGain.toFixed(0)} m
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] mt-0.5">
                          <span className="flex items-center gap-0.5 text-stone-400">
                            <Clock className="w-2.5 h-2.5" />
                            {formatDuration(activity.totalTimeSeconds)}
                          </span>
                          <span className="flex items-center gap-0.5 text-red-400">
                            <Heart className="w-2.5 h-2.5" />
                            {activity.avgHeartRate} bpm
                          </span>
                        </div>
                        <div className="flex items-center gap-0.5 text-[10px] mt-0.5 text-terra-500">
                          <Flame className="w-2.5 h-2.5" />
                          {activity.calories} kcal
                        </div>
                      </div>
                    </Link>
                  )
                } else {
                  return (
                    <div
                      key={key}
                      className={`aspect-square rounded-2xl border flex flex-col
                        ${isToday
                          ? 'border-terra-200 bg-terra-50/40'
                          : 'border-stone-100 bg-stone-50/60'}`}
                    >
                      <div className="flex justify-end p-2">
                        <span
                          className={`text-xs font-medium rounded-full w-6 h-6 flex items-center justify-center
                            ${isToday ? 'bg-terra-500 text-white font-bold' : 'text-stone-300'}`}
                        >
                          {format(day, 'd')}
                        </span>
                      </div>
                    </div>
                  )
                }
              })}
            </div>

            {/* Dot pagination */}
            <div className="flex items-center justify-center gap-1.5 mt-6">
              {showDots ? (
                weeks.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setWeekIdx(i)}
                    className={`rounded-full transition-all duration-200
                      ${i === safeWeekIdx
                        ? 'w-6 h-2.5 bg-forest-600'
                        : 'w-2.5 h-2.5 bg-stone-300 hover:bg-stone-400'}`}
                    aria-label={`Settimana ${i + 1}`}
                  />
                ))
              ) : (
                <div className="flex items-center gap-3 text-sm text-stone-500">
                  <button
                    onClick={() => setWeekIdx(i => Math.max(0, i - 1))}
                    disabled={safeWeekIdx === 0}
                    className="disabled:opacity-30"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="font-mono font-medium text-stone-600">
                    {safeWeekIdx + 1} / {weeks.length}
                  </span>
                  <button
                    onClick={() => setWeekIdx(i => Math.min(weeks.length - 1, i + 1))}
                    disabled={safeWeekIdx === weeks.length - 1}
                    className="disabled:opacity-30"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
