'use client'
import { useEffect, useRef, useState } from 'react'
import type { TrackPoint } from '@/lib/tcxParser'
import type { PoiItem } from '@/lib/overpass'
import { POI_META, buildPoiPopupHtml } from '@/lib/overpass'
import type { WikiPage } from '@/lib/wikipedia'
import type { ClassifiedDifficultyMarker } from '@/lib/difficultyMarkers'
import type { TrailDtmProfile } from '@/lib/dtm/trailDtmProfile'
import { colorSegmentsByDtm, aspectDegToColor } from '@/lib/dtm/dtmColors'

interface Props {
  trackPoints: TrackPoint[]
  height?: string
  showGradient?: boolean
  showAspect?: boolean
  dtmProfile?: TrailDtmProfile
  pois?: PoiItem[]
  wikiPages?: WikiPage[]
  difficultyMarkers?: ClassifiedDifficultyMarker[]
  planned?: boolean
}

const DTM_MATCH_RADIUS_M = 25

const SEVERITY_COLOR: Record<ClassifiedDifficultyMarker['severity'], string> = {
  danger: '#dc2626',
  warning: '#f59e0b',
  info: '#3b82f6',
}

const SEVERITY_EMOJI: Record<ClassifiedDifficultyMarker['severity'], string> = {
  danger: '⚠️',
  warning: '⚠️',
  info: 'ℹ️',
}

