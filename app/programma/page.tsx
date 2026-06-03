'use client'
import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import RouteThumb from '@/components/RouteThumb'
import { getAllPlanned, deletePlanned, type PlannedHikeMeta } from '@/lib/plannedStore'
import { computeTrailScore, tsLabel } from '@/lib/trailScore'
import type { BeautyScore } from '@/lib/beautyScore'
import { formatDuration } from '@/lib/tcxParser'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  Mountain, Route, TrendingUp, Clock, CalendarDays,
  Loader2, Trash2, Upload, AlertTriangle, Info, ShieldAlert, ArrowUpDown,
} from 'lucide-react'

const DIFFICULTY_LABEL: Record<string, string> = {
  facile:       'Facile',
  moderata:     'Moderata',
  impegnativa:  'Impegnativa',
  estrema:      'Estrema',
}

const DIFFICULTY_COLORS: Record<string, string> = {
  facile:      'bg-emerald-100 text-emerald-700',
  moderata:    'bg-amber-100 text-amber-700',
  impegnativa: 'bg-orange-100 text-orange-700',
  estrema:     'bg-red-100 text-red-700',
}

function SuitabilityBar({ score }: { score: number }) {
  const color =
    score >= 75 ? 'bg-emerald-500' :
    score >= 50 ? 'bg-amber-500'   :
    score >= 30 ? 'bg-orange-500'  : 'bg-red-500'
  const label =
    score >= 75 ? 'Ben preparato'        :
    score >= 50 ? 'Fattibile con impegno' :
    score >= 30 ? 'Limite capacità'       : 'Molto sfidante'
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center text-xs">
        <span className="text-stone-500 font-medium">Adatta a te</span>
        <span className="font-semibold text-stone-700">{score}% · {label}</span>
      </div>
      <div className="w-full h-1.5 bg-stone-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  )
}

