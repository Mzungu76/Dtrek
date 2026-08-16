'use client'
import 'leaflet/dist/leaflet.css'
import type * as L from 'leaflet'
import { useEffect, useRef, useState } from 'react'
import type { PublicGroup } from '@/lib/groupSharePublic'

interface Props {
  token: string
  initial: PublicGroup
}

const TILE_URL = '/api/tile?z={z}&x={x}&y={y}&style=voyager'
const POLL_MS = 12000 // stessa cadenza di LiveShareViewer.tsx (Fase 1)
// Palette fissa, ripetuta ciclicamente per gruppi numerosi — non serve un colore per
// partecipante garantito univoco, solo distinguibile a occhio tra pochi marker vicini.
const MEMBER_COLORS = ['#0284c7', '#dc2626', '#16a34a', '#9333ea', '#ea580c', '#0d9488']

function timeAgo(iso: string): string {
  const sec = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (sec < 60) return `${sec}s fa`
  const min = Math.round(sec / 60)
  if (min < 60) return `${min} min fa`
  return `${Math.round(min / 60)}h fa`
}

/**
 * Visualizzatore pubblico multi-partecipante — Fase 9 di docs/navigator-orizzonti-roadmap.md.
 * Stessa struttura di LiveShareViewer.tsx (Fase 1): marker disegnati subito al mount (non
 * attesi dal primo poll, stesso fix del bug segnalato sulla Fase 1), poi aggiornati a ogni
 * sondaggio.
 */
export default function GroupShareViewer({ token, initial }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<L.Map | null>(null)
  const markers = useRef<Map<string, L.CircleMarker>>(new Map())
  const [group, setGroup] = useState<PublicGroup>(initial)
  const [mapReady, setMapReady] = useState(false)
  const [stale, setStale] = useState(false)

  useEffect(() => {
    let cancelled = false
    import('leaflet').then((L) => {
      if (cancelled || !mapRef.current || mapInstance.current) return
      const first = initial.members[0]
      const map = L.map(mapRef.current, { zoomControl: true, attributionControl: false })
        .setView(first ? [first.lat, first.lon] : [41.9, 12.5], first ? 14 : 5)
      L.tileLayer(TILE_URL, { maxZoom: 18 }).addTo(map)
      mapInstance.current = map
      setTimeout(() => map.invalidateSize(), 0)
      setMapReady(true)
    })
    return () => { cancelled = true; mapInstance.current?.remove(); mapInstance.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapInstance.current
    if (!map) return
    import('leaflet').then((L) => {
      const seen = new Set<string>()
      group.members.forEach((m, i) => {
        seen.add(m.displayName)
        const color = MEMBER_COLORS[i % MEMBER_COLORS.length]
        const existing = markers.current.get(m.displayName)
        if (existing) {
          existing.setLatLng([m.lat, m.lon])
        } else {
          const marker = L.circleMarker([m.lat, m.lon], {
            radius: 9, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1,
          }).bindTooltip(m.displayName, { permanent: false, direction: 'top' }).addTo(map)
          markers.current.set(m.displayName, marker)
        }
      })
      // Rimuove i marker di partecipanti non più presenti nella risposta (es. sessione scaduta/uscita dal gruppo).
      Array.from(markers.current.keys()).forEach((name) => {
        if (!seen.has(name)) { markers.current.get(name)?.remove(); markers.current.delete(name) }
      })

      if (group.members.length > 0) {
        const bounds = L.latLngBounds(group.members.map((m) => [m.lat, m.lon] as [number, number]))
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 })
      }
    })
  }, [group, mapReady])

  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/navigation/groups/${token}`, { cache: 'no-store' })
        if (!res.ok) { setStale(true); return }
        setGroup(await res.json())
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
        <p className="text-sm font-semibold text-stone-800">{group.groupName}</p>
        <p className={`text-xs mt-0.5 ${stale ? 'text-terra-600 font-medium' : 'text-stone-500'}`}>
          {stale
            ? 'Impossibile aggiornare — ultime posizioni note'
            : group.members.length === 0
              ? 'Nessun partecipante ha ancora una posizione'
              : `${group.members.length} ${group.members.length === 1 ? 'partecipante' : 'partecipanti'}`}
        </p>
      </div>
      <div ref={mapRef} className="absolute inset-0" />
      {!mapReady && (
        <div className="absolute inset-0 z-[5] flex items-center justify-center bg-stone-100/90 pointer-events-none">
          <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-white shadow-lg border border-stone-200">
            <span className="w-3.5 h-3.5 rounded-full border-2 border-sky-600 border-t-transparent animate-spin" />
            <span className="text-sm font-medium text-stone-600">Caricamento…</span>
          </div>
        </div>
      )}
      {group.members.length > 0 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 text-[11px] text-stone-500 bg-white/90 px-2.5 py-1 rounded-full shadow">
          Aggiornato {timeAgo(group.members[0].lastUpdateTs)}
        </div>
      )}
    </div>
  )
}
