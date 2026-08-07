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
  buildRouteProjector, progressFromLatLngOn, findCrowding, MIN_ITEM_GAP_SEC,
  type TimelineItem,
} from '@/lib/videoTimeline'
import { Image as ImageIcon } from 'lucide-react'
import { computeDirectionArrows } from '@/lib/geoUtils'
import { interludeIconMarkup, photoIconMarkup, INTERLUDE_ICON } from '@/components/video/interludeIcons'
import type { TrackPoint } from '@/lib/tcxParser'
import type { InterludeKind } from '@/lib/videoInterludes'
import type { TrackShape } from '@/lib/geoUtils'

const ARROW_SPACING_M = 250
const ARROW_ICON_PX = 13
const ARROW_SVG_PX = 10

// I glifi unicode di prima (◎ # △ ❦ ★ ! ◆) sono stati sostituiti dalle icone lucide di
// components/video/interludeIcons.tsx — vedi il commento in testa a quel file.
const INTERLUDE_TINT: Record<InterludeKind, string> = {
  visione: '#38bdf8', numeri: '#a3e635', profilo: '#f59e0b', natura: '#34d399',
  tei: '#c084fc', avvisi: '#fb7185', luoghi: '#f472b6',
}

export interface TimelineEditorItem extends TimelineItem {
  thumbUrl?: string
  interludeKind?: InterludeKind
  /** Solo le foto le usano davvero (vedi il commento sul lucchetto in RouteMap3D.tsx): uno stacco
   *  non ha una posizione "originale" da proteggere, quindi resta sempre trascinabile e senza
   *  pallini di stato. */
  locked?: boolean
  /** La foto è stata spostata dal punto dove è stata scattata (o dal punto assegnato la prima
   *  volta): mostra sempre il pallino di ripristino sulla mappa, non solo nell'elenco. */
  moved?: boolean
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
  /** Lucchetto toccato sulla mappa: blocca/sblocca SUL POSTO, senza passare dall'elenco foto. */
  onToggleLock?: (id: string) => void
  /** Pallino di ripristino toccato e confermato nel popup che apre: vedi openResetConfirm. */
  onReset?: (id: string) => void
}

const LOCK_BADGE_CLASS = 'rle-lock-badge'
const RESET_BADGE_CLASS = 'rle-reset-badge'

/** Foto: pin bianco a goccia con la miniatura incorniciata dentro — la stessa forma che il video
 *  disegna sul percorso (drawPhotoPin in lib/videoOverlays.ts) e che compare sulla mappa 3D.
 *  Ritrovare qui la stessa sagoma che si vedrà nel filmato è tutto il punto di un editor: si
 *  dispone la cosa vera, non un suo simbolo. */
const PHOTO_PIN_W = 38, PHOTO_PIN_H = 38, PHOTO_PIN_TIP = 8

function photoPinHtml(thumbUrl: string | undefined, crowded: boolean, locked: boolean): string {
  const border = crowded ? '#d97220' : '#ffffff'
  const inner = thumbUrl
    ? `<img src="${thumbUrl}" alt="" style="width:100%;height:100%;object-fit:cover;display:block">`
    : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#3f3a33">${photoIconMarkup(15)}</div>`
  return `
    <div style="position:relative;width:${PHOTO_PIN_W}px;height:${PHOTO_PIN_H + PHOTO_PIN_TIP}px;cursor:${locked ? 'default' : 'grab'};filter:drop-shadow(0 2px 4px rgba(0,0,0,0.35))">
      <div style="width:${PHOTO_PIN_W}px;height:${PHOTO_PIN_H}px;border-radius:9px;background:${border};padding:3px;box-sizing:border-box">
        <div style="width:100%;height:100%;border-radius:6px;overflow:hidden;background:#eeece5">${inner}</div>
      </div>
      <div style="position:absolute;left:50%;top:${PHOTO_PIN_H - 1}px;transform:translateX(-50%);width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:${PHOTO_PIN_TIP + 1}px solid ${border}"></div>
    </div>`
}

/** Stacco: pastiglia tonda nel colore della categoria con l'icona a tratto dentro, stesso alfabeto
 *  visivo dei segnaposto dei luoghi (poiBadgeMarkup). */
