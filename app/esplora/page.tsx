'use client'
import { useState, useRef } from 'react'
import { Compass, Search, MapPin, Route, TrendingUp, Clock, Plus, Loader2, ExternalLink } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface GeoResult {
  lat: string
  lon: string
  display_name: string
}

interface TrailResult {
  id: string
  source: 'osm' | 'hp'
  name: string
  from?: string
  to?: string
  distanceKm: number | null
  elevationGain: number | null
  elevationLoss: number | null
  sacScale?: string
  caiScale?: string
  difficulty?: string
  ref?: string
  description?: string
  network?: string
  url?: string
  lat?: number
  lon?: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseOsmDistance(s?: string): number | null {
  if (!s) return null
  const n = parseFloat(s)
  if (isNaN(n)) return null
  // "12500 m" or ends with 'm' (not 'km') → meters
  if (s.match(/\d\s*m$/) && !s.includes('km')) return n / 1000
  // if value > 500 without unit, assume meters
  return n > 500 ? n / 1000 : n
}

function parseOsmRelation(rel: { id: number; tags: Record<string, string> }): TrailResult {
  const t = rel.tags
  return {
    id: `osm-${rel.id}`,
    source: 'osm',
    name: t.name,
    from: t.from,
    to: t.to,
    distanceKm: parseOsmDistance(t.distance ?? t.length),
    elevationGain: parseInt(t.ascent ?? t['ele:gain'] ?? '') || null,
    elevationLoss: parseInt(t.descent ?? t['ele:loss'] ?? '') || null,
    sacScale: t.sac_scale,
    caiScale: t.cai_scale,
    ref: t.ref,
    description: t.description,
    network: t.network,
  }
}

const HP_DIFFICULTY: Record<string, string> = {
  green: 'T1', greenBlue: 'T1–T2', blue: 'T2', blueBlack: 'T2–T3', black: 'T3', dblack: 'T4+',
}

function parseHpTrail(hp: Record<string, unknown>): TrailResult {
  return {
    id: `hp-${hp.id}`,
    source: 'hp',
    name: hp.name as string,
    distanceKm: Math.round((hp.length as number) * 1.609),
    elevationGain: Math.round((hp.ascent as number) * 0.3048),
    elevationLoss: Math.round((hp.descent as number) * 0.3048),
    difficulty: HP_DIFFICULTY[hp.difficulty as string] ?? String(hp.difficulty),
    description: hp.summary as string,
    url: hp.url as string,
    lat: hp.latitude as number,
    lon: hp.longitude as number,
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function EsploraPage() {
  const [query, setQuery]               = useState('')
  const [geoResults, setGeoResults]     = useState<GeoResult[]>([])
  const [selectedGeo, setSelectedGeo]   = useState<GeoResult | null>(null)
  const [radius, setRadius]             = useState(20)
  const [source, setSource]             = useState<'osm' | 'hp'>('osm')
  const [trails, setTrails]             = useState<TrailResult[]>([])
  const [searched, setSearched]         = useState(false)
  const [loading, setLoading]           = useState(false)
  const [geoLoading, setGeoLoading]     = useState(false)
  const [adding, setAdding]             = useState<string | null>(null)
  const [added, setAdded]               = useState<Set<string>>(new Set())
  const [error, setError]               = useState<string | null>(null)
  const geoTimer                        = useRef<ReturnType<typeof setTimeout> | null>(null)

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
  }

  // ── Search ──
  async function search() {
    if (!selectedGeo) return
    setLoading(true); setError(null); setTrails([]); setSearched(true)
    try {
      const { lat, lon } = selectedGeo
      if (source === 'osm') {
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
      } else {
        const res = await fetch(`/api/hiking-project?lat=${lat}&lon=${lon}&maxDistance=${radius}`)
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Errore Hiking Project')
        setTrails((json.trails ?? []).map(parseHpTrail))
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  // ── Add to programma ──
  async function addToPlanned(t: TrailResult) {
    setAdding(t.id)
    try {
      const notes = [
        t.description,
        t.from && t.to ? `Da ${t.from} a ${t.to}` : null,
        t.ref          ? `Ref: ${t.ref}` : null,
        t.url          ? `Link: ${t.url}` : null,
      ].filter(Boolean).join('\n')

      const tags = [
        t.source === 'osm' ? 'OpenStreetMap' : 'Hiking Project',
        t.sacScale ?? t.difficulty,
        t.caiScale ? `CAI ${t.caiScale}` : null,
        NETWORK_LABEL[t.network ?? ''],
      ].filter((x): x is string => !!x)

      const body = {
        id: t.id,
        title: t.name,
        distanceMeters: (t.distanceKm ?? 0) * 1000,
        elevationGain:  t.elevationGain  ?? 0,
        elevationLoss:  t.elevationLoss  ?? 0,
        altitudeMax: 0,
        altitudeMin: 0,
        estimatedTimeSeconds: naisimithSecs(t.distanceKm, t.elevationGain),
        trackPoints: [],
        routePolyline: (t.lat && t.lon) ? [[t.lat, t.lon]] : [],
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
    } catch {
      alert('Errore nel salvataggio. Riprova.')
    } finally {
      setAdding(null)
    }
  }

  // ── Render ──
  return (
    <div className="min-h-screen bg-stone-50 pb-24 md:pb-8">
      <div className="max-w-4xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2.5 rounded-xl bg-sky-100">
            <Compass className="w-6 h-6 text-sky-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-stone-800">Esplora Trail</h1>
            <p className="text-sm text-stone-500">Cerca percorsi nelle vicinanze e aggiungili al programma</p>
          </div>
        </div>

        {/* Search Panel */}
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 mb-6">

          {/* Location input */}
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
                disabled={!selectedGeo || loading}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-40 text-white text-sm font-medium transition"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Cerca
              </button>
            </div>

            {/* Autocomplete dropdown */}
            {geoResults.length > 0 && (
              <div className="absolute top-full left-0 right-28 mt-1 bg-white rounded-xl border border-stone-200 shadow-lg z-20 overflow-hidden">
                {geoResults.map((g, i) => (
                  <button
                    key={i}
                    onClick={() => selectGeo(g)}
                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-stone-50 border-b border-stone-100 last:border-0 flex items-start gap-2"
                  >
                    <MapPin className="w-3.5 h-3.5 text-stone-400 mt-0.5 shrink-0" />
                    <span className="text-stone-700 line-clamp-1">{g.display_name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Radius + source */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-[200px]">
              <span className="text-sm text-stone-600 shrink-0">Raggio</span>
              <input
                type="range" min={5} max={100} step={5} value={radius}
                onChange={e => setRadius(parseInt(e.target.value))}
                className="flex-1 accent-sky-600"
              />
              <span className="text-sm font-semibold text-sky-700 w-14 text-right">{radius} km</span>
            </div>

            <div className="flex rounded-xl border border-stone-200 overflow-hidden text-sm">
              {(['osm', 'hp'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setSource(s)}
                  className={`px-3 py-1.5 font-medium transition ${
                    source === s ? 'bg-sky-600 text-white' : 'text-stone-600 hover:bg-stone-50'
                  } ${s === 'hp' ? 'border-l border-stone-200' : ''}`}
                >
                  {s === 'osm' ? '🗺 OpenStreetMap' : '🌐 Hiking Project'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
            {error}
            {(error.includes('504') || error.includes('unavailable') || error.includes('non disponibile')) && (
              <span className="block mt-1 text-red-500">Prova a ridurre il raggio di ricerca.</span>
            )}
          </div>
        )}

        {/* Results header */}
        {trails.length > 0 && (
          <p className="text-sm text-stone-500 mb-4">
            <span className="font-semibold text-stone-700">{trails.length}</span> trail trovati vicino a{' '}
            <span className="font-semibold text-stone-700">{query}</span>
          </p>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
          </div>
        )}

        {/* Trail cards */}
        {!loading && trails.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {trails.map(t => {
              const dur = naisimithSecs(t.distanceKm, t.elevationGain)
              const isAdded   = added.has(t.id)
              const isAdding  = adding === t.id

              return (
                <div
                  key={t.id}
                  className="bg-white rounded-2xl border border-stone-200 shadow-sm hover:shadow-md transition-shadow p-4 flex flex-col gap-2"
                >
                  {/* Name + badge */}
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
                      {(t.sacScale || t.difficulty) && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-stone-100 text-stone-600">
                          {t.sacScale ?? t.difficulty}
                        </span>
                      )}
                      {t.ref && (
                        <span className="text-[10px] text-stone-400">{t.ref}</span>
                      )}
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-3 text-xs text-stone-600">
                    {t.distanceKm != null ? (
                      <span className="flex items-center gap-1">
                        <Route className="w-3 h-3 text-stone-400" />
                        {t.distanceKm.toFixed(1)} km
                      </span>
                    ) : (
                      <span className="text-stone-300 text-[11px]">km N/D</span>
                    )}
                    {t.elevationGain != null ? (
                      <span className="flex items-center gap-1">
                        <TrendingUp className="w-3 h-3 text-stone-400" />
                        {t.elevationGain} m
                      </span>
                    ) : (
                      <span className="text-stone-300 text-[11px]">D+ N/D</span>
                    )}
                    {dur > 0 && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-stone-400" />
                        {formatDur(dur)}
                      </span>
                    )}
                  </div>

                  {/* Description */}
                  {t.description && (
                    <p className="text-[11px] text-stone-500 line-clamp-2 leading-relaxed">
                      {t.description}
                    </p>
                  )}

                  {/* Footer */}
                  <div className="flex items-center justify-between mt-auto pt-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        t.source === 'osm' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'
                      }`}>
                        {t.source === 'osm' ? '🗺 OSM' : '🌐 HP'}
                      </span>
                      {t.network && NETWORK_LABEL[t.network] && (
                        <span className="text-[10px] text-stone-400">{NETWORK_LABEL[t.network]}</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      {t.url && (
                        <a
                          href={t.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-stone-600 transition"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                      <button
                        onClick={() => addToPlanned(t)}
                        disabled={isAdded || isAdding}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition disabled:opacity-60 ${
                          isAdded
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-sky-600 hover:bg-sky-700 text-white'
                        }`}
                      >
                        {isAdding
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : isAdded
                            ? '✓ Aggiunto'
                            : <><Plus className="w-3 h-3" /> Programma</>
                        }
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Empty states */}
        {!loading && searched && trails.length === 0 && !error && (
          <div className="text-center py-16 text-stone-400">
            <Compass className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nessun trail trovato. Prova ad aumentare il raggio o cambia area.</p>
          </div>
        )}
        {!loading && !searched && (
          <div className="text-center py-16 text-stone-400">
            <Compass className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Cerca una città o un&apos;area per scoprire i trail nelle vicinanze</p>
          </div>
        )}

      </div>
    </div>
  )
}
