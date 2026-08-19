'use client'
import 'leaflet/dist/leaflet.css'
import type * as L from 'leaflet'
import { useEffect, useRef, useState } from 'react'
import type { PublicLiveSession } from '@/lib/liveSharePublic'
import { computeLiveStatus, type LiveShareStatus } from '@/lib/navigation/liveShareStatus'
import { triggerDeadManAlert, requestDeadManAlertPermission, deadManAlertPermissionGranted } from '@/lib/navigation/deadManAlert'

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
// Indipendente dal poll — ricalcola l'età di last_live_ts anche se il poll smette di aggiornare
// `session` (proprio il caso che DTREK-AUDIT.md P0 #8 segnala: un poll che continua a rispondere
// 200 OK con lo stesso last_live_ts vecchio non farebbe mai avanzare lo stato altrimenti).
const TICK_MS = 5000

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
  // Rinominato da "stale": riflette SOLO un fallimento dell'ultima chiamata fetch (problema di
  // rete di chi guarda), non l'età della posizione — vedi `liveStatus` sotto per quella, i due
  // sono indipendenti (un fetch può riuscire e restituire comunque un last_live_ts vecchio di ore).
  const [unreachable, setUnreachable] = useState(false)
  // Ricalcolato ogni TICK_MS, indipendente dal poll — vedi commento su TICK_MS in testa al file.
  const [now, setNow] = useState(() => Date.now())
  const [alertsEnabled, setAlertsEnabled] = useState(false)
  const prevStatusRef = useRef<LiveShareStatus>('live')
  // Distinto da "session esiste" (la pagina non renderizza nemmeno senza — vedi
  // app/s/live/[token]/page.tsx, notFound() se fetchLiveSession non trova un fix): questo
  // traccia solo se la mappa Leaflet (caricata via import dinamico) e il primo marker sono già
  // a schermo, per non lasciare la mappa vuota e silenziosa nell'attesa.
  const [markerPlaced, setMarkerPlaced] = useState(false)

  const liveStatus = computeLiveStatus(session.lastUpdateTs, now)

  useEffect(() => {
    setAlertsEnabled(deadManAlertPermissionGranted())
  }, [])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(id)
  }, [])

  // Avviso solo all'INGRESSO in 'critical' (edge-triggered), mai a ogni render/tick — altrimenti
  // suonerebbe/vibrerebbe ogni TICK_MS finché lo stato resta critico.
  useEffect(() => {
    if (liveStatus === 'critical' && prevStatusRef.current !== 'critical') {
      triggerDeadManAlert(
        'DTrek — nessun aggiornamento',
        `${session.hikeTitle}: nessun aggiornamento di posizione da oltre 15 minuti.`,
      )
    }
    prevStatusRef.current = liveStatus
  }, [liveStatus, session.hikeTitle])

  useEffect(() => {
    let cancelled = false
    import('leaflet').then((L) => {
      if (cancelled || !mapRef.current || mapInstance.current) return
      const map = L.map(mapRef.current, { zoomControl: true, attributionControl: false })
        .setView([initial.lat, initial.lon], 15)
      L.tileLayer(TILE_URL, { maxZoom: 18 }).addTo(map)
      mapInstance.current = map
      setTimeout(() => map.invalidateSize(), 0)
      // Disegna subito il fix iniziale (già disponibile da SSR, nessun bisogno di aspettare il
      // primo sondaggio) invece di aspettare che l'altro effect si riattivi — quello dipende da
      // `session`, che non cambia finché non arriva la prima risposta di poll, fino a POLL_MS
      // dopo: senza questo la mappa restava vuota per tutta quell'attesa.
      marker.current = L.circleMarker([initial.lat, initial.lon], {
        radius: 9, color: '#fff', weight: 2, fillColor: MARKER_COLOR, fillOpacity: 1,
      }).addTo(map)
      if (initial.accuracyM != null && initial.accuracyM > 0) {
        accuracyCircle.current = L.circle([initial.lat, initial.lon], {
          radius: initial.accuracyM, color: MARKER_COLOR, weight: 1, fillColor: MARKER_COLOR, fillOpacity: 0.12, interactive: false,
        }).addTo(map)
      }
      setMarkerPlaced(true)
    })
    return () => { cancelled = true; mapInstance.current?.remove(); mapInstance.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Aggiornamenti successivi (ogni poll) — il marker esiste già a questo punto (disegnato
  // sopra), quindi qui è sempre un update in place, mai la prima creazione.
  useEffect(() => {
    const map = mapInstance.current
    if (!map || !marker.current) return
    marker.current.setLatLng([session.lat, session.lon])
    if (session.accuracyM != null && session.accuracyM > 0) {
      if (accuracyCircle.current) {
        accuracyCircle.current.setLatLng([session.lat, session.lon])
        accuracyCircle.current.setRadius(session.accuracyM)
      } else {
        import('leaflet').then((L) => {
          if (!mapInstance.current) return
          accuracyCircle.current = L.circle([session.lat, session.lon], {
            radius: session.accuracyM!, color: MARKER_COLOR, weight: 1, fillColor: MARKER_COLOR, fillOpacity: 0.12, interactive: false,
          }).addTo(mapInstance.current)
        })
      }
    }
    map.panTo([session.lat, session.lon], { animate: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, markerPlaced])

  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/navigation/share/${token}`, { cache: 'no-store' })
        if (!res.ok) { setUnreachable(true); return }
        const data = (await res.json()) as PublicLiveSession
        setSession(data)
        setUnreachable(false)
      } catch {
        setUnreachable(true)
      }
    }, POLL_MS)
    return () => clearInterval(id)
  }, [token])

  const enableAlerts = async () => {
    const granted = await requestDeadManAlertPermission()
    setAlertsEnabled(granted)
  }

  return (
    <div className="fixed inset-0 flex flex-col">
      <div
        className={`absolute top-0 inset-x-0 z-10 backdrop-blur-sm border-b px-4 py-3 ${
          liveStatus === 'critical' ? 'bg-red-600 border-red-700' : liveStatus === 'stale' ? 'bg-amber-50 border-amber-200' : 'bg-white/95 border-stone-200'
        }`}
      >
        <p className={`text-sm font-semibold ${liveStatus === 'critical' ? 'text-white' : 'text-stone-800'}`}>{session.hikeTitle}</p>
        <p
          className={`text-xs mt-0.5 font-medium ${
            liveStatus === 'critical' ? 'text-white' : unreachable || liveStatus === 'stale' ? 'text-amber-700' : 'text-stone-500 font-normal'
          }`}
        >
          {unreachable
            ? 'Impossibile aggiornare — ultima posizione nota'
            : liveStatus === 'critical'
              ? 'Nessun aggiornamento da oltre 15 minuti'
              : liveStatus === 'stale'
                ? 'Nessun aggiornamento recente — potrebbe essere temporaneo (galleria, bosco fitto)'
                : 'Posizione live'} · aggiornata {timeAgo(session.lastUpdateTs)}
        </p>
        {!alertsEnabled && (
          <button
            onClick={enableAlerts}
            className={`mt-1.5 text-xs font-semibold underline underline-offset-2 ${liveStatus === 'critical' ? 'text-white' : 'text-sky-700'}`}
          >
            🔔 Attiva avviso se la posizione si ferma
          </button>
        )}
      </div>
      <div ref={mapRef} className="absolute inset-0" />
      {!markerPlaced && (
        <div className="absolute inset-0 z-[5] flex items-center justify-center bg-stone-100/90 pointer-events-none">
          <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-white shadow-lg border border-stone-200">
            <span className="w-3.5 h-3.5 rounded-full border-2 border-sky-600 border-t-transparent animate-spin" />
            <span className="text-sm font-medium text-stone-600">Localizzazione in corso…</span>
          </div>
        </div>
      )}
    </div>
  )
}