function interludeBadgeHtml(kind: InterludeKind, crowded: boolean): string {
  const size = 30
  const tint = INTERLUDE_TINT[kind] ?? '#3f3a33'
  const ring = crowded
    ? 'box-shadow:0 0 0 3px rgba(217,114,32,0.9), 0 1px 4px rgba(0,0,0,0.25);'
    : 'box-shadow:0 1px 4px rgba(0,0,0,0.25);'
  return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${tint};border:2px solid #ffffff;display:flex;align-items:center;justify-content:center;${ring}cursor:grab">${interludeIconMarkup(kind, 15, 'rgba(20,18,15,0.92)')}</div>`
}

function markerIcon(Lmod: typeof L, it: TimelineEditorItem, crowded: boolean): L.DivIcon {
  const isPhoto = it.kind === 'photo'
  const locked = isPhoto && !!it.locked
  const moved = isPhoto && !!it.moved

  // Il lucchetto sul pin è SEMPRE presente per una foto (chiuso o aperto) e si tocca
  // direttamente: è il modo di bloccare/sbloccare senza passare dall'elenco. Zona di tocco più
  // larga dell'icona vera (24px invece di 16) per non far fallire il tocco su schermi piccoli —
  // vedi bindBadgeHandlers per come diventa cliccabile.
  const lockBadge = isPhoto
    ? `<div class="${LOCK_BADGE_CLASS}" style="position:absolute;right:-9px;bottom:-1px;width:24px;height:24px;display:flex;align-items:center;justify-content:center;cursor:pointer">
         <span style="width:16px;height:16px;border-radius:50%;background:${locked ? '#c05a17' : '#277134'};border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:9px;line-height:1;color:#fff;box-shadow:0 1px 3px rgba(0,0,0,0.35)">${locked ? '🔒' : '🔓'}</span>
       </div>`
    : ''
  // Il ripristino è SEMPRE visibile quando la foto non è più al suo punto originale, bloccata o
  // no: è un'informazione ("questa non è dove l'hai scattata"), non solo un comando per chi
  // l'ha appena sbloccata.
  const resetBadge = moved
    ? `<div class="${RESET_BADGE_CLASS}" style="position:absolute;left:-9px;top:-9px;width:24px;height:24px;display:flex;align-items:center;justify-content:center;cursor:pointer">
         <span style="width:16px;height:16px;border-radius:50%;background:#38bdf8;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:10px;line-height:1;color:#fff;box-shadow:0 1px 3px rgba(0,0,0,0.35)">↺</span>
       </div>`
    : ''

  const body = isPhoto
    ? photoPinHtml(it.thumbUrl, crowded, locked)
    : interludeBadgeHtml(it.interludeKind ?? 'numeri', crowded)

  // Il pin della foto è alto (corpo + punta) e va ancorato sulla PUNTA, non al centro: è la punta
  // che indica il punto del percorso, come per qualunque segnaposto. Lo stacco resta un disco
  // ancorato al proprio centro.
  const w = isPhoto ? PHOTO_PIN_W : 30
  const h = isPhoto ? PHOTO_PIN_H + PHOTO_PIN_TIP : 30
  // iconSize è il riquadro cliccabile dell'INTERO marker: allargato per includere i pallini che
  // sporgono dai bordi, altrimenti un tocco sul lucchetto cadrebbe fuori e sembrerebbe morto.
  const padX = isPhoto ? 18 : 0, padY = isPhoto ? 18 : 0

  return Lmod.divIcon({
    html: `<div style="position:relative;width:${w}px;height:${h}px;margin:${padY / 2}px ${padX / 2}px">
             ${body}${lockBadge}${resetBadge}
           </div>`,
    iconSize: [w + padX, h + padY],
    iconAnchor: isPhoto ? [(w + padX) / 2, h + padY / 2] : [(w + padX) / 2, (h + padY) / 2],
    className: '',
  })
}

/**
 * Ricollega i gestori dei pallini lucchetto/ripristino dopo OGNI setIcon: divIcon sostituisce il
 * nodo DOM del marker da zero ad ogni chiamata, quindi qualunque listener attaccato prima sparisce
 * insieme al nodo vecchio — va rifatto ogni volta, non solo alla creazione.
 *
 * stopPropagation su mousedown/touchstart, non solo su click: Leaflet.Draggable avvia il
 * trascinamento al mousedown sull'intero elemento icona, prima che un click abbia la possibilità
 * di distinguere "hai toccato il lucchetto" da "hai toccato il pallino". Senza fermarlo lì,
 * toccare il lucchetto sposterebbe comunque la foto di qualche pixel prima di sbloccarla.
 */
