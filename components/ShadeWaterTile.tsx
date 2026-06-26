'use client'
import { useEffect, useRef, useState } from 'react'
import { Sun, Waves } from 'lucide-react'
import type { Sentinel2Data } from '@/lib/cl/types'
import { ScoreTile } from '@/components/ScoreTile'

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

export function ShadeWaterTile({ data, loading }: { data: Sentinel2Data | null; loading?: boolean }) {
  const [open, setOpen] = useState(false)

  if (loading) {
    return (
      <div className="rounded-2xl border border-stone-200 shadow-sm overflow-hidden animate-pulse">
        <div className="px-4 py-3.5 bg-stone-50 h-16" />
      </div>
    )
  }

  if (!data || !data.available) return null

  const hasShade = data.shadeScore != null
  const score = hasShade ? Math.round(data.shadeScore! * 100) : '—'
  const label = hasShade
    ? (data.shadeScore! < 0.33 ? 'Poco ombreggiato' : data.shadeScore! < 0.66 ? 'Parziale' : 'Molto ombreggiato')
    : 'Acqua'

  return (
    <ScoreTile
      title="Ombra e acqua"
      score={score}
      label={label}
      color="#0ea5e9"
      badge="H₂O"
      open={open}
      onToggle={() => setOpen(v => !v)}
    >
      <div className="space-y-4">
        {hasShade && <ShadeBar score={data.shadeScore!} />}
        <WaterSourcesSection data={data} />
      </div>
    </ScoreTile>
  )
}
