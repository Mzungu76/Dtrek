'use client'
import { useEffect, useRef, useState } from 'react'
import { Loader2, X, MapPin } from 'lucide-react'

export interface TrailResult {
  id: string          // "wmt-{relationId}"
  osmId: number        // same numeric value as the OSM relation id
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
  geometryPolyline?: [number, number][]
  estimatedTimeMin?: number | null
  dataQuality?: 'osm_tags' | 'calculated' | 'estimated' | null
  routeType?: 'loop' | 'out_and_back' | 'point_to_point'
  // true while elevation/duration are still being computed server-side (cache
  // miss + incomplete OSM tags) — distance is always resolved by this point.
  statsPending?: boolean
}

interface WmtCandidate {
  id: number
  name: string
  ref?: string
  network?: string
}

interface CandidateBrief {
  distanceKm: number | null
  elevationGain: number | null
  estimatedTimeMin: number | null
  loading: boolean
}

function formatDur(secs: number): string {
  if (secs <= 0) return ''
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h${String(m).padStart(2, '0')}`
}

interface Props {
  center?: { lat: number; lon: number } | null
  onTrailSelected: (trail: TrailResult) => void
  height?: string
}

const NETWORK_LABEL: Record<string, string> = {
  lwn: 'Locale', rwn: 'Regionale', nwn: 'Nazionale', iwn: 'Internazionale',
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max)
}

export default function ExploreMap({ center, onTrailSelected, height = '480px' }: Props) {
  const mapRef          = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstance      = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const highlightLayer   = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leafletRef        = useRef<any>(null)
  const [mapReady, setMapReady]           = useState(false)
  const [candidates, setCandidates]       = useState<WmtCandidate[]>([])
  const [briefs, setBriefs]               = useState<Record<number, CandidateBrief>>({})
  const [queryLoading, setQueryLoading]   = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [queryError, setQueryError]       = useState<string | null>(null)
  // Tracks the most recently selected trail so a slow phase-2 stats response
  // can't clobber the panel if the user picks a different trail in the meantime.
  const currentTrailId = useRef<number | null>(null)

  // Init map once
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return

    import('leaflet').then(L => {
      leafletRef.current = L
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      const start: [number, number] = center ? [center.lat, center.lon] : [44.5, 10.5]
      const map = L.map(mapRef.current!).setView(start, center ? 12 : 6)
      mapInstance.current = map
      setMapReady(true)

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map)

      // Hiking network overlay, loaded directly client-side (no backend proxy needed for tiles)
      L.tileLayer('https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png', {
        opacity: 0.85,
        zIndex: 5,
        maxZoom: 18,
        attribution: 'Sentieri © <a href="https://waymarkedtrails.org">Waymarked Trails</a>',
      }).addTo(map)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.on('click', (e: any) => {
        handleMapClick(e.latlng.lat, e.latlng.lng, map.getZoom())
      })
    })

    if (!document.querySelector('#leaflet-css')) {
      const link = document.createElement('link')
      link.id   = 'leaflet-css'
      link.rel  = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)
    }

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove()
        mapInstance.current = null
        setMapReady(false)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Recenter when `center` prop changes (e.g. after picking a geocode result)
  useEffect(() => {
    if (!mapReady || !mapInstance.current || !center) return
    mapInstance.current.setView([center.lat, center.lon], 12)
  }, [center, mapReady])

  async function handleMapClick(lat: number, lon: number, zoom: number) {
    setQueryError(null)
    setCandidates([])
    setQueryLoading(true)
    try {
      // Smaller bbox at high zoom (precise click), wider at low zoom (sparse network visible)
      const radiusDeg = clamp(0.5 / Math.pow(2, zoom - 8), 0.001, 0.05)
      const bbox = [lon - radiusDeg, lat - radiusDeg, lon + radiusDeg, lat + radiusDeg].join(',')
      const res  = await fetch(`/api/waymarked-trails/list?bbox=${bbox}&limit=10`)
      const json = await res.json()
      const results: WmtCandidate[] = json.results ?? []
      if (results.length === 0) {
        setQueryError('Nessun sentiero trovato qui. Prova a cliccare più vicino a una linea colorata.')
      } else if (results.length === 1) {
        await selectTrail(results[0].id)
      } else {
        setCandidates(results)
        loadBriefs(results)
      }
    } catch {
      setQueryError('Errore nella ricerca dei sentieri.')
    } finally {
      setQueryLoading(false)
    }
  }

  // Fetches a quick distance/elevation/duration snapshot for each candidate so the
  // list below the map shows real numbers right away instead of just names.
  function loadBriefs(results: WmtCandidate[]) {
    setBriefs(Object.fromEntries(results.map(c => [c.id, { distanceKm: null, elevationGain: null, estimatedTimeMin: null, loading: true }])))
    for (const c of results) {
      fetch(`/api/waymarked-trails/details?id=${c.id}`)
        .then(res => res.json())
        .then(det => {
          setBriefs(prev => ({
            ...prev,
            [c.id]: {
              distanceKm: det.distanceKm ?? null,
              elevationGain: det.elevationGain ?? null,
              estimatedTimeMin: det.estimatedTimeMin ?? null,
              loading: false,
            },
          }))
        })
        .catch(() => {
          setBriefs(prev => ({ ...prev, [c.id]: { distanceKm: null, elevationGain: null, estimatedTimeMin: null, loading: false } }))
        })
    }
  }

  async function selectTrail(id: number) {
    setCandidates([])
    setBriefs({})
    setDetailLoading(true)
    setQueryError(null)
    currentTrailId.current = id
    try {
      const detRes = await fetch(`/api/waymarked-trails/details?id=${id}`)
      const det = await detRes.json()
      if (!detRes.ok) throw new Error(det.error ?? 'Errore dettagli')

      const polyline: [number, number][] = det.polyline ?? []
      drawHighlight(polyline)

      const trail: TrailResult = {
        id: `wmt-${id}`,
        osmId: id,
        name: det.name ?? `Percorso ${id}`,
        from: det.from,
        to: det.to,
        distanceKm: det.distanceKm,
        elevationGain: det.elevationGain ?? null,
        elevationLoss: det.elevationLoss ?? null,
        altitudeMax: det.altitudeMax,
        altitudeMin: det.altitudeMin,
        sacScale: det.sacScale,
        caiScale: det.caiScale,
        ref: det.ref,
        description: det.description,
        network: det.network,
        geometryPolyline: polyline,
        estimatedTimeMin: det.estimatedTimeMin ?? null,
        dataQuality: det.dataQuality ?? null,
        routeType: det.routeType,
        statsPending: !!det.statsPending,
      }
      onTrailSelected(trail)

      // Cache miss + incomplete OSM tags: distance is already final, but elevation
      // needs the slower OpenTopoData round trip — finish it in the background so
      // the panel can open right away instead of blocking on it.
      if (det.statsPending) {
        finishTrailStats(trail, det.geometrySimplified ?? [], det.bbox, det.operator)
      }
    } catch {
      setQueryError('Errore nel caricamento del sentiero selezionato.')
    } finally {
      setDetailLoading(false)
    }
  }

  async function finishTrailStats(
    trail: TrailResult,
    geometrySimplified: [number, number][],
    bbox: { minLat: number; maxLat: number; minLon: number; maxLon: number },
    operator?: string,
  ) {
    try {
      const res = await fetch('/api/waymarked-trails/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          osmId: trail.osmId,
          name: trail.name,
          ref: trail.ref,
          network: trail.network,
          sacScale: trail.sacScale,
          caiScale: trail.caiScale,
          description: trail.description,
          from: trail.from,
          to: trail.to,
          operator,
          distanceKm: trail.distanceKm,
          routeType: trail.routeType,
          bbox,
          geometrySimplified,
        }),
      })
      const stats = await res.json()
      if (!res.ok || currentTrailId.current !== trail.osmId) return

      onTrailSelected({
        ...trail,
        elevationGain: stats.elevationGain,
        elevationLoss: stats.elevationLoss,
        estimatedTimeMin: stats.estimatedTimeMin,
        dataQuality: stats.dataQuality,
        statsPending: false,
      })
    } catch {
      // Phase-1 data stays on screen; stats simply remain pending.
    }
  }

  function drawHighlight(polyline: [number, number][]) {
    const L = leafletRef.current
    if (!L || !mapInstance.current || polyline.length < 2) return
    if (highlightLayer.current) {
      highlightLayer.current.remove()
      highlightLayer.current = null
    }
    const line = L.polyline(polyline, { color: '#dc2626', weight: 5, opacity: 0.95 }).addTo(mapInstance.current)
    highlightLayer.current = line
    mapInstance.current.fitBounds(line.getBounds(), { padding: [30, 30] })
  }

  return (
    <div>
      <div className="relative">
        <div ref={mapRef} style={{ height }} className="rounded-2xl overflow-hidden border border-stone-200 shadow-sm" />

        {(queryLoading || detailLoading) && (
          <div className="absolute top-3 left-3 bg-white/95 rounded-xl shadow-md px-3 py-2 flex items-center gap-2 text-xs text-stone-600 z-[1000]">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-600" />
            {detailLoading ? 'Caricamento sentiero…' : 'Ricerca sentieri…'}
          </div>
        )}

        {queryError && (
          <div className="absolute top-3 left-3 right-3 bg-white rounded-xl shadow-md px-3 py-2.5 flex items-start gap-2 text-xs text-stone-600 z-[1000]">
            <span className="flex-1">{queryError}</span>
            <button onClick={() => setQueryError(null)} className="text-stone-400 hover:text-stone-600 shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {candidates.length > 0 && (
        <div className="mt-3 bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 text-[11px] font-medium text-stone-400 uppercase tracking-wide border-b border-stone-100">
            {candidates.length} sentieri qui — scegli
          </div>
          {candidates.map(c => {
            const b = briefs[c.id]
            const dur = b?.estimatedTimeMin != null ? b.estimatedTimeMin * 60 : 0
            return (
              <button
                key={c.id}
                onClick={() => selectTrail(c.id)}
                className="w-full text-left px-4 py-3 hover:bg-stone-50 border-b border-stone-100 last:border-0 flex items-center gap-3"
              >
                <MapPin className="w-4 h-4 text-stone-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-stone-800 font-medium truncate">{c.name}</span>
                    {c.network && NETWORK_LABEL[c.network] && (
                      <span className="text-[10px] text-stone-400 shrink-0">{NETWORK_LABEL[c.network]}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-stone-500">
                    {b?.loading ? (
                      <span className="flex items-center gap-1 text-stone-400">
                        <Loader2 className="w-3 h-3 animate-spin" /> calcolo dati…
                      </span>
                    ) : (
                      <>
                        <span>{b?.distanceKm != null ? `${b.distanceKm.toFixed(1)} km` : 'N/D'}</span>
                        <span>{b?.elevationGain != null ? `+${b.elevationGain} m` : 'N/D'}</span>
                        <span>{dur > 0 ? formatDur(dur) : 'N/D'}</span>
                      </>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
