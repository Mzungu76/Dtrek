'use client'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import type * as L from 'leaflet'
import { useEffect, useRef } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { loadLeafletWithCluster } from '@/lib/loadLeafletCluster'
import { META_TYPE_CONFIG, type MetaType } from '@/lib/metaTypes'

export interface MeteMapPin {
  id: string
  metaType: MetaType
  title: string
  latitude: number
  longitude: number
  /** URL della Meta (di solito /guida/{id}/prima_di_partire) — il popup del pin apre questo link,
   *  stessa destinazione della riga corrispondente in elenco. */
  href: string
}

interface Props {
  pins: MeteMapPin[]
  height?: string
  /** Posizione dell'utente (piano Fase 3 — "Vicino a me") — solo per il marker "sei qui", mai
   *  richiesta da questo componente: il permesso di geolocalizzazione si chiede nella pagina che
   *  lo monta, non qui. Può arrivare DOPO il primo render (la geolocalizzazione è asincrona): il
   *  marker si aggiorna quando cambia, non solo al mount. */
  userLocation?: { lat: number; lon: number } | null
}

// Icona SVG del componente lucide di META_TYPE_CONFIG[metaType].icon, resa a markup statico una
// volta sola per tipologia — Leaflet vuole HTML per un divIcon, non un albero React montato: senza
// questo, il pin sulla carta e il chip di filtro potevano disallinearsi (segnalazione dell'utente:
// "i pin devono essere uguali alle icone dei filtri"). Stessa icona, stesso colore
// (lib/metaTypes.ts's `color`) di chip e miniatura di riga (app/percorsi/page.tsx) — un solo posto
// decide "che aspetto ha un Sentiero/Borgo/Sito", non tre copie.
const PIN_GLYPH_SVG: Record<MetaType, string> = Object.fromEntries(
  (Object.keys(META_TYPE_CONFIG) as MetaType[]).map(t => {
    const Icon = META_TYPE_CONFIG[t].icon
    return [t, renderToStaticMarkup(<Icon color="#fff" strokeWidth={2.3} size={15} />)]
  }),
) as Record<MetaType, string>

const PIN_SHAPE_SIZE = 30

function pinIconHtml(metaType: MetaType): string {
  const color = META_TYPE_CONFIG[metaType].color
  const glyph = `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding-bottom:6px">${PIN_GLYPH_SVG[metaType]}</div>`
  if (metaType === 'borgo_citta') {
    return `<div style="width:${PIN_SHAPE_SIZE}px;height:${PIN_SHAPE_SIZE + 6}px;transform:translate(-50%,-100%);position:relative">
      <svg width="${PIN_SHAPE_SIZE}" height="${PIN_SHAPE_SIZE + 6}" viewBox="0 0 30 36" style="position:absolute;inset:0">
        <rect x="3" y="3" width="24" height="24" rx="5" fill="${color}" stroke="#F5EDDD" stroke-width="2"/>
        <path d="M15 33l-5-7h10z" fill="${color}" stroke="#F5EDDD" stroke-width="2" stroke-linejoin="round"/>
      </svg>
      ${glyph}
    </div>`
  }
  if (metaType === 'sito') {
    return `<div style="width:${PIN_SHAPE_SIZE}px;height:${PIN_SHAPE_SIZE + 6}px;transform:translate(-50%,-100%);position:relative">
      <svg width="${PIN_SHAPE_SIZE}" height="${PIN_SHAPE_SIZE + 6}" viewBox="0 0 30 36" style="position:absolute;inset:0">
        <circle cx="15" cy="14" r="12" fill="${color}" stroke="#F5EDDD" stroke-width="2"/>
        <path d="M15 33l-5-7h10z" fill="${color}" stroke="#F5EDDD" stroke-width="2" stroke-linejoin="round"/>
      </svg>
      ${glyph}
    </div>`
  }
  return `<div style="width:${PIN_SHAPE_SIZE}px;height:${PIN_SHAPE_SIZE + 8}px;transform:translate(-50%,-100%);position:relative">
    <svg width="${PIN_SHAPE_SIZE}" height="${PIN_SHAPE_SIZE + 8}" viewBox="0 0 30 38" style="position:absolute;inset:0">
      <path d="M15 37C15 37 27 24.5 27 15.5A12 12 0 1 0 3 15.5C3 24.5 15 37 15 37Z" fill="${color}" stroke="#F5EDDD" stroke-width="2"/>
    </svg>
    <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding-bottom:12px">${PIN_GLYPH_SVG.sentiero}</div>
  </div>`
}

