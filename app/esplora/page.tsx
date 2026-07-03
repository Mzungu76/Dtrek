'use client'
import { useState, useRef } from 'react'
import Navbar from '@/components/Navbar'
import BackLink from '@/app/components/BackLink'
import ExploreMap, { type TrailResult, type MapViewport } from '@/components/ExploreMap'
import ExploreLayout from '@/components/ExploreLayout'
import ExploreResultsPanel from '@/components/ExploreResultsPanel'
import TrailMiniMap from '@/components/TrailMiniMap'
import { CLBadge } from '@/components/CLBadge'
import { CurrentConditionsNotice } from '@/components/CurrentConditionsNotice'
import { PhenologyPanel } from '@/components/PhenologyPanel'
import { ShadeWaterTile } from '@/components/ShadeWaterTile'
import { useCL, useSentinel2 } from '@/lib/cl/useCL'
import { useFlora } from '@/lib/useFlora'
import { savePlanned, type PlannedHike } from '@/lib/plannedStore'
import { computeCtsForHike } from '@/lib/computeCtsForHike'
import { interpolateElevations, formatDurationSecs } from '@/lib/trailStats'
import { ROUTE_TYPE_LABEL, ROUTE_TYPE_ICON } from '@/lib/routeTypeLabels'
import { sacCodesForTiers } from '@/lib/difficultyTiers'
import { NETWORK_LABEL } from '@/lib/networkLabels'
import { fetchTrailDetail, finishTrailStats } from '@/lib/fetchTrailDetail'
import { runWithConcurrency } from '@/lib/promisePool'
import { matchesFilters, type SearchFilters } from '@/lib/trailFilters'
import type { TrailSearchResult, TrailSearchCandidate, SearchResponseBody } from '@/lib/trailSearch'
import {
  Compass, MapPin, Route, TrendingUp, Clock,
  Plus, Loader2, X, Info, SlidersHorizontal,
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
  const si                            = useCL({ osmId: preview?.osmId })
  const s2                            = useSentinel2({ osmId: preview?.osmId })
  const flora                         = useFlora(preview?.geometryPolyline, preview?.altitudeMax ?? undefined)

  // ── "Cerca in quest'area" state ──
  const [viewport, setViewport]                 = useState<MapViewport | null>(null)
  const [filters, setFilters]                   = useState<SearchFilters>({})
  const [searchResults, setSearchResults]       = useState<TrailSearchResult[]>([])
  const [pendingCandidates, setPendingCandidates] = useState<TrailSearchCandidate[]>([])
  const [searchLoading, setSearchLoading]       = useState(false)
  const [searchError, setSearchError]           = useState<string | null>(null)
  const [truncated, setTruncated]               = useState(false)
  const [hasSearched, setHasSearched]           = useState(false)
  // True whenever the viewport or filters changed since the last search — drives
  // the button's "you should press this again" highlight (Google Maps-style).
  const [searchDirty, setSearchDirty]           = useState(true)
  const [panelSelectingId, setPanelSelectingId] = useState<number | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  // Bumped on every search start — tells ExploreLayout's mobile sheet to
  // auto-expand from collapsed to half so progress is visible.
  const [searchTrigger, setSearchTrigger]       = useState(0)
  // Fetched lazily on first "Usa le mie preferenze" click, cached for the rest
  // of the session so re-clicking doesn't re-hit the API.
  const preferencesCache = useRef<{ prefSforzo: number; prefDurata: number } | null>(null)
  // Lets a superseded enrichment pass (from a previous search) recognize it's
  // stale and stop touching state once a newer search has started.
  const enrichTokenRef                          = useRef<symbol | null>(null)

  function handleViewportChanged(v: MapViewport) {
    setViewport(v)
    setSearchDirty(true)
  }

  function handleFiltersChange(f: SearchFilters) {
    setFilters(f)
    setSearchDirty(true)
  }

  // Precompiles the manual filters from the user's saved effort/duration
  // preferences (user_settings.pref_sforzo/pref_durata) — a starting point,
  // not a lock: the controls stay fully editable afterwards. Effort sets a
  // difficulty tier + an elevation-gain ceiling (not a floor, a short easy
  // walk still matches a low-effort preference); duration becomes a ±90min
  // tolerance band around the stored value so it doesn't over-constrain results.
  async function handleUsePreferences() {
    try {
      let prefs = preferencesCache.current
      if (!prefs) {
        const res = await fetch('/api/user-settings')
        if (!res.ok) {
          setSearchError(res.status === 401
            ? 'Accedi per usare le tue preferenze salvate.'
            : 'Errore nel caricamento delle preferenze.')
          return
        }
        const json = await res.json()
        prefs = { prefSforzo: json.prefSforzo ?? 50, prefDurata: json.prefDurata ?? 270 }
        preferencesCache.current = prefs
      }

      const { prefSforzo, prefDurata } = prefs
      const difficulty = prefSforzo <= 33
        ? sacCodesForTiers(['facile'])
        : prefSforzo <= 66
          ? sacCodesForTiers(['facile', 'moderato'])
          : sacCodesForTiers(['moderato', 'impegnativo'])
      const elevationGainMax = prefSforzo <= 33 ? 400 : prefSforzo <= 66 ? 900 : undefined

      setFilters(f => ({
        ...f,
        difficulty,
        elevationGainMax,
        durationMinMin: Math.max(30, prefDurata - 90),
        durationMinMax: prefDurata + 90,
      }))
      setSearchDirty(true)
    } catch {
      setSearchError('Errore nel caricamento delle preferenze.')
    }
  }

  async function handleSearchThisArea() {
    if (!viewport) return
    setSearchLoading(true)
    setSearchError(null)
    setSearchTrigger(n => n + 1)
    const token = Symbol('search')
    enrichTokenRef.current = token
    try {
      const res = await fetch('/api/waymarked-trails/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bbox: viewport.bbox, filters }),
      })
      const json: SearchResponseBody & { error?: string } = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Errore ricerca')
      setSearchResults(json.results)
      setPendingCandidates(json.pendingCandidates)
      setTruncated(json.truncated)
      setHasSearched(true)
      setSearchDirty(false)
      enrichPendingCandidates(json.pendingCandidates, token)
    } catch {
      setSearchError("Errore nella ricerca dei sentieri in quest'area.")
    } finally {
      setSearchLoading(false)
    }
  }

  // Progressively fetches full details for cache-miss candidates (limited
  // concurrency so a 40+ result area search doesn't fire 40 parallel requests),
  // then filters and promotes each into the rendered results list as it resolves
  // — the initial response never blocks on this. Note: a candidate whose
  // elevation is still statsPending at this point (rare — only true cache misses
  // without full OSM tags) is evaluated with elevationGain still null, so an
  // active elevation/duration filter can drop it even though the real value
  // might have matched; re-running the phase-2 stats call for every pending
  // candidate here would reintroduce the "N slow external calls" problem this
  // design avoids, so this is an accepted trade-off.
  async function enrichPendingCandidates(candidates: TrailSearchCandidate[], token: symbol) {
    await runWithConcurrency(candidates, 5, c => fetchTrailDetail(c.id), (c, detail) => {
      if (enrichTokenRef.current !== token) return
      const { trail } = detail
      const result: TrailSearchResult = {
        id: c.id,
        name: trail.name,
        ref: trail.ref ?? c.ref,
        network: trail.network ?? c.network,
        distanceKm: trail.distanceKm,
        elevationGain: trail.elevationGain,
        elevationLoss: trail.elevationLoss,
        estimatedTimeMin: trail.estimatedTimeMin ?? null,
        sacScale: trail.sacScale,
        caiScale: trail.caiScale,
        routeType: trail.routeType,
        dataQuality: trail.dataQuality,
        description: trail.description,
        from: trail.from,
        to: trail.to,
      }
      setPendingCandidates(prev => prev.filter(p => p.id !== c.id))
      if (matchesFilters(result, filters)) {
        setSearchResults(prev => [...prev, result])
      }
    })
  }

  // Opens the preview modal for a card in the results panel — reuses the exact
  // same fetch/transform/statsPending flow as ExploreMap's click-on-line
  // shortcut (via lib/fetchTrailDetail.ts) so both entry points behave identically.
  async function handleSelectTrailFromPanel(id: number) {
    setPanelSelectingId(id)
    try {
      const { trail, statsPending, geometrySimplified, bbox, operator } = await fetchTrailDetail(id)
      setPreview(trail)
      if (statsPending && bbox) {
        finishTrailStats(trail, geometrySimplified, bbox, operator).then(updated => {
          if (updated) setPreview(prev => (prev && prev.osmId === trail.osmId ? updated : prev))
        })
      }
    } catch {
      setSearchError('Errore nel caricamento del sentiero selezionato.')
    } finally {
      setPanelSelectingId(null)
    }
  }

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
      // Interpolate the sparse (~200m) elevation samples onto the dense route geometry
      // so the saved hike's trackPoints carry real altitudeMeters — without this the
      // elevation chart and the CTS slope-variance scoring both see a flat profile.
      const altitudes = t.elevationProfile?.length
        ? interpolateElevations(routePolyline, t.elevationProfile)
        : null
      const trackPoints = routePolyline.map(([lat, lon], i) => ({
        time: '', lat, lon,
        altitudeMeters: altitudes ? altitudes[i] : undefined,
      }))

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
        osmId: t.osmId,
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
      // Fire-and-forget: CTS needs several slow fetches (POI/OSM/DTM), so it
      // runs in the background instead of blocking the "added" confirmation.
      computeCtsForHike(hike).catch(() => {})
    } catch {
      alert('Errore nel salvataggio. Riprova.')
    } finally {
      setAdding(null)
    }
  }

  // Floats over the map (search box + filter icon), like Diario/Escursione's
  // floating controls — instead of living inside the results panel/sheet.
  const activeFilterCount =
    (filters.routeType ? 1 : 0) +
    (filters.difficulty ? 1 : 0) +
    (filters.distanceKmMin != null || filters.distanceKmMax != null ? 1 : 0) +
    (filters.elevationGainMin != null || filters.elevationGainMax != null ? 1 : 0) +
    (filters.durationMinMin != null || filters.durationMinMax != null ? 1 : 0)

  const searchBar = (
    <div className="absolute top-3 left-3 right-3 z-[1000] flex gap-2">
      <div className="relative flex-1">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
        <input
          type="text"
          placeholder="Cerca zona o sentiero…"
          value={query}
          onChange={e => handleQueryChange(e.target.value)}
          className="w-full pl-9 pr-9 py-3 rounded-2xl border-0 bg-white/95 backdrop-blur shadow-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
        />
        {geoLoading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 animate-spin" />
        )}

        {geoResults.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-stone-200 shadow-lg overflow-hidden">
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
      <button
        onClick={() => setFiltersOpen(v => !v)}
        title="Filtri"
        className={`relative shrink-0 w-[46px] h-[46px] rounded-2xl shadow-lg flex items-center justify-center transition-colors ${
          filtersOpen ? 'bg-sky-600 text-white' : 'bg-white text-forest-900'
        }`}
      >
        <SlidersHorizontal className="w-[18px] h-[18px]" />
        {activeFilterCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-terra-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white">
            {activeFilterCount}
          </span>
        )}
      </button>
    </div>
  )

  // ── Render ──
  return (
    <div className="min-h-screen bg-stone-50 pb-24 md:pb-8">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 py-4">

        {/* Back + compact header */}
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <BackLink label="Diario" fallbackHref="/" className="inline-flex items-center gap-1 text-sm text-stone-400 hover:text-stone-600 transition" />
          </div>
          <div className="flex items-center gap-2 text-stone-700">
            <Compass className="w-5 h-5 text-sky-600" />
            <h1 className="text-base font-bold">Esplora Trail</h1>
            <span title="I sentieri mostrati arrivano da Waymarked Trails, la rete escursionistica di OpenStreetMap. Clicca su una linea colorata per vederne i dettagli.">
              <Info className="w-3.5 h-3.5 text-stone-400" />
            </span>
          </div>
        </div>

        {/* Map + results panel, coexisting side by side (desktop) or map +
            bottom sheet (mobile) instead of a list stacked below a tall map. */}
        <ExploreLayout
          resultsCount={searchResults.length + pendingCandidates.length}
          searchTrigger={searchTrigger}
          map={
            <div className="relative">
              {searchBar}
              <ExploreMap
                center={mapCenter}
                onTrailSelected={setPreview}
                onViewportChanged={handleViewportChanged}
                dismissCandidatesSignal={searchTrigger}
                height="clamp(440px, 72vh, 760px)"
              />
            </div>
          }
          panel={
            <ExploreResultsPanel
              results={searchResults}
              pendingCandidates={pendingCandidates}
              loading={searchLoading}
              error={searchError}
              truncated={truncated}
              hasSearched={hasSearched}
              filters={filters}
              onFiltersChange={handleFiltersChange}
              onUsePreferences={handleUsePreferences}
              onSelectTrail={handleSelectTrailFromPanel}
              selectingId={panelSelectingId}
              onSearchThisArea={handleSearchThisArea}
              canSearchThisArea={searchDirty}
              filtersOpen={filtersOpen}
              onToggleFilters={() => setFiltersOpen(v => !v)}
            />
          }
        />
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
                    <CLBadge si={si.result?.si} label={si.result?.label} isGhostTrail={si.result?.isGhostTrail} loading={si.loading} compact />
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

              {/* Mini map — shows the route shape so it's instantly recognizable */}
              {t.geometryPolyline && t.geometryPolyline.length >= 2 && (
                <div className="px-5 pt-4">
                  <TrailMiniMap polyline={t.geometryPolyline} height="160px" />
                </div>
              )}

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
                    ) : dur > 0 ? formatDurationSecs(dur) : 'N/D'}
                  </div>
                  <div className="text-[10px] text-stone-400">Durata</div>
                </div>
              </div>

              {/* Details */}
              <div className="px-5 py-4 space-y-2.5">
                {t.routeType && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-stone-500 w-24 shrink-0">Tipo percorso</span>
                    <span className="text-xs text-stone-700 flex items-center gap-1.5">
                      {(() => {
                        const Icon = ROUTE_TYPE_ICON[t.routeType!]
                        return <Icon className="w-3.5 h-3.5 text-stone-400" />
                      })()}
                      {ROUTE_TYPE_LABEL[t.routeType]}
                    </span>
                  </div>
                )}
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

              {/* Sicurezza e dati satellitari */}
              <div className="px-5 pb-2 space-y-3">
                <CLBadge
                  si={si.result?.si}
                  label={si.result?.label}
                  signals={si.result?.signals}
                  isGhostTrail={si.result?.isGhostTrail}
                  partial={si.result?.partial}
                  loading={si.loading}
                  onRefresh={si.refresh}
                  refreshing={si.refreshing}
                  refreshError={si.refreshError}
                  expanded
                />
                {!si.notMatched && <CurrentConditionsNotice osmId={preview?.osmId} signals={si.result?.signals} />}
                <PhenologyPanel data={s2.data} loading={s2.loading} flora={flora.data} floraLoading={flora.loading} />
                <ShadeWaterTile data={s2.data} loading={s2.loading} />
              </div>

              {/* Add to programma — disabled while elevation/duration are still
                  being computed, otherwise the saved hike would get a 0 dislivello
                  and its score would be calculated on incomplete data. */}
              <div className="px-5 pb-6">
                <button
                  onClick={() => addToPlanned(t)}
                  disabled={isAdded || isAdding || t.statsPending}
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
                      : t.statsPending
                        ? <><Loader2 className="w-4 h-4 animate-spin" />Calcolo dislivello…</>
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
