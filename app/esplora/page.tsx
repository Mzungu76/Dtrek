'use client'
import { useState, useRef } from 'react'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import ExploreMap, { type TrailResult } from '@/components/ExploreMap'
import { savePlanned, type PlannedHike } from '@/lib/plannedStore'
import {
  Compass, MapPin, Route, TrendingUp, Clock,
  Plus, Loader2, X, ChevronLeft, Info,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface GeoResult {
  lat: string
  lon: string
  display_name: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function EsploraPage() {
  const [query, setQuery]             = useState('')
  const [geoResults, setGeoResults]   = useState<GeoResult[]>([])
  const [selectedGeo, setSelectedGeo] = useState<GeoResult | null>(null)
  const [mapCenter, setMapCenter]     = useState<{ lat: number; lon: number } | null>(null)
  const [geoLoading, setGeoLoading]   = useState(false)
  const [adding, setAdding]           = useState<string | null>(null)
  const [added, setAdded]             = useState<Set<string>>(new Set())
  const [preview, setPreview]         = useState<TrailResult | null>(null)
  const geoTimer                      = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Geocoding ──
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
    setMapCenter({ lat: parseFloat(g.lat), lon: parseFloat(g.lon) })
  }

  // ── Add to programma ──
  async function addToPlanned(t: TrailResult) {
    setAdding(t.id)
    try {
      const routePolyline = t.geometryPolyline ?? []
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

      const hike: PlannedHike = {
        id: t.id,
        title: t.name,
        createdAt: new Date().toISOString(),
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

      await savePlanned(hike)
      setAdded(prev => new Set(prev).add(t.id))
    } catch {
      alert('Errore nel salvataggio. Riprova.')
    } finally {
      setAdding(null)
    }
  }

  // ── Render ──
  return (
    <div className="min-h-screen bg-stone-50 pb-24 md:pb-8">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 py-6">

        {/* Back + header */}
        <div className="mb-6">
          <Link href="/" className="inline-flex items-center gap-1 text-sm text-stone-400 hover:text-stone-600 transition mb-4">
            <ChevronLeft className="w-4 h-4" /> Calendario
          </Link>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-sky-100">
              <Compass className="w-6 h-6 text-sky-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-stone-800">Esplora Trail</h1>
              <p className="text-sm text-stone-500">Esplora la mappa dei sentieri e aggiungili al programma</p>
            </div>
          </div>
        </div>

        {/* Info banner */}
        <div className="flex items-start gap-2.5 bg-sky-50 border border-sky-200 rounded-xl px-4 py-3 mb-6 text-xs text-sky-700">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <span>I sentieri mostrati arrivano da <strong>Waymarked Trails</strong>, la rete escursionistica di OpenStreetMap. Clicca su una linea colorata per vederne i dettagli — distanza e dislivello potrebbero essere assenti su tratti poco documentati.</span>
        </div>

        {/* Location search — centers the map */}
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 mb-6">
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input
              type="text"
              placeholder="Vai a una città, area o regione..."
              value={query}
              onChange={e => handleQueryChange(e.target.value)}
              className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
            />
            {geoLoading && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 animate-spin" />
            )}

            {geoResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-stone-200 shadow-lg z-20 overflow-hidden">
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
        </div>

        {/* Map + results below it */}
        <ExploreMap center={mapCenter} onTrailSelected={setPreview} height="500px" />
      </div>

      {/* ── Preview modal ── */}
      {preview && (() => {
        const t   = preview
        const dur = t.estimatedTimeMin != null ? t.estimatedTimeMin * 60 : naisimithSecs(t.distanceKm, t.elevationGain)
        const isAdded     = added.has(t.id)
        const isAdding    = adding === t.id
        const isEstimated = t.dataQuality === 'estimated'
        return (
          <div
            className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setPreview(null)}
          >
            <div
              className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="sticky top-0 bg-white border-b border-stone-100 px-5 py-4 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-bold text-stone-800 text-base leading-tight">{t.name}</h2>
                    {isEstimated && (
                      <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded shrink-0">
                        dati stimati
                      </span>
                    )}
                  </div>
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

              {/* Stats */}
              <div className="px-5 py-5 grid grid-cols-3 gap-3 border-b border-stone-100">
                {/* Distanza — sempre risolta in fase 1, mai "in calcolo" */}
                <div className="text-center">
                  <Route className="w-4 h-4 text-stone-400 mx-auto mb-1" />
                  <div className="text-sm font-bold text-stone-800">
                    {t.distanceKm != null
                      ? isEstimated
                        ? <span title="Stima basata sulla geometria del percorso">~ {t.distanceKm.toFixed(1)} km</span>
                        : `${t.distanceKm.toFixed(1)} km`
                      : 'N/D'}
                  </div>
                  <div className="text-[10px] text-stone-400">Distanza</div>
                </div>

                {/* Dislivello — può restare "in calcolo" finché OpenTopoData non risponde */}
                <div className="text-center">
                  <TrendingUp className="w-4 h-4 text-stone-400 mx-auto mb-1" />
                  <div className="text-sm font-bold text-stone-800">
                    {t.statsPending ? (
                      <span className="flex items-center justify-center gap-1 text-xs font-normal text-gray-400">
                        <Loader2 className="w-3 h-3 animate-spin" /> calcolo…
                      </span>
                    ) : t.elevationGain != null ? (
                      isEstimated
                        ? <span title="Stima basata sulla geometria del percorso">~ {t.elevationGain} m</span>
                        : `${t.elevationGain} m`
                    ) : 'N/D'}
                  </div>
                  <div className="text-[10px] text-stone-400">Dislivello</div>
                </div>

                {/* Durata — dipende dal dislivello, stessa logica di attesa */}
                <div className="text-center">
                  <Clock className="w-4 h-4 text-stone-400 mx-auto mb-1" />
                  <div className="text-sm font-bold text-stone-800">
                    {t.statsPending ? (
                      <span className="flex items-center justify-center gap-1 text-xs font-normal text-gray-400">
                        <Loader2 className="w-3 h-3 animate-spin" /> calcolo…
                      </span>
                    ) : dur > 0 ? formatDur(dur) : 'N/D'}
                  </div>
                  <div className="text-[10px] text-stone-400">Durata</div>
                </div>
              </div>

              {/* Details */}
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

              {/* Add to programma */}
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
                    ? <><Loader2 className="w-4 h-4 animate-spin" />Salvataggio…</>
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