function popupHtml(pin: MeteMapPin): string {
  return `<div style="font-family:'Lora',Georgia,serif;font-weight:600;font-size:13px;color:#2E2A22;margin-bottom:4px">${escapeHtml(pin.title)}</div>
    <a href="${pin.href}" style="font-family:'Caveat',cursive;font-weight:700;font-size:15px;color:#C0603D;text-decoration:none">Apri la Meta →</a>`
}

function addPinsToCluster(L: typeof import('leaflet'), clusterGroup: L.MarkerClusterGroup, pins: MeteMapPin[]) {
  clusterGroup.clearLayers()
  for (const pin of pins) {
    const icon = L.divIcon({ className: '', html: pinIconHtml(pin.metaType), iconSize: [PIN_SHAPE_SIZE, PIN_SHAPE_SIZE + 8], iconAnchor: [PIN_SHAPE_SIZE / 2, PIN_SHAPE_SIZE + 8] })
    const marker = L.marker([pin.latitude, pin.longitude], { icon, title: pin.title })
    // Fumetto minimo: titolo + link alla stessa destinazione della riga in elenco
    // (/guida/{id}/prima_di_partire) — non una riproduzione dell'intera riga React dentro un
    // popup Leaflet (portale complesso per un guadagno marginale), solo l'essenziale per aprire
    // la Meta dal pin.
    marker.bindPopup(popupHtml(pin), { closeButton: true, className: 'mete-map-popup' })
    clusterGroup.addLayer(marker)
  }
}

/**
 * La carta delle Mete (piano di restyling, Fase 3) — mappa d'insieme di tutte le Mete filtrate,
 * montata SOLO quando l'utente apre la carta (mai al caricamento della pagina, app/percorsi/
 * page.tsx tiene questo componente fuori dall'albero finché `mapOpen` non è vero). Stessa
 * infrastruttura di components/bacheca/TerritoryMap.tsx (loader Leaflet+cluster condiviso via
 * lib/loadLeafletCluster.ts, stesse tile `/api/tile`), ma pin per tipologia invece di badge POI:
 * qui ogni pin è una Meta dell'utente, non un punto di interesse generico.
 *
 * `pins`/`userLocation` possono cambiare DOPO il mount (i chip di filtro sulla pagina, la
 * geolocalizzazione asincrona) — la mappa reagisce aggiornando i marker esistenti invece di
 * ricrearsi da zero, così pan/zoom dell'utente non saltano a ogni tocco su un filtro.
 */
