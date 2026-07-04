'use client'
import { useEffect, useState, useMemo } from 'react'
import dynamic from 'next/dynamic'
import Navbar from '@/components/Navbar'
import BackLink from '@/app/components/BackLink'
import { PawPrint, X, Loader2 } from 'lucide-react'
import type { AnimalItem } from '@/app/api/animals/route'
import type { TrackPoint } from '@/lib/tcxParser'

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false })

const MONTHS = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
]

function dangerColor(level: AnimalItem['dangerLevel']): string | null {
  if (level === 'alto') return '#ef4444'
  if (level === 'moderato') return '#f59e0b'
  if (level === 'basso') return '#10b981'
  return null
}

function dangerLabel(level: AnimalItem['dangerLevel']): string | null {
  if (level === 'alto') return 'Pericolo alto'
  if (level === 'moderato') return 'Pericolo moderato'
  if (level === 'basso') return 'Pericolo basso'
  return null
}

function PawPlaceholder({ className }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center bg-amber-50 ${className ?? ''}`}>
      <PawPrint className="w-8 h-8 text-amber-300" />
    </div>
  )
}

function DangerBadge({ level }: { level: AnimalItem['dangerLevel'] }) {
  const color = dangerColor(level)
  const label = dangerLabel(level)
  if (!color || !label) return null
  return (
    <span
      className="absolute top-2 left-2 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full text-white"
      style={{ backgroundColor: color }}
    >
      {label}
    </span>
  )
}

function AnimalCard({ item, onClick }: { item: AnimalItem; onClick: () => void }) {
  const [imgError, setImgError] = useState(false)
  const displayName = item.vernacularIta ?? item.scientificName
  return (
    <button
      onClick={onClick}
      className="text-left bg-white rounded-xl border border-stone-200 overflow-hidden hover:shadow-md transition-shadow relative"
    >
      <div className="relative">
        {!imgError ? (
          <img
            src={item.thumbUrl ?? undefined}
            alt={displayName}
            className="w-full aspect-square object-cover rounded-t-xl"
            onError={() => setImgError(true)}
          />
        ) : (
          <PawPlaceholder className="w-full aspect-square rounded-t-xl" />
        )}
        <DangerBadge level={item.dangerLevel} />
      </div>
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
        {item.description && (
          <p className="text-xs text-stone-500 line-clamp-2">{item.description}</p>
        )}
        <p className="text-xs text-stone-300 truncate">📷 {item.attribution}</p>
      </div>
    </button>
  )
}

function AnimalDetailModal({ item, month, onClose }: { item: AnimalItem; month: number; onClose: () => void }) {
  const [imgError, setImgError] = useState(false)
  const displayName = item.vernacularIta ?? item.scientificName
  const color = dangerColor(item.dangerLevel)
  const label = dangerLabel(item.dangerLevel)
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
        <div className="relative">
          {!imgError ? (
            <img
              src={item.imageUrl ?? undefined}
              alt={displayName}
              className="w-full aspect-[4/3] object-cover"
              onError={() => setImgError(true)}
            />
          ) : (
            <PawPlaceholder className="w-full aspect-[4/3]" />
          )}
          {color && label && (
            <span
              className="absolute top-3 left-3 text-xs font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full text-white"
              style={{ backgroundColor: color }}
            >
              {label}
            </span>
          )}
        </div>
        <div className="p-5 space-y-2">
          <h2 className="font-lora text-2xl text-stone-800">{displayName}</h2>
          {item.vernacularIta && (
            <p className="italic text-stone-500">{item.scientificName}</p>
          )}
          {item.family && (
            <p className="text-sm uppercase tracking-wide text-stone-400">{item.family}</p>
          )}
          {item.description && (
            <p className="text-sm text-stone-600 pt-2">{item.description}</p>
          )}
          <p className="text-sm text-stone-600 pt-2">
            Osservato in questa zona nel mese di {MONTHS[month - 1]}.
          </p>
          <p className="text-xs text-stone-400 pt-2">
            📷 {item.attribution} — {item.license}
            {item.gbifUrl && (
              <>
                {' '}
                <a
                  href={item.gbifUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-700 hover:underline"
                >
                  Scheda ↗
                </a>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}

const FALLBACK_LEVEL_LABEL: Record<2 | 3, string> = {
  2: 'Specie osservate nei dintorni (area estesa)',
  3: 'Specie tipiche dell’area protetta — non osservazione diretta in questo punto',
}

function FallbackLevelNotice({ level }: { level: 1 | 2 | 3 }) {
  if (level === 1) return null
  return (
    <div className="mb-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
      {FALLBACK_LEVEL_LABEL[level]}
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

interface AnimalGalleryProps {
  trackPoints: TrackPoint[]
  /** 1-12 — month to use for the seasonal GBIF query. */
  month: number
  loadingTrack: boolean
  /** Overrides the default back-link label (e.g. the hike/activity title). */
  backLabel?: string
  /** When provided, renders as a closable popup (X button, no Navbar) instead of a standalone page. */
  onClose?: () => void
}

export default function AnimalGallery({ trackPoints, month, loadingTrack, backLabel, onClose }: AnimalGalleryProps) {
  const [items, setItems] = useState<AnimalItem[]>([])
  const [loadingAnimals, setLoadingAnimals] = useState(true)
  const [selected, setSelected] = useState<AnimalItem | null>(null)
  const [fallbackLevel, setFallbackLevel] = useState<1 | 2 | 3>(1)

  const gpsPoints = useMemo(
    () => trackPoints.filter((p): p is TrackPoint & { lat: number; lon: number } => p.lat !== undefined && p.lon !== undefined),
    [trackPoints],
  )

  const animalMarkers = useMemo(
    () => items
      .filter((i): i is AnimalItem & { lat: number; lon: number } => i.lat !== null && i.lon !== null)
      .map(i => ({ lat: i.lat, lon: i.lon, label: i.vernacularIta ?? i.scientificName })),
    [items],
  )

  useEffect(() => {
    if (loadingTrack) return
    if (gpsPoints.length < 2) { setLoadingAnimals(false); return }

    const lats = gpsPoints.map(p => p.lat)
    const lons = gpsPoints.map(p => p.lon)
    const minLat = Math.min(...lats), maxLat = Math.max(...lats)
    const minLon = Math.min(...lons), maxLon = Math.max(...lons)
    const bbox = `${minLat},${maxLat},${minLon},${maxLon}`

    setLoadingAnimals(true)
    fetch(`/api/animals?bbox=${encodeURIComponent(bbox)}&month=${month}`)
      .then(res => res.json())
      .then((data: { items: AnimalItem[]; fallbackLevel?: 1 | 2 | 3; error?: string }) => {
        setItems(data.items ?? [])
        setFallbackLevel(data.fallbackLevel ?? 1)
      })
      .catch(() => setItems([]))
      .finally(() => setLoadingAnimals(false))
  }, [loadingTrack, gpsPoints, month])

  return (
    <div className={onClose ? 'fixed inset-0 z-50 bg-stone-50 overflow-y-auto' : 'min-h-screen bg-stone-50'}>
      {!onClose && <Navbar />}
      <div className="max-w-6xl mx-auto px-4 py-6">
        {onClose ? (
          <button onClick={onClose} className="flex items-center gap-1.5 text-stone-500 hover:text-stone-800 text-sm transition-colors mb-4">
            <X className="w-4 h-4" /> Chiudi
          </button>
        ) : (
          <BackLink
            label={backLabel}
            className="flex items-center gap-1.5 text-stone-500 hover:text-stone-800 text-sm transition-colors mb-4"
          />
        )}

        <h1 className="font-lora text-2xl text-stone-800 flex items-center gap-2 mb-1">
          🐾 Galleria Animali
        </h1>
        <p className="text-sm text-stone-500 mb-6">
          Fauna osservata in zona — {MONTHS[month - 1]}
        </p>

        {!loadingTrack && gpsPoints.length > 1 && !loadingAnimals && items.length > 0 && (
          <div className="mb-6">
            <MapView
              trackPoints={trackPoints}
              pois={[]}
              floraMarkers={animalMarkers}
              height="320px"
            />
          </div>
        )}

        {loadingTrack ? (
          <div className="flex items-center gap-2 text-stone-400 text-sm py-12 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Caricamento…
          </div>
        ) : gpsPoints.length < 2 ? (
          <div className="text-center py-16 text-stone-400">
            <PawPrint className="w-16 h-16 mx-auto mb-3 text-stone-300" />
            <p>Percorso GPS non disponibile per questa escursione</p>
          </div>
        ) : loadingAnimals ? (
          <SkeletonGrid />
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-stone-400 max-w-md mx-auto">
            <PawPrint className="w-16 h-16 mx-auto mb-3 text-stone-300" />
            <p className="font-lora text-lg text-stone-600 mb-2">Nessuna osservazione disponibile</p>
            <p className="text-sm">
              I dati GBIF dipendono dalle osservazioni degli utenti iNaturalist e dagli enti
              faunistici italiani. Le aree meno frequentate o i percorsi ad alta quota possono
              avere copertura limitata per questo mese.
            </p>
          </div>
        ) : (
          <>
            <FallbackLevelNotice level={fallbackLevel} />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {items.map(item => (
                <AnimalCard key={item.scientificName} item={item} onClick={() => setSelected(item)} />
              ))}
            </div>
          </>
        )}

        <div className="text-xs text-stone-400 text-center py-4 mt-6">
          Dati e immagini: GBIF.org, iNaturalist, Wikidata/Commons, EEA Natura 2000.
          Licenze CC0/CC BY. Attribution per immagine nelle singole schede.{' '}
          <a href="/fonti-e-crediti" className="hover:underline text-amber-700">
            Dettaglio fonti e licenze ↗
          </a>
        </div>
      </div>

      {selected && (
        <AnimalDetailModal item={selected} month={month} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
