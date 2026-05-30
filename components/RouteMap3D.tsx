'use client'
import 'maplibre-gl/dist/maplibre-gl.css'
import maplibregl, { Map as MLMap, Marker } from 'maplibre-gl'
import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import type { TrackPoint } from '@/lib/tcxParser'
import { X, Play, Pause, RotateCcw, Mountain, Camera, Images, Film, Download, Share2 } from 'lucide-react'
import StreetViewPanel from '@/components/StreetViewPanel'
import { fetchDayHourly, wmoInfo } from '@/lib/openmeteo'

const KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? ''

const SPEEDS = [
  { label: '1×',  v: 1  },
  { label: '3×',  v: 3  },
  { label: '10×', v: 10 },
  { label: '30×', v: 30 },
]

const STYLES = [
  { label: 'Outdoor',   url: () => `https://api.maptiler.com/maps/outdoor-v2/style.json?key=${KEY}` },
  { label: 'Satellite', url: () => `https://api.maptiler.com/maps/hybrid/style.json?key=${KEY}` },
  { label: 'Winter',    url: () => `https://api.maptiler.com/maps/winter-v2/style.json?key=${KEY}` },
]

// 1080p output for social-quality video
const VIDEO_DIMS: Record<string, [number, number]> = {
  '9:16': [1080, 1920],
  '16:9': [1920, 1080],
  '1:1':  [1080, 1080],
}

// ── Canvas helpers ─────────────────────────────────────────────────────────────

function coverRect(srcW: number, srcH: number, dstW: number, dstH: number) {
  const srcAr = srcW / srcH
  const dstAr = dstW / dstH
  if (srcAr > dstAr) {
    const sw = Math.round(srcH * dstAr)
    return { sx: Math.round((srcW - sw) / 2), sy: 0, sw, sh: srcH }
  }
  const sh = Math.round(srcW / dstAr)
  return { sx: 0, sy: Math.round((srcH - sh) / 2), sw: srcW, sh }
}

// Cross-browser rounded rect (avoids the newer ctx.roundRect API)
function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const cr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + cr, y)
  ctx.lineTo(x + w - cr, y)
  ctx.arcTo(x + w, y, x + w, y + cr, cr)
  ctx.lineTo(x + w, y + h - cr)
  ctx.arcTo(x + w, y + h, x + w - cr, y + h, cr)
  ctx.lineTo(x + cr, y + h)
  ctx.arcTo(x, y + h, x, y + h - cr, cr)
  ctx.lineTo(x, y + cr)
  ctx.arcTo(x, y, x + cr, y, cr)
  ctx.closePath()
}

// ── Graph helper ───────────────────────────────────────────────────────────────

interface GraphData {
  series:       number[]
  label:        string     // e.g. "BPM" or "km/h"
  icon:         string     // e.g. "♥" or "⚡"
  strokeColor:  string     // hex
  fillColor:    string     // rgba string for area fill
  minVal:       number
  maxVal:       number
  currentValue: number
}

// Sport-cam style mini graph panel
function drawGraph(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, gw: number, gh: number,
  sc: number, progress: number, g: GraphData,
) {
  if (!g.series.length || g.maxVal <= g.minVal) return
  ctx.save()

  // Background rounded rect
  ctx.fillStyle = 'rgba(10,10,10,0.62)'
  rrect(ctx, x, y, gw, gh, 14 * sc)
  ctx.fill()

  const pad    = Math.round(16 * sc)
  const valW   = Math.round(148 * sc)  // left column width
  const lineX  = x + valW
  const lineW  = gw - valW - pad
  const lineY  = y + Math.round(10 * sc)
  const lineH  = gh - Math.round(20 * sc)
  const range  = g.maxVal - g.minVal

  // ── Left column: icon / value / unit ──────────────────────────────────────

  // Icon + label
  ctx.textBaseline = 'top'
  ctx.textAlign    = 'left'
  ctx.fillStyle    = g.strokeColor
  ctx.font         = `bold ${Math.round(19 * sc)}px -apple-system,BlinkMacSystemFont,sans-serif`
  ctx.fillText(`${g.icon}  ${g.label}`, x + pad, y + Math.round(10 * sc))

  // Large current value
  ctx.fillStyle    = 'white'
  ctx.textBaseline = 'bottom'
  ctx.font         = `bold ${Math.round(46 * sc)}px -apple-system,BlinkMacSystemFont,sans-serif`
  ctx.fillText(`${Math.round(g.currentValue)}`, x + pad, y + gh - Math.round(10 * sc))

  // Thin divider
  ctx.fillStyle = 'rgba(255,255,255,0.1)'
  ctx.fillRect(lineX, y + Math.round(14 * sc), 1, gh - Math.round(28 * sc))

  // ── Right column: line graph ───────────────────────────────────────────────

  const pts = g.series.map((v, i) => ({
    px: lineX + (i / (g.series.length - 1)) * lineW,
    py: lineY + lineH - Math.max(0, Math.min(1, (v - g.minVal) / range)) * lineH,
  }))

  // Area fill
  const areaGrad = ctx.createLinearGradient(0, lineY, 0, lineY + lineH)
  areaGrad.addColorStop(0, g.fillColor)
  areaGrad.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.beginPath()
  pts.forEach(({ px, py }, i) => i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py))
  ctx.lineTo(pts[pts.length - 1].px, lineY + lineH)
  ctx.lineTo(pts[0].px, lineY + lineH)
  ctx.closePath()
  ctx.fillStyle = areaGrad
  ctx.fill()

  // Stroke line
  ctx.strokeStyle = g.strokeColor
  ctx.lineWidth   = 2.5 * sc
  ctx.lineJoin    = 'round'
  ctx.lineCap     = 'round'
  ctx.beginPath()
  pts.forEach(({ px, py }, i) => i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py))
  ctx.stroke()

  // Cursor dashed line
  const cursorX = lineX + progress * lineW
  ctx.save()
  ctx.strokeStyle = 'rgba(255,255,255,0.45)'
  ctx.lineWidth   = 1.5 * sc
  ctx.setLineDash([4 * sc, 4 * sc])
  ctx.beginPath()
  ctx.moveTo(cursorX, lineY)
  ctx.lineTo(cursorX, lineY + lineH)
  ctx.stroke()
  ctx.restore()

  // Cursor dot on line
  const ci  = Math.min(Math.round(progress * (g.series.length - 1)), g.series.length - 1)
  const cdp = pts[ci]
  if (cdp) {
    ctx.fillStyle   = g.strokeColor
    ctx.strokeStyle = 'white'
    ctx.lineWidth   = 2.5 * sc
    ctx.beginPath()
    ctx.arc(cdp.px, cdp.py, 6 * sc, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }

  ctx.restore()
}

