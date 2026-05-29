'use client'
import 'maplibre-gl/dist/maplibre-gl.css'
import maplibregl, { Map as MLMap, Marker } from 'maplibre-gl'
import { useEffect, useRef, useState, useCallback } from 'react'
import type { TrackPoint } from '@/lib/tcxParser'
import { X, Play, Pause, RotateCcw, Mountain } from 'lucide-react'

const KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? ''

const SPEEDS = [
  { label: '1×',  v: 1  },
  { label: '3×',  v: 3  },
  { label: '10×', v: 10 },
  { label: '30×', v: 30 },
]

const STYLES = [
  { label: 'Outdoor',   url: () => `https://api.maptiler.com/maps/outdoor-v2/style.json?key=${KEY}` },
  { label: 'Satellite', url: () => `https://api.maptiler.com/maps/satellite-v2/style.json?key=${KEY}` },
  { label: 'Winter',    url: () => `https://api.maptiler.com/maps/winter-v2/style.json?key=${KEY}` },
]

// ── Geo helpers ────────────────────────────────────────────────────────────────
function rad(d: number) { return d * Math.PI / 180 }

function distM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const a = Math.sin(rad((lat2 - lat1) / 2)) ** 2
          + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad((lon2 - lon1) / 2)) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = rad(lon2 - lon1)
  const y = Math.sin(dLon) * Math.cos(rad(lat2))
  const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(dLon)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

// ── Component ──────────────────────────────────────────────────────────────────
interface Props {
  trackPoints: TrackPoint[]
  title?: string
  onClose: () => void
}