function bindBadgeHandlers(
  Lmod: typeof L, m: L.Marker,
  handlers: { onToggleLock?: () => void; onReset?: () => void },
) {
  const el = m.getElement()
  if (!el) return
  const stop = (ev: Event) => Lmod.DomEvent.stopPropagation(ev)

  const lockEl = el.querySelector<HTMLElement>(`.${LOCK_BADGE_CLASS}`)
  if (lockEl && handlers.onToggleLock) {
    lockEl.addEventListener('mousedown', stop)
    lockEl.addEventListener('touchstart', stop, { passive: true })
    lockEl.addEventListener('click', ev => { ev.stopPropagation(); handlers.onToggleLock!() })
  }
  const resetEl = el.querySelector<HTMLElement>(`.${RESET_BADGE_CLASS}`)
  if (resetEl && handlers.onReset) {
    resetEl.addEventListener('mousedown', stop)
    resetEl.addEventListener('touchstart', stop, { passive: true })
    resetEl.addEventListener('click', ev => { ev.stopPropagation(); openResetConfirm(m, handlers.onReset!) })
  }
}

/**
 * Popup di conferma ancorato al marker stesso: "ripristinare?" con Annulla/Ripristina, la stessa
 * domanda posta in due tempi già in uso nell'elenco foto, ma qui accanto al pallino invece che in
 * una lista — non serve aprire l'elenco per disfare uno spostamento fatto per errore sulla mappa.
 */
function openResetConfirm(m: L.Marker, onConfirm: () => void) {
  const html = `
    <div style="font:12px/1.4 -apple-system,system-ui,sans-serif;max-width:170px">
      <p style="margin:0 0 8px;color:#332e27">Ripristinare questa foto dov'è stata scattata?</p>
      <div style="display:flex;gap:6px;justify-content:flex-end">
        <button class="rle-reset-cancel" style="font:700 11px system-ui;background:#eeece5;color:#5e564c;border:none;border-radius:8px;padding:5px 9px;cursor:pointer">Annulla</button>
        <button class="rle-reset-confirm" style="font:700 11px system-ui;background:#c05a17;color:#fff;border:none;border-radius:8px;padding:5px 9px;cursor:pointer">Ripristina</button>
      </div>
    </div>`
  m.bindPopup(html, { closeButton: true, className: 'rle-popup', offset: [0, -6] }).openPopup()
  const popupEl = m.getPopup()?.getElement()
  if (!popupEl) return
  popupEl.querySelector<HTMLElement>('.rle-reset-cancel')?.addEventListener('click', () => m.closePopup())
  popupEl.querySelector<HTMLElement>('.rle-reset-confirm')?.addEventListener('click', () => {
    m.closePopup()
    onConfirm()
  })
}

