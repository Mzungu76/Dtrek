'use client'
import { useEffect, useState, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import Navbar from '@/components/Navbar'
import ElevationProfileChart from '@/components/ElevationProfileChart'
import WeatherWidget from '@/components/WeatherWidget'
import WikiCards from '@/components/WikiCards'
import BeautyReport from '@/components/BeautyReport'
import {
  getPlannedById, updatePlannedMeta, deletePlanned,
  type PlannedHike, type HikeAssessment,
} from '@/lib/plannedStore'
import { fetchPoisNearTrack, type PoiItem } from '@/lib/overpass'
import type { WikiPage } from '@/lib/wikipedia'
import { computeBeautyScore } from '@/lib/beautyScore'
import { formatDuration } from '@/lib/tcxParser'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  ArrowLeft, Mountain, Route, TrendingUp, TrendingDown,
  Clock, CalendarDays, Pencil, Check, X, Trash2, Loader2,
  ShieldAlert, AlertTriangle, Info, BarChart2, Layers,
} from 'lucide-react'

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false })

const DIFFICULTY_LABEL: Record<string, string> = {
  facile: 'Facile', moderata: 'Moderata', impegnativa: 'Impegnativa', estrema: 'Estrema',
}
const DIFFICULTY_COLORS: Record<string, string> = {
  facile:      'bg-emerald-100 text-emerald-700 border-emerald-200',
  moderata:    'bg-amber-100 text-amber-700 border-amber-200',
  impegnativa: 'bg-orange-100 text-orange-700 border-orange-200',
  estrema:     'bg-red-100 text-red-700 border-red-200',
}
const SUIT_LABEL = (s: number) =>
  s >= 75 ? 'Ben preparato'         :
  s >= 50 ? 'Fattibile con impegno'  :
  s >= 30 ? 'Al limite delle capacità' : 'Molto sfidante'
const SUIT_COLOR = (s: number) =>
  s >= 75 ? 'bg-emerald-500' : s >= 50 ? 'bg-amber-500' : s >= 30 ? 'bg-orange-500' : 'bg-red-500'

function StatTile({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-stone-200 p-4 flex items-start gap-3">
      <div className="w-9 h-9 rounded-lg bg-sky-50 flex items-center justify-center shrink-0">{icon}</div>
      <div>
        <p className="text-xs text-stone-400 font-medium">{label}</p>
        <p className="text-lg font-bold text-stone-800 leading-tight">{value}</p>
        {sub && <p className="text-xs text-stone-400">{sub}</p>}
      </div>
    </div>
  )
}

function RiskItem({ type, text }: { type: 'danger' | 'warning' | 'info'; text: string }) {
  const colors = {
    danger:  'bg-red-50 border-red-200 text-red-700',
    warning: 'bg-amber-50 border-amber-200 text-amber-700',
    info:    'bg-sky-50 border-sky-200 text-sky-700',
  }
  const Icon = type === 'danger' ? ShieldAlert : type === 'warning' ? AlertTriangle : Info
  return (
    <div className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm ${colors[type]}`}>
      <Icon className="w-4 h-4 shrink-0 mt-0.5" />
      <span>{text}</span>
    </div>
  )
}

function AssessmentPanel({ a, distKm, elevGain }: { a: HikeAssessment; distKm: number; elevGain: number }) {
  const suit = a.suitabilityScore
  return (
    <div className="space-y-5">
      {/* Difficulty + suitability */}
      <div className="flex flex-wrap gap-3 items-start">
        <div className={`px-3 py-1.5 rounded-full border text-sm font-semibold ${DIFFICULTY_COLORS[a.difficulty]}`}>
          {DIFFICULTY_LABEL[a.difficulty]}
        </div>
        <div className="flex-1 min-w-[180px] space-y-1">
          <div className="flex justify-between text-xs font-medium text-stone-600">
            <span>Adatta a te</span>
            <span>{suit}% · {SUIT_LABEL(suit)}</span>
          </div>
          <div className="w-full h-2 bg-stone-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${SUIT_COLOR(suit)}`} style={{ width: `${suit}%` }} />
          </div>
        </div>
      </div>

      {/* Personal context */}
      {a.userContext.activityCount > 0 && (
        <div className="bg-stone-50 rounded-xl border border-stone-200 p-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-stone-400 mb-0.5">vs. media distanza</p>
            <p className="font-semibold text-stone-800">
              {a.userContext.vsAvgDistPct}%
              <span className="text-xs font-normal text-stone-400 ml-1">
                (tua media {a.userContext.avgDistanceKm.toFixed(1)} km)
              </span>
            </p>
          </div>
          <div>
            <p className="text-xs text-stone-400 mb-0.5">vs. media dislivello</p>
            <p className="font-semibold text-stone-800">
              {a.userContext.vsAvgElevPct}%
              <span className="text-xs font-normal text-stone-400 ml-1">
                (tua media {a.userContext.avgElevationM} m D+)
              </span>
            </p>
          </div>
          {a.userContext.maxDistanceKm > 0 && (
            <div>
              <p className="text-xs text-stone-400 mb-0.5">record distanza</p>
              <p className="font-semibold text-stone-800">{a.userContext.maxDistanceKm.toFixed(1)} km</p>
            </div>
          )}
          {a.userContext.maxElevationM > 0 && (
            <div>
              <p className="text-xs text-stone-400 mb-0.5">record dislivello</p>
              <p className="font-semibold text-stone-800">{a.userContext.maxElevationM} m D+</p>
            </div>
          )}
        </div>
      )}

      {/* Risks */}
      {a.risks.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">Fattori di rischio</p>
          <div className="space-y-2">
            {a.risks.map((r, i) => <RiskItem key={i} type={r.type} text={r.text} />)}
          </div>
        </div>
      )}

      {/* Suggestions */}
      {a.suggestions.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">Consigli pratici</p>
          <div className="space-y-2">
            {a.suggestions.map((s, i) => <RiskItem key={i} type={s.type} text={s.text} />)}
          </div>
        </div>
      )}
    </div>
  )
}

