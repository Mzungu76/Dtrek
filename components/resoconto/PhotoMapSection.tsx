'use client'
import { useState } from 'react'
import dynamic from 'next/dynamic'
import { Lock, LockOpen, Maximize2, Minimize2, Box, LocateFixed } from 'lucide-react'
import type { TrackPoint } from '@/lib/tcxParser'
import type { RoutePhoto } from '@/lib/activityPhotos'

const RoutePhotoMap = dynamic(() => import('@/app/components/RoutePhotoMap'), { ssr: false })

const chipBase = 'flex items-center justify-center w-9 h-9 rounded-full backdrop-blur-md border transition-colors shrink-0'
const chipIdle = `${chipBase} bg-black/50 border-white/15 text-white/90`
const chipActive = `${chipBase} bg-terra-500 border-terra-300/40 text-white`

interface Props {
  trackPoints: TrackPoint[]
  photos: RoutePhoto[]
  onPhotoTap?: (photoId: string) => void
  onOpenMap3D?: () => void
}

/**
 * "Foto sulla mappa" con lo stesso lucchetto/schermo-intero/inquadra/3D di
 * components/RouteMapSection.tsx (mappa di "Andamento") — di default bloccata (pan/zoom nativi
 * disattivati) così lo scroll della pagina non la sposta involontariamente.
 */
export default function PhotoMapSection({ trackPoints, photos, onPhotoTap, onOpenMap3D }: Props) {
  const [locked, setLocked] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)
  const [fitTick, setFitTick] = useState(0)

  const toggleFullscreen = () => {
    setFullscreen(v => {
      const next = !v
      if (next) setLocked(false) // richiesto: lo schermo intero attiva sempre la navigazione
      return next
    })
    // A differenza di MapView (usata da RouteMapSection), RoutePhotoMap è un Leaflet "grezzo": il
    // solo ResizeObserver non basta a farla ridisegnare in tempo quando il contenitore passa da
    // ~360px allo schermo intero — senza questo la mappa restava con le dimensioni/l'inquadratura
    // vecchie e le foto finivano fuori dall'area visibile (sembravano sparite).
    setFitTick(t => t + 1)
  }

  return (
    <div
      className={fullscreen ? 'fixed inset-0 z-[70] bg-black' : 'relative rounded-2xl overflow-hidden border'}
      style={fullscreen ? undefined : { height: 360, borderColor: '#dcd8cc' }}
    >
      <RoutePhotoMap
        trackPoints={trackPoints}
        photos={photos}
        height="100%"
        interactive={!locked}
        fitSignal={fitTick}
        onPhotoTap={onPhotoTap}
      />
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
