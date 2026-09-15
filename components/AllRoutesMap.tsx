'use client'
import 'leaflet/dist/leaflet.css'
import type * as L from 'leaflet'
import { useEffect, useRef } from 'react'
import { ROUTE_COLORS } from '@/lib/designTokens'

interface RouteEntry {
  id: string
  title: string
  startTime: string
  polyline: [number, number][]
  /** Statistiche essenziali per il fumetto — assenti ⇒ quella riga di pillole non compare
   *  (fallback al solo titolo/data di sempre, es. /statistiche che non le passa). */
  distanceMeters?: number
  elevationGain?: number
  /** Stesso "punteggio migliore disponibile" già mostrato in galleria (BottomGallery.tsx,
   *  scorePreview): Trail Score per una Guida, voto utente per un Reportage. */
  scorePreview?: { value: number; max: number; color?: string; label?: string }
  /** Guida-only: Sicurezza oggettiva già cachata (RouteHubItem.safetyPreview). */
  safetyPreview?: { overall: number; color: string; label: string }
  /** Link "Apri" nel fumetto verso la scheda del percorso (/guida/{id} o /resoconto/{id}) —
   *  assente ⇒ nessun pulsante (es. il percorso "suggerito" della Dashboard, che non ha ancora
   *  una scheda propria da aprire). */
  openHref?: string
}

interface Props {
  routes: RouteEntry[]
  height?: string
  interactive?: boolean
  /** Quando `routes` è vuoto, disegna comunque una mappa di base centrata/zoomata qui invece del
   *  placeholder testuale — usato dall'hero della Dashboard (Direzione E, docs/mockup-dashboard-
   *  hero/) per un utente nuovo: a zoom regionale la mappa non ha bisogno di nessuna coordinata
   *  dell'utente per esistere, a differenza di una cover-map puntuale su un singolo percorso.
   *  Omesso (comportamento di sempre) per /statistiche, dove "nessun percorso" resta un placeholder. */
  emptyFallback?: { center: [number, number]; zoom: number }
  /** Sovrascrive lo stile del contenitore — di norma una card arrotondata con bordo (uso in
   *  /statistiche), ma l'hero della Dashboard (Direzione E) la vuole a piena pagina, senza bordi
   *  né angoli arrotondati. */
  className?: string
}

// Palette condivisa (lib/designTokens.ts), non più una copia locale: prima questo file, la
// legenda del diario e i raster generati per il PDF avevano ciascuno la propria lista di colori,
// quindi lo stesso percorso poteva risultare di un colore sulla mappa a schermo e di un altro
// nella legenda o nel PDF.
const PALETTE = ROUTE_COLORS

// route.title arriva dall'utente (nome dato alla Guida/al Reportage) e finisce in innerHTML via
// Leaflet bindPopup — mai interpolato senza escape, anche se qui l'unico "attaccante" possibile è
// l'utente stesso sul proprio dispositivo.
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c])
}

function badgePillHtml(color: string, value: number, label: string): string {
  return `<span style="display:inline-flex;align-items:center;gap:4px;background:${color}1a;border:1px solid ${color}55;color:${color};border-radius:999px;padding:2px 8px;font-size:10px;font-weight:700;white-space:nowrap">
    <span style="width:6px;height:6px;border-radius:999px;background:${color};flex-shrink:0"></span>${Math.round(value)} · ${escapeHtml(label)}
  </span>`
}

/** Fumetto Leaflet arricchito — titolo/data (di sempre) più, quando disponibili, le statistiche
 *  essenziali, gli stessi badge di punteggio già mostrati in galleria (CTS+Sicurezza per una
 *  Guida, voto per un Reportage — BottomGallery.tsx) e un link "Apri" diretto alla scheda del
 *  percorso. Costruito come stringa HTML (non un componente React) perché Leaflet monta i popup
 *  fuori dall'albero React — badgePillHtml sopra imita lo stesso linguaggio visivo dei badge reali
 *  (TrailScoreGaugeBadge/MiniScoreRing) senza poterli montare qui dentro. */