export default function PlannedHikePage() {
  const params = useParams()
  const router = useRouter()
  const id     = decodeURIComponent(params.id as string)

  const [hike,         setHike]        = useState<PlannedHike | null>(null)
  const [loading,      setLoading]     = useState(true)
  const [saving,       setSaving]      = useState(false)
  const [editTitle,    setEditTitle]   = useState(false)
  const [editNotes,    setEditNotes]   = useState(false)
  const [editDate,     setEditDate]    = useState(false)
  const [titleVal,     setTitleVal]    = useState('')
  const [notesVal,     setNotesVal]    = useState('')
  const [dateVal,      setDateVal]     = useState('')
  const [showGradient, setShowGradient] = useState(false)
  const [pois,         setPois]        = useState<PoiItem[]>([])
  const [wikiPages,    setWikiPages]   = useState<WikiPage[]>([])

  useEffect(() => {
    getPlannedById(id).then(h => {
      if (!h) { router.push('/programma'); return }
      setHike(h)
      setTitleVal(h.title)
      setNotesVal(h.userNotes ?? '')
      setDateVal(h.plannedDate ?? '')
      // Fetch POIs in background
      const gpsPoints = (h.trackPoints ?? [])
        .filter(p => p.lat && p.lon)
        .map(p => [p.lat!, p.lon!] as [number, number])
      if (gpsPoints.length > 0) {
        fetchPoisNearTrack(gpsPoints, 300).then(setPois).catch(() => {})
      }
    }).finally(() => setLoading(false))
  }, [id, router])

  if (loading) return (
    <div className="min-h-screen bg-stone-50">
      <Navbar />
      <div className="flex items-center justify-center py-32 text-stone-400 gap-3">
        <Loader2 className="w-6 h-6 animate-spin" />
        <span>Caricamento…</span>
      </div>
    </div>
  )
  if (!hike) return null

  const patch = async (data: Parameters<typeof updatePlannedMeta>[1]) => {
    setSaving(true)
    try {
      await updatePlannedMeta(id, data)
      setHike(prev => prev ? { ...prev, ...data } : prev)
    } finally { setSaving(false) }
  }

  const saveTitle = async () => { await patch({ title: titleVal }); setEditTitle(false) }
  const saveNotes = async () => { await patch({ userNotes: notesVal }); setEditNotes(false) }
  const saveDate  = async () => { await patch({ plannedDate: dateVal || undefined }); setEditDate(false) }

  const handleDelete = async () => {
    if (!confirm('Eliminare questa escursione pianificata?')) return
    setSaving(true)
    try { await deletePlanned(id); router.push('/programma') }
    finally { setSaving(false) }
  }

  const distKm    = hike.distanceMeters / 1000
  const polyline  = hike.trackPoints?.filter(p => p.lat && p.lon).map(p => [p.lat!, p.lon!] as [number, number])
  const gpsPoints = hike.trackPoints?.filter(p => p.lat && p.lon) ?? []
  const centerPt  = gpsPoints[Math.floor(gpsPoints.length / 2)]
  const hasGps    = gpsPoints.length > 0

  // Compute beauty score once both POIs and wiki pages are loaded
  const beautyScore = useMemo(
    () => (pois.length > 0 || wikiPages.length > 0)
      ? computeBeautyScore(pois, wikiPages, hike.elevationGain, hike.altitudeMax)
      : null,
    [pois, wikiPages, hike.elevationGain, hike.altitudeMax],
  )

  return (
    <div className="min-h-screen bg-stone-50 pb-20 md:pb-0">
      <Navbar />

      <main className="max-w-[1200px] mx-auto px-3 sm:px-4 py-5 sm:py-8 space-y-5 sm:space-y-6">
        {/* Back + delete */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.push('/programma')}
            className="flex items-center gap-2 text-sm text-stone-500 hover:text-stone-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Tutte le escursioni pianificate
          </button>
          <button
            onClick={handleDelete}
            disabled={saving}
            className="flex items-center gap-1.5 text-sm text-red-400 hover:text-red-600 transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Elimina
          </button>
        </div>

        {/* Title */}
        <div className="flex items-start gap-2">
          {editTitle ? (
            <div className="flex items-center gap-2 flex-1">
              <input
                autoFocus
                value={titleVal}
                onChange={e => setTitleVal(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditTitle(false) }}
                className="flex-1 text-2xl font-display font-semibold text-stone-800 border-b-2 border-sky-400 bg-transparent outline-none"
              />
              <button onClick={saveTitle} className="text-forest-600 hover:text-forest-700"><Check className="w-5 h-5" /></button>
              <button onClick={() => { setTitleVal(hike.title); setEditTitle(false) }} className="text-stone-400"><X className="w-5 h-5" /></button>
            </div>
          ) : (
            <div className="flex items-center gap-2 group flex-1">
              <h1 className="font-display text-3xl font-semibold text-stone-800">{hike.title}</h1>
              <button onClick={() => setEditTitle(true)} className="opacity-0 group-hover:opacity-100 transition-opacity text-stone-400 hover:text-stone-600">
                <Pencil className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Planned date row */}
        <div className="flex items-center gap-2 text-sm">
          <CalendarDays className="w-4 h-4 text-sky-500" />
          {editDate ? (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateVal}
                onChange={e => setDateVal(e.target.value)}
                className="border border-stone-300 rounded-lg px-2 py-1 text-sm text-stone-700 bg-white outline-none focus:border-sky-400"
              />
              <button onClick={saveDate} className="text-forest-600 hover:text-forest-700"><Check className="w-4 h-4" /></button>
              <button onClick={() => { setDateVal(hike.plannedDate ?? ''); setEditDate(false) }} className="text-stone-400"><X className="w-4 h-4" /></button>
            </div>
          ) : (
            <button onClick={() => setEditDate(true)} className="text-stone-500 hover:text-sky-600 transition-colors">
              {hike.plannedDate
                ? <>Data pianificata: <strong>{format(new Date(hike.plannedDate), 'EEEE d MMMM yyyy', { locale: it })}</strong></>
                : <span className="text-stone-400 italic">+ Aggiungi data pianificata</span>
              }
            </button>
          )}
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <StatTile
            icon={<Route className="w-5 h-5 text-sky-600" />}
            label="Distanza" value={`${distKm.toFixed(2)} km`}
          />
          <StatTile
            icon={<TrendingUp className="w-5 h-5 text-sky-600" />}
            label="Dislivello +" value={`${Math.round(hike.elevationGain)} m`}
          />
          <StatTile
            icon={<TrendingDown className="w-5 h-5 text-sky-600" />}
            label="Dislivello −" value={`${Math.round(hike.elevationLoss)} m`}
          />
          <StatTile
            icon={<Mountain className="w-5 h-5 text-sky-600" />}
            label="Quota max" value={`${Math.round(hike.altitudeMax)} m`}
            sub={`Min: ${Math.round(hike.altitudeMin)} m`}
          />
          <StatTile
            icon={<Clock className="w-5 h-5 text-sky-600" />}
            label="Tempo stimato" value={formatDuration(hike.estimatedTimeSeconds)}
            sub="Regola di Naismith"
          />
          {hike.fileName && (
            <div className="col-span-1 flex items-center bg-white rounded-xl border border-stone-200 px-4 py-3 text-xs text-stone-400 font-mono truncate">
              {hike.fileName}
            </div>
          )}
        </div>

        {/* Weather forecast */}
        {hasGps && (
          <WeatherWidget mode="forecast" lat={centerPt.lat!} lon={centerPt.lon!} days={7} />
        )}

        {/* Map + Elevation side by side on large screens */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Map */}
          <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
              <p className="text-sm font-semibold text-stone-700">Tracciato</p>
              {hasGps && hike.trackPoints?.some(p => p.altitudeMeters !== undefined) && (
                <button
                  onClick={() => setShowGradient(g => !g)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border transition-colors ${showGradient ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-stone-500 border-stone-200 hover:bg-stone-50'}`}
                >
                  <Layers className="w-3 h-3" /> Pendenza
                </button>
              )}
            </div>
            <div className="h-80">
              {polyline && polyline.length > 1 ? (
                <MapView
                  trackPoints={hike.trackPoints ?? []}
                  showGradient={showGradient}
                  pois={pois}
                  wikiPages={wikiPages}
                  planned
                />
              ) : (
                <div className="h-full flex items-center justify-center text-stone-400 text-sm">
                  <Mountain className="w-8 h-8 text-stone-200 mr-2" /> Tracciato non disponibile
                </div>
              )}
            </div>
            {pois.length > 0 && (
              <p className="px-4 pb-2 text-xs text-stone-400">{pois.length} punti di interesse lungo il tracciato</p>
            )}
          </div>

          {/* Elevation profile */}
          <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-stone-100">
              <p className="text-sm font-semibold text-stone-700">Profilo altimetrico</p>
            </div>
            <div className="p-4">
              {hike.trackPoints && hike.trackPoints.length > 0 ? (
                <ElevationProfileChart trackPoints={hike.trackPoints} />
              ) : (
                <div className="h-48 flex items-center justify-center text-stone-400 text-sm">
                  <BarChart2 className="w-8 h-8 text-stone-200 mr-2" /> Dati non disponibili
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Assessment */}
        {hike.assessment && (
          <div className="bg-white rounded-2xl border border-stone-200 p-5">
            <p className="text-sm font-semibold text-stone-700 mb-4">Valutazione personalizzata</p>
            <AssessmentPanel a={hike.assessment} distKm={distKm} elevGain={hike.elevationGain} />
          </div>
        )}

        {/* Beauty report */}
        {beautyScore && (
          <BeautyReport score={beautyScore} />
        )}

        {/* Wikipedia nearby */}
        {hasGps && (
          <div>
            <h2 className="font-display text-lg font-semibold text-stone-700 mb-3">Luoghi nelle vicinanze</h2>
            <WikiCards lat={centerPt.lat!} lon={centerPt.lon!} onLoaded={setWikiPages} />
          </div>
        )}

        {/* Notes */}
        <div className="bg-white rounded-2xl border border-stone-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-stone-700">Note personali</p>
            {!editNotes && (
              <button onClick={() => setEditNotes(true)} className="text-stone-400 hover:text-stone-600 transition-colors">
                <Pencil className="w-4 h-4" />
              </button>
            )}
          </div>
          {editNotes ? (
            <div className="space-y-2">
              <textarea
                autoFocus
                value={notesVal}
                onChange={e => setNotesVal(e.target.value)}
                rows={4}
                placeholder="Aggiungi note, equipaggiamento, punti di interesse…"
                className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm text-stone-700 bg-stone-50 resize-none outline-none focus:border-sky-400 focus:bg-white"
              />
              <div className="flex gap-2">
                <button onClick={saveNotes} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 text-white text-sm rounded-lg hover:bg-sky-700 transition-colors">
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Salva
                </button>
                <button onClick={() => { setNotesVal(hike.userNotes ?? ''); setEditNotes(false) }} className="px-3 py-1.5 text-sm text-stone-500 hover:text-stone-700 transition-colors">
                  Annulla
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-stone-500 whitespace-pre-wrap">
              {hike.userNotes || <span className="italic text-stone-300">Nessuna nota — clicca la matita per aggiungerne una</span>}
            </p>
          )}
        </div>
      </main>
    </div>
  )
}
