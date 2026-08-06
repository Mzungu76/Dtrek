'use client'

/**
 * components/video/RouteLeafletEditor.tsx — il percorso vero, con foto e stacchi che ci si
 * trascinano sopra.
 *
 * Sostituisce RouteTimelineEditor (la figura disegnata a mano su SVG, senza mappa): qui la mappa è
 * la stessa Leaflet già usata nelle schede dell'app (stesso endpoint tile, stessa libreria, stesso
 * pattern di inizializzazione — vedi app/components/PhotoPlacementMap.tsx), zoomabile e pannabile
 * come ci si aspetta. La differenza col posizionamento delle foto nelle schede è che qui il
 * trascinamento è NATIVO di Leaflet (marker `draggable: true`), non un gesto ricostruito a mano:
 * tocco lungo, sposto, rilascio — Leaflet gestisce da solo mouse e touch, che è esattamente il
 * comportamento con cui chi usa l'app ha già dimestichezza altrove.
 *
 * Stesso contratto (props) di RouteTimelineEditor, apposta: chi lo monta non deve sapere quale dei
 * due sta usando.
 */

import 'leaflet/dist/leaflet.css'
import type * as L from 'leaflet'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  progressFromLatLng, findCrowding, MIN_ITEM_GAP_SEC,
  type TimelineItem,
} from '@/lib/videoTimeline'
import { computeDirectionArrows } from '@/lib/geoUtils'
import type { TrackPoint } from '@/lib/tcxParser'
import type { InterludeKind } from '@/lib/videoInterludes'
import type { TrackShape } from '@/lib/geoUtils'

const ARROW_SPACING_M = 250
const ARROW_ICON_PX = 13
const ARROW_SVG_PX = 10

export const INTERLUDE_GLYPH: Record<InterludeKind, string> = {
  visione: '◎', numeri: '#', profilo: '△', natura: '❦', tei: '★', avvisi: '!', luoghi: '◆',
}
const INTERLUDE_TINT: Record<InterludeKind, string> = {
  visione: '#38bdf8', numeri: '#a3e635', profilo: '#f59e0b', natura: '#34d399',
  tei: '#c084fc', avvisi: '#fb7185', luoghi: '#f472b6',
}

export interface TimelineEditorItem extends TimelineItem {
  thumbUrl?: string
  interludeKind?: InterludeKind
}

interface Props {
  trackPoints: TrackPoint[]
  items: TimelineEditorItem[]
  /** Secondi di solo volo: serve a dire in SECONDI quanto due elementi sono vicini. */
  routeSeconds: number
  shape?: TrackShape
  roundTrip?: boolean
  onMove: (id: string, atP: number) => void
}

function markerIcon(Lmod: typeof L, it: TimelineEditorItem, crowded: boolean): L.DivIcon {
  const isPhoto = it.kind === 'photo'
  const tint = isPhoto ? '#f1ede2' : (INTERLUDE_TINT[it.interludeKind ?? 'numeri'] ?? '#f1ede2')
  const glyph = isPhoto ? '▣' : INTERLUDE_GLYPH[it.interludeKind ?? 'numeri']
  const size = isPhoto ? 30 : 28
  const ring = crowded ? `box-shadow:0 0 0 3px rgba(251,191,36,0.85), 0 2px 8px rgba(0,0,0,0.5);` : `box-shadow:0 2px 8px rgba(0,0,0,0.5);`
  const bg = isPhoto ? 'rgba(15,23,20,0.94)' : tint
  const fg = isPhoto ? tint : 'rgba(10,15,12,0.92)'
  return Lmod.divIcon({
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};border:2px solid ${isPhoto ? tint : 'rgba(0,0,0,0.4)'};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:${fg};${ring};cursor:grab">${glyph}</div>`,
    iconSize: [size, size], iconAnchor: [size / 2, size / 2], className: '',
  })
}

