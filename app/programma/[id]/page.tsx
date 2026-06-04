'use client'
import { useEffect, useState, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import Navbar from '@/components/Navbar'
import ElevationProfileChart from '@/components/ElevationProfileChart'
import WeatherWidget from '@/components/WeatherWidget'
import WikiCards from '@/components/WikiCards'
import RouteThumb from '@/components/RouteThumb'
import { ComfortTrailScoreWidget } from '@/components/ComfortTrailScoreWidget'
import {
  getPlannedById, updatePlannedMeta, deletePlanned,
  type PlannedHike, type HikeAssessment,
} from '@/lib/plannedStore'
import { type PoiItem, POI_META } from '@/lib/overpass'
import { fetchHikingPoisFromWikidata } from '@/lib/wikidataPois'
import { fetchWikiForNamedPois, type WikiPage } from '@/lib/wikipedia'
import { computeTrailScore, type TrailScoreResult } from '@/lib/trailScore'
import type { BeautyScore } from '@/lib/beautyScore'
import { formatDuration } from '@/lib/tcxParser'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  ArrowLeft, Mountain, Route, TrendingUp, TrendingDown,
  Clock, CalendarDays, Pencil, Check, X, Trash2, Loader2,
  ShieldAlert, AlertTriangle, Info, BarChart2, Layers, Box, Images, BookOpen,
} from 'lucide-react'
import PdfExportButton from '@/components/PdfExportButton'

const MapView         = dynamic(() => import('@/components/MapView'),         { ssr: false })
const RouteMap3D      = dynamic(() => import('@/components/RouteMap3D'),      { ssr: false })
const StreetViewPanel = dynamic(() => import('@/components/StreetViewPanel'), { ssr: false })

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
  s >= 75 ? 'Ben preparato' : s >= 50 ? 'Fattibile con impegno' :
  s >= 30 ? 'Al limite delle capacità' : 'Molto sfidante'
const SUIT_COLOR = (s: number) =>
  s >= 75 ? 'bg-emerald-500' : s >= 50 ? 'bg-amber-500' : s >= 30 ? 'bg-orange-500' : 'bg-red-500'

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

