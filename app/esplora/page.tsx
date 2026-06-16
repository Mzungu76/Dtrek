'use client'
import { useState, useRef, useEffect, useMemo } from 'react'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import RouteThumb from '@/components/RouteThumb'
import { getAllPlanned, deletePlanned, type PlannedHikeMeta } from '@/lib/plannedStore'
import { ctsLabel } from '@/lib/trailScore'
import type { SafetyScore } from '@/lib/safetyScore'
import { formatDuration } from '@/lib/tcxParser'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  Compass, Search, MapPin, Route, TrendingUp, Clock,
  Plus, Loader2, X, ArrowUpRight, Mountain, Info,
  Trash2, Upload, AlertTriangle, ShieldAlert, ArrowUpDown, CalendarDays, BookOpen,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface GeoResult {
  lat: string
  lon: string
  display_name: string
}

interface TrailResult {
  id: string
  osmId: number
  name: string
  from?: string
  to?: string
  distanceKm: number | null
  elevationGain: number | null
  elevationLoss: number | null
  altitudeMax: number | null
  altitudeMin: number | null
  sacScale?: string
  caiScale?: string
  ref?: string
  description?: string
  network?: string
}

// ── Scopri helpers ─────────────────────────────────────────────────────────────

function parseOsmDistance(s?: string): number | null {
  if (!s) return null
  const n = parseFloat(s)
  if (isNaN(n)) return null
  if (s.match(/\d\s*m$/) && !s.includes('km')) return n / 1000
  return n > 500 ? n / 1000 : n
}

function parseOsmRelation(rel: { id: number; tags: Record<string, string> }): TrailResult {
  const t = rel.tags
  return {
    id: `osm-${rel.id}`,
    osmId: rel.id,
    name: t.name,
    from: t.from,
    to: t.to,
    distanceKm: parseOsmDistance(t.distance ?? t.length),
    elevationGain: parseInt(t.ascent  ?? t['ele:gain'] ?? '') || null,
    elevationLoss: parseInt(t.descent ?? t['ele:loss'] ?? '') || null,
    altitudeMax:   parseInt(t['ele:max'] ?? t.highest_point ?? t.ele ?? '') || null,
    altitudeMin:   parseInt(t['ele:min'] ?? t.lowest_point  ?? '') || null,
    sacScale: t.sac_scale,
    caiScale: t.cai_scale,
    ref: t.ref,
    description: t.description,
    network: t.network,
  }
}

function naisimithSecs(distKm: number | null, gainM: number | null): number {
  return ((distKm ?? 0) / 4.5 + (gainM ?? 0) / 600) * 3600
}

