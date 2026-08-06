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
 *
 * DUE effetti separati, non uno, per un motivo di prestazioni misurato: durante un trascinamento
 * Leaflet emette l'evento 'drag' più volte al secondo, e ogni tick aggiorna l'ANTEPRIMA
 * dell'affollamento (vedi crowding più sotto). La prima versione aveva un solo effetto con
 * `crowding` fra le dipendenze: ogni tick ricreava quindi l'icona E richiamava setLatLng/bindTooltip
 * su OGNI marcatore della mappa, non solo su quello trascinato — su un percorso con molte foto,
 * abbastanza lavoro da far sembrare il trascinamento incollato e a scatti. Ora un effetto pesante
 * (posizioni, tooltip, creazione/rimozione) reagisce solo a `items` — un cambio vero, non
 * un'anteprima — e uno leggero reagisce a `crowding` aggiornando SOLO l'anello dei marcatori il cui
 * stato di affollamento è davvero cambiato da un tick all'altro.
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
  /** Solo le foto la usano davvero (vedi il commento sul lucchetto in RouteMap3D.tsx): uno stacco
   *  non ha una posizione "originale" da proteggere, quindi resta sempre trascinabile. */
  locked?: boolean
}

interface Props {
  trackPoints: TrackPoint[]
  /** Riempie il contenitore invece di prendersi un'altezza fissa — lo studio le dà tutto lo spazio
   *  che avanza fra i due binari, la scheda del wizard una fascia. */
  fill?: boolean
  items: TimelineEditorItem[]
  /** Secondi di solo volo: serve a dire in SECONDI quanto due elementi sono vicini. */
  routeSeconds: number
  shape?: TrackShape
  roundTrip?: boolean
  onMove: (id: string, atP: number) => void
}

function markerIcon(Lmod: typeof L, it: TimelineEditorItem, crowded: boolean): L.DivIcon {
  const isPhoto = it.kind === 'photo'
  const locked = isPhoto && it.locked
  const tint = isPhoto ? '#3f3a33' : (INTERLUDE_TINT[it.interludeKind ?? 'numeri'] ?? '#3f3a33')
  const glyph = isPhoto ? '▣' : INTERLUDE_GLYPH[it.interludeKind ?? 'numeri']
  const size = isPhoto ? 30 : 28
  // Su fondo chiaro l'ombra nera pesante di prima sporcava la mappa: basta un bordo bianco a
  // staccare il pallino, come i segnaposto delle schede.
  const ring = crowded
    ? `box-shadow:0 0 0 3px rgba(217,114,32,0.9), 0 1px 4px rgba(0,0,0,0.25);`
    : `box-shadow:0 1px 4px rgba(0,0,0,0.25);`
  const bg = isPhoto ? '#3f3a33' : tint
  const fg = isPhoto ? '#ffffff' : 'rgba(20,18,15,0.9)'
  // Il lucchetto sul pallino è l'unico modo di sapere, guardando la MAPPA (non l'elenco foto), che
  // quella foto non si sposta finché non la si sblocca da lì — vedi il commento in RouteMap3D.tsx.
  const lockBadge = locked
    ? `<div style="position:absolute;right:-3px;bottom:-3px;width:14px;height:14px;border-radius:50%;background:#c05a17;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:8px;line-height:1;color:#fff">🔒</div>`
    : ''
  return Lmod.divIcon({
    html: `<div style="position:relative;width:${size}px;height:${size}px">
             <div style="width:100%;height:100%;border-radius:50%;background:${bg};border:2px solid #ffffff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:${fg};${ring};cursor:${locked ? 'default' : 'grab'}">${glyph}</div>
             ${lockBadge}
           </div>`,
    iconSize: [size, size], iconAnchor: [size / 2, size / 2], className: '',
  })
}