export default function RouteLeafletEditor({
  trackPoints, items, routeSeconds, shape: trackShape, roundTrip, onMove, onToggleLock, onReset, fill,
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
  const onToggleLockRef = useRef(onToggleLock)
  onToggleLockRef.current = onToggleLock
  const onResetRef = useRef(onReset)
  onResetRef.current = onReset

  const [mapReady, setMapReady] = useState(false)
  // Anteprima live dell'affollamento durante un trascinamento in corso: senza, il cerchio arancio
  // comparirebbe solo a rilascio avvenuto, cioè un istante troppo tardi per essere una guida.
  const [dragPreview, setDragPreview] = useState<Record<string, number> | null>(null)
  // Istruzioni e dettaglio dell'affollamento: chiusi di partenza, si aprono solo se chiesti.
  const [showHelp, setShowHelp] = useState(false)
  const [showCrowdDetail, setShowCrowdDetail] = useState(false)

  const gpsPoints = trackPoints.filter(p => p.lat != null && p.lon != null) as { lat: number; lon: number }[]
  const coords: [number, number][] = gpsPoints.map(p => [p.lat, p.lon])

  // Costruito UNA VOLTA per tracciato, non ad ogni movimento del dito: vedi il commento su
  // buildRouteProjector in lib/videoTimeline.ts per perché è la differenza fra un pallino che
  // segue il dito e uno che sembra opporre resistenza.
  const projector = useMemo(() => buildRouteProjector(trackPoints), [trackPoints])
  const projectorRef = useRef(projector)
  projectorRef.current = projector

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

      const badgeHandlers = it.kind === 'photo' ? {
        onToggleLock: onToggleLockRef.current ? () => onToggleLockRef.current!(it.id) : undefined,
        onReset: onResetRef.current ? () => onResetRef.current!(it.id) : undefined,
      } : undefined

      let m = markersRef.current.get(it.id)
      if (!m) {
        m = Lmod.marker([pt.lat, pt.lon], { icon: markerIcon(Lmod, it, crowded0.has(it.id)), draggable: !it.locked })
          .addTo(map)
        m.on('drag', () => {
          const ll = m!.getLatLng()
          const p = progressFromLatLngOn(projectorRef.current, ll.lat, ll.lng)
          setDragPreview(prev => ({ ...(prev ?? {}), [it.id]: p }))
        })
        m.on('dragend', () => {
          const ll = m!.getLatLng()
          const p = progressFromLatLngOn(projectorRef.current, ll.lat, ll.lng)
          setDragPreview(prev => { if (!prev) return prev; const { [it.id]: _drop, ...rest } = prev; return rest })
          onMoveRef.current(it.id, p)
        })
        markersRef.current.set(it.id, m)
        if (badgeHandlers) bindBadgeHandlers(Lmod, m, badgeHandlers)
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
        // setIcon appena sopra ha sostituito il nodo DOM: i gestori dei pallini vanno ricollegati,
        // sempre, non solo alla creazione — vedi il commento su bindBadgeHandlers.
        if (badgeHandlers) bindBadgeHandlers(Lmod, m, badgeHandlers)
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
      if (!m) continue
      // MAI setIcon sul marker che si sta trascinando in questo istante: divIcon ricostruisce da
      // zero il nodo DOM, e Leaflet.Draggable resta agganciato a quello VECCHIO, ormai staccato
      // dalla pagina. Il trascinamento si interrompe a metà gesto — ed è proprio la condizione in
      // cui accadeva sempre, perché avvicinarsi a un altro elemento (cioè cambiare stato di
      // affollamento) è esattamente quello che si fa mentre si trascina. L'anello arancio su quel
      // marker arriva al rilascio, un istante dopo; su tutti gli altri resta immediato.
      if (dragPreview && dragPreview[it.id] !== undefined) continue
      m.setIcon(markerIcon(Lmod, it, is))
      if (it.kind === 'photo') {
        bindBadgeHandlers(Lmod, m, {
          onToggleLock: onToggleLockRef.current ? () => onToggleLockRef.current!(it.id) : undefined,
          onReset: onResetRef.current ? () => onResetRef.current!(it.id) : undefined,
        })
      }
    }
    lastCrowdedRef.current = next
    // dragPreview è letto qui dentro ma volutamente fuori dalle dipendenze: cambia ad ogni tick di
    // trascinamento e `crowding` cambia già insieme a lui, quindi aggiungerlo raddoppierebbe le
    // esecuzioni senza cambiare l'esito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
              {' '}(cerchiati in arancio). Il video si fermerebbe due volte con poco percorso in mezzo: allontanali
              trascinandoli sulla mappa.
            </p>
          </div>
        )}

        {showHelp && (
          <div className="rounded-xl bg-white/97 border border-stone-200 shadow-lg px-3 py-2.5 space-y-2">
            <p className="text-stone-700 text-[11px] leading-relaxed">
              Trascina i pallini per scegliere dove cadono foto e stacchi: si agganciano al punto del percorso
              più vicino. Il lucchetto su una foto la blocca o la sblocca. Il pallino ↺ compare quando la foto
              non è più dove è stata scattata e la riporta al punto originale.
              {roundTrip && ' Questo percorso è un andata e ritorno e il video mostra solo l’andata: posiziona tutto su quella.'}
            </p>
            {interludeItems.length > 0 && (
              <div className="flex flex-wrap gap-x-3 gap-y-1 pt-0.5 border-t border-stone-200">
                <span className="flex items-center gap-1.5 text-[10px] text-stone-500 mt-1.5">
                  <span className="w-4 h-4 rounded-[4px] bg-white border border-stone-300 flex items-center justify-center shrink-0">
                    <ImageIcon className="w-2.5 h-2.5 text-stone-600" />
                  </span>
                  Foto
                </span>
                {interludeItems.map(i => {
                  const Icon = INTERLUDE_ICON[i.interludeKind ?? 'numeri']
                  return (
                    <span key={i.id} className="flex items-center gap-1.5 text-[10px] text-stone-500 mt-1.5">
                      <span className="w-4 h-4 rounded-full flex items-center justify-center shrink-0"
                        style={{ background: INTERLUDE_TINT[i.interludeKind ?? 'numeri'] }}>
                        <Icon className="w-2.5 h-2.5" style={{ color: 'rgba(20,18,15,0.92)' }} strokeWidth={2.5} />
                      </span>
                      {i.label}
                    </span>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
