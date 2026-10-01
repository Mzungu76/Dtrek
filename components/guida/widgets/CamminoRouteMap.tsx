'use client'
import 'leaflet/dist/leaflet.css'
import type * as L from 'leaflet'
import { useEffect, useRef, useState } from 'react'
import { Lock, LockOpen } from 'lucide-react'
import { POI_META, type PoiItem } from '@/lib/overpass'

// Mappa del cammino (docs/piano-cammini.md, Fase 5): una linea per tappa, colorata per giornata, con
// la tappa attiva evidenziata; in una singola tappa mostra anche i luoghi lungo la strada. Parte
// "bloccata" (la pagina scorre senza intrappolare il dito) e si sblocca con il lucchetto.

export interface RouteMapLine {
  id: number
  points: [number, number][]
  color: string
  /** Etichetta sul punto di partenza (es. numero tappa). */
  label?: string
}

interface Props {
  lines: RouteMapLine[]
  activeId?: number | null
  pois?: PoiItem[]
  height?: number
  onSelectLine?: (id: number) => void
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c])
}

export default function CamminoRouteMap({ lines, activeId = null, pois, height = 240, onSelectLine }: Props) {
  const elRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const leafletRef = useRef<typeof L | null>(null)
  const [ready, setReady] = useState(false)
  const [locked, setLocked] = useState(true)
  const onSelectRef = useRef(onSelectLine)
  onSelectRef.current = onSelectLine

  useEffect(() => {
    if (!elRef.current || mapRef.current) return
    let ro: ResizeObserver | null = null
    import('leaflet').then(Lf => {
      if (!elRef.current || mapRef.current) return
      leafletRef.current = Lf
      const map = Lf.map(elRef.current, { zoomControl: false, dragging: false, touchZoom: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false })
        .setView([42.5, 12.5], 6)
      Lf.tileLayer('/api/tile?z={z}&x={x}&y={y}&style=light', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(map)
      layerRef.current = Lf.layerGroup().addTo(map)
      mapRef.current = map
      ro = new ResizeObserver(() => map.invalidateSize())
      ro.observe(elRef.current)
      setReady(true)
    })
    return () => {
      ro?.disconnect()
      mapRef.current?.remove()
      mapRef.current = null
      layerRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const fn = locked ? 'disable' : 'enable'
    map.dragging[fn](); map.touchZoom[fn](); map.doubleClickZoom[fn]()
  }, [locked, ready])

  useEffect(() => {
    const Lf = leafletRef.current, map = mapRef.current, layer = layerRef.current
    if (!Lf || !map || !layer) return
    layer.clearLayers()
    const all: [number, number][] = []
    // Prima le linee non attive, poi quella attiva sopra, più spessa.
    const ordered = [...lines].sort((a, b) => Number(a.id === activeId) - Number(b.id === activeId))
    for (const line of ordered) {
      if (line.points.length < 2) continue
      const active = activeId == null || line.id === activeId
      all.push(...line.points)
      const pl = Lf.polyline(line.points, { color: line.color, weight: line.id === activeId ? 6 : 4, opacity: active ? 0.95 : 0.4 }).addTo(layer)
      if (onSelectRef.current) pl.on('click', () => onSelectRef.current?.(line.id))
      if (line.label) {
        Lf.marker(line.points[0], {
          icon: Lf.divIcon({
            className: '',
            html: `<div style="width:20px;height:20px;border-radius:50%;background:${line.color};color:#fff;font:700 10px system-ui;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.35)">${escapeHtml(line.label)}</div>`,
            iconSize: [20, 20], iconAnchor: [10, 10],
          }),
          interactive: false,
        }).addTo(layer)
      }
    }
    for (const poi of pois ?? []) {
      const meta = POI_META[poi.type]
      Lf.marker([poi.lat, poi.lon], {
        icon: Lf.divIcon({
          className: '',
          html: `<div style="width:24px;height:24px;border-radius:50%;background:#fff;border:2px solid ${meta?.color ?? '#6b7280'};font-size:12px;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,.3)">${meta?.emoji ?? '•'}</div>`,
          iconSize: [24, 24], iconAnchor: [12, 12],
        }),
      }).bindPopup(`<div style="font:600 12px system-ui">${escapeHtml(poi.name ?? meta?.label ?? 'Luogo')}</div><div style="font:11px system-ui;color:#6b7280">${escapeHtml(meta?.label ?? '')} · a ${Math.round(poi.distFromTrack)} m</div>`).addTo(layer)
    }
    if (all.length > 0) {
      const focus = activeId != null ? lines.find(l => l.id === activeId)?.points : null
      map.fitBounds(Lf.latLngBounds(focus && focus.length > 1 ? focus : all), { padding: [24, 24], animate: false })
    }
  }, [lines, activeId, pois, ready])

  return (
    <div className="relative rounded-xl overflow-hidden border border-stone-200" style={{ height }}>
      <div ref={elRef} className="absolute inset-0" />
      <button type="button" onClick={() => setLocked(v => !v)} aria-label={locked ? 'Sblocca la mappa per muoverla' : 'Blocca la mappa'}
        className="absolute right-2 top-2 z-[500] w-9 h-9 rounded-full bg-white/95 border border-stone-200 shadow flex items-center justify-center text-stone-600">
        {locked ? <Lock className="w-4 h-4" /> : <LockOpen className="w-4 h-4" />}
      </button>
    </div>
  )
}
