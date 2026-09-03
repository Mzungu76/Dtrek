'use client'
import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import Navbar from '@/components/Navbar'
import BackLink from '@/app/components/BackLink'
import { Leaf, PawPrint, X, Loader2, LocateFixed, Lock, LockOpen, Maximize2, Minimize2, ExternalLink, Info } from 'lucide-react'
import type { FloraItem } from '@/app/api/flora/route'
import type { AnimalItem } from '@/app/api/animals/route'
import type { TrackPoint } from '@/lib/tcxParser'
import { TornFrame } from '@/components/TornFrame'

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false })

const MONTHS = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
]

type NatureLayer = 'flora' | 'fauna'
type NatureItem = FloraItem | AnimalItem

const LAYER_META: Record<NatureLayer, {
  label: string; icon: typeof Leaf; color: string; emoji: string; noun: string; endpoint: string
}> = {
  flora: { label: 'Flora', icon: Leaf, color: '#378d44', emoji: '🌿', noun: 'Flora osservata in zona', endpoint: '/api/flora' },
  fauna: { label: 'Fauna', icon: PawPrint, color: '#b45309', emoji: '🐾', noun: 'Fauna osservata in zona', endpoint: '/api/animals' },
}

function hasDangerLevel(item: NatureItem): item is AnimalItem {
  return 'dangerLevel' in item
}
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

const chipBase = 'flex items-center justify-center w-9 h-9 rounded-full backdrop-blur-md border transition-colors shrink-0'
const chipIdle = `${chipBase} bg-black/50 border-white/15 text-white/90`
const pillChipBase = 'flex items-center justify-center w-8 h-8 rounded-full transition-colors shrink-0'
const pillChipIdle = `${pillChipBase} text-white/90 hover:bg-white/10`
const pillChipActive = `${pillChipBase} bg-terra-500 text-white`

function NatureChip({ item, color, onTap }: { item: NatureItem; color: string; onTap: () => void }) {
  const displayName = item.vernacularIta ?? item.scientificName
  return (
    <button onClick={onTap} className="flex flex-col shrink-0 self-start items-center w-16 gap-1.5 group">
      <span className="flex items-center justify-center w-[38px] h-[38px] rounded-full bg-stone-100 shrink-0 transition-transform group-hover:scale-105">
        <Leaf width={17} height={17} color={color} strokeWidth={2.25} />
      </span>
      <span className="text-[10px] leading-tight text-center text-stone-700 font-semibold line-clamp-2">{displayName}</span>
    </button>
  )
}

function sourceLabel(gbifUrl: string | null): string {
  if (gbifUrl?.includes('inaturalist')) return 'iNaturalist'
  if (gbifUrl?.includes('gbif')) return 'GBIF'
  return 'Fonte'
}

function NaturePhotoCard({ item, layerIcon, onTap }: { item: NatureItem; layerIcon: typeof Leaf; onTap: () => void }) {
  const displayName = item.vernacularIta ?? item.scientificName
  const danger = hasDangerLevel(item) ? dangerColor(item.dangerLevel) : null
  // <img> semplice, non next/image: le foto vengono da GBIF/iNaturalist, host non nella
  // whitelist remotePatterns di next.config.js (solo Wikipedia/Wikimedia lo sono) — next/image le
  // rifiutava silenziosamente, restava l'icona di immagine rotta al posto della foto.
  const [imgError, setImgError] = useState(false)
  const LayerIcon = layerIcon
  return (
    <button
      onClick={onTap}
      className="group relative flex flex-col shrink-0 w-40 sm:w-44 rounded-xl overflow-hidden border border-stone-100 hover:border-stone-200 shadow-sm hover:shadow-md transition-all bg-white text-left"
    >
      <div className="relative h-28 sm:h-32 overflow-hidden bg-stone-100">
        {!imgError && item.thumbUrl ? (
          <img
            src={item.thumbUrl}
            alt={displayName}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-stone-100">
            <LayerIcon className="w-8 h-8 text-stone-300" />
          </div>
        )}
        {danger && <span className="absolute top-1.5 left-1.5 w-2.5 h-2.5 rounded-full border-2 border-white shadow-sm" style={{ background: danger }} />}
      </div>
      <div className="p-2.5 pb-1">
        <p className="font-display font-semibold text-stone-800 text-[14px] leading-tight line-clamp-1 tracking-wide">{displayName}</p>
        <p className="text-[10px] text-stone-400 mt-0.5 italic line-clamp-1">{item.scientificName}</p>
        <span className="flex items-center gap-0.5 text-[10px] mt-1 text-terra-800">
          <ExternalLink className="w-2.5 h-2.5" /> {sourceLabel(item.gbifUrl)}
        </span>
      </div>
    </button>
  )
}