function formatDur(secs: number): string {
  if (secs <= 0) return ''
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h${String(m).padStart(2, '0')}`
}

const NETWORK_LABEL: Record<string, string> = {
  lwn: 'Locale', rwn: 'Regionale', nwn: 'Nazionale', iwn: 'Internazionale',
}

const SAC_LABEL: Record<string, string> = {
  T1: 'T1 – Escursionismo', T2: 'T2 – Montagna',
  T3: 'T3 – Alpinismo base', T4: 'T4 – Alpinismo',
  T5: 'T5 – Avanzato', T6: 'T6 – Estremo',
}

// ── Le mie helpers ─────────────────────────────────────────────────────────────

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
    score >= 75 ? 'Ben preparato'         :
    score >= 50 ? 'Fattibile con impegno'  :
    score >= 30 ? 'Limite capacità'        : 'Molto sfidante'
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function EsploraPage() {
  const [activeTab, setActiveTab] = useState<'scopri' | 'lemie'>('scopri')

  // ── Scopri state ──
  const [query, setQuery]             = useState('')
  const [geoResults, setGeoResults]   = useState<GeoResult[]>([])
  const [selectedGeo, setSelectedGeo] = useState<GeoResult | null>(null)
  const [radius, setRadius]           = useState(20)
  const [trails, setTrails]           = useState<TrailResult[]>([])
  const [searched, setSearched]       = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const [geoLoading, setGeoLoading]   = useState(false)
  const [adding, setAdding]           = useState<{ id: string; phase: 'geo' | 'save' } | null>(null)
  const [added, setAdded]             = useState<Set<string>>(new Set())
  const [searchError, setSearchError] = useState<string | null>(null)
  const [preview, setPreview]         = useState<TrailResult | null>(null)
  const geoTimer                      = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Le mie state ──
  const [hikes,    setHikes]    = useState<PlannedHikeMeta[]>([])
  const [hikesLoading, setHikesLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [sortBy,   setSortBy]   = useState<'date' | 'km' | 'dplus' | 'suitability' | 'cts'>('date')

  const sortedHikes = useMemo(() => {
    const arr = [...hikes]
    switch (sortBy) {
      case 'km':          return arr.sort((a, b) => b.distanceMeters - a.distanceMeters)
      case 'dplus':       return arr.sort((a, b) => b.elevationGain - a.elevationGain)
      case 'suitability': return arr.sort((a, b) => (b.assessment?.suitabilityScore ?? 0) - (a.assessment?.suitabilityScore ?? 0))
      case 'cts':         return arr.sort((a, b) => ((b as PlannedHikeMeta & { cachedTrailScore?: number }).cachedTrailScore ?? -1) - ((a as PlannedHikeMeta & { cachedTrailScore?: number }).cachedTrailScore ?? -1))
      default:            return arr.sort((a, b) => {
        const da = a.plannedDate ? new Date(a.plannedDate).getTime() : 0
        const db = b.plannedDate ? new Date(b.plannedDate).getTime() : 0
        return db - da
      })
    }
  }, [hikes, sortBy])

  // Next planned hike: nearest upcoming date, or first in list
  const nextHike = useMemo(() => {
    const now = new Date()
    const withDate = hikes
      .filter(h => h.plannedDate)
      .sort((a, b) => new Date(a.plannedDate!).getTime() - new Date(b.plannedDate!).getTime())
      .find(h => new Date(h.plannedDate!) >= now)
    return withDate ?? hikes[0] ?? null
  }, [hikes])

  useEffect(() => {
    getAllPlanned(setHikes).then(setHikes).finally(() => setHikesLoading(false))
  }, [])

  // Auto-switch to "Le mie" once hikes are loaded
  useEffect(() => {
    if (!hikesLoading && hikes.length > 0) setActiveTab('lemie')
  }, [hikesLoading, hikes.length])

  useEffect(() => {
    const refresh = () => { getAllPlanned(setHikes).then(setHikes).catch(() => {}) }
    window.addEventListener('cts-updated', refresh)
    return () => window.removeEventListener('cts-updated', refresh)
  }, [])

  // ── Scopri handlers ──
  function handleQueryChange(v: string) {
    setQuery(v)
    setSelectedGeo(null)
    setGeoResults([])
    if (geoTimer.current) clearTimeout(geoTimer.current)
    if (v.length < 2) return
    geoTimer.current = setTimeout(async () => {
      setGeoLoading(true)
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(v)}`)
        setGeoResults(await res.json())
      } finally {
        setGeoLoading(false)
      }
    }, 400)
  }

  function selectGeo(g: GeoResult) {
    setQuery(g.display_name.split(',').slice(0, 2).join(',').trim())
    setSelectedGeo(g)
    setGeoResults([])
  }

  async function search() {
    if (!selectedGeo) return
    setSearchLoading(true); setSearchError(null); setTrails([]); setSearched(true)
    try {
      const { lat, lon } = selectedGeo
      const res = await fetch(`/api/cerca-trail?lat=${lat}&lon=${lon}&radius=${radius * 1000}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Errore Overpass')
      const seen = new Set<number>()
      const results = (json.elements ?? [])
        .filter((e: { id: number; tags?: Record<string, string> }) => {
          if (!e.tags?.name || seen.has(e.id)) return false
          seen.add(e.id)
          return true
        })
        .map(parseOsmRelation)
      setTrails(results)
    } catch (e) {
      setSearchError((e as Error).message)
    } finally {
      setSearchLoading(false)
    }
  }

  async function addToPlanned(t: TrailResult) {
    setAdding({ id: t.id, phase: 'geo' })
    try {
      let routePolyline: [number, number][] = []
      try {
        const geoRes = await fetch(`/api/trail-geometry?id=${t.osmId}`)
        const geoJson = await geoRes.json()
        routePolyline = geoJson.polyline ?? []
      } catch { }

      setAdding({ id: t.id, phase: 'save' })
      const trackPoints = routePolyline.map(([lat, lon]) => ({ time: '', lat, lon }))
      const notes = [
        t.description,
        t.from && t.to ? `Da ${t.from} a ${t.to}` : null,
        t.ref          ? `Ref: ${t.ref}` : null,
        `OSM: https://www.openstreetmap.org/relation/${t.osmId}`,
      ].filter(Boolean).join('\n')

      const tags = [
        'OpenStreetMap',
        t.sacScale,
        t.caiScale ? `CAI ${t.caiScale}` : null,
        NETWORK_LABEL[t.network ?? ''],
      ].filter((x): x is string => !!x)

      const body = {
        id: t.id,
        title: t.name,
        distanceMeters: (t.distanceKm ?? 0) * 1000,
        elevationGain:  t.elevationGain ?? 0,
        elevationLoss:  t.elevationLoss ?? 0,
        altitudeMax:    t.altitudeMax   ?? 0,
        altitudeMin:    t.altitudeMin   ?? 0,
        estimatedTimeSeconds: naisimithSecs(t.distanceKm, t.elevationGain),
        trackPoints,
        routePolyline,
        userNotes: notes,
        tags,
      }

      const res = await fetch('/api/planned', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error()
      setAdded(prev => new Set(prev).add(t.id))
      setHikes(prev => [...prev]) // trigger re-count
    } catch {
      alert('Errore nel salvataggio. Riprova.')
    } finally {
      setAdding(null)
    }
  }

  // ── Le mie handlers ──
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

  // ── Render ──
  return (
    <div className="min-h-screen bg-stone-50 pb-24 md:pb-8">
      <Navbar />

      {/* Sub-tab switcher */}
      <div className="bg-white border-b border-stone-200 px-4 py-3 sticky top-14 z-30">
        <div className="max-w-4xl mx-auto">
          <div className="flex gap-1 bg-stone-100 rounded-xl p-1">
            <button
              onClick={() => setActiveTab('scopri')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'scopri'
                  ? 'bg-white shadow-sm text-sky-700'
                  : 'text-stone-500 hover:text-stone-700'
              }`}
            >
              <Search className="w-4 h-4" /> Scopri trail
            </button>
            <button
              onClick={() => setActiveTab('lemie')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'lemie'
                  ? 'bg-white shadow-sm text-sky-700'
                  : 'text-stone-500 hover:text-stone-700'
              }`}
            >
              <Mountain className="w-4 h-4" />
              Le mie
              {!hikesLoading && hikes.length > 0 && (
                <span className="ml-1 bg-sky-100 text-sky-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {hikes.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── SCOPRI TAB ── */}
      {activeTab === 'scopri' && (
        <div className="max-w-4xl mx-auto px-4 py-6">

          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 rounded-xl bg-sky-100">
              <Compass className="w-6 h-6 text-sky-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-stone-800">Esplora Trail</h1>
              <p className="text-sm text-stone-500">Cerca percorsi OSM nelle vicinanze e aggiungili al programma</p>
            </div>
          </div>

          <div className="flex items-start gap-2.5 bg-sky-50 border border-sky-200 rounded-xl px-4 py-3 mb-6 text-xs text-sky-700">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>I dati provengono da <strong>OpenStreetMap</strong>. Distanza e dislivello potrebbero essere assenti su percorsi poco documentati — verifica sempre su OSM prima di aggiungere al programma.</span>
          </div>

          {/* Search panel */}
          <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 mb-6">
            <div className="relative mb-4">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                  <input
                    type="text"
                    placeholder="Città, area o regione..."
                    value={query}
                    onChange={e => handleQueryChange(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && selectedGeo) search() }}
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
                  />
                  {geoLoading && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 animate-spin" />
                  )}
                </div>
                <button
                  onClick={search}
                  disabled={!selectedGeo || searchLoading}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-40 text-white text-sm font-medium transition"
                >
                  {searchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  Cerca
                </button>
              </div>

              {geoResults.length > 0 && (
                <div className="absolute top-full left-0 right-28 mt-1 bg-white rounded-xl border border-stone-200 shadow-lg z-20 overflow-hidden">
                  {geoResults.map((g, i) => (
                    <button key={i} onClick={() => selectGeo(g)}
                      className="w-full text-left px-3 py-2.5 text-sm hover:bg-stone-50 border-b border-stone-100 last:border-0 flex items-start gap-2">
                      <MapPin className="w-3.5 h-3.5 text-stone-400 mt-0.5 shrink-0" />
                      <span className="text-stone-700 line-clamp-1">{g.display_name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <span className="text-sm text-stone-600 shrink-0">Raggio</span>
              <input
                type="range" min={5} max={50} step={5} value={radius}
                onChange={e => setRadius(parseInt(e.target.value))}
                className="flex-1 accent-sky-600"
              />
              <span className="text-sm font-semibold text-sky-700 w-14 text-right">{radius} km</span>
            </div>
          </div>

          {searchError && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
              {searchError}
              {(searchError.toLowerCase().includes('504') || searchError.toLowerCase().includes('non disponibile')) && (
                <span className="block mt-1 text-red-500">Prova a ridurre il raggio di ricerca.</span>
              )}
            </div>
          )}

          {trails.length > 0 && (
            <p className="text-sm text-stone-500 mb-4">
              <span className="font-semibold text-stone-700">{trails.length}</span> trail trovati vicino a{' '}
              <span className="font-semibold text-stone-700">{query}</span>
            </p>
          )}

          {searchLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {trails.map(t => {
                const dur     = naisimithSecs(t.distanceKm, t.elevationGain)
                const isAdded = added.has(t.id)
                return (
                  <button
                    key={t.id}
                    onClick={() => setPreview(t)}
                    className="text-left bg-white rounded-2xl border border-stone-200 shadow-sm hover:shadow-md hover:border-sky-200 transition-all p-4 flex flex-col gap-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-stone-800 text-sm leading-tight">{t.name}</h3>
                        {(t.from || t.to) && (
                          <p className="text-[11px] text-stone-400 mt-0.5 truncate">
                            {[t.from, t.to].filter(Boolean).join(' → ')}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {t.sacScale && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-stone-100 text-stone-600">
                            {t.sacScale}
                          </span>
                        )}
                        {t.ref && <span className="text-[10px] text-stone-400">{t.ref}</span>}
                        {isAdded && <span className="text-[10px] text-emerald-600 font-semibold">✓ aggiunto</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-stone-600">
                      {t.distanceKm != null
                        ? <span className="flex items-center gap-1"><Route className="w-3 h-3 text-stone-400" />{t.distanceKm.toFixed(1)} km</span>
                        : <span className="text-stone-300 text-[11px]">km N/D</span>}
                      {t.elevationGain != null
                        ? <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3 text-stone-400" />{t.elevationGain} m</span>
                        : <span className="text-stone-300 text-[11px]">D+ N/D</span>}
                      {dur > 0 && <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-stone-400" />{formatDur(dur)}</span>}
                    </div>
                    {t.description && (
                      <p className="text-[11px] text-stone-500 line-clamp-2 leading-relaxed">{t.description}</p>
                    )}
                    <div className="flex items-center gap-1.5 mt-auto pt-1">
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-emerald-50 text-emerald-700">🗺 OSM</span>
                      {t.network && NETWORK_LABEL[t.network] && (
                        <span className="text-[10px] text-stone-400">{NETWORK_LABEL[t.network]}</span>
                      )}
                      <span className="ml-auto text-[11px] text-sky-600 font-medium">Dettagli →</span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {!searchLoading && searched && trails.length === 0 && !searchError && (
            <div className="text-center py-16 text-stone-400">
              <Compass className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nessun trail trovato. Prova ad aumentare il raggio o cambia area.</p>
            </div>
          )}

          {!searchLoading && !searched && (
            <div className="space-y-3">
              <p className="text-xs text-stone-400 font-medium uppercase tracking-wider px-1">Idee di ricerca</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { label: 'Dolomiti', area: 'Belluno, Veneto' },
                  { label: 'Appennino Toscano', area: 'Firenze, Toscana' },
                  { label: 'Gran Sasso', area: "L'Aquila, Abruzzo" },
                  { label: 'Cinque Terre', area: 'La Spezia, Liguria' },
                  { label: 'Etna', area: 'Catania, Sicilia' },
                  { label: "Valle d'Aosta", area: "Aosta, Valle d'Aosta" },
                ].map(({ label, area }) => (
                  <button
                    key={label}
                    onClick={() => { setQuery(label); handleQueryChange(label) }}
                    className="flex items-center gap-2.5 bg-white rounded-xl border border-stone-200 px-3 py-3 hover:border-sky-300 hover:shadow-sm transition text-left"
                  >
                    <Mountain className="w-4 h-4 text-stone-400 shrink-0" />
                    <div>
                      <div className="text-xs font-semibold text-stone-700">{label}</div>
                      <div className="text-[10px] text-stone-400">{area}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── LE MIE TAB ── */}
      {activeTab === 'lemie' && (
        <div className="max-w-4xl mx-auto px-4 py-5">

          {hikesLoading ? (
            <div className="flex items-center justify-center py-24 text-stone-400 gap-3">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span>Caricamento…</span>
            </div>
          ) : hikes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-20 h-20 rounded-full bg-sky-50 border border-sky-200 flex items-center justify-center mb-6">
                <Mountain className="w-10 h-10 text-sky-400" />
              </div>
              <h3 className="font-display text-2xl font-semibold text-stone-700 mb-2">Nessuna escursione pianificata</h3>
              <p className="text-stone-400 text-sm max-w-sm mb-6">
                Carica un file GPX per pianificare un&#39;escursione e ricevere una valutazione personalizzata, oppure cerca un percorso in &quot;Scopri trail&quot;.
              </p>
              <div className="flex gap-3 flex-wrap justify-center">
                <button
                  onClick={() => setActiveTab('scopri')}
                  className="flex items-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl font-medium transition-colors text-sm"
                >
                  <Search className="w-4 h-4" /> Scopri trail
                </button>
                <Link
                  href="/upload"
                  className="flex items-center gap-2 px-5 py-2.5 border border-stone-200 hover:bg-stone-50 text-stone-600 rounded-xl font-medium transition-colors text-sm"
                >
                  <Upload className="w-4 h-4" /> Carica GPX
                </Link>
              </div>
            </div>
          ) : (
            <>
              {/* ── Hero: prossima uscita ── */}
              {nextHike && (
                <div className="rounded-2xl overflow-hidden mb-6 bg-gradient-to-br from-forest-800 to-forest-900 shadow-lg">
                  {/* Route thumb */}
                  <div className="relative h-44">
                    {nextHike.routePolyline && nextHike.routePolyline.length > 1 && (
                      <div className="absolute inset-0 opacity-30">
                        <RouteThumb polyline={nextHike.routePolyline} color="white" strokeWidth={3} />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-forest-900/90 via-forest-900/30 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 px-5 pb-4">
                      <p className="text-[9px] font-bold uppercase tracking-[2px] text-forest-300 mb-1">
                        {nextHike.plannedDate
                          ? `In programma · ${format(new Date(nextHike.plannedDate), 'd MMMM yyyy', { locale: it })}`
                          : 'La tua prossima uscita'}
                      </p>
                      <h2 className="font-display text-2xl font-bold text-white leading-tight">
                        {nextHike.title}
                      </h2>
                    </div>
                  </div>

                  {/* Stats + CTAs */}
                  <div className="px-5 py-4">
                    <div className="flex items-center gap-4 mb-4">
                      <span className="flex items-center gap-1.5 text-sm text-white/70">
                        <Route className="w-4 h-4 text-white/40" />
                        {(nextHike.distanceMeters / 1000).toFixed(1)} km
                      </span>
                      <span className="flex items-center gap-1.5 text-sm text-white/70">
                        <TrendingUp className="w-4 h-4 text-white/40" />
                        {Math.round(nextHike.elevationGain)} m D+
                      </span>
                      <span className="flex items-center gap-1.5 text-sm text-white/70">
                        <Clock className="w-4 h-4 text-white/40" />
                        {formatDuration(nextHike.estimatedTimeSeconds)}
                      </span>
                    </div>

                    <div className="flex flex-col gap-2">
                      <Link
                        href={`/guida/${encodeURIComponent(nextHike.id)}`}
                        className="flex items-center justify-center gap-2 px-4 py-3 bg-terra-500 hover:bg-terra-600 text-white rounded-xl font-semibold text-sm transition-colors shadow-sm"
                      >
                        <BookOpen className="w-4 h-4" />
                        Apri la Guida →
                      </Link>
                      <Link
                        href={`/programma/${encodeURIComponent(nextHike.id)}`}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white/80 rounded-xl text-sm transition-colors"
                      >
                        Dati tecnici e analisi
                      </Link>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Sort controls ── */}
              {hikes.length > 1 && (
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
                    {nextHike ? 'Altre pianificate' : 'Escursioni pianificate'} ({sortedHikes.filter(h => h.id !== nextHike?.id).length})
                  </span>
                  <div className="flex items-center gap-0.5 bg-stone-100 rounded-xl p-1">
                    <ArrowUpDown className="w-3 h-3 text-stone-400 ml-1" />
                    {([
                      { id: 'date',        label: 'Data' },
                      { id: 'km',          label: 'Km' },
                      { id: 'dplus',       label: 'D+' },
                      { id: 'suitability', label: 'Adatta' },
                      { id: 'cts',         label: 'CTS' },
                    ] as const).map(s => (
                      <button key={s.id} onClick={() => setSortBy(s.id)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all
                          ${sortBy === s.id ? 'bg-white text-sky-700 shadow-sm' : 'text-stone-400 hover:text-stone-600'}`}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Other hikes grid ── */}
              {sortedHikes.filter(h => h.id !== nextHike?.id).length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {sortedHikes.filter(h => h.id !== nextHike?.id).map(hike => {
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
                        {hike.plannedDate && (
                          <div className="flex items-center justify-end px-3 py-1.5 shrink-0 bg-stone-50 border-b border-stone-100">
                            <span className="flex items-center gap-0.5 text-[10px] font-semibold text-stone-500">
                              <CalendarDays className="w-3 h-3" />
                              {format(new Date(hike.plannedDate), 'd MMM', { locale: it })}
                            </span>
                          </div>
                        )}

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

                          {diff && (
                            <span className={`absolute top-2 left-2 text-[10px] font-bold rounded-full px-2 py-0.5 ${DIFFICULTY_COLORS[diff]}`}>
                              {DIFFICULTY_LABEL[diff]}
                            </span>
                          )}

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

                        <div className="p-3 flex flex-col gap-2 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-semibold text-stone-800 truncate leading-tight flex-1">
                              {hike.title}
                            </p>
                            <div className="flex gap-1.5 shrink-0">
                              {(hike as PlannedHikeMeta & { cachedSafetyScore?: SafetyScore }).cachedSafetyScore && (() => {
                                const safety = (hike as PlannedHikeMeta & { cachedSafetyScore?: SafetyScore }).cachedSafetyScore!
                                return (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-lg text-white whitespace-nowrap"
                                    style={{ backgroundColor: safety.color }}>
                                    🛡 {Math.round(safety.overall)}
                                  </span>
                                )
                              })()}
                              {(hike as PlannedHikeMeta & { cachedTrailScore?: number }).cachedTrailScore != null && (() => {
                                const score = (hike as PlannedHikeMeta & { cachedTrailScore?: number }).cachedTrailScore!
                                const conf  = (hike as PlannedHikeMeta & { cachedTrailScoreConfidence?: string }).cachedTrailScoreConfidence
                                const sfx   = conf === 'default' ? '≈' : conf === 'estimated' ? '~' : ''
                                const cts   = ctsLabel(score)
                                return (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-lg text-white whitespace-nowrap"
                                    style={{ backgroundColor: cts.color }}>
                                    CTS {Math.round(score)}{sfx}
                                  </span>
                                )
                              })()}
                            </div>
                          </div>

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

                          {hike.assessment && <SuitabilityBar score={suit} />}

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
            </>
          )}
        </div>
      )}

      {/* ── Preview modal ── */}
      {preview && (() => {
        const t        = preview
        const dur      = naisimithSecs(t.distanceKm, t.elevationGain)
        const isAdded  = added.has(t.id)
        const isAdding = adding?.id === t.id
        const addPhase = adding?.phase
        return (
          <div
            className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setPreview(null)}
          >
            <div
              className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="sticky top-0 bg-white border-b border-stone-100 px-5 py-4 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h2 className="font-bold text-stone-800 text-base leading-tight">{t.name}</h2>
                  {(t.from || t.to) && (
                    <p className="text-xs text-stone-400 mt-0.5">
                      {[t.from, t.to].filter(Boolean).join(' → ')}
                    </p>
                  )}
                </div>
                <button onClick={() => setPreview(null)} className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-400 shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="px-5 py-5 grid grid-cols-3 gap-3 border-b border-stone-100">
                {[
                  { icon: Route,      label: 'Distanza',   value: t.distanceKm   != null ? `${t.distanceKm.toFixed(1)} km` : 'N/D' },
                  { icon: TrendingUp, label: 'Dislivello', value: t.elevationGain != null ? `${t.elevationGain} m` : 'N/D' },
                  { icon: Clock,      label: 'Durata',     value: dur > 0 ? formatDur(dur) : 'N/D' },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} className="text-center">
                    <Icon className="w-4 h-4 text-stone-400 mx-auto mb-1" />
                    <div className="text-sm font-bold text-stone-800">{value}</div>
                    <div className="text-[10px] text-stone-400">{label}</div>
                  </div>
                ))}
              </div>

              <div className="px-5 py-4 space-y-2.5">
                {t.sacScale && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-stone-500 w-24 shrink-0">Difficoltà</span>
                    <span className="text-xs text-stone-700">{SAC_LABEL[t.sacScale] ?? t.sacScale}</span>
                  </div>
                )}
                {t.caiScale && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-stone-500 w-24 shrink-0">Scala CAI</span>
                    <span className="text-xs text-stone-700">{t.caiScale}</span>
                  </div>
                )}
                {t.ref && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-stone-500 w-24 shrink-0">Riferimento</span>
                    <span className="text-xs text-stone-700">{t.ref}</span>
                  </div>
                )}
                {t.network && NETWORK_LABEL[t.network] && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-stone-500 w-24 shrink-0">Rete</span>
                    <span className="text-xs text-stone-700">{NETWORK_LABEL[t.network]}</span>
                  </div>
                )}
                {t.description && (
                  <p className="text-xs text-stone-600 leading-relaxed pt-1">{t.description}</p>
                )}
              </div>

              <div className="px-5 pb-3">
                <a
                  href={`https://www.openstreetmap.org/relation/${t.osmId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl border-2 border-stone-200 hover:border-sky-300 hover:bg-sky-50 text-sm text-stone-700 hover:text-sky-700 font-medium transition"
                >
                  <ArrowUpRight className="w-4 h-4" />
                  Visualizza percorso su OpenStreetMap
                </a>
              </div>

              <div className="px-5 pb-6">
                <button
                  onClick={() => addToPlanned(t)}
                  disabled={isAdded || isAdding}
                  className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition disabled:opacity-60 ${
                    isAdded
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-sky-600 hover:bg-sky-700 text-white'
                  }`}
                >
                  {isAdding
                    ? <><Loader2 className="w-4 h-4 animate-spin" />{addPhase === 'geo' ? 'Caricamento tracciato…' : 'Salvataggio…'}</>
                    : isAdded
                      ? '✓ Aggiunto al programma'
                      : <><Plus className="w-4 h-4" /> Aggiungi al programma</>
                  }
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