export default function ProgrammaPage() {
  const [hikes,   setHikes]   = useState<PlannedHikeMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [sortBy,    setSortBy]    = useState<'date' | 'km' | 'dplus' | 'ts' | 'suitability'>('date')
  const [userAge,    setUserAge]    = useState(0)
  const [pesoNatura, setPesoNatura] = useState(50)
  const [prefSforzo, setPrefSforzo] = useState(50)
  const [prefRitmo,  setPrefRitmo]  = useState(50)

  const sortedHikes = useMemo(() => {
    const arr = [...hikes]
    switch (sortBy) {
      case 'km':          return arr.sort((a, b) => b.distanceMeters - a.distanceMeters)
      case 'dplus':       return arr.sort((a, b) => b.elevationGain - a.elevationGain)
      case 'ts':          return arr.sort((a, b) => (b.cachedTrailScore ?? -1) - (a.cachedTrailScore ?? -1))
      case 'suitability': return arr.sort((a, b) => (b.assessment?.suitabilityScore ?? 0) - (a.assessment?.suitabilityScore ?? 0))
      default:            return arr.sort((a, b) => {
        const da = a.plannedDate ? new Date(a.plannedDate).getTime() : 0
        const db = b.plannedDate ? new Date(b.plannedDate).getTime() : 0
        return db - da
      })
    }
  }, [hikes, sortBy])

  useEffect(() => {
    getAllPlanned(setHikes).then(setHikes).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetch('/api/user-settings').then(r => r.json()).then(d => {
      if (d.userAge)                    setUserAge(d.userAge)
      if (d.beautyNaturaWeight != null) setPesoNatura(d.beautyNaturaWeight)
      if (d.prefSforzo         != null) setPrefSforzo(d.prefSforzo)
      if (d.prefRitmo          != null) setPrefRitmo(d.prefRitmo)
    }).catch(() => {})
  }, [])

  // Compute TS client-side from cached categories + current prefs (all hikes, every time prefs change)
  useEffect(() => {
    const toCompute = hikes.filter(
      h => (h.cachedBeautyScore?.categories?.length ?? 0) > 0
    )
    if (!toCompute.length) return
    const updMap: Record<string, number> = {}
    for (const hike of toCompute) {
      const cats = hike.cachedBeautyScore!.categories!
      const bs: BeautyScore = {
        categories:  cats as BeautyScore['categories'],
        overall:     hike.cachedBeautyScore!.overall,
        grade:       hike.cachedBeautyScore!.grade,
        gradeLabel:  hike.cachedBeautyScore!.gradeLabel ?? '',
        color:       hike.cachedBeautyScore!.color,
      }
      const { ts } = computeTrailScore(bs, {
        distanceMeters: hike.distanceMeters,
        elevationGain:  hike.elevationGain,
        userAge:        userAge > 0 ? userAge : undefined,
        prefSforzo,
        prefRitmo,
      }, pesoNatura)
      updMap[hike.id] = ts
    }
    setHikes(prev => {
      const hasChanges = prev.some(h => updMap[h.id] !== undefined && updMap[h.id] !== h.cachedTrailScore)
      if (!hasChanges) return prev
      return prev.map(h => updMap[h.id] !== undefined ? { ...h, cachedTrailScore: updMap[h.id] } : h)
    })
  }, [hikes.length, userAge, pesoNatura, prefSforzo, prefRitmo])

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault()
    if (!confirm('Eliminare questa escursione pianificata?')) return
    setDeleting(id)
    try {
      await deletePlanned(id)
      setHikes(prev => prev.filter(h => h.id !== id))
    } finally {
      setDeleting(null)
    }
  }

  const topRisk = (hike: PlannedHikeMeta) =>
    hike.assessment?.risks.find(r => r.type === 'danger') ??
    hike.assessment?.risks.find(r => r.type === 'warning') ??
    hike.assessment?.risks.find(r => r.type === 'info')

  return (
    <div className="min-h-screen bg-stone-50 pb-20 md:pb-0">
      <Navbar />

      <div className="bg-gradient-to-br from-sky-800 to-sky-900 text-white">
        <div className="max-w-[1400px] mx-auto px-4 py-8">
          <div className="flex items-end justify-between flex-wrap gap-4">
            <div>
              <h1 className="font-display text-4xl font-semibold leading-tight">
                Escursioni<br />
                <span className="text-sky-300">pianificate</span>
              </h1>
              <p className="text-sky-400 text-sm mt-2">
                {loading ? 'Caricamento…' : `${hikes.length} escursion${hikes.length !== 1 ? 'i' : 'e'} in programma`}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {!loading && hikes.length > 0 && (
                <div className="flex items-center gap-0.5 bg-sky-700/50 rounded-xl p-1">
                  <ArrowUpDown className="w-3.5 h-3.5 text-sky-300 ml-1" />
                  {([
                    { id: 'date',        label: 'Data' },
                    { id: 'km',          label: 'Km' },
                    { id: 'dplus',       label: 'D+' },
                    { id: 'ts',          label: 'TS' },
                    { id: 'suitability', label: 'Adatta' },
                  ] as const).map(s => (
                    <button key={s.id} onClick={() => setSortBy(s.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all
                        ${sortBy === s.id ? 'bg-white text-sky-800 shadow-sm' : 'text-sky-200 hover:text-white'}`}>
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            <Link
              href="/upload"
              className="flex items-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-medium transition-colors shadow-sm text-sm"
            >
              <Upload className="w-4 h-4" /> Pianifica da GPX
            </Link>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-[1400px] mx-auto px-4 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-24 text-stone-400 gap-3">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span>Caricamento…</span>
          </div>

        ) : hikes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-20 h-20 rounded-full bg-sky-50 border border-sky-200 flex items-center justify-center mb-6">
              <Mountain className="w-10 h-10 text-sky-400" />
            </div>
            <h2 className="font-display text-2xl font-semibold text-stone-700 mb-2">Nessuna escursione pianificata</h2>
            <p className="text-stone-400 text-sm max-w-sm mb-6">
              Carica un file GPX per pianificare un&#39;escursione e ricevere una valutazione personalizzata.
            </p>
            <Link
              href="/upload"
              className="flex items-center gap-2 px-6 py-3 bg-sky-600 hover:bg-sky-700 text-white rounded-xl font-medium transition-colors"
            >
              <Upload className="w-5 h-5" /> Pianifica la tua prossima escursione
            </Link>
          </div>

        ) : (
          <div className="fade-up grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {sortedHikes.map(hike => {
              const risk   = topRisk(hike)
              const diff   = hike.assessment?.difficulty
              const suit   = hike.assessment?.suitabilityScore ?? 50
              const isDel  = deleting === hike.id

              return (
                <Link
                  key={hike.id}
                  href={`/programma/${encodeURIComponent(hike.id)}`}
                  className="bg-white rounded-2xl border border-sky-100 shadow-sm hover:border-sky-400 hover:shadow-md transition-all overflow-hidden flex flex-col group"
                >
                  {/* ── TS header — top of card ── */}
                  {(() => {
                    const cts = hike.cachedTrailScore
                    const tsInfo = cts !== undefined ? tsLabel(cts) : null
                    if (tsInfo && cts !== undefined) {
                      return (
                        <div className="flex items-center gap-2 px-3 py-2 shrink-0"
                          style={{ backgroundColor: tsInfo.color + '18', borderBottom: `1.5px solid ${tsInfo.color}30` }}>
                          <span className="text-base font-bold" style={{ color: tsInfo.color }}>TS {cts}</span>
                          <span className="text-xs font-semibold" style={{ color: tsInfo.color }}>{tsInfo.label}</span>
                          {hike.plannedDate && (
                            <span className="ml-auto flex items-center gap-0.5 text-[10px] font-semibold text-stone-500">
                              <CalendarDays className="w-3 h-3" />
                              {format(new Date(hike.plannedDate), 'd MMM', { locale: it })}
                            </span>
                          )}
                        </div>
                      )
                    }
                    return (
                      <div className="flex items-center justify-between px-3 py-1.5 shrink-0 bg-stone-50 border-b border-stone-100">
                        <span className="text-[10px] text-stone-400 italic">Apri per il punteggio</span>
                        {hike.plannedDate && (
                          <span className="flex items-center gap-0.5 text-[10px] font-semibold text-stone-500">
                            <CalendarDays className="w-3 h-3" />
                            {format(new Date(hike.plannedDate), 'd MMM', { locale: it })}
                          </span>
                        )}
                      </div>
                    )
                  })()}

                  {/* Route thumbnail */}
                  <div className="relative h-32 bg-gradient-to-b from-sky-50 to-stone-50 overflow-hidden">
                    <div className="absolute inset-2">
                      {hike.routePolyline && hike.routePolyline.length > 1 ? (
                        <RouteThumb polyline={hike.routePolyline} color="#0284c7" strokeWidth={3} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Mountain className="w-10 h-10 text-sky-200" />
                        </div>
                      )}
                    </div>

                    {/* Difficulty badge */}
                    {diff && (
                      <span className={`absolute top-2 left-2 text-[10px] font-bold rounded-full px-2 py-0.5 ${DIFFICULTY_COLORS[diff]}`}>
                        {DIFFICULTY_LABEL[diff]}
                      </span>
                    )}

                    {/* Delete button */}
                    <button
                      onClick={e => handleDelete(hike.id, e)}
                      disabled={isDel}
                      className="absolute bottom-2 right-2 w-7 h-7 rounded-full bg-white/80 hover:bg-red-50 border border-stone-200 hover:border-red-300 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                    >
                      {isDel
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin text-stone-400" />
                        : <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      }
                    </button>
                  </div>

                  {/* Info section */}
                  <div className="p-3 flex flex-col gap-2 flex-1">
                    <p className="text-sm font-semibold text-stone-800 truncate leading-tight">
                      {hike.title}
                    </p>

                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                      <span className="flex items-center gap-0.5 text-sky-700 font-medium">
                        <Route className="w-3 h-3" />{(hike.distanceMeters / 1000).toFixed(1)} km
                      </span>
                      <span className="flex items-center gap-0.5 text-sky-600">
                        <TrendingUp className="w-3 h-3" />{Math.round(hike.elevationGain)} m D+
                      </span>
                      <span className="flex items-center gap-0.5 text-stone-400">
                        <Clock className="w-3 h-3" />{formatDuration(hike.estimatedTimeSeconds)} stim.
                      </span>
                    </div>

                    {/* Suitability bar */}
                    {hike.assessment && <SuitabilityBar score={suit} />}

                    {/* Top risk */}
                    {risk && (
                      <div className={`flex items-start gap-1.5 text-[10px] leading-snug rounded-lg px-2 py-1.5
                        ${risk.type === 'danger'  ? 'bg-red-50 text-red-700'    :
                          risk.type === 'warning' ? 'bg-amber-50 text-amber-700' :
                                                    'bg-sky-50 text-sky-700'}`}
                      >
                        {risk.type === 'danger'  ? <ShieldAlert className="w-3 h-3 shrink-0 mt-0.5" /> :
                         risk.type === 'warning' ? <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" /> :
                                                   <Info className="w-3 h-3 shrink-0 mt-0.5" />}
                        <span>{risk.text}</span>
                      </div>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