function AssessmentPanel({ a }: { a: HikeAssessment }) {
  const suit = a.suitabilityScore
  return (
    <div className="space-y-5">
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
            <div className={`h-full rounded-full transition-all ${SUIT_COLOR(suit)}`} style={{ width: `${suit}%` }} />
          </div>
        </div>
      </div>

      {a.userContext.activityCount > 0 && (
        <div className="bg-stone-50 rounded-xl border border-stone-200 p-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-stone-400 mb-0.5">vs. media distanza</p>
            <p className="font-semibold text-stone-800">
              {a.userContext.vsAvgDistPct}%
              <span className="text-xs font-normal text-stone-400 ml-1">(media {a.userContext.avgDistanceKm.toFixed(1)} km)</span>
            </p>
          </div>
          <div>
            <p className="text-xs text-stone-400 mb-0.5">vs. media dislivello</p>
            <p className="font-semibold text-stone-800">
              {a.userContext.vsAvgElevPct}%
              <span className="text-xs font-normal text-stone-400 ml-1">(media {a.userContext.avgElevationM} m D+)</span>
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

      {a.risks.length > 0 && (
        <div>
          <p className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Fattori di rischio</p>
          <div className="space-y-2">
            {a.risks.map((r, i) => <RiskItem key={i} type={r.type} text={r.text} />)}
          </div>
        </div>
      )}

      {a.suggestions.length > 0 && (
        <div>
          <p className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Consigli pratici</p>
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
  const id = decodeURIComponent(params.id as string)

  const [hike,           setHike]          = useState<PlannedHike | null>(null)
  const [loading,        setLoading]       = useState(true)
  const [saving,         setSaving]        = useState(false)
  const [editTitle,      setEditTitle]     = useState(false)
  const [editNotes,      setEditNotes]     = useState(false)
  const [editDate,       setEditDate]      = useState(false)
  const [titleVal,       setTitleVal]      = useState('')
  const [notesVal,       setNotesVal]      = useState('')
  const [dateVal,        setDateVal]       = useState('')
  const [showGradient,   setShowGradient]  = useState(false)
  const [show3D,         setShow3D]        = useState(false)
  const [showStreetView, setShowStreetView] = useState(false)
  const [pois,           setPois]          = useState<PoiItem[]>([])
  const [wikiPages,      setWikiPages]     = useState<WikiPage[]>([])
  const [poiWikiEntries, setPoiWikiEntries] = useState<{ poi: PoiItem; wiki: WikiPage }[]>([])
  const [poisFullyLoaded, setPoisFullyLoaded] = useState(false)
  const [ctsResult,      setCtsResult]     = useState<TrailScoreResult | null>(null)
  const [prefsLoaded,    setPrefsLoaded]   = useState(false)
  const [pesoNatura,     setPesoNatura]    = useState(50)
  const [prefSforzo,     setPrefSforzo]    = useState(50)
  const [prefDurata,     setPrefDurata]    = useState(270)

  // Must be before early returns
  const heroPolyline = useMemo((): [number, number][] => {
    const pts = (hike?.trackPoints ?? []).filter(p => p.lat && p.lon)
    if (!pts.length) return []
    const step = Math.max(1, Math.ceil(pts.length / 100))
    return pts.filter((_, i) => i % step === 0).map(p => [p.lat!, p.lon!])
  }, [hike])


  useEffect(() => {
    getPlannedById(id).then(h => {
      if (!h) { router.push('/programma'); return }
      setHike(h)
      setTitleVal(h.title)
      setNotesVal(h.userNotes ?? '')
      setDateVal(h.plannedDate ?? '')
      const gps = (h.trackPoints ?? []).filter(p => p.lat && p.lon).map(p => [p.lat!, p.lon!] as [number, number])
      if (gps.length > 0) {
        if (h.cachedPois?.length) {
          // Use cached POIs
          setPois(h.cachedPois as PoiItem[])
          if (h.cachedPoiWiki?.length) setPoiWikiEntries(h.cachedPoiWiki as { poi: PoiItem; wiki: WikiPage }[])
          setPoisFullyLoaded(true)
        } else {
          // Fresh fetch
          fetchHikingPoisFromWikidata(gps, 300)
            .then(newPois => {
              setPois(newPois)
              fetchWikiForNamedPois(newPois)
                .then(entries => { setPoiWikiEntries(entries); setPoisFullyLoaded(true) })
                .catch(() => { setPoisFullyLoaded(true) })
            })
            .catch(() => { setPoisFullyLoaded(true) })
        }
      }
    }).finally(() => setLoading(false))
  }, [id, router])

  // Save POI data to DB after first successful fetch
  useEffect(() => {
    if (!poisFullyLoaded || !hike || (hike.cachedPois?.length ?? 0) > 0 || !pois.length) return
    updatePlannedMeta(hike.id, { cachedPois: pois, cachedPoiWiki: poiWikiEntries }).catch(() => {})
    setHike(prev => prev ? { ...prev, cachedPois: pois, cachedPoiWiki: poiWikiEntries } : prev)
  }, [poisFullyLoaded]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load user prefs for CTS display
  useEffect(() => {
    fetch('/api/user-settings')
      .then(r => r.json())
      .then(d => {
        if (d.beautyNaturaWeight != null) setPesoNatura(d.beautyNaturaWeight)
        if (d.prefSforzo        != null) setPrefSforzo(d.prefSforzo)
        if (d.prefDurata        != null) setPrefDurata(d.prefDurata)
      })
      .catch(() => {})
      .finally(() => setPrefsLoaded(true))
  }, [])

  // Compute CTS for breakdown display — NEVER saves
  useEffect(() => {
    const bs = (hike as { cachedBeautyScore?: BeautyScore } | null)?.cachedBeautyScore
    if (!bs?.categories?.length || !prefsLoaded) return
    const computed = computeTrailScore(bs, {
      distanceMeters: hike!.distanceMeters,
      elevationGain:  hike!.elevationGain,
      elevationLoss:  hike!.elevationLoss,
      altitudeMax:    hike!.altitudeMax,
      prefSforzo,
      prefDurata,
    }, pesoNatura)
    setCtsResult({ ...computed, ts: (hike as { cachedTrailScore?: number }).cachedTrailScore ?? computed.ts })
  }, [hike?.id, prefsLoaded, pesoNatura, prefSforzo, prefDurata]) // eslint-disable-line react-hooks/exhaustive-deps


  if (loading) return (
    <div className="min-h-screen bg-stone-50">
      <Navbar />
      <div className="flex items-center justify-center py-32 text-stone-400 gap-3">
        <Loader2 className="w-6 h-6 animate-spin" /><span>Caricamento…</span>
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
  const gpsPoints = hike.trackPoints?.filter(p => p.lat && p.lon) ?? []
  const centerPt  = gpsPoints[Math.floor(gpsPoints.length / 2)]
  const hasGps    = gpsPoints.length > 0
  const polyline  = hike.trackPoints?.filter(p => p.lat && p.lon).map(p => [p.lat!, p.lon!] as [number, number])

  return (
    <div className="min-h-screen bg-stone-50 pb-20 md:pb-0">
      <Navbar />

      {/* ══ HERO ══ */}
      <div className="relative bg-gradient-to-br from-sky-900 via-sky-800 to-sky-700 text-white overflow-hidden">
        {heroPolyline.length > 1 && (
          <div className="absolute inset-0 pointer-events-none">
            <RouteThumb polyline={heroPolyline} color="rgba(255,255,255,0.10)" strokeWidth={7} />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-sky-900/60 to-transparent pointer-events-none" />

        <div className="relative max-w-[1200px] mx-auto px-4">
          {/* Top nav */}
          <div className="flex items-center justify-between pt-4 pb-3 border-b border-white/10">
            <button onClick={() => router.push('/programma')}
              className="flex items-center gap-1.5 text-sky-300 hover:text-white text-sm transition-colors">
              <ArrowLeft className="w-4 h-4" /> Tutte le pianificate
            </button>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => router.push(`/guida/${encodeURIComponent(id)}`)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-amber-900 rounded-lg text-xs font-semibold transition-colors"
                title="Guida escursionistica"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Guida</span>
              </button>
              <PdfExportButton
                variant="planned"
                data={hike}
                iconOnly
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              />
              <button onClick={handleDelete} disabled={saving}
                className="flex items-center gap-1.5 text-sm text-red-300 hover:text-white transition-colors">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                <span className="hidden sm:inline">Elimina</span>
              </button>
            </div>
          </div>

          {/* Hero body */}
          <div className="py-7 flex items-end justify-between gap-6 flex-wrap">
            {/* Left */}
            <div className="flex-1 min-w-0">
              {editTitle ? (
                <div className="flex items-center gap-2 mb-2">
                  <input
                    autoFocus
                    value={titleVal}
                    onChange={e => setTitleVal(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditTitle(false) }}
                    className="flex-1 font-display text-2xl sm:text-3xl bg-white/10 rounded-lg px-3 py-1 text-white outline-none border border-white/30 max-w-md"
                  />
                  <button onClick={saveTitle}><Check className="w-5 h-5 text-sky-300 hover:text-white" /></button>
                  <button onClick={() => { setTitleVal(hike.title); setEditTitle(false) }}><X className="w-5 h-5 text-white/50 hover:text-white" /></button>
                </div>
              ) : (
                <button onClick={() => setEditTitle(true)} className="group flex items-center gap-2.5 text-left mb-2">
                  <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold leading-tight">{hike.title}</h1>
                  <Pencil className="w-4 h-4 text-white/40 group-hover:text-white/70 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              )}

              {/* Planned date */}
              <div className="flex items-center gap-2 mb-4 text-sm">
                <CalendarDays className="w-4 h-4 text-sky-300 shrink-0" />
                {editDate ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={dateVal}
                      onChange={e => setDateVal(e.target.value)}
                      className="bg-white/10 border border-white/30 rounded-lg px-2 py-1 text-sm text-white outline-none focus:border-white/50"
                    />
                    <button onClick={saveDate}><Check className="w-4 h-4 text-sky-300 hover:text-white" /></button>
                    <button onClick={() => { setDateVal(hike.plannedDate ?? ''); setEditDate(false) }}><X className="w-4 h-4 text-white/50 hover:text-white" /></button>
                  </div>
                ) : (
                  <button onClick={() => setEditDate(true)} className="text-sky-200 hover:text-white transition-colors">
                    {hike.plannedDate
                      ? <span className="capitalize">{format(new Date(hike.plannedDate), 'EEEE d MMMM yyyy', { locale: it })}</span>
                      : <span className="italic text-sky-400">+ Aggiungi data pianificata</span>
                    }
                  </button>
                )}
              </div>

              {/* Stat pills */}
              <div className="flex flex-wrap gap-2">
                {[
                  { icon: <Route className="w-3.5 h-3.5" />, v: `${distKm.toFixed(1)} km` },
                  { icon: <TrendingUp className="w-3.5 h-3.5" />, v: `${Math.round(hike.elevationGain)} m D+` },
                  { icon: <Mountain className="w-3.5 h-3.5" />, v: `${Math.round(hike.altitudeMax)} m s.l.m.` },
                  { icon: <Clock className="w-3.5 h-3.5" />, v: `${formatDuration(hike.estimatedTimeSeconds)} stim.` },
                ].map(({ icon, v }) => (
                  <span key={v} className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-white/10 border border-white/15">
                    {icon} {v}
                  </span>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>

      <main className="max-w-[1200px] mx-auto px-3 sm:px-4 py-6 sm:py-8 fade-up space-y-6 sm:space-y-8">

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { icon: <Route className="w-5 h-5 text-sky-500" />, label: 'Distanza', value: `${distKm.toFixed(2)} km` },
            { icon: <TrendingUp className="w-5 h-5 text-sky-500" />, label: 'Dislivello +', value: `${Math.round(hike.elevationGain)} m` },
            { icon: <TrendingDown className="w-5 h-5 text-sky-500" />, label: 'Dislivello −', value: `${Math.round(hike.elevationLoss)} m` },
            { icon: <Mountain className="w-5 h-5 text-sky-500" />, label: 'Quota max', value: `${Math.round(hike.altitudeMax)} m`, sub: `Min: ${Math.round(hike.altitudeMin)} m` },
            { icon: <Clock className="w-5 h-5 text-sky-500" />, label: 'Tempo stimato', value: formatDuration(hike.estimatedTimeSeconds), sub: 'Naismith' },
          ].map(({ icon, label, value, sub }) => (
            <div key={label} className="bg-white rounded-2xl border border-stone-200 p-4 flex items-start gap-3 shadow-sm">
              <div className="w-9 h-9 rounded-lg bg-sky-50 flex items-center justify-center shrink-0">{icon}</div>
              <div>
                <p className="text-xs text-stone-400 font-medium">{label}</p>
                <p className="text-base font-bold text-stone-800 leading-tight">{value}</p>
                {sub && <p className="text-xs text-stone-400">{sub}</p>}
              </div>
            </div>
          ))}
        </div>

        {/* Weather forecast — planned mode when a date is set */}
        {hasGps && (
          <WeatherWidget
            mode={hike.plannedDate ? 'planned' : 'forecast'}
            lat={centerPt.lat!}
            lon={centerPt.lon!}
            date={hike.plannedDate}
            altitudeMax={hike.altitudeMax}
            elevationGain={hike.elevationGain}
            days={7}
          />
        )}

        {/* Map + Elevation */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
              <p className="text-sm font-semibold text-stone-700">Tracciato</p>
              <div className="flex items-center gap-1.5">
                {hasGps && hike.trackPoints?.some(p => p.altitudeMeters !== undefined) && (
                  <button
                    onClick={() => setShowGradient(g => !g)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border transition-colors ${showGradient ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-stone-500 border-stone-200 hover:bg-stone-50'}`}
                  >
                    <Layers className="w-3 h-3" /> Pendenza
                  </button>
                )}
                {hasGps && (
                  <button
                    onClick={() => setShowStreetView(true)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border bg-white text-stone-500 border-stone-200 hover:bg-stone-50 transition-colors"
                  >
                    <Images className="w-3 h-3" /> Foto zona
                  </button>
                )}
                {hasGps && (
                  <button
                    onClick={() => setShow3D(true)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border bg-white text-stone-500 border-stone-200 hover:bg-stone-50 transition-colors"
                  >
                    <Box className="w-3 h-3" /> Vista 3D
                  </button>
                )}
              </div>
            </div>
            <div className="h-80">
              {polyline && polyline.length > 1 ? (
                <MapView trackPoints={hike.trackPoints ?? []} showGradient={showGradient} pois={pois} wikiPages={wikiPages} planned />
              ) : (
                <div className="h-full flex items-center justify-center text-stone-400 text-sm gap-2">
                  <Mountain className="w-8 h-8 text-stone-200" /> Tracciato non disponibile
                </div>
              )}
            </div>
            {pois.length > 0 && <p className="px-4 pb-3 text-xs text-stone-400">{pois.length} punti di interesse lungo il tracciato</p>}
          </div>

          <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-stone-100">
              <p className="text-sm font-semibold text-stone-700">Profilo altimetrico</p>
            </div>
            <div className="p-4">
              {hike.trackPoints && hike.trackPoints.length > 0 ? (
                <ElevationProfileChart trackPoints={hike.trackPoints} />
              ) : (
                <div className="h-48 flex items-center justify-center text-stone-400 text-sm gap-2">
                  <BarChart2 className="w-8 h-8 text-stone-200" /> Dati non disponibili
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Assessment */}
        {hike.assessment && (
          <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm">
            <h2 className="font-display text-xl font-semibold text-stone-700 mb-5">Valutazione personalizzata</h2>
            <AssessmentPanel a={hike.assessment} />
          </div>
        )}

        {/* Comfort TrailScore */}
        {(ctsResult || (hike as { cachedTrailScore?: number }).cachedTrailScore != null) && (
          <div className="space-y-2">
            <h2 className="font-display text-xl font-semibold text-stone-700">Comfort TrailScore</h2>
            <ComfortTrailScoreWidget
              result={ctsResult}
              cached={(hike as { cachedTrailScore?: number }).cachedTrailScore}
            />
          </div>
        )}

        {/* POI-focused Wikipedia: articles for named elements physically on the route */}
        {poiWikiEntries.length > 0 && (
          <section>
            <h2 className="font-display text-xl font-semibold text-stone-700 mb-4">Sul percorso</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {poiWikiEntries.map(({ poi, wiki }) => {
                const meta = POI_META[poi.type]
                return (
                  <div key={poi.id} className="bg-white rounded-2xl border border-stone-200 p-4 flex gap-3 shadow-sm hover:border-sky-200 transition-colors">
                    {wiki.thumbnail && (
                      <img
                        src={wiki.thumbnail}
                        alt={wiki.title}
                        className="w-16 h-16 object-cover rounded-xl shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-base leading-none">{meta.emoji}</span>
                        <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide">{meta.label}</span>
                        {poi.ele && <span className="text-[10px] text-stone-300 ml-auto shrink-0">{Math.round(poi.ele)} m</span>}
                      </div>
                      <p className="text-sm font-semibold text-stone-800 leading-tight mb-1">{wiki.title}</p>
                      <p className="text-xs text-stone-500 leading-relaxed line-clamp-3">{wiki.extract.slice(0, 160)}{wiki.extract.length > 160 ? '…' : ''}</p>
                      <a
                        href={wiki.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-sky-600 font-semibold mt-1.5 inline-block hover:text-sky-700"
                      >
                        {wiki.source === 'wikivoyage-it' ? 'Leggi su Wikivoyage →' : wiki.source === 'wikipedia-en' ? 'Leggi su Wikipedia (EN) →' : 'Leggi su Wikipedia →'}
                      </a>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* Wikipedia geo-search: regional context, places near the route area */}
        {hasGps && (
          <section>
            <h2 className="font-display text-xl font-semibold text-stone-700 mb-4">Luoghi nelle vicinanze</h2>
            <WikiCards lat={centerPt.lat!} lon={centerPt.lon!} onLoaded={setWikiPages} />
          </section>
        )}

        {/* Notes */}
        <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-xl font-semibold text-stone-700">Note personali</h2>
            {!editNotes && (
              <button onClick={() => setEditNotes(true)} className="flex items-center gap-1.5 text-sm text-stone-400 hover:text-stone-700 transition-colors">
                <Pencil className="w-4 h-4" /> Modifica
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
                className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm text-stone-700 bg-stone-50 resize-none outline-none focus:border-sky-400 focus:bg-white"
              />
              <div className="flex gap-2">
                <button onClick={saveNotes} disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 text-white text-sm rounded-lg hover:bg-sky-700 transition-colors">
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Salva
                </button>
                <button onClick={() => { setNotesVal(hike.userNotes ?? ''); setEditNotes(false) }}
                  className="px-3 py-1.5 text-sm text-stone-500 hover:text-stone-700 transition-colors">
                  Annulla
                </button>
              </div>
            </div>
          ) : (
            <p className={`text-sm leading-relaxed ${hike.userNotes ? 'text-stone-600 whitespace-pre-wrap' : 'text-stone-400 italic'}`}>
              {hike.userNotes || 'Nessuna nota — clicca Modifica per aggiungerne una.'}
            </p>
          )}
        </div>
      </main>

      {show3D && hike.trackPoints && (
        <RouteMap3D
          trackPoints={hike.trackPoints}
          title={hike.title}
          plannedDate={hike.plannedDate}
          onClose={() => setShow3D(false)}
        />
      )}

      {showStreetView && centerPt?.lat && centerPt?.lon && (
        <StreetViewPanel
          lat={centerPt.lat}
          lon={centerPt.lon}
          title={hike.title}
          onClose={() => setShowStreetView(false)}
        />
      )}
    </div>
  )
}