function buildPopupHtml(route: RouteEntry, color: string, dateStr: string): string {
  const statsRow = (route.distanceMeters != null || route.elevationGain != null)
    ? `<div style="display:flex;gap:10px;margin-top:5px;font-size:11px;color:#57534e">
        ${route.distanceMeters != null ? `<span>${(route.distanceMeters / 1000).toFixed(1)} km</span>` : ''}
        ${route.elevationGain != null ? `<span>+${Math.round(route.elevationGain)} m D+</span>` : ''}
      </div>`
    : ''
  const badges: string[] = []
  if (route.scorePreview) {
    badges.push(badgePillHtml(route.scorePreview.color ?? '#57534e', route.scorePreview.value, route.scorePreview.label ?? (route.scorePreview.max === 10 ? 'Voto' : 'CTS')))
  }
  if (route.safetyPreview) {
    badges.push(badgePillHtml(route.safetyPreview.color, route.safetyPreview.overall, route.safetyPreview.label))
  }
  const badgeRow = badges.length > 0 ? `<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">${badges.join('')}</div>` : ''
  const openLink = route.openHref
    ? `<a href="${escapeHtml(route.openHref)}" style="display:block;margin-top:9px;padding:6px 10px;background:#277134;color:#fff;border-radius:8px;font-size:11px;font-weight:700;text-decoration:none;text-align:center">Apri →</a>`
    : ''
  return `<div style="min-width:190px">
    <strong style="display:block;color:${color};font-size:13px;line-height:1.3;margin-bottom:2px">${escapeHtml(route.title)}</strong>
    <span style="font-size:12px;color:#666">${dateStr}</span>
    ${statsRow}${badgeRow}${openLink}
  </div>`
}

export default function AllRoutesMap({ routes, height = '500px', interactive = true, emptyFallback, className = 'rounded-xl overflow-hidden border border-stone-200 shadow-sm' }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<L.Map | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const interactiveRef = useRef(interactive)
  interactiveRef.current = interactive

  const validRoutes = routes.filter(r => r.polyline && r.polyline.length > 1)

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return
    if (validRoutes.length === 0 && !emptyFallback) return

    import('leaflet').then(L => {
      if (!mapRef.current || mapInstance.current) return

      // Fix icone Leaflet con Next.js
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: '/leaflet/marker-icon-2x.png',
        iconUrl: '/leaflet/marker-icon.png',
        shadowUrl: '/leaflet/marker-shadow.png',
      })

      const initialView = validRoutes.length === 0 && emptyFallback ? emptyFallback : { center: [44, 11] as [number, number], zoom: 7 }
      const map = L.map(mapRef.current!, {
        dragging: interactiveRef.current,
        scrollWheelZoom: interactiveRef.current,
        doubleClickZoom: interactiveRef.current,
        touchZoom: interactiveRef.current,
        boxZoom: interactiveRef.current,
        keyboard: interactiveRef.current,
      }).setView(initialView.center, initialView.zoom)
      mapInstance.current = map

      L.tileLayer('/api/tile?z={z}&x={x}&y={y}&style=light', {
        attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map)

      const allBounds: L.LatLngBounds[] = []

      validRoutes.forEach((route, idx) => {
        const color = PALETTE[idx % PALETTE.length]
        const coords: [number, number][] = route.polyline

        const polyline = L.polyline(coords, {
          color,
          weight: 4,
          opacity: 0.85,
          smoothFactor: 1.5,
        }).addTo(map)

        const dateStr = (() => {
          try {
            return new Date(route.startTime).toLocaleDateString('it-IT', {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
            })
          } catch {
            return route.startTime
          }
        })()

        polyline.bindPopup(buildPopupHtml(route, color, dateStr))

        allBounds.push(polyline.getBounds())
      })

      if (allBounds.length > 0) {
        const combined = allBounds.reduce((acc, b) => acc.extend(b), allBounds[0])
        map.fitBounds(combined, { padding: [24, 24] })
      }

      // Leaflet misura il contenitore una volta, alla creazione, e non si accorge da solo se le
      // sue dimensioni cambiano dopo — cosa che qui succede spesso: il Diario ricalcola il layout
      // del libro (scala e altezza) man mano che foto e trackpoint arrivano in background dopo il
      // render iniziale (vedi app/diario/page.tsx), e ogni volta le mappe già montate restavano
      // con tile mancanti ai bordi o il tracciato non centrato, finché non si toccava manualmente
      // la mappa. Senza questo osservatore Leaflet non lo saprebbe mai.
      const ro = new ResizeObserver(() => map.invalidateSize())
      ro.observe(mapRef.current!)
      resizeObserverRef.current = ro
    })

    return () => {
      resizeObserverRef.current?.disconnect()
      resizeObserverRef.current = null
      if (mapInstance.current) {
        mapInstance.current.remove()
        mapInstance.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapInstance.current
    if (!map) return
    const handlers = [map.dragging, map.scrollWheelZoom, map.doubleClickZoom, map.touchZoom, map.boxZoom, map.keyboard]
    handlers.forEach(h => { if (h) interactive ? h.enable() : h.disable() })
  }, [interactive])

  if (validRoutes.length === 0 && !emptyFallback) {
    return (
      <div
        className="flex items-center justify-center rounded-xl bg-stone-100 border border-stone-200 text-stone-400 text-sm"
        style={{ height }}
      >
        Nessun percorso GPS disponibile
      </div>
    )
  }

  return (
    <div ref={mapRef} style={{ height }} className={className} />
  )
}
