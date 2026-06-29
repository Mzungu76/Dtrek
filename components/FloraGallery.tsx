'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { Leaf, ArrowLeft, X, Loader2 } from 'lucide-react'
import type { FloraItem } from '@/app/api/flora/route'

const MONTHS = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
]

function LeafPlaceholder({ className }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center bg-green-50 ${className ?? ''}`}>
      <Leaf className="w-8 h-8 text-green-300" />
    </div>
  )
}

function FloraCard({ item, onClick }: { item: FloraItem; onClick: () => void }) {
  const [imgError, setImgError] = useState(false)
  const displayName = item.vernacularIta ?? item.scientificName
  return (
    <button
      onClick={onClick}
      className="text-left bg-white rounded-xl border border-stone-200 overflow-hidden hover:shadow-md transition-shadow"
    >
      {!imgError ? (
        <img
          src={item.thumbUrl}
          alt={displayName}
          className="w-full aspect-square object-cover rounded-t-xl"
          onError={() => setImgError(true)}
        />
      ) : (
        <LeafPlaceholder className="w-full aspect-square rounded-t-xl" />
      )}
      <div className="p-2.5 space-y-0.5">
        {item.vernacularIta ? (
          <p className="font-lora text-sm font-medium text-stone-800 truncate">{item.vernacularIta}</p>
        ) : (
          <p className="font-lora text-sm italic text-stone-800 truncate">{item.scientificName}</p>
        )}
        {item.vernacularIta && (
          <p className="text-xs italic text-stone-500 truncate">{item.scientificName}</p>
        )}
        {item.family && (
          <p className="text-xs uppercase tracking-wide text-stone-400 truncate">{item.family}</p>
        )}
        <p className="text-xs text-stone-300 truncate">📷 {item.attribution}</p>
      </div>
    </button>
  )
}

function FloraDetailModal({ item, month, onClose }: { item: FloraItem; month: number; onClose: () => void }) {
  const [imgError, setImgError] = useState(false)
  const displayName = item.vernacularIta ?? item.scientificName
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="max-w-lg w-full mx-auto bg-white rounded-2xl overflow-hidden relative"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 flex items-center justify-center text-white z-10"
        >
          <X className="w-4 h-4" />
        </button>
        {!imgError ? (
          <img
            src={item.imageUrl}
            alt={displayName}
            className="w-full aspect-[4/3] object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <LeafPlaceholder className="w-full aspect-[4/3]" />
        )}
        <div className="p-5 space-y-2">
          <h2 className="font-lora text-2xl text-stone-800">{displayName}</h2>
          {item.vernacularIta && (
            <p className="italic text-stone-500">{item.scientificName}</p>
          )}
          {item.family && (
            <p className="text-sm uppercase tracking-wide text-stone-400">{item.family}</p>
          )}
          <p className="text-sm text-stone-600 pt-2">
            Osservata in questa zona nel mese di {MONTHS[month - 1]}.
          </p>
          <p className="text-xs text-stone-400 pt-2">
            📷 {item.attribution} — {item.license}{' '}
            <a
              href={item.gbifUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-green-700 hover:underline"
            >
              Scheda GBIF ↗
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-stone-200 overflow-hidden animate-pulse">
          <div className="w-full aspect-square bg-stone-200" />
          <div className="p-2.5 space-y-2">
            <div className="h-3 bg-stone-200 rounded w-3/4" />
            <div className="h-2.5 bg-stone-100 rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  )
}

interface FloraGalleryProps {
  /** Already filtered to points with valid lat/lon. */
  gpsPoints: { lat: number; lon: number }[]
  /** 1-12 — month to use for the seasonal GBIF query. */
  month: number
  loadingTrack: boolean
  backHref: string
  backLabel: string
}

export default function FloraGallery({ gpsPoints, month, loadingTrack, backHref, backLabel }: FloraGalleryProps) {
  const router = useRouter()
  const [items, setItems] = useState<FloraItem[]>([])
  const [loadingFlora, setLoadingFlora] = useState(true)
  const [selected, setSelected] = useState<FloraItem | null>(null)

  useEffect(() => {
    if (loadingTrack) return
    if (gpsPoints.length < 2) { setLoadingFlora(false); return }

    const lats = gpsPoints.map(p => p.lat)
    const lons = gpsPoints.map(p => p.lon)
    const minLat = Math.min(...lats), maxLat = Math.max(...lats)
    const minLon = Math.min(...lons), maxLon = Math.max(...lons)
    const bbox = `${minLat},${maxLat},${minLon},${maxLon}`

    setLoadingFlora(true)
    fetch(`/api/flora?bbox=${encodeURIComponent(bbox)}&month=${month}`)
      .then(res => res.json())
      .then((data: { items: FloraItem[]; error?: string }) => {
        setItems(data.items ?? [])
      })
      .catch(() => setItems([]))
      .finally(() => setLoadingFlora(false))
  }, [loadingTrack, gpsPoints, month])

  return (
    <div className="min-h-screen bg-stone-50">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 py-6">
        <button
          onClick={() => router.push(backHref)}
          className="flex items-center gap-1.5 text-stone-500 hover:text-stone-800 text-sm transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> {backLabel}
        </button>

        <h1 className="font-lora text-2xl text-stone-800 flex items-center gap-2 mb-1">
          🌿 Galleria Verde
        </h1>
        <p className="text-sm text-stone-500 mb-6">
          Flora osservata in zona — {MONTHS[month - 1]}
        </p>

        {loadingTrack ? (
          <div className="flex items-center gap-2 text-stone-400 text-sm py-12 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Caricamento…
          </div>
        ) : gpsPoints.length < 2 ? (
          <div className="text-center py-16 text-stone-400">
            <Leaf className="w-16 h-16 mx-auto mb-3 text-stone-300" />
            <p>Percorso GPS non disponibile per questa escursione</p>
          </div>
        ) : loadingFlora ? (
          <SkeletonGrid />
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-stone-400 max-w-md mx-auto">
            <Leaf className="w-16 h-16 mx-auto mb-3 text-stone-300" />
            <p className="font-lora text-lg text-stone-600 mb-2">Nessuna osservazione disponibile</p>
            <p className="text-sm">
              I dati GBIF dipendono dalle osservazioni degli utenti iNaturalist. Le aree meno
              frequentate o i percorsi ad alta quota possono avere copertura limitata per questo mese.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {items.map(item => (
              <FloraCard key={item.gbifKey} item={item} onClick={() => setSelected(item)} />
            ))}
          </div>
        )}

        <div className="text-xs text-stone-400 text-center py-4 mt-6">
          Dati e immagini:{' '}
          <a href="https://www.gbif.org" target="_blank" rel="noopener noreferrer" className="hover:underline">
            GBIF.org
          </a>{' '}
          — Global Biodiversity Information Facility. Licenze: CC0 e CC BY. Attribution per immagine
          nelle singole schede.
        </div>
      </div>

      {selected && (
        <FloraDetailModal item={selected} month={month} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