// Slope → color (green=easy, yellow=moderate, orange=steep, red=extreme)
function slopeColor(pct: number): string {
  const a = Math.abs(pct)
  if (a < 8)  return '#22c55e'
  if (a < 15) return '#eab308'
  if (a < 25) return '#f97316'
  return '#ef4444'
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const f1 = lat1 * Math.PI / 180, f2 = lat2 * Math.PI / 180
  const df = (lat2 - lat1) * Math.PI / 180
  const dl = (lon2 - lon1) * Math.PI / 180
  const a  = Math.sin(df / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export default function MapView({
  trackPoints,
  height = '400px',
  showGradient = false,
  showAspect = false,
  dtmProfile,
  pois = [],
  wikiPages = [],
  difficultyMarkers = [],
  planned = false,
}: Props) {
  const mapRef          = useRef<HTMLDivElement>(null)
  const mapInstance     = useRef<any>(null)
  const poiLayer        = useRef<any[]>([])
  const wikiLayer       = useRef<any[]>([])
  const difficultyLayer = useRef<any[]>([])
  const [mapReady, setMapReady] = useState(false)

  // Main map init effect
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return

    const points = trackPoints.filter(p => p.lat !== undefined && p.lon !== undefined)
    if (points.length === 0) return

    import('leaflet').then(L => {
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      const coords: [number, number][] = points.map(p => [p.lat!, p.lon!])
      const map = L.map(mapRef.current!).setView(coords[0], 14)
      mapInstance.current = map
      setMapReady(true)

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map)

      const baseColor = planned ? '#0ea5e9' : '#378d44'
      const dtmActive = dtmProfile?.source === 'lidar1m'
      const latLons = coords.map(([lat, lon]) => ({ lat, lon }))

      if (showAspect && dtmActive) {
        // Draw per-segment aspect-colored polylines (DTM-only — no GPX fallback exists for exposure)
        const aspectColors = colorSegmentsByDtm(latLons, dtmProfile!, 'aspect', DTM_MATCH_RADIUS_M)
        for (let i = 0; i < coords.length - 1; i++) {
          L.polyline([coords[i], coords[i + 1]], {
            color: aspectColors[i] ?? '#9ca3af',
            weight: 4,
            opacity: 0.9,
          }).addTo(map)
        }
        const AspectLegend = L.Control.extend({
          onAdd(): HTMLElement {
            const d = L.DomUtil.create('div', '')
            d.style.cssText = 'background:white;padding:6px 10px;border-radius:8px;font-size:11px;line-height:1.6;box-shadow:0 1px 4px rgba(0,0,0,0.2)'
            d.innerHTML = [
              '<b>Esposizione</b>',
              `<span style="color:${aspectDegToColor(0)}">■</span> N`,
              `<span style="color:${aspectDegToColor(90)}">■</span> E`,
              `<span style="color:${aspectDegToColor(180)}">■</span> S`,
              `<span style="color:${aspectDegToColor(270)}">■</span> O`,
            ].join('<br>')
            return d
          },
        })
        new AspectLegend({ position: 'bottomright' }).addTo(map)
      } else if (showGradient && points.some(p => p.altitudeMeters !== undefined)) {
        // Draw per-segment colored polylines — DTM slope where a sample is close enough,
        // GPX net-elevation-delta fallback per pair otherwise (degrades per-segment, not the whole toggle)
        const slopeColors = dtmActive ? colorSegmentsByDtm(latLons, dtmProfile!, 'slope', DTM_MATCH_RADIUS_M) : null
        for (let i = 0; i < coords.length - 1; i++) {
          let color = slopeColors?.[i] ?? null
          if (!color) {
            const p1 = points[i], p2 = points[i + 1]
            const dist = haversineM(p1.lat!, p1.lon!, p2.lat!, p2.lon!)
            const dEle = ((p2.altitudeMeters ?? p1.altitudeMeters ?? 0) - (p1.altitudeMeters ?? 0))
            const slopePct = dist > 0 ? (dEle / dist) * 100 : 0
            color = slopeColor(slopePct)
          }
          L.polyline([coords[i], coords[i + 1]], {
            color,
            weight: 4,
            opacity: 0.9,
          }).addTo(map)
        }
        // Legend: degree buckets (matching lib/trailScore.ts's slopeTerrainMult) when DTM is
        // live, otherwise the existing percent buckets used by the GPX-only fallback.
        const LegendControl = L.Control.extend({
          onAdd(): HTMLElement {
            const d = L.DomUtil.create('div', '')
            d.style.cssText = 'background:white;padding:6px 10px;border-radius:8px;font-size:11px;line-height:1.6;box-shadow:0 1px 4px rgba(0,0,0,0.2)'
            d.innerHTML = dtmActive
              ? [
                  '<b>Pendenza</b>',
                  '<span style="color:#22c55e">■</span> &lt;10°',
                  '<span style="color:#eab308">■</span> 10-20°',
                  '<span style="color:#f97316">■</span> 20-30°',
                  '<span style="color:#ef4444">■</span> 30-40°',
                  '<span style="color:#7f1d1d">■</span> &gt;40°',
                ].join('<br>')
              : [
                  '<b>Pendenza</b>',
                  '<span style="color:#22c55e">■</span> &lt;8%',
                  '<span style="color:#eab308">■</span> 8-15%',
                  '<span style="color:#f97316">■</span> 15-25%',
                  '<span style="color:#ef4444">■</span> &gt;25%',
                ].join('<br>')
            return d
          },
        })
        new LegendControl({ position: 'bottomright' }).addTo(map)
      } else {
        const polyline = L.polyline(coords, {
          color: baseColor,
          weight: 4,
          opacity: 0.85,
          smoothFactor: 1.5,
        }).addTo(map)
        map.fitBounds(polyline.getBounds(), { padding: [20, 20] })
      }

      // Always fit bounds (for gradient/aspect mode, fit after drawing segments)
      if (showGradient || showAspect) {
        map.fitBounds(L.polyline(coords).getBounds(), { padding: [20, 20] })
      }

      // Start / end markers (always shown)
      const mkIcon = (label: string, color: string) => L.divIcon({
        html: `<div style="background:${color};color:white;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:bold;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)">${label}</div>`,
        iconSize: [28, 28], iconAnchor: [14, 14], className: '',
      })

      L.marker(coords[0], { icon: mkIcon('S', baseColor) }).addTo(map).bindPopup('Partenza')
      L.marker(coords[coords.length - 1], { icon: mkIcon('A', '#c05a17') }).addTo(map).bindPopup('Arrivo')
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
  }, [trackPoints, showGradient, showAspect, dtmProfile, planned])

  // POI layer — re-runs when pois arrive OR when map finishes initializing
  useEffect(() => {
    if (!mapReady || !mapInstance.current) return

    import('leaflet').then(L => {
      // Clear previous markers
      poiLayer.current.forEach((m: any) => m.remove())
      poiLayer.current = []

      for (const poi of pois) {
        const meta = POI_META[poi.type]
        const icon = L.divIcon({
          html: `<div style="font-size:22px;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.4))">${meta.emoji}</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
          className: '',
        })
        const popup = buildPoiPopupHtml(poi)

        const m = L.marker([poi.lat, poi.lon], { icon }).addTo(mapInstance.current).bindPopup(popup, { maxWidth: 250 })
        poiLayer.current.push(m)
      }
    })
  }, [pois, mapReady])

  // Wikipedia layer — only pages that have coordinates
  useEffect(() => {
    if (!mapReady || !mapInstance.current) return

    import('leaflet').then(L => {
      wikiLayer.current.forEach((m: any) => m.remove())
      wikiLayer.current = []

      for (const page of wikiPages) {
        if (page.lat == null || page.lon == null) continue

        const iconHtml = page.thumbnail
          ? `<div style="width:46px;height:46px;border-radius:50%;overflow:hidden;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.45);background:#3b82f6">
               <img src="${page.thumbnail}" style="width:100%;height:100%;object-fit:cover" loading="lazy">
             </div>`
          : `<div style="background:#3b82f6;color:white;border-radius:50%;width:40px;height:40px;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:bold;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.4)">W</div>`

        const icon = L.divIcon({
          html: iconHtml,
          iconSize: [46, 46],
          iconAnchor: [23, 23],
          className: '',
        })
        const thumb = page.thumbnail
          ? `<img src="${page.thumbnail}" style="width:56px;height:56px;object-fit:cover;border-radius:6px;float:right;margin-left:8px">`
          : ''
        const popup = `
          <div style="max-width:220px;font-size:12px;line-height:1.4">
            ${thumb}
            <b style="font-size:13px">${page.title}</b>
            ${page.description ? `<div style="color:#6b7280;margin:2px 0">${page.description}</div>` : ''}
            <div style="color:#374151;margin-top:4px">${page.extract.slice(0, 120)}…</div>
            <a href="${page.url}" target="_blank" rel="noopener" style="color:#2563eb;font-weight:600;margin-top:6px;display:inline-block">Leggi su Wikipedia →</a>
          </div>`

        const m = L.marker([page.lat, page.lon], { icon })
          .addTo(mapInstance.current)
          .bindPopup(popup, { maxWidth: 240 })
        wikiLayer.current.push(m)
      }
    })
  }, [wikiPages, mapReady])

  // Difficulty-marker layer — tratti difficili dal GPX importato (Komoot/
  // AllTrails waypoint & track comments classificati da lib/difficultyMarkers.ts)
  useEffect(() => {
    if (!mapReady || !mapInstance.current) return

    import('leaflet').then(L => {
      difficultyLayer.current.forEach((m: any) => m.remove())
      difficultyLayer.current = []

      for (const marker of difficultyMarkers) {
        const color = SEVERITY_COLOR[marker.severity]
        const icon = L.divIcon({
          html: `<div style="background:${color};color:white;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-size:13px;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35)">${SEVERITY_EMOJI[marker.severity]}</div>`,
          iconSize: [26, 26], iconAnchor: [13, 13], className: '',
        })
        const popup = `
          <div style="max-width:220px;font-size:12px;line-height:1.4">
            <b style="color:${color}">${marker.severity === 'danger' ? 'Pericolo' : marker.severity === 'warning' ? 'Attenzione' : 'Info'}</b>
            <div style="color:#374151;margin-top:4px">${marker.text}</div>
          </div>`

        const m = L.marker([marker.lat, marker.lon], { icon })
          .addTo(mapInstance.current)
          .bindPopup(popup, { maxWidth: 240 })
        difficultyLayer.current.push(m)
      }
    })
  }, [difficultyMarkers, mapReady])

  const hasGps = trackPoints.some(p => p.lat !== undefined)

  if (!hasGps) {
    return (
      <div
        className="flex items-center justify-center rounded-xl bg-stone-100 border border-stone-200 text-stone-400 text-sm"
        style={{ height }}
      >
        Nessun dato GPS disponibile in questo file
      </div>
    )
  }

  return (
    <div
      ref={mapRef}
      style={{ height }}
      className="rounded-xl overflow-hidden border border-stone-200 shadow-sm"
    />
  )
}
