'use client'
import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { Lock, LockOpen, Maximize2, Minimize2, Box, LocateFixed, Navigation } from 'lucide-react'
import type { TrackPoint } from '@/lib/tcxParser'
import type { PoiItem } from '@/lib/overpass'

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false })

interface Props {
  trackPoints?: TrackPoint[]
  /** Tutti i POI del percorso — anche quelli senza voce Wikipedia restano visibili in mappa,
   *  solo la lista/card sotto mostra unicamente quelli con approfondimento. */
  pois: PoiItem[]
  /** Id dei POI attualmente evidenziati — un solo id per un POI singolo, più id insieme per un
   *  gruppo selezionato (badge con contatore) — vedi PoiListWidget.tsx. */
  highlightedPoiIds?: Set<number> | null
  onPoiTap?: (poi: PoiItem) => void
  onOpenMap3D?: () => void
  /** Coordinate su cui inquadrare la mappa al prossimo `focusSignal` — usato dalle icone
   *  raggruppate della griglia sotto la Galleria per zoomare sui pin di un singolo tipo. */
  focusPoints?: { lat: number; lon: number }[] | null
  focusSignal?: number
  /** Servizi di trasporto per il ritorno (bus/treno/taxi) — vedi il commento su `returnMarkers` in
   *  MapView.tsx: un layer a parte da `pois`, mai incluso nel fit della mappa. */
  returnMarkers?: { lat: number; lon: number; kind: 'bus' | 'treno' | 'taxi'; label: string; mapsUrl?: string }[]
  /** Id dei `pois` con copertura Street View plausibile — calcolata una sola volta dal chiamante
   *  (PoiListWidget.tsx, che la condivide con le card della Galleria) invece che qui: evita una
   *  seconda chiamata Overpass ridondante sugli stessi punti. */
  streetViewPoiIds?: Set<number>
}

const chipBase = 'flex items-center justify-center w-9 h-9 rounded-full backdrop-blur-md border transition-colors shrink-0'
const chipIdle = `${chipBase} bg-black/50 border-white/15 text-white/90`
// Stessa pillola raggruppata di RouteMapSection.tsx ("Il percorso") — anche qui i comandi
// secondari restano insieme, isolato solo lo schermo intero.
const pillChipBase = 'flex items-center justify-center w-8 h-8 rounded-full transition-colors shrink-0'
const pillChipIdle = `${pillChipBase} text-white/90 hover:bg-white/10`
const pillChipActive = `${pillChipBase} bg-terra-500 text-white`

/**
 * Mappa dedicata ai punti di interesse — stessi controlli della mappa "Il percorso"
 * (RouteMapSection: 3D/schermo intero/lucchetto/vista d'insieme). Il risalto ai POI viene dai
 * pin più grandi del normale (poiMarkerScale) e da un tracciato di base volutamente tenue, non
 * da cornici o etichette aggiuntive. Sincronizzata bidirezionalmente con le card della lista
 * tramite `highlightedPoiIds`/`onPoiTap`.
 */
export default function PoiMap({
  trackPoints, pois, highlightedPoiIds = null, onPoiTap, onOpenMap3D, focusPoints, focusSignal, returnMarkers,
  streetViewPoiIds,
}: Props) {
  const [locked, setLocked] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)
  const [fitTick, setFitTick] = useState(0)
  const [showArrows, setShowArrows] = useState(false)
  const [resizeTick, setResizeTick] = useState(0)

  const highlightedIndices = useMemo(
    () => (!highlightedPoiIds || highlightedPoiIds.size === 0
      ? null
      : pois.reduce<number[]>((acc, p, i) => { if (highlightedPoiIds.has(p.id)) acc.push(i); return acc }, [])),
    [highlightedPoiIds, pois],
  )

  const hasGps = !!trackPoints?.some(p => p.lat && p.lon)
  if (!hasGps || (pois.length === 0 && !returnMarkers?.length)) return null

  const toggleFullscreen = () => {
    setFullscreen(v => {
      const next = !v
      if (next) setLocked(false)
      return next
    })
    setResizeTick(t => t + 1)
  }

  return (
    <div
      className={fullscreen ? 'fixed inset-0 z-[70] bg-black isolate' : 'relative isolate rounded-2xl overflow-hidden border'}
      style={fullscreen ? undefined : { height: 260, borderColor: '#dcd8cc' }}
    >
      <MapView
        trackPoints={trackPoints ?? []} height="100%" interactive={!locked}
        pois={pois} showPoiLayer poiMarkerScale={1.25} streetViewPoiIds={streetViewPoiIds}
        routeColor="#8a6d3b" routeWeight={4} routeOpacity={0.85} showEndpointMarkers={false}
        highlightedPoiIndices={highlightedIndices}
        onPoiTap={poi => onPoiTap?.(poi)}
        fitSignal={fitTick}
        focusPoints={focusPoints}
        focusSignal={focusSignal}
        returnMarkers={returnMarkers}
        showDirectionArrows={showArrows}
        resizeSignal={resizeTick}
      />
      <div
        className="absolute inset-x-3 z-[1000] flex items-center justify-between"
        style={{ top: fullscreen ? 'calc(env(safe-area-inset-top, 0px) + 12px)' : '12px' }}
      >
        <div className="flex items-center gap-0.5 bg-black/50 backdrop-blur-md border border-white/15 rounded-full p-1">
          <button
            onClick={() => setShowArrows(v => !v)}
            title={showArrows ? 'Nascondi le frecce di direzione' : 'Mostra le frecce di direzione'}
            className={showArrows ? pillChipActive : pillChipIdle}
          >
            <Navigation className="w-4 h-4" />
          </button>
          {onOpenMap3D && (
            <button onClick={onOpenMap3D} title="Vista 3D" className={pillChipIdle}>
              <Box className="w-4 h-4" />
            </button>
          )}
          <button onClick={() => setFitTick(t => t + 1)} title="Inquadra tutto il percorso" className={pillChipIdle}>
            <LocateFixed className="w-4 h-4" />
          </button>
          <button
            onClick={() => setLocked(v => !v)}
            title={locked ? 'Sblocca la mappa per navigarla' : 'Blocca la mappa (evita spostamenti involontari)'}
            className={locked ? pillChipIdle : pillChipActive}
          >
            {locked ? <Lock className="w-4 h-4" /> : <LockOpen className="w-4 h-4" />}
          </button>
        </div>
        <button
          onClick={toggleFullscreen}
          title={fullscreen ? 'Esci da schermo intero' : 'Schermo intero'}
          className={chipIdle}
        >
          {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )
}
