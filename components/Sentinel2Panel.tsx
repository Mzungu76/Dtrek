'use client'
import { useEffect, useRef } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, ReferenceLine,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Flame, Droplets, Mountain, Sun, Waves, TreePine } from 'lucide-react'
import type { Sentinel2Data } from '@/lib/si/types'

const MONTH_LABEL = Array.from({ length: 12 }, (_, i) => format(new Date(2024, i, 1), 'MMM', { locale: it }))

interface Props {
  data: Sentinel2Data | null
  loading?: boolean
}

// ── Phenology chart ───────────────────────────────────────────────────────────

function PhenologyChart({ data }: { data: Sentinel2Data }) {
  if (!data.ndviMonthly) return null
  const chartData = data.ndviMonthly.map((ndvi, i) => ({ month: MONTH_LABEL[i], ndvi: Math.round(ndvi * 1000) / 1000 }))
  const peakLabel = data.phenologyPeakMonth ? MONTH_LABEL[data.phenologyPeakMonth - 1] : null

  const insights: string[] = []
  if (peakLabel) insights.push(`Picco di vegetazione a ${peakLabel}`)
  if (data.ndviDelta != null && data.ndviDelta < -0.1) insights.push('Calo recente della vegetazione rispetto alla media stagionale')
  else if (data.ndviDelta != null && data.ndviDelta > 0.1) insights.push('Vegetazione in forte crescita rispetto alla media stagionale')
  if (data.landscapeVariety != null) {
    insights.push(data.landscapeVariety > 0.12 ? 'Paesaggio molto variegato lungo il percorso' : 'Paesaggio piuttosto uniforme lungo il percorso')
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-stone-700">Fenologia della vegetazione</p>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="ndviGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#277134" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#277134" stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e8e4dc" />
            <XAxis dataKey="month" tick={{ fontSize: 11, fontFamily: 'DM Sans' }} tickLine={false} />
            <YAxis domain={[0, 1]} tick={{ fontSize: 11, fontFamily: 'DM Sans' }} tickLine={false} axisLine={false} width={36} />
            <Tooltip
              formatter={(v: number) => [v.toFixed(2), 'NDVI']}
              contentStyle={{ borderRadius: 8, border: '1px solid #e8e4dc', fontSize: 13 }}
            />
            {peakLabel && <ReferenceLine x={peakLabel} stroke="#277134" strokeDasharray="4 4" />}
            <Area type="monotone" dataKey="ndvi" stroke="#277134" strokeWidth={2} fill="url(#ndviGrad)" dot={false} activeDot={{ r: 4 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {insights.length > 0 && (
        <ul className="text-xs text-stone-500 space-y-0.5">
          {insights.map((t, i) => <li key={i}>• {t}</li>)}
        </ul>
      )}
    </div>
  )
}

// ── Environmental alerts ──────────────────────────────────────────────────────

function EnvironmentalAlerts({ data }: { data: Sentinel2Data }) {
  const alerts: Array<{ icon: React.ReactNode; text: string; bg: string; fg: string }> = []
  if (data.fireDetected) alerts.push({ icon: <Flame className="w-4 h-4" />, text: 'Possibile area incendiata rilevata via satellite', bg: 'bg-red-50', fg: 'text-red-700' })
  if (data.floodDetected) alerts.push({ icon: <Droplets className="w-4 h-4" />, text: 'Possibile area alluvionata rilevata via satellite', bg: 'bg-blue-50', fg: 'text-blue-700' })
  if (data.landslideRisk) alerts.push({ icon: <Mountain className="w-4 h-4" />, text: 'Possibile rischio frana rilevato via satellite', bg: 'bg-amber-50', fg: 'text-amber-700' })
  if (alerts.length === 0) return null

  return (
    <div className="space-y-2">
      {alerts.map((a, i) => (
        <div key={i} className={`flex items-center gap-2 rounded-lg px-3 py-2 ${a.bg} ${a.fg}`}>
          {a.icon}
          <p className="text-xs font-medium">{a.text}</p>
        </div>
      ))}
    </div>
  )
}

// ── Shade bar ──────────────────────────────────────────────────────────────────

function ShadeBar({ score }: { score: number }) {
  const pct = Math.round(score * 100)
  const label = score < 0.33 ? 'Poco ombreggiato' : score < 0.66 ? 'Parzialmente ombreggiato' : 'Molto ombreggiato'

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-stone-500">
        <span className="flex items-center gap-1.5"><Sun className="w-3.5 h-3.5" /> Ombra stimata in estate</span>
        <span className="font-semibold text-stone-700">{label}</span>
      </div>
      <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// ── Water sources mini-map ────────────────────────────────────────────────────

function WaterSourcesMiniMap({ points }: { points: Array<{ lat: number; lon: number }> }) {
  const mapRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstance = useRef<any>(null)

  useEffect(() => {
    if (!mapRef.current || points.length === 0) return

    let cancelled = false
    import('leaflet').then(L => {
      if (cancelled || !mapRef.current) return

      const map = L.map(mapRef.current, {
        zoomControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
        touchZoom: false,
      })
      mapInstance.current = map

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(map)

      const markers = points.map(p => L.circleMarker([p.lat, p.lon], { radius: 6, color: '#0284c7', fillColor: '#38bdf8', fillOpacity: 1, weight: 2 }).addTo(map))
      if (markers.length === 1) {
        map.setView([points[0].lat, points[0].lon], 15)
      } else {
        const bounds = L.latLngBounds(points.map(p => [p.lat, p.lon] as [number, number]))
        map.fitBounds(bounds, { padding: [20, 20] })
      }
    })

    if (!document.querySelector('#leaflet-css')) {
      const link = document.createElement('link')
      link.id = 'leaflet-css'
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)
    }

    return () => {
      cancelled = true
      if (mapInstance.current) {
        mapInstance.current.remove()
        mapInstance.current = null
      }
    }
  }, [points])

  return <div ref={mapRef} style={{ height: '200px' }} className="rounded-xl overflow-hidden border border-stone-200" />
}

function WaterSourcesSection({ data }: { data: Sentinel2Data }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-stone-700 flex items-center gap-1.5"><Waves className="w-4 h-4 text-sky-500" /> Sorgenti d&apos;acqua rilevate</p>
      {data.waterSources.length > 0
        ? <WaterSourcesMiniMap points={data.waterSources} />
        : <p className="text-xs text-stone-400">Nessuna sorgente d&apos;acqua rilevata lungo il percorso.</p>}
    </div>
  )
}

// ── Main panel ─────────────────────────────────────────────────────────────────

export function Sentinel2Panel({ data, loading }: Props) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-stone-200 shadow-sm p-5 animate-pulse">
        <div className="h-48 bg-stone-50 rounded-xl" />
      </div>
    )
  }

  if (!data || !data.available) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-stone-50 px-5 py-4">
        <p className="text-sm text-stone-500">
          Dati satellitari non disponibili — configura le credenziali Copernicus nelle variabili d&apos;ambiente.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-stone-200 shadow-sm p-5 space-y-5">
      <PhenologyChart data={data} />
      <EnvironmentalAlerts data={data} />
      {data.shadeScore != null && <ShadeBar score={data.shadeScore} />}
      <WaterSourcesSection data={data} />
      {data.landscapeVariety != null && (
        <div className="flex items-center justify-between text-xs text-stone-500 pt-1 border-t border-stone-100">
          <span className="flex items-center gap-1.5"><TreePine className="w-3.5 h-3.5 text-emerald-600" /> Varietà del paesaggio</span>
          {/* V_geo component of TEI */}
          <span className="font-semibold text-stone-700">{data.landscapeVariety.toFixed(2)}</span>
        </div>
      )}
    </div>
  )
}
