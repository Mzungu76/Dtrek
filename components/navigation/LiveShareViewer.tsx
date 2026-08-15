'use client'
import 'leaflet/dist/leaflet.css'
import type * as L from 'leaflet'
import { useEffect, useRef, useState } from 'react'
import type { PublicLiveSession } from '@/lib/liveSharePublic'

interface Props {
  token: string
  initial: PublicLiveSession
}

const MARKER_COLOR = '#0284c7'
const TILE_URL = '/api/tile?z={z}&x={x}&y={y}&style=voyager'
// Lettura ogni 10-15s — vedi docs/navigator-orizzonti-roadmap.md, Fase 1: due frequenze
// distinte e configurabili (scrittura lato camminatore ~15-20s, lettura qui ~10-15s),
// nessuna precisione promessa oltre il fix GPS realmente disponibile in quel momento.
const POLL_MS = 12000

function timeAgo(iso: string): string {
  const sec = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (sec < 60) return `${sec}s fa`
  const min = Math.round(sec / 60)
  if (min < 60) return `${min} min fa`
  const h = Math.round(min / 60)
  return `${h}h fa`
}

/**
 * Visualizzatore pubblico, nessun login — Fase 1 di docs/navigator-orizzonti-roadmap.md.
 * Stesso tile layer/marker di FreeTrackMap.tsx (semplificato: nessuna traccia, nessuna freccia
 * di direzione, il payload pubblico non porta bearing) — sondaggio periodico della stessa
 * route pubblica che ha servito il render iniziale.
 */
export default function LiveShareViewer({ token, initial }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<L.Map | null>(null)
  const marker = useRef<L.CircleMarker | null>(null)
  const accuracyCircle = useRef<L.Circle | null>(null)
  const [session, setSession] = useState<PublicLiveSession>(initial)
  const [stale, setStale] = useState(false)

  useEffect(() => {
    let cancelled = false
    import('leaflet').then((L) => {
      if (cancelled || !mapRef.current || mapInstance.current) return
      const map = L.map(mapRef.current, { zoomControl: true, attributionControl: false })
        .setView([initial.lat, initial.lon], 15)
      L.tileLayer(TILE_URL, { maxZoom: 18 }).addTo(map)
      mapInstance.current = map
      setTimeout(() => map.invalidateSize(), 0)
    })
    return () => { cancelled = true; mapInstance.current?.remove(); mapInstance.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapInstance.current
    if (!map) return
    import('leaflet').then((L) => {
      if (marker.current) {
        marker.current.setLatLng([session.lat, session.lon])
      } else {
        marker.current = L.circleMarker([session.lat, session.lon], {
          radius: 9, color: '#fff', weight: 2, fillColor: MARKER_COLOR, fillOpacity: 1,
        }).addTo(map)
      }
      if (session.accuracyM != null && session.accuracyM > 0) {
        if (accuracyCircle.current) {
          accuracyCircle.current.setLatLng([session.lat, session.lon])
          accuracyCircle.current.setRadius(session.accuracyM)
        } else {
          accuracyCircle.current = L.circle([session.lat, session.lon], {
            radius: session.accuracyM, color: MARKER_COLOR, weight: 1, fillColor: MARKER_COLOR, fillOpacity: 0.12, interactive: false,
          }).addTo(map)
        }
      }
      map.panTo([session.lat, session.lon], { animate: true })
    })
  }, [session])

  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/navigation/share/${token}`, { cache: 'no-store' })
        if (!res.ok) { setStale(true); return }
        const data = (await res.json()) as PublicLiveSession
        setSession(data)
        setStale(false)
      } catch {
        setStale(true)
      }
    }, POLL_MS)
    return () => clearInterval(id)
  }, [token])

  return (
    <div className="fixed inset-0 flex flex-col">
      <div className="absolute top-0 inset-x-0 z-10 bg-white/95 backdrop-blur-sm border-b border-stone-200 px-4 py-3">
        <p className="text-sm font-semibold text-stone-800">{session.hikeTitle}</p>
        <p className={`text-xs mt-0.5 ${stale ? 'text-terra-600 font-medium' : 'text-stone-500'}`}>
          {stale ? 'Impossibile aggiornare — ultima posizione nota' : 'Posizione live'} · aggiornata {timeAgo(session.lastUpdateTs)}
        </p>
      </div>
      <div ref={mapRef} className="absolute inset-0" />
    </div>
  )
}
