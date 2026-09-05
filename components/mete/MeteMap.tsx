'use client'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import type * as L from 'leaflet'
import { useEffect, useRef } from 'react'
import { loadLeafletWithCluster } from '@/lib/loadLeafletCluster'
import type { MetaType } from '@/lib/metaTypes'

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
   *  lo monta, non qui. */
  userLocation?: { lat: number; lon: number } | null
}

// Forma diversa per tipologia, non solo colore (piano — il mockup approvato: "goccia = sentiero,
// quadrato = borgo/città, cerchio = sito"), coerente con la legenda della striscia chiusa in
// app/percorsi/page.tsx. Stessi toni "Taccuino Botanico" già in uso nell'elenco (lib/taccuinoTokens).
const PIN_COLOR: Record<MetaType, string> = {
  sentiero: '#7C8F6E',
  borgo_citta: '#C0603D',
  sito: '#5F7355',
}

function pinIconHtml(metaType: MetaType): string {
  const color = PIN_COLOR[metaType]
  if (metaType === 'borgo_citta') {
    return `<div style="width:26px;height:26px;transform:translate(-50%,-100%)">
      <svg width="26" height="32" viewBox="0 0 28 34">
        <rect x="3" y="3" width="22" height="22" rx="4" fill="${color}" stroke="#F5EDDD" stroke-width="2"/>
        <path d="M14 31l-4.5-7h9z" fill="${color}" stroke="#F5EDDD" stroke-width="2" stroke-linejoin="round"/>
      </svg>
    </div>`
  }
  if (metaType === 'sito') {
    return `<div style="width:26px;height:26px;transform:translate(-50%,-100%)">
      <svg width="26" height="32" viewBox="0 0 28 34">
        <circle cx="14" cy="13" r="11" fill="${color}" stroke="#F5EDDD" stroke-width="2"/>
        <path d="M14 31l-4.5-7h9z" fill="${color}" stroke="#F5EDDD" stroke-width="2" stroke-linejoin="round"/>
      </svg>
    </div>`
  }
  return `<div style="width:24px;height:30px;transform:translate(-50%,-100%)">
    <svg width="24" height="30" viewBox="0 0 28 34">
      <path d="M14 33C14 33 25 21.5 25 13.5A11 11 0 1 0 3 13.5C3 21.5 14 33 14 33Z" fill="${color}" stroke="#F5EDDD" stroke-width="2"/>
    </svg>
  </div>`
}

/**
 * La carta delle Mete (piano di restyling, Fase 3) — mappa d'insieme di tutte le Mete filtrate,
 * montata SOLO quando l'utente apre la carta (mai al caricamento della pagina, app/percorsi/
 * page.tsx tiene questo componente fuori dall'albero finché `mapOpen` non è vero). Stessa
 * infrastruttura di components/bacheca/TerritoryMap.tsx (loader Leaflet+cluster condiviso via
 * lib/loadLeafletCluster.ts, stesse tile `/api/tile`), ma pin per tipologia invece di badge POI:
 * qui ogni pin è una Meta dell'utente, non un punto di interesse generico.
 */
export default function MeteMap({ pins, height = '260px', userLocation }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<L.Map | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)

  const validPins = pins.filter(p => Number.isFinite(p.latitude) && Number.isFinite(p.longitude))

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return
    if (validPins.length === 0) return

    let cancelled = false
    loadLeafletWithCluster().then(L => {
      if (cancelled || !mapRef.current || mapInstance.current) return

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
      for (const pin of validPins) {
        const icon = L.divIcon({ className: '', html: pinIconHtml(pin.metaType), iconSize: [26, 32], iconAnchor: [13, 32] })
        const marker = L.marker([pin.latitude, pin.longitude], { icon, title: pin.title })
        // Fumetto minimo: titolo + link alla stessa destinazione della riga in elenco
        // (/guida/{id}/prima_di_partire) — non una riproduzione dell'intera riga React dentro un
        // popup Leaflet (portale complesso per un guadagno marginale), solo l'essenziale per
        // aprire la Meta dal pin.
        marker.bindPopup(
          `<div style="font-family:'Lora',Georgia,serif;font-weight:600;font-size:13px;color:#2E2A22;margin-bottom:4px">${escapeHtml(pin.title)}</div>
           <a href="${pin.href}" style="font-family:'Caveat',cursive;font-weight:700;font-size:15px;color:#C0603D;text-decoration:none">Apri la Meta →</a>`,
          { closeButton: true, className: 'mete-map-popup' },
        )
        clusterGroup.addLayer(marker)
      }
      clusterGroup.addTo(map)

      if (userLocation) {
        L.circleMarker([userLocation.lat, userLocation.lon], {
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
      if (mapInstance.current) {
        mapInstance.current.remove()
        mapInstance.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (validPins.length === 0) return null

  return <div ref={mapRef} style={{ height }} className="rounded-xl overflow-hidden" />
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
