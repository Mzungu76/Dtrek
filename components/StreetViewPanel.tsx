'use client'
import { useEffect, useState } from 'react'
import { X, Images, ExternalLink, ChevronLeft, ChevronRight, MapPin } from 'lucide-react'

const MAPILLARY_KEY = process.env.NEXT_PUBLIC_MAPILLARY_KEY ?? ''

interface MlyImage {
  id: string
  thumb_256_url: string
  thumb_1024_url: string
  captured_at: number
  compass_angle: number
  geometry: { type: 'Point'; coordinates: [number, number] }
}

interface Props {
  lat: number
  lon: number
  title?: string
  onClose: () => void
}

export default function StreetViewPanel({ lat, lon, title, onClose }: Props) {
  const [images,  setImages]  = useState<MlyImage[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(0)

  useEffect(() => {
    setImages([])
    setSelected(0)
    setLoading(true)
    if (!MAPILLARY_KEY) { setLoading(false); return }

    const r = 0.0012 // ~133 m
    const bbox = `${lon - r},${lat - r},${lon + r},${lat + r}`
    fetch(
      `https://graph.mapillary.com/images?bbox=${bbox}&fields=id,geometry,thumb_256_url,thumb_1024_url,captured_at,compass_angle&limit=30&access_token=${MAPILLARY_KEY}`,
    )
      .then(res => res.json())
      .then(d => { if (Array.isArray(d.data)) setImages(d.data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [lat, lon])

  const img = images[selected]

  return (
    <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-stone-100 shrink-0">
          <Images className="w-4 h-4 text-sky-500 shrink-0" />
          <p className="font-semibold text-stone-800 text-sm flex-1 truncate">
            {title ? `Foto: ${title}` : 'Foto della zona'}
          </p>
          <a
            href={`https://www.mapillary.com/app/?lat=${lat}&lng=${lon}&z=17&focus=photo`}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700 font-medium transition-colors"
          >
            <ExternalLink className="w-3 h-3" /> Mapillary
          </a>
          <button onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-stone-700 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        {!MAPILLARY_KEY ? (
          <div className="p-8 text-center space-y-4">
            <Images className="w-12 h-12 text-stone-200 mx-auto" />
            <div>
              <p className="text-stone-700 text-sm font-semibold mb-1">Configura Mapillary per le foto di zona</p>
              <p className="text-xs text-stone-400 max-w-xs mx-auto leading-relaxed">
                Registrati gratuitamente su Mapillary, vai su{' '}
                <span className="font-mono bg-stone-100 px-1 rounded">Dashboard → Applications</span>,
                crea un&apos;app e copia il token.
              </p>
            </div>
            <a
              href="https://www.mapillary.com/dashboard/developers"
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium rounded-xl transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Ottieni token gratuito
            </a>
            <p className="text-xs text-stone-400">
              Poi aggiungi{' '}
              <code className="bg-stone-100 px-1 py-0.5 rounded text-[11px]">NEXT_PUBLIC_MAPILLARY_KEY=…</code>{' '}
              nelle variabili d&apos;ambiente Vercel
            </p>
          </div>

        ) : loading ? (
          <div className="flex items-center justify-center py-16 gap-3 text-stone-400">
            <div className="w-5 h-5 border-2 border-stone-200 border-t-sky-500 rounded-full animate-spin" />
            <span className="text-sm">Ricerca foto nelle vicinanze…</span>
          </div>

        ) : images.length === 0 ? (
          <div className="p-8 text-center space-y-3">
            <MapPin className="w-10 h-10 text-stone-200 mx-auto" />
            <p className="text-stone-500 text-sm">Nessuna foto disponibile in questa zona</p>
            <a
              href={`https://www.mapillary.com/app/?lat=${lat}&lng=${lon}&z=17`}
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-sky-600 hover:underline"
            >
              <ExternalLink className="w-3 h-3" /> Esplora su Mapillary
            </a>
          </div>

        ) : (
          <>
            {/* Main photo */}
            <div className="relative bg-stone-900 shrink-0" style={{ aspectRatio: '16/9' }}>
              <img
                key={img.id}
                src={img.thumb_1024_url ?? img.thumb_256_url}
                alt="Foto zona"
                className="w-full h-full object-cover"
              />

              {selected > 0 && (
                <button onClick={() => setSelected(s => s - 1)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 hover:bg-black/75 flex items-center justify-center text-white transition-colors">
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}
              {selected < images.length - 1 && (
                <button onClick={() => setSelected(s => s + 1)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 hover:bg-black/75 flex items-center justify-center text-white transition-colors">
                  <ChevronRight className="w-5 h-5" />
                </button>
              )}

              <div className="absolute bottom-2 left-2 right-2 flex items-end justify-between pointer-events-none">
                <span className="text-[10px] text-white/80 bg-black/45 px-2 py-0.5 rounded-full">
                  {selected + 1} / {images.length}
                </span>
                <a
                  href={`https://www.mapillary.com/app/?pKey=${img.id}`}
                  target="_blank" rel="noopener noreferrer"
                  className="pointer-events-auto flex items-center gap-1 px-2.5 py-1 bg-black/50 hover:bg-black/70 rounded-full text-white text-[10px] font-medium transition-colors"
                >
                  <ExternalLink className="w-3 h-3" /> Apri 360°
                </a>
              </div>
            </div>

            {/* Thumbnail strip */}
            <div className="flex gap-1.5 p-2.5 bg-stone-50 border-t border-stone-100 overflow-x-auto shrink-0">
              {images.map((im, i) => (
                <button key={im.id} onClick={() => setSelected(i)}
                  className={`shrink-0 w-14 h-10 rounded-lg overflow-hidden border-2 transition-all ${
                    i === selected
                      ? 'border-sky-500 shadow-sm scale-105'
                      : 'border-transparent opacity-60 hover:opacity-100 hover:border-stone-300'
                  }`}>
                  <img src={im.thumb_256_url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