export default function RouteMap3D({ trackPoints, title, onClose }: Props) {
  const containerRef  = useRef<HTMLDivElement>(null)
  const mapRef        = useRef<MLMap | null>(null)
  const markerRef     = useRef<Marker | null>(null)
  const animRef       = useRef<number>(0)
  const progressRef   = useRef(0)
  const lastTsRef     = useRef(0)
  const isPlayingRef  = useRef(false)
  const gpsRef        = useRef<TrackPoint[]>([])
  const totalDistRef  = useRef(0)
  const exaggRef      = useRef(1.5)

  const [mapReady,     setMapReady]     = useState(false)
  const [isPlaying,    setIsPlaying]    = useState(false)
  const [progress,     setProgress]     = useState(0)
  const [speedIdx,     setSpeedIdx]     = useState(1)
  const [styleIdx,     setStyleIdx]     = useState(0)
  const [exaggeration, setExaggeration] = useState(1.5)
  const [currentAlt,   setCurrentAlt]   = useState(0)
  const [coveredKm,    setCoveredKm]    = useState(0)

  const gps = useRef(trackPoints.filter(p => p.lat !== undefined && p.lon !== undefined))

  // ── Layer setup (called on load + style.load) ────────────────────────────────
  const setupLayers = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    const pts = gpsRef.current
    const N   = pts.length
    if (N < 2) return

    // Terrain DEM
    if (!map.getSource('terrain')) {
      map.addSource('terrain', {
        type: 'raster-dem',
        url: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${KEY}`,
        tileSize: 256,
      })
    }
    map.setTerrain({ source: 'terrain', exaggeration: exaggRef.current })

    // Atmosphere sky layer
    if (!map.getLayer('sky')) {
      try {
        map.addLayer({
          id: 'sky', type: 'sky',
          paint: {
            'sky-type': 'atmosphere',
            'sky-atmosphere-sun': [0.0, 90.0],
            'sky-atmosphere-sun-intensity': 15,
          },
        } as any)
      } catch { /* some styles already include sky */ }
    }

    // Route geometry — includes altitude for true 3D positioning
    const coords = pts.map(p => [p.lon!, p.lat!, p.altitudeMeters ?? 0] as [number, number, number])

    if (map.getSource('route')) {
      (map.getSource('route') as any).setData({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords },
        properties: {},
      })
    } else {
      map.addSource('route', {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} },
      })
    }

    if (!map.getLayer('route-casing')) {
      map.addLayer({
        id: 'route-casing', type: 'line', source: 'route',
        paint: { 'line-color': '#ffffff', 'line-width': 8, 'line-opacity': 0.55 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      })
    }
    if (!map.getLayer('route-line')) {
      map.addLayer({
        id: 'route-line', type: 'line', source: 'route',
        paint: { 'line-color': '#ff4444', 'line-width': 4 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      })
    }

    // Re-position animated marker at current progress
    const rawIdx = progressRef.current * (N - 1)
    const i0 = Math.min(Math.floor(rawIdx), N - 1)
    if (markerRef.current) {
      markerRef.current.setLngLat([pts[i0].lon!, pts[i0].lat!])
    }
  }, [])

  // ── Map initialisation ───────────────────────────────────────────────────────
  useEffect(() => {
    const pts = gps.current
    if (!containerRef.current || pts.length < 2) return
    gpsRef.current = pts

    // Cumulative distance for stats
    let cum = 0
    for (let i = 1; i < pts.length; i++) cum += distM(pts[i-1].lat!, pts[i-1].lon!, pts[i].lat!, pts[i].lon!)
    totalDistRef.current = cum
    setCurrentAlt(pts[0].altitudeMeters ?? 0)

    // Bounding box
    let minLon = pts[0].lon!, maxLon = pts[0].lon!, minLat = pts[0].lat!, maxLat = pts[0].lat!
    for (const p of pts) {
      if (p.lon! < minLon) minLon = p.lon!; if (p.lon! > maxLon) maxLon = p.lon!
      if (p.lat! < minLat) minLat = p.lat!; if (p.lat! > maxLat) maxLat = p.lat!
    }

    const map = new (maplibregl.Map as any)({
      container: containerRef.current,
      style: STYLES[0].url(),
      center: [(minLon + maxLon) / 2, (minLat + maxLat) / 2],
      zoom: 11,
      pitch: 55,
      bearing: 0,
      antialias: true,
    }) as MLMap
    mapRef.current = map

    map.on('load', () => {
      setupLayers()

      // Fixed start (green) and end (red) pins
      const mkEl = (color: string) => {
        const el = document.createElement('div')
        el.style.cssText = `width:14px;height:14px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.5)`
        return el
      }
      new maplibregl.Marker({ element: mkEl('#22c55e') }).setLngLat([pts[0].lon!, pts[0].lat!]).addTo(map)
      new maplibregl.Marker({ element: mkEl('#ef4444') }).setLngLat([pts[pts.length-1].lon!, pts[pts.length-1].lat!]).addTo(map)

      // Animated marker (blue pulsing dot)
      const el = document.createElement('div')
      el.style.cssText = 'position:relative;width:24px;height:24px;'
      el.innerHTML = `
        <style>.pulse-ring{position:absolute;inset:-8px;border-radius:50%;background:rgba(59,130,246,.35);animation:pulse3d 1.6s ease-in-out infinite}
        @keyframes pulse3d{0%,100%{transform:scale(.7);opacity:.6}50%{transform:scale(1.3);opacity:.1}}</style>
        <div class="pulse-ring"></div>
        <div style="position:absolute;inset:0;border-radius:50%;background:#3b82f6;border:3px solid white;box-shadow:0 2px 10px rgba(0,0,0,.5)"></div>
      `
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([pts[0].lon!, pts[0].lat!])
        .addTo(map)
      markerRef.current = marker

      // Fly to overview
      map.fitBounds([[minLon, minLat], [maxLon, maxLat]], { padding: 72, pitch: 58, duration: 2200 })
      setMapReady(true)
    })

    // Re-add custom layers after style change
    map.on('style.load', () => { setupLayers() })

    return () => {
      cancelAnimationFrame(animRef.current)
      isPlayingRef.current = false
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
  }, [setupLayers]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Terrain exaggeration live update ─────────────────────────────────────────
  useEffect(() => {
    exaggRef.current = exaggeration
    const map = mapRef.current
    if (!map || !mapReady) return
    try { map.setTerrain({ source: 'terrain', exaggeration }) } catch {}
  }, [exaggeration, mapReady])

  // ── Style switching ───────────────────────────────────────────────────────────
  const switchStyle = useCallback((idx: number) => {
    setStyleIdx(idx)
    mapRef.current?.setStyle(STYLES[idx].url())
  }, [])

  // ── Animation loop ────────────────────────────────────────────────────────────
  useEffect(() => {
    isPlayingRef.current = isPlaying

    if (!isPlaying) {
      cancelAnimationFrame(animRef.current)
      return
    }

    lastTsRef.current = 0

    const pts = gpsRef.current
    const N   = pts.length
    const totalKm = totalDistRef.current / 1000

    const tick = (ts: number) => {
      if (!isPlayingRef.current) return

      const dt   = lastTsRef.current ? ts - lastTsRef.current : 16
      lastTsRef.current = ts

      const speed = SPEEDS[speedIdx].v
      // At speed 1× the full tour takes ~90 s
      progressRef.current = Math.min(1, progressRef.current + (dt * speed) / 90000)
      setProgress(progressRef.current)

      // Interpolated position
      const rawIdx = progressRef.current * (N - 1)
      const i0 = Math.floor(rawIdx)
      const i1 = Math.min(i0 + 1, N - 1)
      const frac = rawIdx - i0
      const p0 = pts[i0], p1 = pts[i1]
      const lon = p0.lon! + (p1.lon! - p0.lon!) * frac
      const lat = p0.lat! + (p1.lat! - p0.lat!) * frac
      const alt = (p0.altitudeMeters ?? 0) + ((p1.altitudeMeters ?? 0) - (p0.altitudeMeters ?? 0)) * frac

      markerRef.current?.setLngLat([lon, lat])
      setCurrentAlt(Math.round(alt))
      setCoveredKm(+(progressRef.current * totalKm).toFixed(1))

      // Camera: look slightly ahead, tilt down from behind
      const lookIdx = Math.min(i0 + Math.max(3, Math.round(N * 0.015)), N - 1)
      const bear = bearingDeg(lat, lon, pts[lookIdx].lat!, pts[lookIdx].lon!)

      mapRef.current?.easeTo({
        center: [lon, lat],
        bearing: bear,
        pitch: 68,
        zoom: 14.5,
        duration: 180,
      })

      if (progressRef.current < 1) {
        animRef.current = requestAnimationFrame(tick)
      } else {
        setIsPlaying(false)
      }
    }
    animRef.current = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(animRef.current)
  }, [isPlaying, speedIdx])

  // ── Reset ─────────────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    cancelAnimationFrame(animRef.current)
    isPlayingRef.current = false
    progressRef.current = 0
    setProgress(0)
    setIsPlaying(false)

    const pts = gpsRef.current
    if (pts.length === 0) return
    markerRef.current?.setLngLat([pts[0].lon!, pts[0].lat!])
    setCurrentAlt(pts[0].altitudeMeters ?? 0)
    setCoveredKm(0)

    let minLon = pts[0].lon!, maxLon = pts[0].lon!, minLat = pts[0].lat!, maxLat = pts[0].lat!
    for (const p of pts) {
      if (p.lon! < minLon) minLon = p.lon!; if (p.lon! > maxLon) maxLon = p.lon!
      if (p.lat! < minLat) minLat = p.lat!; if (p.lat! > maxLat) maxLat = p.lat!
    }
    mapRef.current?.fitBounds([[minLon, minLat], [maxLon, maxLat]], { padding: 72, pitch: 58, duration: 1200 })
  }, [])

  const handlePlay = () => {
    if (progressRef.current >= 1) reset()
    setIsPlaying(v => !v)
  }

  const totalKm = +(totalDistRef.current / 1000).toFixed(1)

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col" style={{ touchAction: 'none' }}>

      {/* Map canvas */}
      <div ref={containerRef} className="flex-1 w-full h-full" />

      {/* ── Top bar ── */}
      <div className="absolute top-0 inset-x-0 pointer-events-none">
        <div className="flex items-start justify-between p-3 bg-gradient-to-b from-black/65 to-transparent">

          {/* Left: style selector + title */}
          <div className="flex flex-col gap-2 pointer-events-auto">
            <div className="flex gap-1 bg-black/45 backdrop-blur-md rounded-xl p-1 w-fit">
              {STYLES.map((s, i) => (
                <button key={s.label} onClick={() => switchStyle(i)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all
                    ${styleIdx === i ? 'bg-white text-stone-900 shadow' : 'text-white/80 hover:bg-white/20'}`}>
                  {s.label}
                </button>
              ))}
            </div>
            {title && (
              <p className="text-white text-sm font-semibold drop-shadow-md ml-1 max-w-[280px] truncate">{title}</p>
            )}
          </div>

          {/* Right: close */}
          <button onClick={onClose}
            className="pointer-events-auto w-10 h-10 rounded-full bg-black/50 backdrop-blur-md hover:bg-black/75 flex items-center justify-center text-white transition-colors shadow-lg mt-0.5">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ── Stats HUD ── */}
      <div className="absolute top-20 left-3 pointer-events-none">
        <div className="bg-black/50 backdrop-blur-md rounded-2xl px-4 py-3 text-white space-y-2 min-w-[148px] shadow-xl border border-white/10">
          <div className="flex items-center gap-2">
            <Mountain className="w-3.5 h-3.5 text-blue-300 shrink-0" />
            <span className="text-[11px] text-white/55 flex-1">Quota</span>
            <span className="text-sm font-bold tabular-nums">{currentAlt} m</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 shrink-0" />
            <span className="text-[11px] text-white/55 flex-1">Percorso</span>
            <span className="text-sm font-bold tabular-nums">{coveredKm} km</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 shrink-0" />
            <span className="text-[11px] text-white/55 flex-1">Totale</span>
            <span className="text-sm font-bold tabular-nums text-white/70">{totalKm} km</span>
          </div>
        </div>
      </div>

      {/* ── Progress bar ── */}
      <div className="absolute left-3 right-3 pointer-events-none" style={{ bottom: '92px' }}>
        <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden backdrop-blur-sm">
          <div
            className="h-full rounded-full transition-none"
            style={{ width: `${progress * 100}%`, background: 'linear-gradient(90deg, #3b82f6, #60a5fa)' }}
          />
        </div>
        <div className="flex justify-between mt-1 text-[10px] text-white/50 font-medium px-0.5">
          <span>0 km</span>
          <span>{totalKm} km</span>
        </div>
      </div>

      {/* ── Bottom controls ── */}
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent pt-8 pb-5 px-4">
        <div className="max-w-sm mx-auto flex flex-col gap-3">

          {/* Main controls row */}
          <div className="flex items-center justify-between gap-3">

            {/* Reset */}
            <button onClick={reset}
              className="w-11 h-11 rounded-full bg-white/15 hover:bg-white/30 flex items-center justify-center text-white transition-colors border border-white/10">
              <RotateCcw className="w-4 h-4" />
            </button>

            {/* Play / Pause */}
            <button
              onClick={handlePlay}
              disabled={!mapReady}
              className="w-16 h-16 rounded-full bg-white flex items-center justify-center text-stone-900 shadow-2xl hover:bg-stone-100 active:scale-95 transition-all disabled:opacity-35"
            >
              {isPlaying
                ? <Pause  className="w-7 h-7" />
                : <Play   className="w-7 h-7 translate-x-0.5" />
              }
            </button>

            {/* Speed */}
            <div className="flex gap-0.5 bg-white/15 rounded-xl p-1 border border-white/10">
              {SPEEDS.map((s, i) => (
                <button key={s.label} onClick={() => setSpeedIdx(i)}
                  className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all
                    ${speedIdx === i ? 'bg-white text-stone-900 shadow' : 'text-white/70 hover:bg-white/20'}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Terrain exaggeration */}
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-white/50 whitespace-nowrap font-medium">Rilievo</span>
            <input type="range" min={1} max={3} step={0.1}
              value={exaggeration}
              onChange={e => setExaggeration(+e.target.value)}
              className="flex-1 h-1.5 rounded-full accent-blue-400 cursor-pointer"
            />
            <span className="text-[11px] text-white font-bold w-8 text-right">{exaggeration.toFixed(1)}×</span>
          </div>
        </div>
      </div>

      {/* ── Loading overlay ── */}
      {!mapReady && (
        <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center gap-4 text-white">
          <div className="w-12 h-12 rounded-full border-2 border-white/20 border-t-white animate-spin" />
          <p className="text-sm font-medium text-white/70">Caricamento mappa 3D…</p>
        </div>
      )}
    </div>
  )
}