export default function MeteMap({ pins, height = '260px', userLocation }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<L.Map | null>(null)
  const leafletRef = useRef<typeof import('leaflet') | null>(null)
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null)
  const userMarkerRef = useRef<L.CircleMarker | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  // Il mount è asincrono (loadLeafletWithCluster().then(...)) — se `pins`/`userLocation` cambiano
  // mentre il caricamento è ancora in corso, il callback deve vedere il valore più recente al
  // momento in cui la mappa è pronta, non quello (potenzialmente superato) catturato alla prima
  // chiamata di questo componente. Aggiornati a ogni render, letti dentro gli effect.
  const latestPinsRef = useRef(pins)
  latestPinsRef.current = pins
  const latestUserLocationRef = useRef(userLocation)
  latestUserLocationRef.current = userLocation

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return

    let cancelled = false
    loadLeafletWithCluster().then(L => {
      if (cancelled || !mapRef.current || mapInstance.current) return
      leafletRef.current = L

      const map = L.map(mapRef.current!).setView([42, 12.5], 7)
      mapInstance.current = map

      L.tileLayer('/api/tile?z={z}&x={x}&y={y}&style=light', {
        attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map)

      const clusterGroup = L.markerClusterGroup({
        maxClusterRadius: 44,
        spiderfyOnMaxZoom: true,
        iconCreateFunction: (cluster) => L.divIcon({
          className: '',
          html: `<div style="width:30px;height:30px;border-radius:50%;background:#5F7355;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;border:2px solid #F5EDDD;box-shadow:0 1px 3px rgba(46,42,34,.4)">${cluster.getChildCount()}</div>`,
          iconSize: [30, 30],
        }),
      })
      addPinsToCluster(L, clusterGroup, latestPinsRef.current)
      clusterGroup.addTo(map)
      clusterGroupRef.current = clusterGroup

      const loc = latestUserLocationRef.current
      if (loc) {
        userMarkerRef.current = L.circleMarker([loc.lat, loc.lon], {
          radius: 7, color: '#F5EDDD', weight: 2, fillColor: '#3B82F6', fillOpacity: 1,
        }).addTo(map)
      }

      const bounds = clusterGroup.getBounds()
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [32, 32], maxZoom: 13 })

      const ro = new ResizeObserver(() => map.invalidateSize())
      ro.observe(mapRef.current!)
      resizeObserverRef.current = ro
    }).catch(err => {
      if (!cancelled) console.error('MeteMap: inizializzazione mappa fallita', err)
    })

    return () => {
      cancelled = true
      resizeObserverRef.current?.disconnect()
      resizeObserverRef.current = null
      clusterGroupRef.current = null
      userMarkerRef.current = null
      leafletRef.current = null
      if (mapInstance.current) {
        mapInstance.current.remove()
        mapInstance.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo mount/unmount: pins/userLocation
    // sono seguiti dai due effect sotto, che leggono i ref sempre aggiornati qui sopra.
  }, [])

  // I filtri di tipologia (e ricerca/preferiti) cambiano `pins` mentre la carta resta aperta — si
  // ripercuotono subito sui marker esistenti, senza ricreare la mappa (pan/zoom dell'utente
  // restano dove sono, il riquadro si adatta di nuovo al nuovo insieme di pin).
  useEffect(() => {
    const L = leafletRef.current
    const map = mapInstance.current
    const clusterGroup = clusterGroupRef.current
    if (!L || !map || !clusterGroup) return // mount ancora in corso: lo userà lui stesso i pin più recenti
    addPinsToCluster(L, clusterGroup, pins)
    const bounds = clusterGroup.getBounds()
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [32, 32], maxZoom: 13 })
  }, [pins])

  // La geolocalizzazione è asincrona e può risolversi dopo che la mappa è già montata — il pallino
  // "sei qui" compare/si sposta/sparisce quando userLocation cambia, non solo al primo mount.
  useEffect(() => {
    const L = leafletRef.current
    const map = mapInstance.current
    if (!L || !map) return
    if (userMarkerRef.current) { userMarkerRef.current.remove(); userMarkerRef.current = null }
    if (userLocation) {
      userMarkerRef.current = L.circleMarker([userLocation.lat, userLocation.lon], {
        radius: 7, color: '#F5EDDD', weight: 2, fillColor: '#3B82F6', fillOpacity: 1,
      }).addTo(map)
    }
  }, [userLocation])

  const validPins = pins.filter(p => Number.isFinite(p.latitude) && Number.isFinite(p.longitude))
  if (validPins.length === 0) return null

  return <div ref={mapRef} style={{ height, width: '100%' }} className="overflow-hidden" />
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
