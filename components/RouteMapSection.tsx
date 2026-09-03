'use client'
import { useState } from 'react'
import dynamic from 'next/dynamic'
import { Lock, LockOpen, Maximize2, Minimize2, Box, LocateFixed, Compass, Navigation } from 'lucide-react'
import ElevationProfileChart from '@/components/ElevationProfileChart'
import { TornFrame } from '@/components/TornFrame'
import type { TrackPoint } from '@/lib/tcxParser'
import type { PoiItem } from '@/lib/overpass'
import type { TrailDtmProfile } from '@/lib/dtm/trailDtmProfile'

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false })

interface Props {
  trackPoints?: TrackPoint[]
  pois?: PoiItem[]
  highlightedPoiIndices?: number[] | null
  onPoiTap?: (poi: PoiItem) => void
  /** Opens the fullscreen 3D map view for the route — omit to hide the chip entirely. */
  onOpenMap3D?: () => void
  showGradient?: boolean
  showAspect?: boolean
  /** Mostra il chip "Esposizione" flottante sulla mappa — omesso quando il DTM non è disponibile
   *  per questo percorso (stesso criterio già usato per il vecchio toggle in ScoresWidget). */
  showAspectToggle?: boolean
  onToggleAspect?: () => void
  dtmProfile?: TrailDtmProfile
  /** Track color: blue (planned, not yet hiked) vs green (completed) — mirrors MapView's own default. */
  planned?: boolean
  /** Mostra i pin dei POI sulla mappa — disattivato nella sezione "Il percorso" della guida (i
   *  POI hanno una mappa dedicata in "I luoghi da non perdere"), attivo per default altrove. */
  showPois?: boolean
}

const chipBase = 'flex items-center justify-center w-9 h-9 rounded-full backdrop-blur-md border transition-colors shrink-0'
const chipIdle = `${chipBase} bg-black/50 border-white/15 text-white/90`
// Pulsanti dentro la pillola raggruppata: niente più sfondo/bordo propri (li porta la pillola,
// vedi sotto), così cinque comandi identici smettono di leggersi come cinque bottoni indipendenti
// in competizione e diventano "i comandi della mappa" — resta isolato solo lo schermo intero,
// l'azione che ci si aspetta di trovare da sola.
const pillChipBase = 'flex items-center justify-center w-8 h-8 rounded-full transition-colors shrink-0'
const pillChipIdle = `${pillChipBase} text-white/90 hover:bg-white/10`
const pillChipActive = `${pillChipBase} bg-terra-500 text-white`

/**
 * Mappa del percorso condivisa da Guida ("Il percorso") e Resoconto (tab "Andamento") — sostituisce
 * la vecchia mappa "attiva" dietro lo sheet. Di default è bloccata (pan/zoom nativi disattivati) così
 * lo scroll della pagina non la sposta involontariamente; il lucchetto la sblocca per navigarla. Lo
 * schermo intero sblocca automaticamente. Un solo nodo MapView, mai smontato: il fullscreen cambia
 * solo le classi del contenitore (MapView.tsx ha un ResizeObserver che chiama invalidateSize()).
 */
export default function RouteMapSection({
  trackPoints, pois = [], highlightedPoiIndices = null, onPoiTap, onOpenMap3D,
  showGradient, showAspect, showAspectToggle, onToggleAspect, dtmProfile, planned, showPois = true,
}: Props) {
  const [locked, setLocked] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [fitTick, setFitTick] = useState(0)
  // Layer opzionale, spento di default — non tutti vogliono le frecce di direzione sempre visibili
  // sulla mappa del percorso, a differenza della navigazione live dove restano sempre attive.
  const [showArrows, setShowArrows] = useState(false)
  // Incrementato ad ogni cambio schermo-intero — forza MapView a correggere subito la propria
  // dimensione interna invece di aspettare il solo ResizeObserver (vedi commento in MapView.tsx),
  // altrimenti una mappa aperta a schermo intero può restare "parziale" (grigia oltre l'area che
  // conosceva prima del cambio) se l'utente inizia a zoomare prima che il resize venga rilevato.
  const [resizeTick, setResizeTick] = useState(0)

  const hasGps = !!trackPoints?.some(p => p.lat && p.lon)
  if (!hasGps) return null

  const toggleFullscreen = () => {
    setFullscreen(v => {
      const next = !v
      if (next) setLocked(false) // richiesto: lo schermo intero attiva sempre la navigazione
      return next
    })
    setResizeTick(t => t + 1)
  }

  // Pendenza mostrata sul tracciato solo mentre l'utente sposta il dito/mouse sul grafico
  // altimetrico (activeIndex valorizzato) — non un secondo toggle persistente come showGradient.
  const transientGradient = !showGradient && activeIndex != null

  const mapContent = (
    <>
      <MapView
        trackPoints={trackPoints ?? []} height="100%" interactive={!locked}
        pois={pois} planned={planned} showPoiLayer={showPois}
        highlightedPoiIndices={highlightedPoiIndices}
        onPoiTap={poi => onPoiTap?.(poi)}
        activeIndex={activeIndex}
        showGradient={showGradient} showAspect={showAspect} dtmProfile={dtmProfile}
        transientGradient={transientGradient}
        fitSignal={fitTick}
        showDirectionArrows={showArrows}
        resizeSignal={resizeTick}
      />
      <div
        className="absolute inset-x-3 z-[1000] flex items-center justify-between"
        style={{ top: fullscreen ? 'calc(env(safe-area-inset-top, 0px) + 12px)' : '12px' }}
      >
        <div className="flex items-center gap-0.5 bg-black/50 backdrop-blur-md border border-white/15 rounded-full p-1">
          {showAspectToggle && (
            <button
              onClick={onToggleAspect}
              title="Esposizione dei versanti"
              className={showAspect ? pillChipActive : pillChipIdle}
            >
              <Compass className="w-4 h-4" />
            </button>
          )}
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
    </>
  )

  return (
    <div className="space-y-4">
      {/* Test: nastro washi + bordo strappato (Taccuino Botanico, components/TornFrame.tsx) al
          posto del vecchio riquadro arrotondato bordato — solo da chiuso. Lo schermo intero resta
          il vecchio riquadro edge-to-edge invariato: non ha senso "nastrare" tutto lo schermo, e
          serve comunque il massimo spazio utile per navigare la mappa. */}
      <div
        className={fullscreen ? 'fixed inset-0 z-[70] bg-black isolate' : 'relative isolate'}
        style={fullscreen ? undefined : { height: 260 }}
      >
        {fullscreen ? mapContent : <TornFrame size="hero" variant={0}>{mapContent}</TornFrame>}
      </div>
      <ElevationProfileChart trackPoints={trackPoints ?? []} onHover={setActiveIndex} />
    </div>
  )
}