export default function RouteLeafletEditor({
  trackPoints, items, routeSeconds, shape: trackShape, roundTrip, onMove, fill,
}: Props) {
  const mapElRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markersRef = useRef<Map<string, L.Marker>>(new Map())
  // Popolato una volta sola all'init della mappa, riletto sincrono da entrambi gli effetti dei
  // marcatori: un `import('leaflet').then(...)` ad ogni tick di trascinamento — anche se il modulo
  // è già in cache — è un giro di microtask in più che l'effetto leggero qui sotto non si può
  // permettere.
  const leafletRef = useRef<typeof L | null>(null)
  const onMoveRef = useRef(onMove)
  onMoveRef.current = onMove

  const [mapReady, setMapReady] = useState(false)
  // Anteprima live dell'affollamento durante un trascinamento in corso: senza, il cerchio arancio
  // comparirebbe solo a rilascio avvenuto, cioè un istante troppo tardi per essere una guida.
  const [dragPreview, setDragPreview] = useState<Record<string, number> | null>(null)
  // Istruzioni e dettaglio dell'affollamento: chiusi di partenza, si aprono solo se chiesti.
  const [showHelp, setShowHelp] = useState(false)
  const [showCrowdDetail, setShowCrowdDetail] = useState(false)

  const gpsPoints = trackPoints.filter(p => p.lat != null && p.lon != null) as { lat: number; lon: number }[]
  const coords: [number, number][] = gpsPoints.map(p => [p.lat, p.lon])

  const liveItems = dragPreview
    ? items.map(it => (dragPreview[it.id] !== undefined ? { ...it, atP: dragPreview[it.id] } : it))
    : items
  // Memorizzato su items+dragPreview (non su liveItems, ricreato a ogni render): la dipendenza
  // pesante (creazione/posizione dei marker, vedi sotto) non guarda più `crowding`, ma l'effetto
  // leggero sì — e ricalcolarlo ad ogni render invece che solo quando items o dragPreview cambiano
  // davvero vorrebbe dire perdere il confronto "chi è cambiato da un tick all'altro" su cui si
  // basa: senza questo memo, `crowding.ids` sarebbe un Set NUOVO ad ogni render anche a contenuto
  // identico, e l'effetto leggero — che si fida della referenza per capire quando girare —
  // finirebbe comunque per rifare il lavoro ad ogni render invece che solo ai tick di drag veri.
  const crowding = useMemo(() => findCrowding(liveItems, routeSeconds, MIN_ITEM_GAP_SEC), [items, dragPreview, routeSeconds]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── init una volta ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapElRef.current || mapRef.current || coords.length < 2) return
    let cancelled = false
    import('leaflet').then(Lmod => {
      if (cancelled || !mapElRef.current) return
      leafletRef.current = Lmod
      // I pulsanti dello zoom scendono in basso a sinistra: in alto a sinistra ci sta ora il «?»
      // con le istruzioni e la pastiglia dell'affollamento, e due comandi sovrapposti nello stesso
      // angolo sono il modo più rapido per farne toccare uno per l'altro.
      const map = Lmod.map(mapElRef.current, { zoomControl: false }).setView(coords[0], 13)
      Lmod.control.zoom({ position: 'bottomleft' }).addTo(map)
      mapRef.current = map
      // Positron, non "voyager" e tanto meno "dark": qui la mappa è il FONDO di tutto lo studio, e
      // sopra ci galleggiano schede bianche e pastiglie. Un fondo mid-tone le faceva sembrare
      // ritagli incollati; positron è quasi senza colore, così l'unica cosa satura della vista
      // resta ciò che si sta davvero disponendo — il tracciato e i pallini.
      Lmod.tileLayer('/api/tile?z={z}&x={x}&y={y}&style=positron', {
        attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map)

      // Doppia linea: una fascia bianca sotto e il verde sopra. Su tile chiarissime una linea sola
      // si confonde con le strade, che qui sono grigie della stessa larghezza.
      Lmod.polyline(coords, { color: '#ffffff', weight: 8, opacity: 0.9 }).addTo(map)
      const poly = Lmod.polyline(coords, { color: '#277134', weight: 4, opacity: 1 }).addTo(map)
      map.fitBounds(poly.getBounds(), { padding: [32, 32] })

      for (const arrow of computeDirectionArrows(coords, ARROW_SPACING_M)) {
        const icon = Lmod.divIcon({
          html: `<div style="transform:rotate(${arrow.bearing}deg);width:${ARROW_ICON_PX}px;height:${ARROW_ICON_PX}px;display:flex;align-items:center;justify-content:center">
                   <svg width="${ARROW_SVG_PX}" height="${ARROW_SVG_PX}" viewBox="0 0 24 24" fill="#277134" stroke="#ffffff" stroke-width="2.5"><path d="M12 2 L20 20 L12 15 L4 20 Z"/></svg>
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

  // ── marker di foto e stacchi: creazione, rimozione, posizione, blocco/sblocco ──────────────
  // Reagisce SOLO a `items` (un cambio vero — foto spostata e rilasciata, stacco acceso, foto
  // sbloccata) e non a `crowding`: è il lavoro pesante (setLatLng, bindTooltip, dragging
  // enable/disable), e ripeterlo ad ogni tick di trascinamento è esattamente quello che rendeva lo
  // spostamento lento — vedi il commento in testa al file.
  useEffect(() => {
    const Lmod = leafletRef.current
    if (!mapReady || !mapRef.current || !Lmod) return
    const map = mapRef.current
    const seen = new Set<string>()
    const crowded0 = crowding.ids

    for (const it of items) {
      seen.add(it.id)
      const idx = Math.round(it.atP * (gpsPoints.length - 1))
      const pt = gpsPoints[Math.min(Math.max(idx, 0), gpsPoints.length - 1)]
      if (!pt) continue

      let m = markersRef.current.get(it.id)
      if (!m) {
        m = Lmod.marker([pt.lat, pt.lon], { icon: markerIcon(Lmod, it, crowded0.has(it.id)), draggable: !it.locked })
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
      } else if (dragPreview && dragPreview[it.id] !== undefined) {
        // In trascinamento attivo: la posizione la possiede Leaflet stesso (Draggable la muove dai
        // delta del mouse rispetto al punto di partenza), non `it.atP` — che è ancora quello di
        // PRIMA del trascinamento, il prop non si aggiorna finché non si rilascia. Non si tocca.
      } else {
        m.setLatLng([pt.lat, pt.lon])
        m.setIcon(markerIcon(Lmod, it, crowded0.has(it.id)))
        m.bindTooltip(it.label, { direction: 'top', offset: [0, -16] })
        // Idempotente: enable/disable su uno stato già corrente non fa nulla di visibile, quindi
        // richiamarlo ogni volta che `items` cambia (non ad ogni tick) resta economico.
        if (it.locked) m.dragging?.disable(); else m.dragging?.enable()
      }
    }

    markersRef.current.forEach((m, id) => {
      if (!seen.has(id)) { m.remove(); markersRef.current.delete(id) }
    })
    // crowding.ids serve solo all'icona iniziale di un marker appena creato: quella corrente (non
    // un'anteprima di trascinamento, che a un marker appena creato non può comunque riguardare) è
    // la scelta giusta anche se non è nelle dep — l'effetto leggero sotto la tiene aggiornata da lì
    // in avanti. gpsPoints deriva da trackPoints, già in dep tramite `items` di norma stabile.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, mapReady])

  // ── anello di affollamento: leggero, reagisce ad OGNI tick di trascinamento ─────────────────
  // Unico lavoro qui: capire quali marker hanno CAMBIATO stato di affollamento da un tick
  // all'altro e aggiornare solo la loro icona. Su un trascinamento tipico sono 0-2 marker, non
  // tutti quelli sulla mappa — la differenza che rende lo spostamento di nuovo fluido.
  const lastCrowdedRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    const Lmod = leafletRef.current
    if (!mapReady || !Lmod) return
    const prev = lastCrowdedRef.current
    const next = crowding.ids
    for (const it of items) {
      const was = prev.has(it.id), is = next.has(it.id)
      if (was === is) continue
      const m = markersRef.current.get(it.id)
      if (m) m.setIcon(markerIcon(Lmod, it, is))
    }
    lastCrowdedRef.current = next
  }, [crowding, mapReady, items])

  if (gpsPoints.length < 2) {
    return (
      <p className="text-stone-500 text-[11px] leading-relaxed p-3">
        Il tracciato non ha abbastanza punti con coordinate per disegnare la mappa.
      </p>
    )
  }

  const interludeItems = items.filter(i => i.kind === 'interlude')
  const crowdedCount = crowding.ids.size

  return (
    <div className={`relative ${fill ? 'h-full w-full' : 'rounded-2xl overflow-hidden border border-stone-200'}`}
      style={fill ? undefined : { height: 340 }}>
      <div ref={mapElRef} className="absolute inset-0" />

      {/* ── Sovrapposti, in alto a sinistra ──────────────────────────────────────
          Istruzioni e legenda NON stanno più nel flusso sotto la mappa: erano tre paragrafi che
          costavano più spazio della mappa stessa e che si rileggono una volta sola. Qui c'è un «?»
          che le tiene, e una pastiglia che dice in due parole l'unica cosa da correggere. */}
      <div className="absolute top-2 left-2 z-[1000] flex flex-col items-start gap-1.5 max-w-[min(20rem,calc(100%-1rem))]">
        <div className="flex items-center gap-1.5">
          <button onClick={() => { setShowHelp(h => !h); setShowCrowdDetail(false) }}
            aria-label="Come si usa la mappa" aria-expanded={showHelp}
            className={`w-8 h-8 rounded-full shadow-sm border flex items-center justify-center text-[13px] font-bold transition-colors ${
              showHelp ? 'bg-forest-600 border-forest-700 text-white' : 'bg-white/95 border-stone-200 text-stone-600 hover:bg-white'}`}>
            ?
          </button>

          {crowdedCount > 0 && (
            <button onClick={() => { setShowCrowdDetail(d => !d); setShowHelp(false) }}
              aria-expanded={showCrowdDetail}
              className="flex items-center gap-1.5 h-8 pl-2 pr-2.5 rounded-full bg-terra-600 text-white shadow-sm border border-terra-700">
              <span className="w-2 h-2 rounded-full bg-white/90 shrink-0" />
              <span className="text-[11px] font-bold whitespace-nowrap">
                <span className="font-mono">{crowdedCount}</span> troppo vicini
              </span>
            </button>
          )}
        </div>

        {showCrowdDetail && (
          <div className="rounded-xl bg-white/97 border border-terra-200 shadow-lg px-3 py-2.5">
            <p className="text-stone-700 text-[11px] leading-relaxed">
              {crowding.pairs.length === 1
                ? `Due elementi cadono a ${crowding.pairs[0].apartSec.toFixed(1)}s l'uno dall'altro`
                : `${crowding.pairs.length} coppie cadono a meno di ${MIN_ITEM_GAP_SEC}s l'una dall'altra`}
              {' '}(cerchiati in arancio): il video si fermerebbe due volte di fila senza percorso in mezzo.
              Allontanali per dare respiro al montaggio.
            </p>
          </div>
        )}

        {showHelp && (
          <div className="rounded-xl bg-white/97 border border-stone-200 shadow-lg px-3 py-2.5 space-y-2">
            <p className="text-stone-700 text-[11px] leading-relaxed">
              Trascina i pallini per decidere dove cade ogni foto e ogni stacco: si agganciano da soli al punto
              del percorso più vicino. Una foto con il lucchetto va prima sbloccata dall&apos;elenco foto qui sotto.
              {roundTrip && ' Il percorso è un andata e ritorno: il video mostra la sola andata, quindi tutto va posizionato su quella.'}
            </p>
            {interludeItems.length > 0 && (
              <div className="flex flex-wrap gap-x-3 gap-y-1 pt-0.5 border-t border-stone-200">
                <span className="flex items-center gap-1.5 text-[10px] text-stone-500 mt-1.5">
                  <span className="w-3.5 h-3.5 rounded-full bg-[#3f3a33] text-white flex items-center justify-center text-[9px] font-extrabold">▣</span>
                  Foto
                </span>
                {interludeItems.map(i => (
                  <span key={i.id} className="flex items-center gap-1.5 text-[10px] text-stone-500 mt-1.5">
                    <span className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] font-extrabold text-stone-900"
                      style={{ background: INTERLUDE_TINT[i.interludeKind ?? 'numeri'] }}>
                      {INTERLUDE_GLYPH[i.interludeKind ?? 'numeri']}
                    </span>
                    {i.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
