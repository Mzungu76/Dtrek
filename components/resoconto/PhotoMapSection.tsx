'use client'
import { useMemo, useRef, useState } from 'react'
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
 * Mappa foto della sezione "Galleria fotografica", con lo stesso lucchetto/schermo-intero/inquadra/3D di
 * components/RouteMapSection.tsx (mappa di "Andamento") — di default bloccata (pan/zoom nativi
 * disattivati) così lo scroll della pagina non la sposta involontariamente.
 *
 * A schermo intero, sotto la mappa compare la galleria delle foto geolocalizzate: toccare un pin
 * numerato sulla mappa scorre la galleria fino alla foto corrispondente ed la evidenzia (senza
 * aprire nulla, per non coprire subito la mappa); toccare una foto in galleria apre il lightbox
 * sopra la mappa. Fuori da schermo intero non c'è galleria: il pin apre subito il lightbox, come
 * prima (comportamento identico alla griglia numerata sotto la mappa in ReportReader.tsx).
 */
export default function PhotoMapSection({ trackPoints, photos, onPhotoTap, onOpenMap3D }: Props) {
  const [locked, setLocked] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)
  const [fitTick, setFitTick] = useState(0)
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const galleryRefs = useRef(new Map<string, HTMLButtonElement>())

  // Stesso ordinamento per progressione lungo il percorso usato internamente da RoutePhotoMap per
  // numerare i pin — la galleria deve mostrare le foto con la stessa numerazione, altrimenti "pin
  // 3" e "foto 3" in galleria non coinciderebbero.
  const sortedPhotos = useMemo(() => [...photos].sort((a, b) => a.progress - b.progress), [photos])

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

  function handlePinTap(photoId: string) {
    if (!fullscreen) { onPhotoTap?.(photoId); return }
    setHighlightedId(photoId)
    galleryRefs.current.get(photoId)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }

  return (
    <div
      className={fullscreen ? 'fixed inset-0 z-[70] bg-black isolate' : 'relative isolate rounded-2xl overflow-hidden border'}
      style={fullscreen ? undefined : { height: 360, borderColor: '#dcd8cc' }}
    >
      <RoutePhotoMap
        trackPoints={trackPoints}
        photos={photos}
        height="100%"
        interactive={!locked}
        fitSignal={fitTick}
        onPhotoTap={handlePinTap}
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

      {fullscreen && sortedPhotos.length > 0 && (
        <div
          className="absolute inset-x-0 bottom-0 z-[1000] pb-[env(safe-area-inset-bottom,0px)]"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.75), rgba(0,0,0,0))' }}
        >
          <div className="flex gap-2 overflow-x-auto px-3 pt-8 pb-3 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
            {sortedPhotos.map((ph, i) => (
              <button
                key={ph.id}
                ref={el => { if (el) galleryRefs.current.set(ph.id, el); else galleryRefs.current.delete(ph.id) }}
                onClick={() => onPhotoTap?.(ph.id)}
                className="relative shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors"
                style={{ borderColor: highlightedId === ph.id ? '#f59e0b' : 'rgba(255,255,255,0.25)' }}
              >
                <img src={ph.url} alt={ph.caption} className="w-full h-full object-cover" />
                <span className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center">{i + 1}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