// ── HUD overlay ────────────────────────────────────────────────────────────────

interface HUDOpts {
  showTitle:    boolean
  title:        string
  showStats:    boolean
  coveredKm:    number
  totalKm:      number
  alt:          number
  elevGain:     number
  showProgress: boolean
  progress:     number
  showBody:     boolean
  hrData?:      GraphData
  speedData?:   GraphData
}

function drawHUD(ctx: CanvasRenderingContext2D, w: number, h: number, opts: HUDOpts) {
  // Scale all elements relative to 1080p base (works for all 3 orientations)
  const sc = Math.min(w, h) / 1080

  const pad     = Math.round(40 * sc)
  const lineH   = Math.round(52 * sc)
  const statSz  = Math.round(32 * sc)
  const labelSz = Math.round(22 * sc)
  const brandSz = Math.round(22 * sc)
  const graphH  = Math.round(116 * sc)
  const graphGap= Math.round(16 * sc)

  const hasBody = opts.showBody && (opts.hrData || opts.speedData)
  const hasGraphs = hasBody

  // Gradient — extend higher when graphs are shown
  const gradTop = hasGraphs ? h * 0.58 : h * 0.72
  const grad = ctx.createLinearGradient(0, gradTop, 0, h)
  grad.addColorStop(0, 'rgba(0,0,0,0)')
  grad.addColorStop(0.5, 'rgba(0,0,0,0.55)')
  grad.addColorStop(1, 'rgba(0,0,0,0.88)')
  ctx.fillStyle = grad
  ctx.fillRect(0, gradTop, w, h - gradTop)

  ctx.textAlign = 'left'
  let yBase = h - pad

  // ── Progress bar ────────────────────────────────────────────────────────────
  if (opts.showProgress) {
    const barH = Math.max(6, Math.round(8 * sc))
    yBase -= barH
    // Track
    ctx.fillStyle = 'rgba(255,255,255,0.22)'
    rrect(ctx, 0, yBase, w, barH, barH / 2)
    ctx.fill()
    // Fill
    if (opts.progress > 0) {
      ctx.fillStyle = '#3b82f6'
      rrect(ctx, 0, yBase, Math.max(barH, w * opts.progress), barH, barH / 2)
      ctx.fill()
    }
    yBase -= Math.round(20 * sc)
  }

  // ── Stats row ───────────────────────────────────────────────────────────────
  if (opts.showStats) {
    ctx.textBaseline = 'bottom'
    ctx.font = `bold ${statSz}px -apple-system,BlinkMacSystemFont,sans-serif`

    ctx.fillStyle = 'white'
    ctx.fillText(`${opts.coveredKm}/${opts.totalKm} km`, pad, yBase)

    const altText = `${opts.alt} m`
    ctx.fillText(altText, (w - ctx.measureText(altText).width) / 2, yBase)

    ctx.fillStyle = 'rgba(255,255,255,0.82)'
    const gainText = `+${opts.elevGain} m`
    ctx.fillText(gainText, w - ctx.measureText(gainText).width - pad, yBase)

    yBase -= lineH
  }

  // ── Title ───────────────────────────────────────────────────────────────────
  if (opts.showTitle && opts.title) {
    ctx.textBaseline = 'bottom'
    ctx.font = `600 ${labelSz}px -apple-system,BlinkMacSystemFont,sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.78)'
    let t = opts.title
    while (ctx.measureText(t).width > w - pad * 2 && t.length > 4) t = t.slice(0, -4) + '…'
    ctx.fillText(t, pad, yBase)
    yBase -= lineH
  }

  // ── Body data graphs ────────────────────────────────────────────────────────
  if (hasBody) {
    yBase -= Math.round(22 * sc)  // spacer above graphs
    const isPortrait = h > w

    if (isPortrait) {
      // Stack vertically: speed below HR
      if (opts.speedData) {
        yBase -= graphH
        drawGraph(ctx, pad, yBase, w - 2 * pad, graphH, sc, opts.progress, opts.speedData)
        yBase -= graphGap
      }
      if (opts.hrData) {
        yBase -= graphH
        drawGraph(ctx, pad, yBase, w - 2 * pad, graphH, sc, opts.progress, opts.hrData)
      }
    } else {
      // Side by side for landscape / square
      const half = Math.floor((w - 2 * pad - graphGap) / 2)
      yBase -= graphH
      if (opts.hrData && opts.speedData) {
        drawGraph(ctx, pad,            yBase, half, graphH, sc, opts.progress, opts.hrData)
        drawGraph(ctx, pad + half + graphGap, yBase, half, graphH, sc, opts.progress, opts.speedData)
      } else if (opts.hrData) {
        drawGraph(ctx, pad, yBase, w - 2 * pad, graphH, sc, opts.progress, opts.hrData)
      } else if (opts.speedData) {
        drawGraph(ctx, pad, yBase, w - 2 * pad, graphH, sc, opts.progress, opts.speedData)
      }
    }
  }

  // ── Branding (bottom-right corner) ──────────────────────────────────────────
  ctx.textBaseline = 'bottom'
  ctx.font = `bold ${brandSz}px -apple-system,BlinkMacSystemFont,sans-serif`
  ctx.fillStyle = 'rgba(255,255,255,0.38)'
  const brand = 'DTrek'
  ctx.fillText(brand, w - ctx.measureText(brand).width - pad, h - Math.round(10 * sc))
}

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

// Smooth speed using a moving average window
function smoothArray(arr: number[], half = 4): number[] {
  return arr.map((_, i) => {
    const slice = arr.slice(Math.max(0, i - half), Math.min(arr.length, i + half + 1))
    return slice.reduce((a, b) => a + b, 0) / slice.length
  })
}

type VideoState = 'idle' | 'config' | 'recording' | 'done'

// ── Component ──────────────────────────────────────────────────────────────────
interface Props {
  trackPoints: TrackPoint[]
  title?: string
  onClose: () => void
  plannedDate?: string  // YYYY-MM-DD — enables weather badge
}

export default function RouteMap3D({ trackPoints, title, onClose, plannedDate }: Props) {
  const containerRef   = useRef<HTMLDivElement>(null)
  const mapRef         = useRef<MLMap | null>(null)
  const markerRef      = useRef<Marker | null>(null)
  const animRef        = useRef<number>(0)
  const progressRef    = useRef(0)
  const lastTsRef      = useRef(0)
  const isPlayingRef   = useRef(false)
  const gpsRef         = useRef<TrackPoint[]>([])
  const totalDistRef   = useRef(0)
  const exaggRef       = useRef(1.5)
  const handleScrubRef = useRef<(p: number) => void>(() => {})
  const elevStatsRef   = useRef({ gain: 0, altMax: 0 })

  // Video refs
  const mediaRecorderRef   = useRef<MediaRecorder | null>(null)
  const videoChunksRef     = useRef<Blob[]>([])
  const videoAnimRef       = useRef<number>(0)
  const compositeCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const videoObjUrlRef     = useRef<string | null>(null)

  const [mapReady,       setMapReady]      = useState(false)
  const [isPlaying,      setIsPlaying]     = useState(false)
  const [progress,       setProgress]      = useState(0)
  const [speedIdx,       setSpeedIdx]      = useState(1)
  const [styleIdx,       setStyleIdx]      = useState(0)
  const [exaggeration,   setExaggeration]  = useState(1.5)
  const [currentAlt,     setCurrentAlt]    = useState(0)
  const [coveredKm,      setCoveredKm]     = useState(0)
  const [shareToast,     setShareToast]    = useState('')
  const [showStreetView, setShowStreetView]= useState(false)
  const [streetViewPos,  setStreetViewPos] = useState<[number, number] | null>(null)

  // Video state
  const [videoState,         setVideoState]        = useState<VideoState>('idle')
  const [videoDuration,      setVideoDuration]     = useState(30)
  const [videoOrientation,   setVideoOrientation]  = useState<'9:16' | '16:9' | '1:1'>('9:16')
  const [videoShowTitle,     setVideoShowTitle]    = useState(true)
  const [videoShowStats,     setVideoShowStats]    = useState(true)
  const [videoShowProgress,  setVideoShowProgress] = useState(true)
  const [videoShowBody,      setVideoShowBody]     = useState(true)
  const [videoRecordedBlob,  setVideoRecordedBlob] = useState<Blob | null>(null)
  const [videoProgress,      setVideoProgress]     = useState(0)

  const gps = useRef(trackPoints.filter(p => p.lat !== undefined && p.lon !== undefined))

  // Whether body data (HR / speed) is available in this track
  const hasBodyData = useMemo(() => {
    const pts = gps.current
    const hasHr   = pts.some(p => (p.heartRateBpm ?? 0) > 0)
    const hasTime = pts.length > 1 && pts.some(p => !!p.time)
    return hasHr || hasTime
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-computed altitude series for elevation profile (300 samples)
  const altitudeSeries = useMemo(() => {
    const pts = gps.current
    if (!pts.some(p => p.altitudeMeters !== undefined)) return []
    const N = pts.length
    const SAMPLES = Math.min(300, N)
    const step = (N - 1) / (SAMPLES - 1)
    return Array.from({ length: SAMPLES }, (_, i) => {
      const idx = Math.min(Math.round(i * step), N - 1)
      return pts[idx].altitudeMeters ?? 0
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Weather badge for planned hikes
  const [weatherBadge, setWeatherBadge] = useState<{ emoji: string; temp: number; label: string } | null>(null)

  useEffect(() => {
    if (!plannedDate) return
    const pts = gps.current
    if (!pts.length) return
    const cp = pts[Math.floor(pts.length / 2)]
    if (!cp.lat || !cp.lon) return
    fetchDayHourly(cp.lat, cp.lon, plannedDate)
      .then(hours => {
        const noon = hours.find(h => h.time.slice(11, 13) === '12') ?? hours[Math.floor(hours.length / 2)]
        if (noon) {
          const info = wmoInfo(noon.weathercode)
          setWeatherBadge({ emoji: info.emoji, temp: Math.round(noon.temperature), label: info.label })
        }
      })
      .catch(() => {})
  }, [plannedDate]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Layer setup ──────────────────────────────────────────────────────────────
  const setupLayers = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    const pts = gpsRef.current
    const N   = pts.length
    if (N < 2) return

    if (!map.getSource('terrain')) {
      map.addSource('terrain', {
        type: 'raster-dem',
        url: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${KEY}`,
        tileSize: 512,   // 512 → sharper terrain mesh
      })
    }
    map.setTerrain({ source: 'terrain', exaggeration: exaggRef.current })

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
      } catch { /* some styles include sky */ }
    }

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

    const rawIdx = progressRef.current * (N - 1)
    const i0 = Math.min(Math.floor(rawIdx), N - 1)
    if (markerRef.current) markerRef.current.setLngLat([pts[i0].lon!, pts[i0].lat!])
  }, [])

  // ── Map initialisation ───────────────────────────────────────────────────────
  useEffect(() => {
    const pts = gps.current
    if (!containerRef.current || pts.length < 2) return
    gpsRef.current = pts

    let cum = 0, gain = 0, altMax = pts[0].altitudeMeters ?? 0
    for (let i = 1; i < pts.length; i++) {
      cum += distM(pts[i-1].lat!, pts[i-1].lon!, pts[i].lat!, pts[i].lon!)
      const dAlt = (pts[i].altitudeMeters ?? 0) - (pts[i-1].altitudeMeters ?? 0)
      if (dAlt > 0) gain += dAlt
      if ((pts[i].altitudeMeters ?? 0) > altMax) altMax = pts[i].altitudeMeters ?? 0
    }
    totalDistRef.current = cum
    elevStatsRef.current = { gain: Math.round(gain), altMax: Math.round(altMax) }
    setCurrentAlt(pts[0].altitudeMeters ?? 0)

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
      preserveDrawingBuffer: true,
    }) as MLMap
    mapRef.current = map

    map.on('load', () => {
      setupLayers()

      const mkEl = (color: string) => {
        const el = document.createElement('div')
        el.style.cssText = `width:14px;height:14px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.5)`
        return el
      }
      new maplibregl.Marker({ element: mkEl('#22c55e') })
        .setLngLat([pts[0].lon!, pts[0].lat!]).addTo(map)
      new maplibregl.Marker({ element: mkEl('#ef4444') })
        .setLngLat([pts[pts.length-1].lon!, pts[pts.length-1].lat!]).addTo(map)

      const el = document.createElement('div')
      el.style.cssText = 'position:relative;width:24px;height:24px;'
      el.innerHTML = `
        <style>.pulse-ring{position:absolute;inset:-8px;border-radius:50%;background:rgba(59,130,246,.35);animation:pulse3d 1.6s ease-in-out infinite}
        @keyframes pulse3d{0%,100%{transform:scale(.7);opacity:.6}50%{transform:scale(1.3);opacity:.1}}</style>
        <div class="pulse-ring"></div>
        <div style="position:absolute;inset:0;border-radius:50%;background:#3b82f6;border:3px solid white;box-shadow:0 2px 10px rgba(0,0,0,.5)"></div>
      `
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([pts[0].lon!, pts[0].lat!]).addTo(map)
      markerRef.current = marker

      map.fitBounds([[minLon, minLat], [maxLon, maxLat]], { padding: 72, pitch: 58, duration: 2200 })

      const onRouteClick = (e: any) => {
        const g = gpsRef.current
        if (g.length < 2) return
        const { lat, lng } = e.lngLat
        let minD = Infinity, bestIdx = 0
        for (let i = 0; i < g.length; i++) {
          const d = distM(g[i].lat!, g[i].lon!, lat, lng)
          if (d < minD) { minD = d; bestIdx = i }
        }
        handleScrubRef.current(bestIdx / (g.length - 1))
      }
      map.on('click', 'route-casing', onRouteClick)
      map.on('click', 'route-line',   onRouteClick)
      map.on('mouseenter', 'route-casing', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'route-casing', () => { map.getCanvas().style.cursor = '' })

      setMapReady(true)
    })

    map.on('style.load', () => { setupLayers(); setMapReady(true) })

    return () => {
      cancelAnimationFrame(animRef.current)
      cancelAnimationFrame(videoAnimRef.current)
      isPlayingRef.current = false
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.onstop = null
        mediaRecorderRef.current.stop()
      }
      if (videoObjUrlRef.current) URL.revokeObjectURL(videoObjUrlRef.current)
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
  }, [setupLayers]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Terrain exaggeration ─────────────────────────────────────────────────────
  useEffect(() => {
    exaggRef.current = exaggeration
    const map = mapRef.current
    if (!map || !mapReady) return
    try { map.setTerrain({ source: 'terrain', exaggeration }) } catch {}
  }, [exaggeration, mapReady])

  // ── Style switching ───────────────────────────────────────────────────────────
  const switchStyle = useCallback((idx: number) => {
    setStyleIdx(idx)
    setMapReady(false)
    mapRef.current?.setStyle(STYLES[idx].url())
  }, [])

  // ── Normal animation loop ─────────────────────────────────────────────────────
  useEffect(() => {
    isPlayingRef.current = isPlaying
    if (!isPlaying) { cancelAnimationFrame(animRef.current); return }

    lastTsRef.current = 0
    const pts     = gpsRef.current
    const N       = pts.length
    const totalKm = totalDistRef.current / 1000

    const tick = (ts: number) => {
      if (!isPlayingRef.current) return
      const dt = lastTsRef.current ? ts - lastTsRef.current : 16
      lastTsRef.current = ts

      progressRef.current = Math.min(1, progressRef.current + (dt * SPEEDS[speedIdx].v) / 90000)
      setProgress(progressRef.current)

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

      const lookIdx = Math.min(i0 + Math.max(3, Math.round(N * 0.015)), N - 1)
      const bear = bearingDeg(lat, lon, pts[lookIdx].lat!, pts[lookIdx].lon!)
      mapRef.current?.easeTo({ center: [lon, lat], bearing: bear, pitch: 68, zoom: 14.5, duration: 180 })

      if (progressRef.current < 1) { animRef.current = requestAnimationFrame(tick) }
      else { setIsPlaying(false) }
    }
    animRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animRef.current)
  }, [isPlaying, speedIdx])

  // ── Reset ─────────────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    cancelAnimationFrame(animRef.current)
    isPlayingRef.current = false
    progressRef.current = 0
    setProgress(0); setIsPlaying(false)
    const pts = gpsRef.current
    if (!pts.length) return
    markerRef.current?.setLngLat([pts[0].lon!, pts[0].lat!])
    setCurrentAlt(pts[0].altitudeMeters ?? 0); setCoveredKm(0)
    let minLon = pts[0].lon!, maxLon = pts[0].lon!, minLat = pts[0].lat!, maxLat = pts[0].lat!
    for (const p of pts) {
      if (p.lon! < minLon) minLon = p.lon!; if (p.lon! > maxLon) maxLon = p.lon!
      if (p.lat! < minLat) minLat = p.lat!; if (p.lat! > maxLat) maxLat = p.lat!
    }
    mapRef.current?.fitBounds([[minLon, minLat], [maxLon, maxLat]], { padding: 72, pitch: 58, duration: 1200 })
  }, [])

  const handlePlay = () => { if (progressRef.current >= 1) reset(); setIsPlaying(v => !v) }

  // ── Screenshot ───────────────────────────────────────────────────────────────
  const handleCapture = useCallback(async () => {
    const map = mapRef.current
    if (!map) return
    const dataUrl = map.getCanvas().toDataURL('image/png')
    const blob = await (await fetch(dataUrl)).blob()
    const file = new File([blob], `dtrek-3d-${Date.now()}.png`, { type: 'image/png' })
    if (typeof navigator !== 'undefined' && (navigator as any).canShare?.({ files: [file] })) {
      try { await navigator.share({ title: title ?? 'Percorso 3D', text: 'DTrek — Vista 3D del percorso', files: [file] }); return } catch {}
    }
    const a = document.createElement('a')
    a.href = dataUrl; a.download = `dtrek-3d-${Date.now()}.png`; a.click()
    setShareToast('Screenshot salvato!'); setTimeout(() => setShareToast(''), 2500)
  }, [title])

  const handleStreetViewHere = useCallback(() => {
    const pts = gpsRef.current
    if (!pts.length) return
    const i0 = Math.min(Math.floor(progressRef.current * (pts.length - 1)), pts.length - 1)
    setStreetViewPos([pts[i0].lat!, pts[i0].lon!]); setShowStreetView(true)
  }, [])

  // ── Scrub ─────────────────────────────────────────────────────────────────────
  const handleScrub = useCallback((p: number) => {
    const pts = gpsRef.current
    if (!pts.length) return
    if (isPlayingRef.current) { isPlayingRef.current = false; setIsPlaying(false); cancelAnimationFrame(animRef.current) }
    progressRef.current = p; setProgress(p)
    const rawIdx = p * (pts.length - 1)
    const i0 = Math.min(Math.floor(rawIdx), pts.length - 1)
    const i1 = Math.min(i0 + 1, pts.length - 1)
    const frac = rawIdx - i0
    const lon = pts[i0].lon! + (pts[i1].lon! - pts[i0].lon!) * frac
    const lat = pts[i0].lat! + (pts[i1].lat! - pts[i0].lat!) * frac
    const alt = (pts[i0].altitudeMeters ?? 0) + ((pts[i1].altitudeMeters ?? 0) - (pts[i0].altitudeMeters ?? 0)) * frac
    markerRef.current?.setLngLat([lon, lat])
    setCurrentAlt(Math.round(alt))
    setCoveredKm(+(p * totalDistRef.current / 1000).toFixed(1))
    const lookIdx = Math.min(i0 + Math.max(3, Math.round(pts.length * 0.015)), pts.length - 1)
    const bear = bearingDeg(lat, lon, pts[lookIdx].lat!, pts[lookIdx].lon!)
    mapRef.current?.easeTo({ center: [lon, lat], bearing: bear, pitch: 68, zoom: 14.5, duration: 300 })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { handleScrubRef.current = handleScrub }, [handleScrub])

  // ── Video recording ───────────────────────────────────────────────────────────
  const startVideoRecording = useCallback(() => {
    const map = mapRef.current
    if (!map) return

    if (typeof MediaRecorder === 'undefined') {
      setShareToast('Registrazione video non supportata su questo browser')
      setTimeout(() => setShareToast(''), 3500)
      setVideoState('idle')
      return
    }

    // Pause normal animation, reset to start
    cancelAnimationFrame(animRef.current)
    isPlayingRef.current = false; setIsPlaying(false)
    progressRef.current = 0; setProgress(0)
    const pts = gpsRef.current
    if (pts.length < 2) return
    markerRef.current?.setLngLat([pts[0].lon!, pts[0].lat!])

    const mapCanvas = map.getCanvas()
    const srcW = mapCanvas.width
    const srcH = mapCanvas.height

    const [outW, outH] = VIDEO_DIMS[videoOrientation]
    const composite = document.createElement('canvas')
    composite.width = outW; composite.height = outH
    compositeCanvasRef.current = composite
    const ctx = composite.getContext('2d')!

    const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']
      .find(t => MediaRecorder.isTypeSupported(t)) ?? ''

    const stream = (composite as any).captureStream(30) as MediaStream
    const recorder = new MediaRecorder(stream, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: 10_000_000,  // 10 Mbps for social quality
    })
    videoChunksRef.current = []
    recorder.ondataavailable = (e: BlobEvent) => { if (e.data.size > 0) videoChunksRef.current.push(e.data) }
    recorder.onstop = () => {
      const blob = new Blob(videoChunksRef.current, { type: mimeType || 'video/webm' })
      setVideoRecordedBlob(blob); setVideoState('done')
    }
    mediaRecorderRef.current = recorder
    recorder.start(100)

    // ── Pre-compute body data series (sampled to 300 points) ─────────────────
    const N = pts.length
    const SAMPLES = Math.min(300, N)
    const step = (N - 1) / (SAMPLES - 1)

    const rawHr    = Array.from({ length: SAMPLES }, (_, i) => pts[Math.min(Math.round(i * step), N-1)].heartRateBpm ?? 0)
    const rawSpeed = Array.from({ length: SAMPLES }, (_, i) => {
      const idx = Math.min(Math.round(i * step), N-1)
      if (idx === 0) return 0
      const prev = Math.max(0, idx - 1)
      const t0 = pts[prev].time ? new Date(pts[prev].time!).getTime() : 0
      const t1 = pts[idx].time  ? new Date(pts[idx].time!).getTime()  : 0
      if (!t0 || !t1 || t1 <= t0) return 0
      return (distM(pts[prev].lat!, pts[prev].lon!, pts[idx].lat!, pts[idx].lon!) / ((t1 - t0) / 1000)) * 3.6
    })
    const smoothSpeed = smoothArray(rawSpeed, 4)

    const hrMax = Math.max(...rawHr); const hrMin = Math.min(...rawHr.filter(v => v > 0), hrMax)
    const spMax = Math.max(...smoothSpeed); const spMin = 0
    const hasHr    = hrMax > 0
    const hasSpeed = spMax > 0

    // ── Per-frame data ────────────────────────────────────────────────────────
    const totalKm     = totalDistRef.current / 1000
    const { gain: elevGain } = elevStatsRef.current
    const dpr         = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1
    const durationMs  = videoDuration * 1000
    const cr          = coverRect(srcW, srcH, outW, outH)
    let startTime     = 0

    const tick = (ts: number) => {
      if (!startTime) startTime = ts
      const p = Math.min(1, (ts - startTime) / durationMs)
      setVideoProgress(p)

      const rawIdx = p * (N - 1)
      const i0  = Math.floor(rawIdx)
      const i1  = Math.min(i0 + 1, N - 1)
      const frac = rawIdx - i0
      const lon = pts[i0].lon! + (pts[i1].lon! - pts[i0].lon!) * frac
      const lat = pts[i0].lat! + (pts[i1].lat! - pts[i0].lat!) * frac
      const alt = (pts[i0].altitudeMeters ?? 0) + ((pts[i1].altitudeMeters ?? 0) - (pts[i0].altitudeMeters ?? 0)) * frac

      markerRef.current?.setLngLat([lon, lat])

      // ── Bird's-eye camera: smooth bearing, closer zoom, higher pitch ────────
      // Use 4% lookahead for very smooth bearing transitions
      const lookIdx = Math.min(i0 + Math.max(20, Math.round(N * 0.04)), N - 1)
      const bear    = bearingDeg(lat, lon, pts[lookIdx].lat!, pts[lookIdx].lon!)
      // Zoom adapts to terrain altitude: higher mountains → zoom out slightly
      const zoom    = Math.max(13.0, Math.min(15.2, 15.2 - (alt / 2000)))
      map.easeTo({ center: [lon, lat], bearing: bear, pitch: 38, zoom, duration: 400 })

      // ── Draw composite frame ────────────────────────────────────────────────
      ctx.drawImage(mapCanvas, cr.sx, cr.sy, cr.sw, cr.sh, 0, 0, outW, outH)

      // Position marker dot (projected from map canvas space)
      const mp  = map.project([lon, lat] as [number, number])
      const px  = mp.x * dpr
      const py  = mp.y * dpr
      const cx  = ((px - cr.sx) / cr.sw) * outW
      const cy  = ((py - cr.sy) / cr.sh) * outH
      if (cx >= -20 && cx <= outW + 20 && cy >= -20 && cy <= outH + 20) {
        const ms = outW / 1080
        ctx.save()
        ctx.beginPath(); ctx.arc(cx, cy, 18 * ms, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(59,130,246,0.25)'; ctx.fill()
        ctx.beginPath(); ctx.arc(cx, cy, 9 * ms, 0, Math.PI * 2)
        ctx.fillStyle = '#3b82f6'; ctx.fill()
        ctx.strokeStyle = 'white'; ctx.lineWidth = 3 * ms; ctx.stroke()
        ctx.restore()
      }

      // Body data for this frame
      const si = Math.min(Math.round(p * (SAMPLES - 1)), SAMPLES - 1)
      const hrData: GraphData | undefined = (hasHr && videoShowBody) ? {
        series: rawHr, label: 'BPM', icon: '♥', strokeColor: '#ef4444',
        fillColor: 'rgba(239,68,68,0.28)', minVal: Math.max(0, hrMin - 5),
        maxVal: hrMax + 5, currentValue: rawHr[si],
      } : undefined
      const speedData: GraphData | undefined = (hasSpeed && videoShowBody) ? {
        series: smoothSpeed, label: 'km/h', icon: '⚡', strokeColor: '#60a5fa',
        fillColor: 'rgba(96,165,250,0.28)', minVal: spMin, maxVal: spMax + 1,
        currentValue: smoothSpeed[si],
      } : undefined

      drawHUD(ctx, outW, outH, {
        showTitle:    videoShowTitle,
        title:        title ?? '',
        showStats:    videoShowStats,
        coveredKm:    +(p * totalKm).toFixed(1),
        totalKm:      +totalKm.toFixed(1),
        alt:          Math.round(alt),
        elevGain,
        showProgress: videoShowProgress,
        progress:     p,
        showBody:     videoShowBody,
        hrData,
        speedData,
      })

      if (p < 1) { videoAnimRef.current = requestAnimationFrame(tick) }
      else { recorder.stop() }
    }

    setVideoState('recording')
    videoAnimRef.current = requestAnimationFrame(tick)
  }, [videoDuration, videoOrientation, videoShowTitle, videoShowStats, videoShowProgress, videoShowBody, title])

  const cancelVideoRecording = useCallback(() => {
    cancelAnimationFrame(videoAnimRef.current)
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = null
      mediaRecorderRef.current.stop()
    }
    mediaRecorderRef.current = null; compositeCanvasRef.current = null
    setVideoState('idle'); setVideoProgress(0); setVideoRecordedBlob(null)
  }, [])

  const handleVideoDownload = useCallback(() => {
    if (!videoRecordedBlob) return
    const ext = videoRecordedBlob.type.includes('mp4') ? 'mp4' : 'webm'
    const url = URL.createObjectURL(videoRecordedBlob)
    if (videoObjUrlRef.current) URL.revokeObjectURL(videoObjUrlRef.current)
    videoObjUrlRef.current = url
    const a = document.createElement('a')
    a.href = url; a.download = `dtrek-3d-${Date.now()}.${ext}`; a.click()
    setShareToast('Video salvato!'); setTimeout(() => setShareToast(''), 2500)
  }, [videoRecordedBlob])

  const handleVideoShare = useCallback(async () => {
    if (!videoRecordedBlob) return
    const ext = videoRecordedBlob.type.includes('mp4') ? 'mp4' : 'webm'
    const file = new File([videoRecordedBlob], `dtrek-3d-${Date.now()}.${ext}`, { type: videoRecordedBlob.type })
    if (typeof navigator !== 'undefined' && (navigator as any).canShare?.({ files: [file] })) {
      try {
        await navigator.share({ title: title ?? 'Percorso DTrek', text: 'DTrek — Video 3D del percorso', files: [file] })
        setVideoState('idle'); setVideoRecordedBlob(null); return
      } catch {}
    }
    handleVideoDownload()
  }, [videoRecordedBlob, title, handleVideoDownload])

  // ─────────────────────────────────────────────────────────────────────────────
  const totalKm = +(totalDistRef.current / 1000).toFixed(1)

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col" style={{ touchAction: 'none' }}>

      {/* Map canvas */}
      <div ref={containerRef} className="flex-1 w-full h-full" />

      {/* ── Top bar ── */}
      <div className="absolute top-0 inset-x-0 pointer-events-none">
        <div className="flex items-start justify-between p-3 bg-gradient-to-b from-black/65 to-transparent">

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

          <div className="flex items-center gap-2 pointer-events-auto mt-0.5">
            <button onClick={handleStreetViewHere} title="Foto della zona"
              className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md hover:bg-black/75 flex items-center justify-center text-white transition-colors shadow-lg">
              <Images style={{ width: '1.1rem', height: '1.1rem' }} />
            </button>
            <button onClick={() => setVideoState('config')} title="Registra video"
              className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md hover:bg-black/75 flex items-center justify-center text-white transition-colors shadow-lg">
              <Film style={{ width: '1.1rem', height: '1.1rem' }} />
            </button>
            <button onClick={handleCapture} title="Condividi screenshot"
              className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md hover:bg-black/75 flex items-center justify-center text-white transition-colors shadow-lg">
              <Camera style={{ width: '1.1rem', height: '1.1rem' }} />
            </button>
            <button onClick={onClose}
              className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md hover:bg-black/75 flex items-center justify-center text-white transition-colors shadow-lg">
              <X className="w-5 h-5" />
            </button>
          </div>
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
          {weatherBadge && (
            <div className="flex items-center gap-2 pt-1 border-t border-white/10">
              <span className="text-base leading-none shrink-0">{weatherBadge.emoji}</span>
              <span className="text-[11px] text-white/55 flex-1 truncate">{weatherBadge.label}</span>
              <span className="text-sm font-bold tabular-nums">{weatherBadge.temp}°</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Elevation profile / Progress bar ── */}
      <div className="absolute left-3 right-3" style={{ bottom: '92px' }}>
        <div className="relative">
          {altitudeSeries.length > 1 ? (() => {
            const minAlt  = Math.min(...altitudeSeries)
            const maxAlt  = Math.max(...altitudeSeries)
            const range   = maxAlt - minAlt || 1
            const H = 56
            const polyPts = altitudeSeries.map((a, i) => {
              const x = ((i / (altitudeSeries.length - 1)) * 1000).toFixed(0)
              const y = (H - ((a - minAlt) / range) * (H - 6)).toFixed(1)
              return `${x},${y}`
            }).join(' ')
            const cursorX = (progress * 1000).toFixed(1)
            return (
              <div className="w-full rounded-xl overflow-hidden backdrop-blur-sm bg-black/30 border border-white/10" style={{ height: `${H}px` }}>
                <svg viewBox={`0 0 1000 ${H}`} preserveAspectRatio="none" className="w-full h-full">
                  <defs>
                    <linearGradient id="elevGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.45" />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.08" />
                    </linearGradient>
                  </defs>
                  <polygon points={`0,${H} ${polyPts} 1000,${H}`} fill="url(#elevGrad)" />
                  <polyline points={polyPts} fill="none" stroke="#93c5fd" strokeWidth="2.5" strokeLinejoin="round" />
                  <line x1={cursorX} y1="0" x2={cursorX} y2={H}
                    stroke="white" strokeWidth="2" strokeDasharray="4,3" opacity="0.75" />
                </svg>
              </div>
            )
          })() : (
            <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden backdrop-blur-sm">
              <div className="h-full rounded-full transition-none"
                style={{ width: `${progress * 100}%`, background: 'linear-gradient(90deg,#3b82f6,#60a5fa)' }} />
            </div>
          )}
          <input type="range" min={0} max={1} step={0.0005} value={progress}
            onChange={e => handleScrub(+e.target.value)}
            className="absolute w-full opacity-0 cursor-pointer"
            style={{ height: '64px', top: '50%', transform: 'translateY(-50%)' }} />
        </div>
        <div className="flex justify-between mt-1 text-[10px] font-medium px-0.5">
          <span className="text-white/50">0 km</span>
          {altitudeSeries.length > 0 && (
            <span className="text-blue-300">{currentAlt} m slm</span>
          )}
          <span className="text-white/50">{totalKm} km</span>
        </div>
      </div>

      {/* ── Bottom controls ── */}
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent pt-8 pb-5 px-4">
        <div className="max-w-sm mx-auto flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <button onClick={reset}
              className="w-11 h-11 rounded-full bg-white/15 hover:bg-white/30 flex items-center justify-center text-white transition-colors border border-white/10">
              <RotateCcw className="w-4 h-4" />
            </button>
            <button onClick={handlePlay} disabled={!mapReady}
              className="w-16 h-16 rounded-full bg-white flex items-center justify-center text-stone-900 shadow-2xl hover:bg-stone-100 active:scale-95 transition-all disabled:opacity-35">
              {isPlaying ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7 translate-x-0.5" />}
            </button>
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
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-white/50 whitespace-nowrap font-medium">Rilievo</span>
            <input type="range" min={1} max={3} step={0.1} value={exaggeration}
              onChange={e => setExaggeration(+e.target.value)}
              className="flex-1 h-1.5 rounded-full accent-blue-400 cursor-pointer" />
            <span className="text-[11px] text-white font-bold w-8 text-right">{exaggeration.toFixed(1)}×</span>
          </div>
        </div>
      </div>

      {/* ── Loading overlay ── */}
      {!mapReady && videoState === 'idle' && (
        <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center gap-4 text-white">
          <div className="w-12 h-12 rounded-full border-2 border-white/20 border-t-white animate-spin" />
          <p className="text-sm font-medium text-white/70">Caricamento mappa 3D…</p>
        </div>
      )}

      {shareToast && (
        <div className="absolute bottom-32 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-md text-stone-800 text-sm font-semibold px-4 py-2 rounded-full shadow-xl pointer-events-none">
          ✓ {shareToast}
        </div>
      )}

      {showStreetView && streetViewPos && (
        <StreetViewPanel lat={streetViewPos[0]} lon={streetViewPos[1]} title={title} onClose={() => setShowStreetView(false)} />
      )}

      {/* ══ VIDEO CONFIG ════════════════════════════════════════════════════════ */}
      {videoState === 'config' && (
        <div className="absolute inset-0 bg-black/55 backdrop-blur-sm flex items-end z-20 pointer-events-auto">
          <div className="w-full bg-stone-900/96 rounded-t-3xl px-5 pt-5 pb-8 shadow-2xl space-y-5">

            <div className="flex items-center justify-between">
              <h2 className="text-white font-bold text-lg">Registra video</h2>
              <button onClick={() => setVideoState('idle')} className="text-white/50 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Map style */}
            <div>
              <p className="text-white/45 text-[11px] font-semibold mb-2 tracking-wider">STILE MAPPA</p>
              <div className="flex gap-2">
                {STYLES.map((s, i) => (
                  <button key={s.label} onClick={() => switchStyle(i)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all
                      ${styleIdx === i ? 'bg-white text-stone-900' : 'bg-white/10 text-white/70 hover:bg-white/20'}`}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Duration */}
            <div>
              <p className="text-white/45 text-[11px] font-semibold mb-2 tracking-wider">DURATA</p>
              <div className="flex gap-2">
                {[15, 30, 60, 90].map(d => (
                  <button key={d} onClick={() => setVideoDuration(d)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all
                      ${videoDuration === d ? 'bg-blue-500 text-white' : 'bg-white/10 text-white/70 hover:bg-white/20'}`}>
                    {d}s
                  </button>
                ))}
              </div>
            </div>

            {/* Orientation */}
            <div>
              <p className="text-white/45 text-[11px] font-semibold mb-2 tracking-wider">FORMATO</p>
              <div className="flex gap-2">
                {(['9:16', '16:9', '1:1'] as const).map(o => (
                  <button key={o} onClick={() => setVideoOrientation(o)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all
                      ${videoOrientation === o ? 'bg-blue-500 text-white' : 'bg-white/10 text-white/70 hover:bg-white/20'}`}>
                    {o}
                  </button>
                ))}
              </div>
            </div>

            {/* Elements */}
            <div>
              <p className="text-white/45 text-[11px] font-semibold mb-2 tracking-wider">ELEMENTI NEL VIDEO</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Titolo',       val: videoShowTitle,    set: setVideoShowTitle,    always: true },
                  { label: 'Statistiche',  val: videoShowStats,    set: setVideoShowStats,    always: true },
                  { label: 'Progresso',    val: videoShowProgress, set: setVideoShowProgress, always: true },
                  { label: 'Dati corporei',val: videoShowBody,     set: setVideoShowBody,     always: hasBodyData },
                ].map(item => (
                  <button key={item.label}
                    onClick={() => item.always && item.set(v => !v)}
                    disabled={!item.always}
                    className={`py-2.5 rounded-xl text-sm font-semibold transition-all
                      ${!item.always ? 'opacity-30 cursor-not-allowed bg-white/5 text-white/40'
                        : item.val ? 'bg-white text-stone-900' : 'bg-white/10 text-white/60 hover:bg-white/20'}`}>
                    {item.label}
                    {!item.always && <span className="block text-[10px] font-normal opacity-60">non disponibile</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* Quality note */}
            <p className="text-white/35 text-[11px] text-center">
              Video 1080p · 10 Mbps · {videoOrientation}
            </p>

            {/* Actions */}
            <div className="flex gap-3">
              <button onClick={() => setVideoState('idle')}
                className="flex-1 py-3.5 rounded-2xl bg-white/10 text-white font-semibold hover:bg-white/20 transition-colors">
                Annulla
              </button>
              <button onClick={startVideoRecording}
                className="flex-[2] py-3.5 rounded-2xl bg-red-500 hover:bg-red-600 text-white font-bold flex items-center justify-center gap-2 transition-colors">
                <div className="w-3 h-3 rounded-full bg-white animate-pulse" />
                Registra
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ RECORDING OVERLAY ═══════════════════════════════════════════════════ */}
      {videoState === 'recording' && (
        <div className="absolute inset-0 z-20 pointer-events-none flex flex-col">
          <div className="flex items-center justify-between p-4 pointer-events-auto">
            <div className="flex items-center gap-2 bg-black/65 backdrop-blur-md rounded-full px-3 py-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-white text-xs font-bold tracking-widest">REC</span>
              <span className="text-white/70 text-xs tabular-nums">{Math.round(videoProgress * videoDuration)}s / {videoDuration}s</span>
            </div>
            <button onClick={cancelVideoRecording}
              className="bg-black/65 backdrop-blur-md hover:bg-black/85 text-white text-xs font-semibold px-3 py-1.5 rounded-full transition-colors pointer-events-auto">
              Annulla
            </button>
          </div>
          <div className="mt-auto mx-0 mb-0">
            <div className="w-full h-1 bg-white/20">
              <div className="h-full bg-red-500 transition-none" style={{ width: `${videoProgress * 100}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* ══ DONE PANEL ══════════════════════════════════════════════════════════ */}
      {videoState === 'done' && (
        <div className="absolute inset-0 bg-black/65 backdrop-blur-sm flex items-center justify-center z-20 pointer-events-auto">
          <div className="bg-stone-900/96 rounded-3xl px-6 py-7 mx-4 w-full max-w-sm shadow-2xl space-y-5">
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-green-500/15 flex items-center justify-center mx-auto mb-3">
                <Film className="w-7 h-7 text-green-400" />
              </div>
              <h2 className="text-white font-bold text-lg">Video pronto!</h2>
              <p className="text-white/50 text-sm mt-1">1080p · {videoDuration}s · {videoOrientation}</p>
            </div>
            <div className="flex flex-col gap-2.5">
              <button onClick={handleVideoShare}
                className="w-full py-3.5 rounded-2xl bg-blue-500 hover:bg-blue-600 text-white font-bold flex items-center justify-center gap-2 transition-colors">
                <Share2 className="w-4 h-4" />Condividi
              </button>
              <button onClick={handleVideoDownload}
                className="w-full py-3.5 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-semibold flex items-center justify-center gap-2 transition-colors">
                <Download className="w-4 h-4" />Scarica
              </button>
            </div>
            <div className="flex gap-2.5">
              <button onClick={() => { setVideoState('config'); setVideoRecordedBlob(null); setVideoProgress(0) }}
                className="flex-1 py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white text-sm font-semibold transition-colors">
                Ricomincia
              </button>
              <button onClick={() => { setVideoState('idle'); setVideoRecordedBlob(null); setVideoProgress(0) }}
                className="flex-1 py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white text-sm font-semibold transition-colors">
                Chiudi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
