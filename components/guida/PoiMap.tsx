'use client'
import { useState } from 'react'
import dynamic from 'next/dynamic'
import { Lock, LockOpen, Maximize2, Minimize2, Box, LocateFixed, MapPin } from 'lucide-react'
import type { TrackPoint } from '@/lib/tcxParser'
import type { PoiItem } from '@/lib/overpass'

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false })

interface Props {
  trackPoints?: TrackPoint[]
  pois: PoiItem[]
  highlightedIndex?: number | null
  onPoiTap?: (poi: PoiItem) => void
  onOpenMap3D?: () => void
}

const chipBase = 'flex items-center justify-center w-9 h-9 rounded-full backdrop-blur-md border transition-colors shrink-0'
const chipIdle = `${chipBase} bg-black/50 border-white/15 text-white/90`
const chipActive = `${chipBase} bg-terra-500 border-terra-300/40 text-white`

/**
 * Mappa dedicata ai punti di interesse — stessi controlli della mappa "Il percorso"
 * (RouteMapSection: 3D/schermo intero/lucchetto/vista d'insieme) ma con un'impronta visiva
 * diversa (cornice terra invece di neutra, etichetta "Punti di interesse", pin più grandi) per
 * segnalare che qui il soggetto sono i POI, non il tracciato. Il tracciato resta visibile come
 * riferimento ma passa in secondo piano. Sincronizzata bidirezionalmente con le card della lista
 * tramite `highlightedIndex`/`onPoiTap`.
 */
export default function PoiMap({ trackPoints, pois, highlightedIndex = null, onPoiTap, onOpenMap3D }: Props) {
  const [locked, setLocked] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)
  const [fitTick, setFitTick] = useState(0)

  const hasGps = !!trackPoints?.some(p => p.lat && p.lon)
  if (!hasGps || pois.length === 0) return null

  const toggleFullscreen = () => {
    setFullscreen(v => {
      const next = !v
      if (next) setLocked(false)
      return next
    })
  }

  return (
    <div
      className={fullscreen ? 'fixed inset-0 z-[70] bg-black' : 'relative rounded-2xl overflow-hidden border-2'}
      style={fullscreen ? undefined : { height: 260, borderColor: '#e9ab64' }}
    >
      <MapView
        trackPoints={trackPoints ?? []} height="100%" interactive={!locked}
        pois={pois} showPoiLayer poiMarkerScale={1.25}
        routeColor="#a9a18e" routeWeight={3} routeOpacity={0.55} showEndpointMarkers={false}
        highlightedPoiIndex={highlightedIndex}
        onPoiTap={poi => onPoiTap?.(poi)}
        fitSignal={fitTick}
      />
      {!fullscreen && (
        <div className="absolute top-3 left-3 z-[1000] flex items-center gap-1.5 bg-terra-500 text-white text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full shadow">
          <MapPin className="w-3 h-3" /> Punti di interesse
        </div>
      )}
      <div
        className="absolute inset-x-3 z-[1000] flex items-center justify-end gap-2"
        style={{ top: fullscreen ? 'calc(env(safe-area-inset-top, 0px) + 12px)' : '12px' }}
      >
        {onOpenMap3D && (
          <button onClick={onOpenMap3D} title="Vista 3D" className={chipIdle}>
            <Box className="w-4 h-4" />
          </button>
        )}
        <button onClick={() => setFitTick(t => t + 1)} title="Inquadra tutto il percorso" className={chipIdle}>
          <LocateFixed className="w-4 h-4" />
        </button>
        <button
          onClick={toggleFullscreen}
          title={fullscreen ? 'Esci da schermo intero' : 'Schermo intero'}
          className={chipIdle}
        >
          {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
        <button
          onClick={() => setLocked(v => !v)}
          title={locked ? 'Sblocca la mappa per navigarla' : 'Blocca la mappa (evita spostamenti involontari)'}
          className={locked ? chipIdle : chipActive}
        >
          {locked ? <Lock className="w-4 h-4" /> : <LockOpen className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )
}