function NatureDetailModal({ item, layer, month, onClose }: { item: NatureItem; layer: NatureLayer; month: number; onClose: () => void }) {
  const displayName = item.vernacularIta ?? item.scientificName
  const danger = hasDangerLevel(item) ? dangerColor(item.dangerLevel) : null
  const dangerText = hasDangerLevel(item) ? dangerLabel(item.dangerLevel) : null
  return (
    <div className="fixed inset-0 bg-black/60 z-[80] flex items-center justify-center p-4" onClick={onClose}>
      <div className="max-w-lg w-full mx-auto bg-white rounded-2xl overflow-hidden relative" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 flex items-center justify-center text-white z-10">
          <X className="w-4 h-4" />
        </button>
        <div className="relative">
          {item.imageUrl ? (
            <img src={item.imageUrl} alt={displayName} className="w-full aspect-[4/3] object-cover" />
          ) : (
            <div className="w-full aspect-[4/3] flex items-center justify-center" style={{ background: `${LAYER_META[layer].color}14` }}>
              <span className="text-4xl">{LAYER_META[layer].emoji}</span>
            </div>
          )}
          {danger && dangerText && (
            <span className="absolute top-3 left-3 text-xs font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full text-white" style={{ backgroundColor: danger }}>
              {dangerText}
            </span>
          )}
        </div>
        <div className="p-5 space-y-2">
          <h2 className="font-display text-2xl font-semibold text-stone-800">{displayName}</h2>
          {item.vernacularIta && <p className="italic text-stone-500">{item.scientificName}</p>}
          {item.family && <p className="text-sm uppercase tracking-wide text-stone-400">{item.family}</p>}
          {item.description && <p className="text-sm text-stone-600 pt-2">{item.description}</p>}
          <p className="text-sm text-stone-600 pt-2">Osservata in questa zona nel mese di {MONTHS[month - 1]}.</p>
          <p className="text-xs text-stone-400 pt-2">
            {item.attribution} — {item.license}
            {item.gbifUrl && (
              <> · <a href={item.gbifUrl} target="_blank" rel="noopener noreferrer" className="text-terra-700 hover:underline">Scheda ↗</a></>
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

export interface NatureGalleryContentProps {
  trackPoints: TrackPoint[]
  /** 1-12 — month to use for the seasonal GBIF query. */
  month: number
  loadingTrack: boolean
  /** Layer mostrato all'apertura — l'altro viene richiesto solo quando l'utente lo tocca nel
   *  selettore, non prima (stesso principio "nessuna chiamata finché nessuno la chiede" della
   *  cascata GBIF/iNaturalist dietro, vedi lib/galleryCascade.ts). */
  initialLayer?: NatureLayer
}

/** Selettore di livello Flora/Fauna, mappa con pin colorati per livello attivo e controlli
 *  raggruppati (stesso trattamento di RouteMapSection.tsx/PoiMap.tsx), galleria sotto nello
 *  stesso stile di "I luoghi da non perdere" (PoiListWidget.tsx): una riga di chip per le specie
 *  senza foto, una riga di card fotografiche per quelle con foto. Il livello non ancora toccato
 *  non genera nessuna chiamata finché non lo si seleziona. Nessun proprio header/chrome di
 *  pagina — usato sia dentro NatureGallery (popup/pagina standalone) sia inline dentro
 *  NaturaWidget.tsx (sezione "La natura intorno a te" della guida), dove il montaggio stesso è
 *  già rimandato a quando la sezione entra in vista (vedi lì). */
export function NatureGalleryContent({ trackPoints, month, loadingTrack, initialLayer = 'flora' }: NatureGalleryContentProps) {
  const [layer, setLayer] = useState<NatureLayer>(initialLayer)
  const [floraItems, setFloraItems] = useState<FloraItem[]>([])
  const [animalItems, setAnimalItems] = useState<AnimalItem[]>([])
  const [floraLoading, setFloraLoading] = useState(true)
  const [animalLoading, setAnimalLoading] = useState(true)
  const [floraFetched, setFloraFetched] = useState(false)
  const [animalFetched, setAnimalFetched] = useState(false)
  const [floraFallbackLevel, setFloraFallbackLevel] = useState<1 | 2 | 3>(1)
  const [animalFallbackLevel, setAnimalFallbackLevel] = useState<1 | 2 | 3>(1)
  const [selected, setSelected] = useState<NatureItem | null>(null)

  const [locked, setLocked] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)
  const [fitTick, setFitTick] = useState(0)

  const gpsPoints = useMemo(
    () => trackPoints.filter((p): p is TrackPoint & { lat: number; lon: number } => p.lat !== undefined && p.lon !== undefined),
    [trackPoints],
  )

  useEffect(() => {
    if (loadingTrack || gpsPoints.length < 2) return
    if (layer === 'flora' && floraFetched) return
    if (layer === 'fauna' && animalFetched) return

    const lats = gpsPoints.map(p => p.lat)
    const lons = gpsPoints.map(p => p.lon)
    const bbox = `${Math.min(...lats)},${Math.max(...lats)},${Math.min(...lons)},${Math.max(...lons)}`
    const setLoading = layer === 'flora' ? setFloraLoading : setAnimalLoading
    const setFetched = layer === 'flora' ? setFloraFetched : setAnimalFetched

    setLoading(true)
    fetch(`${LAYER_META[layer].endpoint}?bbox=${encodeURIComponent(bbox)}&month=${month}`)
      .then(res => res.json())
      .then((data: { items: NatureItem[]; fallbackLevel?: 1 | 2 | 3 }) => {
        if (layer === 'flora') { setFloraItems(data.items as FloraItem[] ?? []); setFloraFallbackLevel(data.fallbackLevel ?? 1) }
        else { setAnimalItems(data.items as AnimalItem[] ?? []); setAnimalFallbackLevel(data.fallbackLevel ?? 1) }
      })
      .catch(() => { if (layer === 'flora') setFloraItems([]); else setAnimalItems([]) })
      .finally(() => { setLoading(false); setFetched(true) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer, loadingTrack, gpsPoints, month, floraFetched, animalFetched])

  const items = layer === 'flora' ? floraItems : animalItems
  const loading = layer === 'flora' ? floraLoading : animalLoading
  const fallbackLevel = layer === 'flora' ? floraFallbackLevel : animalFallbackLevel
  const meta = LAYER_META[layer]

  const withPhoto = items.filter(i => !!i.thumbUrl)
  const withoutPhoto = items.filter(i => !i.thumbUrl)

  const markers = useMemo(
    () => items.filter((i): i is NatureItem & { lat: number; lon: number } => i.lat != null && i.lon != null)
      .map(i => ({ lat: i.lat, lon: i.lon, label: i.vernacularIta ?? i.scientificName })),
    [items],
  )

  const toggleFullscreen = () => { setFullscreen(v => !v); if (!fullscreen) setLocked(false) }

  return (
    <div>
      <div className="flex gap-1 bg-stone-100 rounded-xl p-1 mb-4 max-w-xs">
        {(Object.keys(LAYER_META) as NatureLayer[]).map(l => (
          <button
            key={l}
            onClick={() => setLayer(l)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[13px] font-semibold transition-colors ${
              layer === l ? 'bg-white shadow-sm text-stone-800' : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            {l === 'flora' ? <Leaf className="w-3.5 h-3.5" /> : <PawPrint className="w-3.5 h-3.5" />}
            {LAYER_META[l].label}
          </button>
        ))}
      </div>

      {loadingTrack ? (
        <div className="flex items-center gap-2 text-stone-400 text-sm py-12 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Caricamento…
        </div>
      ) : gpsPoints.length < 2 ? (
        <div className="text-center py-16 text-stone-400">
          <meta.icon className="w-16 h-16 mx-auto mb-3 text-stone-300" />
          <p>Percorso GPS non disponibile per questa escursione</p>
        </div>
      ) : (
        <>
          {!loading && markers.length > 0 && (
            // Nastro washi + bordo strappato (Taccuino Botanico, test) al posto del vecchio
            // riquadro arrotondato bordato — solo da chiusa, stesso pattern di RouteMapSection.
            <div
              className={fullscreen ? 'fixed inset-0 z-[70] bg-black isolate' : 'relative isolate mb-4'}
              style={fullscreen ? undefined : { height: 220 }}
            >
              {(() => {
                const mapContent = (
                  <>
                    <MapView
                      trackPoints={trackPoints} height="100%" interactive={!locked}
                      pois={[]} floraMarkers={markers} floraMarkerColor={meta.color} floraMarkerEmoji={meta.emoji}
                      fitSignal={fitTick}
                      bare
                    />
                    <div className="absolute inset-x-3 z-[1000] flex items-center justify-between" style={{ top: fullscreen ? 'calc(env(safe-area-inset-top, 0px) + 12px)' : '12px' }}>
                      <div className="flex items-center gap-0.5 bg-black/50 backdrop-blur-md border border-white/15 rounded-full p-1">
                        <button onClick={() => setFitTick(t => t + 1)} title="Inquadra tutti i punti" className={pillChipIdle}>
                          <LocateFixed className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setLocked(v => !v)}
                          title={locked ? 'Sblocca la mappa per navigarla' : 'Blocca la mappa'}
                          className={locked ? pillChipIdle : pillChipActive}
                        >
                          {locked ? <Lock className="w-4 h-4" /> : <LockOpen className="w-4 h-4" />}
                        </button>
                      </div>
                      <button onClick={toggleFullscreen} title={fullscreen ? 'Esci da schermo intero' : 'Schermo intero'} className={chipIdle}>
                        {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                      </button>
                    </div>
                  </>
                )
                return fullscreen ? mapContent : <TornFrame size="hero" variant={2}>{mapContent}</TornFrame>
              })()}
            </div>
          )}

          {loading ? (
            <div className="flex items-center gap-2 text-stone-400 text-sm py-12 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> Cerco {meta.label.toLowerCase()} osservata in zona…
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-16 text-stone-400 max-w-md mx-auto">
              <meta.icon className="w-16 h-16 mx-auto mb-3 text-stone-300" />
              <p className="font-display text-lg text-stone-600 mb-2">Nessuna osservazione disponibile</p>
              <p className="text-sm">
                I dati dipendono dalle osservazioni di GBIF/iNaturalist e dagli enti competenti. Le
                aree meno frequentate o i percorsi ad alta quota possono avere copertura limitata
                per questo mese.
              </p>
            </div>
          ) : (
            <>
              {fallbackLevel !== 1 && (
                <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-stone-100 text-stone-500 text-xs">
                  <Info className="w-3.5 h-3.5 shrink-0" /> {FALLBACK_LEVEL_LABEL[fallbackLevel]}
                </div>
              )}

              {withoutPhoto.length > 0 && (
                <>
                  <p className="font-barlow font-semibold text-[11px] uppercase tracking-wide text-stone-400 mb-2">Senza foto</p>
                  <div className="flex gap-2.5 overflow-x-auto pb-1 mb-4">
                    {withoutPhoto.map(item => (
                      <NatureChip key={item.scientificName} item={item} color={meta.color} onTap={() => setSelected(item)} />
                    ))}
                  </div>
                </>
              )}

              {withPhoto.length > 0 && (
                <>
                  <p className="font-barlow font-semibold text-[11px] uppercase tracking-wide text-stone-400 mb-2">Con foto</p>
                  <div className="flex gap-3 overflow-x-auto pb-1">
                    {withPhoto.map(item => (
                      <NaturePhotoCard key={item.scientificName} item={item} layerIcon={meta.icon} onTap={() => setSelected(item)} />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}

      <div className="text-xs text-stone-400 text-center py-4 mt-2">
        Dati e immagini: GBIF.org, iNaturalist, Wikidata/Commons, EEA Natura 2000. Licenze CC0/CC BY.
        Attribution per immagine nelle singole schede.{' '}
        <a href="/fonti-e-crediti" className="hover:underline text-terra-700">Dettaglio fonti e licenze ↗</a>
      </div>

      {selected && <NatureDetailModal item={selected} layer={layer} month={month} onClose={() => setSelected(null)} />}
    </div>
  )
}

export interface NatureGalleryProps extends NatureGalleryContentProps {
  /** Overrides the default back-link label (e.g. the hike/activity title). */
  backLabel?: string
  /** When provided, renders as a closable popup (X button, no Navbar) instead of a standalone page. */
  onClose?: () => void
}

/** Pagina/popup standalone per le rotte dedicate (/guida/[id]/flora, /guida/[id]/animali, e gli
 *  equivalenti in /resoconto) — dentro la guida stessa, la stessa NatureGalleryContent vive
 *  invece in linea dentro NaturaWidget.tsx, senza questo involucro. */
export default function NatureGallery({ trackPoints, month, loadingTrack, backLabel, onClose, initialLayer = 'flora' }: NatureGalleryProps) {
  return (
    <div className={onClose ? 'fixed inset-0 z-50 bg-stone-50 overflow-y-auto' : 'min-h-screen bg-stone-50'}>
      {!onClose && <Navbar />}
      <div className="max-w-3xl mx-auto px-4 py-6">
        {onClose ? (
          <button onClick={onClose} className="flex items-center gap-1.5 text-stone-500 hover:text-stone-800 text-sm transition-colors mb-4">
            <X className="w-4 h-4" /> Chiudi
          </button>
        ) : (
          <BackLink label={backLabel} className="flex items-center gap-1.5 text-stone-500 hover:text-stone-800 text-sm transition-colors mb-4" />
        )}

        <h1 className="font-display text-2xl font-semibold text-stone-800 mb-1">Flora e fauna</h1>
        <p className="text-sm text-stone-500 mb-4">Osservazioni in zona — {MONTHS[month - 1]}</p>

        <NatureGalleryContent trackPoints={trackPoints} month={month} loadingTrack={loadingTrack} initialLayer={initialLayer} />
      </div>
    </div>
  )
}