export default function RouteLeafletEditor({
  trackPoints, items, routeSeconds, shape: trackShape, roundTrip, onMove,
}: Props) {
  const mapElRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markersRef = useRef<Map<string, L.Marker>>(new Map())
  const itemsRef = useRef(items)
  itemsRef.current = items
  const routeSecondsRef = useRef(routeSeconds)
  routeSecondsRef.current = routeSeconds
  const onMoveRef = useRef(onMove)
  onMoveRef.current = onMove

  const [mapReady, setMapReady] = useState(false)
  // Anteprima live dell'affollamento durante un trascinamento in corso: senza, il cerchio giallo
  // comparirebbe solo a rilascio avvenuto, cioè un istante troppo tardi per essere una guida.
  const [dragPreview, setDragPreview] = useState<Record<string, number> | null>(null)

  const gpsPoints = trackPoints.filter(p => p.lat != null && p.lon != null) as { lat: number; lon: number }[]
  const coords: [number, number][] = gpsPoints.map(p => [p.lat, p.lon])

  const liveItems = dragPreview
    ? items.map(it => (dragPreview[it.id] !== undefined ? { ...it, atP: dragPreview[it.id] } : it))
    : items
  // Memorizzato su items+dragPreview (non su liveItems, ricreato a ogni render): senza, l'effetto
  // dei marker sotto — che dipende da crowding — ridisegnerebbe tutti i pallini a ogni render del
  // genitore, non solo quando la disposizione cambia davvero.
  const crowding = useMemo(() => findCrowding(liveItems, routeSeconds, MIN_ITEM_GAP_SEC), [items, dragPreview, routeSeconds]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── init una volta ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapElRef.current || mapRef.current || coords.length < 2) return
    let cancelled = false
    import('leaflet').then(Lmod => {
      if (cancelled || !mapElRef.current) return
      const map = Lmod.map(mapElRef.current, { zoomControl: true }).setView(coords[0], 13)
      mapRef.current = map
      Lmod.tileLayer('/api/tile?z={z}&x={x}&y={y}&style=dark', {
        attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map)

      const poly = Lmod.polyline(coords, { color: '#52b586', weight: 4, opacity: 0.9 }).addTo(map)
      map.fitBounds(poly.getBounds(), { padding: [32, 32] })

      for (const arrow of computeDirectionArrows(coords, ARROW_SPACING_M)) {
        const icon = Lmod.divIcon({
          html: `<div style="transform:rotate(${arrow.bearing}deg);width:${ARROW_ICON_PX}px;height:${ARROW_ICON_PX}px;display:flex;align-items:center;justify-content:center">
                   <svg width="${ARROW_SVG_PX}" height="${ARROW_SVG_PX}" viewBox="0 0 24 24" fill="#52b586" stroke="#0a100c" stroke-width="2.5"><path d="M12 2 L20 20 L12 15 L4 20 Z"/></svg>
                 </div>`,
          iconSize: [ARROW_ICON_PX, ARROW_ICON_PX], iconAnchor: [ARROW_ICON_PX / 2, ARROW_ICON_PX / 2], className: '',
        })
        Lmod.marker([arrow.lat, arrow.lon], { icon, interactive: false, keyboard: false }).addTo(map)
      }

      const mkEndpointIcon = (label: string, color: string) => Lmod.divIcon({
        html: `<div style="background:${color};color:white;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4)">${label}</div>`,
        iconSize: [26, 26], iconAnchor: [13, 13], className: '',
      })
      Lmod.marker(coords[0], { icon: mkEndpointIcon('P', '#22c55e'), interactive: false, keyboard: false })
        .addTo(map).bindTooltip('Partenza', { direction: 'top', offset: [0, -14] })
      // Su un anello l'arrivo coincide con la partenza: un secondo pallino sopra il primo direbbe
      // solo che il percorso si chiude, cosa che la linea già dice.
      if (trackShape !== 'loop') {
        Lmod.marker(coords[coords.length - 1], { icon: mkEndpointIcon(roundTrip ? 'B' : 'A', '#ef4444'), interactive: false, keyboard: false })
          .addTo(map).bindTooltip(roundTrip ? 'Giro di boa' : 'Arrivo', { direction: 'top', offset: [0, -14] })
      }

      setMapReady(true)
    })
    return () => {
      cancelled = true
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    }
    // Il tracciato non cambia mentre l'editor è aperto: si rimonta l'intera mappa solo se cambia
    // davvero (nuova escursione), non a ogni trascinamento — quello lo gestiscono i marker sotto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackPoints.length])

  // ── marker di foto e stacchi: si ridisegnano quando cambia l'elenco, non a ogni fotogramma ──
  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    let cancelled = false
    import('leaflet').then(Lmod => {
      if (cancelled || !mapRef.current) return
      const map = mapRef.current
      const seen = new Set<string>()

      for (const it of items) {
        seen.add(it.id)
        const idx = Math.round(it.atP * (gpsPoints.length - 1))
        const pt = gpsPoints[Math.min(Math.max(idx, 0), gpsPoints.length - 1)]
        if (!pt) continue
        const crowded = crowding.ids.has(it.id)

        let m = markersRef.current.get(it.id)
        if (!m) {
          m = Lmod.marker([pt.lat, pt.lon], { icon: markerIcon(Lmod, it, crowded), draggable: true })
            .addTo(map)
          m.on('drag', () => {
            const ll = m!.getLatLng()
            const p = progressFromLatLng(trackPoints, ll.lat, ll.lng)
            setDragPreview(prev => ({ ...(prev ?? {}), [it.id]: p }))
          })
          m.on('dragend', () => {
            const ll = m!.getLatLng()
            const p = progressFromLatLng(trackPoints, ll.lat, ll.lng)
            setDragPreview(prev => { if (!prev) return prev; const { [it.id]: _drop, ...rest } = prev; return rest })
            onMoveRef.current(it.id, p)
          })
          markersRef.current.set(it.id, m)
        } else {
          m.setLatLng([pt.lat, pt.lon])
          m.setIcon(markerIcon(Lmod, it, crowded))
        }
        m.bindTooltip(it.label, { direction: 'top', offset: [0, -16] })
      }

      markersRef.current.forEach((m, id) => {
        if (!seen.has(id)) { m.remove(); markersRef.current.delete(id) }
      })
    })
    return () => { cancelled = true }
    // crowding dipende da items+routeSeconds, già nelle dep; gpsPoints deriva da trackPoints.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, mapReady, crowding])

  if (gpsPoints.length < 2) {
    return (
      <p className="text-white/40 text-[11px] leading-relaxed">
        Il tracciato non ha abbastanza punti con coordinate per disegnare la mappa.
      </p>
    )
  }

  return (
    <div>
      <div ref={mapElRef} className="w-full rounded-2xl overflow-hidden border border-white/10" style={{ height: 340 }} />
      <p className="text-white/30 text-[11px] mt-2 leading-relaxed">
        Trascina i pallini sulla mappa per decidere dove cade ogni foto e ogni stacco — si agganciano da soli al punto del percorso più vicino.
        {roundTrip && ' Il percorso è un andata e ritorno: il video mostra la sola andata, quindi tutto va posizionato su quella.'}
      </p>
      {crowding.pairs.length > 0 && (
        <div className="mt-2 rounded-xl bg-amber-500/12 border border-amber-400/35 px-3.5 py-2.5">
          <p className="text-amber-200 text-[11px] leading-relaxed">
            {crowding.pairs.length === 1
              ? `Due elementi cadono a ${crowding.pairs[0].apartSec.toFixed(1)}s l'uno dall'altro`
              : `${crowding.pairs.length} coppie di elementi cadono a meno di ${MIN_ITEM_GAP_SEC}s l'una dall'altra`}
            {' '}(cerchiati in giallo): il video si fermerebbe due volte di fila senza percorso in mezzo. Allontanali per dare respiro al montaggio.
          </p>
        </div>
      )}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2.5">
        {items.filter(i => i.kind === 'interlude').map(i => (
          <span key={i.id} className="flex items-center gap-1.5 text-[10px] text-white/45">
            <span className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] font-extrabold text-stone-900"
              style={{ background: INTERLUDE_TINT[i.interludeKind ?? 'numeri'] }}>
              {INTERLUDE_GLYPH[i.interludeKind ?? 'numeri']}
            </span>
            {i.label}
          </span>
        ))}
      </div>
    </div>
  )
}
