'use client'

import { useState, useRef } from 'react'
import dynamic from 'next/dynamic'
import { haversineM } from '@/lib/geoUtils'
import type { TrackPoint } from '@/lib/tcxParser'
import { fetchActivityPhotos, addActivityPhoto, updateActivityPhoto, removeActivityPhoto, type RoutePhoto } from '@/lib/activityPhotos'
import { readExifGps, EXIF_MAX_SNAP_DISTANCE_M } from '@/lib/exifGps'
import { Upload, Pencil, Check, Camera, MapPin, ImageOff, Map, AlertTriangle, Trash2, Loader2 } from 'lucide-react'

const PhotoPlacementMap = dynamic(() => import('@/app/components/PhotoPlacementMap'), { ssr: false })

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  activityId: string
  trackPoints: TrackPoint[]
  /** Foto già caricate dal chiamante (ReportReader, che le usa anche per hero/mosaico/mappa/
   *  galleria) — componente controllato: nessun fetch proprio, ogni variazione (upload,
   *  didascalia, rimozione, riposizionamento) passa da `onPhotosChange` invece di uno stato
   *  interno separato, altrimenti le due copie andrebbero fuori sincrono. */
  photos: RoutePhoto[]
  onPhotosChange: (photos: RoutePhoto[]) => void
}

export default function ActivityPhotoManager({
  activityId, trackPoints, photos, onPhotosChange,
}: Props) {
  const [uploading,  setUploading]  = useState(false)
  const [editingId,  setEditingId]  = useState<string | null>(null)
  const [editCaption,setEditCaption]= useState('')
  const [dragging,          setDragging]          = useState(false)
  const [showPlacementMap,  setShowPlacementMap]  = useState(false)
  // Foto per cui è stata chiesta l'eliminazione, in attesa di conferma — un'azione distruttiva e
  // irreversibile (la foto sparisce anche dallo Storage) non deve dipendere da un singolo tocco
  // andato a segno per caso.
  const [pendingDelete, setPendingDelete] = useState<RoutePhoto | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef   = useRef<HTMLInputElement>(null)

  async function refreshPhotos() {
    try {
      onPhotosChange(await fetchActivityPhotos(activityId))
    } catch {
      setError('Impossibile caricare le foto di questa escursione.')
    }
  }

  const pts = trackPoints.filter(p => p.lat && p.lon)

  async function processFiles(files: File[]) {
    const imgs = files.filter(f => f.type.startsWith('image/'))
    if (!imgs.length) return
    setUploading(true)
    setError(null)
    const added: RoutePhoto[] = []

    try {
      for (const file of imgs) {
        // Load original
        const dataUrl = await new Promise<string>(res => {
          const r = new FileReader()
          r.onload = ev => res(ev.target!.result as string)
          r.readAsDataURL(file)
        })
        const img = new Image()
        await new Promise<void>(res => { img.onload = () => res(); img.src = dataUrl })

        // Square-crop → 800×800 JPEG 0.82 (same as RouteMap3D)
        const size = Math.min(img.width, img.height)
        const cv   = document.createElement('canvas')
        cv.width = cv.height = 800
        cv.getContext('2d')!.drawImage(
          img,
          (img.width - size) / 2, (img.height - size) / 2, size, size,
          0, 0, 800, 800,
        )
        const cropped = cv.toDataURL('image/jpeg', 0.82)

        // Coordinate EXIF → posizione della foto, e punto di traccia più vicino → progressione
        // lungo il percorso (che serve solo a ordinarla tra le altre).
        //
        // Le due cose sono deliberatamente indipendenti: se la foto ha coordinate valide vengono
        // sempre salvate, anche senza traccia GPS con cui confrontarle. Legarle insieme era
        // sbagliato — una traccia assente o con un solo punto azzerava anche il GPS della foto, che
        // così perdeva il badge e finiva a metà percorso pur avendo una posizione perfettamente
        // buona. Solo una coordinata assurdamente lontana (EXIF_MAX_SNAP_DISTANCE_M: una foto che
        // con questa escursione non c'entra nulla) viene ignorata del tutto, perché ancorarla
        // trascinerebbe un pin fuori dalla mappa del percorso.
        const gps = await readExifGps(file)
        let progress = 0.5
        let hasExifGps = false
        let lat: number | undefined
        let lon: number | undefined

        if (gps) {
          let minD = Infinity, bestIdx = 0
          pts.forEach((pt, i) => {
            const d = haversineM(pt.lat!, pt.lon!, gps.lat, gps.lon)
            if (d < minD) { minD = d; bestIdx = i }
          })
          const belongsToThisHike = pts.length === 0 || minD <= EXIF_MAX_SNAP_DISTANCE_M
          if (belongsToThisHike) {
            hasExifGps = true
            lat = gps.lat
            lon = gps.lon
            if (pts.length > 1) progress = bestIdx / (pts.length - 1)
          }
        }

        const id = `photo-${Date.now()}-${Math.random().toString(36).slice(2)}`
        const caption = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ').slice(0, 50)

        const saved = await addActivityPhoto(activityId, {
          id, dataUrl: cropped, progress, caption, hasExifGps,
          ...(lat !== undefined && lon !== undefined ? { lat, lon } : {}),
        })
        added.push(saved)
      }

      onPhotosChange([...photos, ...added].sort((a, b) => a.progress - b.progress))

      // Single upload → open its caption editor right away so the user writes
      // their own caption instead of keeping the filename-derived default.
      if (added.length === 1) {
        setEditingId(added[0].id)
        setEditCaption(added[0].caption)
      }
    } catch (e) {
      console.error('addActivityPhoto:', e)
      setError('Caricamento foto non riuscito. Controlla la connessione e riprova.')
    } finally {
      setUploading(false)
    }
  }

  async function confirmRemovePhoto() {
    const photo = pendingDelete
    if (!photo) return
    setError(null)
    setDeleting(true)
    try {
      await removeActivityPhoto(activityId, photo.id)
      onPhotosChange(photos.filter(p => p.id !== photo.id))
      setPendingDelete(null)
    } catch (e) {
      console.error('removeActivityPhoto:', e)
      setError('Eliminazione foto non riuscita. Riprova.')
      setPendingDelete(null)
    } finally {
      setDeleting(false)
    }
  }

  function startEdit(photo: RoutePhoto) {
    setEditingId(photo.id)
    setEditCaption(photo.caption)
  }

  async function saveCaption() {
    if (!editingId) return
    const id = editingId
    const caption = editCaption.trim()
    setEditingId(null)
    if (!caption) return
    try {
      await updateActivityPhoto(activityId, id, { caption })
      onPhotosChange(photos.map(p => p.id === id ? { ...p, caption } : p))
    } catch (e) {
      console.error('updateActivityPhoto:', e)
      setError('Aggiornamento didascalia non riuscito. Riprova.')
    }
  }

  return (
    <section className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm print:hidden">
      <div className="flex items-start justify-between mb-1">
        <h2 className="font-display text-xl font-semibold text-stone-700">Aggiungi o gestisci le foto</h2>
        {photos.length > 0 && (
          <span className="text-xs font-mono text-stone-400 mt-1">{photos.length} foto</span>
        )}
      </div>
      <p className="text-xs text-stone-400 italic mb-3 leading-snug">
        Le foto vengono usate nel resoconto e nella mappa. Con GPS automatico vengono posizionate sul percorso;
        altrimenti clicca su una foto per posizionarla manualmente.
      </p>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-5">
          <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-[11px] text-red-600 leading-snug">{error}</p>
        </div>
      )}

      {/* Upload zone */}
      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); processFiles(Array.from(e.dataTransfer.files)) }}
        className={`relative border-2 border-dashed rounded-xl px-4 py-5 flex flex-col items-center gap-2 cursor-pointer transition-colors mb-5
          ${dragging ? 'border-forest-400 bg-forest-50' : 'border-stone-200 hover:border-forest-300 hover:bg-stone-50'}`}
      >
        {uploading
          ? <><Camera className="w-6 h-6 text-forest-500 animate-pulse" /><span className="text-sm text-stone-500">Elaborazione…</span></>
          : <>
              <Upload className="w-5 h-5 text-stone-400" />
              <span className="text-sm text-stone-500">Trascina le foto qui o <span className="text-forest-600 font-medium">clicca per scegliere</span></span>
              <span className="text-xs text-stone-400">GPS automatico se presente nell&apos;EXIF · più file supportati</span>
            </>
        }
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={e => { processFiles(Array.from(e.target.files ?? [])); e.target.value = '' }}
        />
      </div>

      {/* Photo grid */}
      {photos.length === 0 ? (
        <div className="flex flex-col items-center py-6 text-stone-300 gap-2">
          <ImageOff className="w-8 h-8" />
          <span className="text-xs">Nessuna foto aggiunta</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {photos.map(photo => (
            <div key={photo.id} className="group rounded-xl overflow-hidden border border-stone-100 shadow-sm bg-white">
              {/* Thumbnail — click to open placement map */}
              <div className="relative cursor-pointer" onClick={() => setShowPlacementMap(true)}>
                <img src={photo.url} alt={photo.caption}
                  className="w-full aspect-square object-cover group-hover:opacity-90 transition-opacity" />
                {/* GPS / position badge */}
                {photo.hasExifGps
                  ? <div className="absolute bottom-1 left-1 flex items-center gap-0.5 bg-forest-600/85 text-white text-[9px] font-mono rounded-full px-1.5 py-0.5">
                      <MapPin className="w-2.5 h-2.5" /> GPS
                    </div>
                  : <div className="absolute inset-0 flex items-end justify-center pb-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="flex items-center gap-1 bg-black/60 text-white text-[9px] rounded-full px-2 py-0.5">
                        <Map className="w-2.5 h-2.5" /> Posiziona
                      </span>
                    </div>
                }
              </div>

              {/* Caption */}
              <div className="px-2 py-1.5">
                {editingId === photo.id ? (
                  <div className="flex items-center gap-1">
                    <input
                      autoFocus
                      onFocus={e => e.target.select()}
                      value={editCaption}
                      onChange={e => setEditCaption(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveCaption(); if (e.key === 'Escape') setEditingId(null) }}
                      className="flex-1 text-[11px] border-b border-forest-400 outline-none text-stone-700 bg-transparent"
                    />
                    <button onClick={saveCaption}><Check className="w-3 h-3 text-forest-600" /></button>
                  </div>
                ) : (
                  <button onClick={() => startEdit(photo)}
                    className="w-full flex items-center justify-between gap-1 py-1 group/cap">
                    <span className="text-[11px] text-stone-600 truncate leading-snug text-left">
                      {photo.caption || <span className="italic text-stone-400">senza nome</span>}
                    </span>
                    <Pencil className="w-3 h-3 text-stone-300 group-hover/cap:text-forest-500 shrink-0" />
                  </button>
                )}
              </div>

              {/* Azioni esplicite, sempre visibili e a piena larghezza. Prima "elimina" era una
                  crocetta di 20 px in un angolo, rivelata dall'hover: su un telefono l'hover non
                  esiste, quindi il bersaglio restava invisibile e andava centrato a intuito — e
                  quando lo si centrava la foto spariva senza chiedere nulla. Qui il bersaglio è
                  un'intera metà della riga (~36 px di altezza, ben oltre la soglia tattile) ed è
                  etichettato, e l'eliminazione passa comunque da una conferma. */}
              <div className="flex border-t border-stone-100 text-[10.5px] font-semibold">
                <button
                  onClick={() => setShowPlacementMap(true)}
                  className="flex-1 flex items-center justify-center gap-1 py-2 text-stone-500 hover:bg-stone-50 transition-colors"
                >
                  <Map className="w-3 h-3" /> Posiziona
                </button>
                <button
                  onClick={() => setPendingDelete(photo)}
                  className="flex-1 flex items-center justify-center gap-1 py-2 text-red-500 hover:bg-red-50 border-l border-stone-100 transition-colors"
                >
                  <Trash2 className="w-3 h-3" /> Elimina
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Conferma di eliminazione — con l'anteprima della foto, così si vede subito se il tocco è
          finito su quella giusta (in una griglia di miniature quadrate è facile sbagliare vicino). */}
      {pendingDelete && (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget && !deleting) setPendingDelete(null) }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs overflow-hidden">
            <div className="flex items-start gap-3 px-5 pt-5 pb-4">
              <img src={pendingDelete.url} alt="" className="w-16 h-16 rounded-xl object-cover shrink-0 border border-stone-200" />
              <div className="min-w-0">
                <h3 className="font-display font-bold text-stone-800 text-[15px] leading-snug">Eliminare questa foto?</h3>
                <p className="text-[11.5px] text-stone-500 leading-snug mt-1">
                  {pendingDelete.caption
                    ? `«${pendingDelete.caption}» sparirà dal resoconto, dalla galleria e dalla mappa. Non si può annullare.`
                    : 'Sparirà dal resoconto, dalla galleria e dalla mappa. Non si può annullare.'}
                </p>
              </div>
            </div>
            <div className="flex gap-2 px-5 pb-5">
              <button
                onClick={() => setPendingDelete(null)}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl border border-stone-200 text-stone-600 text-[13px] font-semibold hover:bg-stone-50 transition-colors disabled:opacity-50"
              >
                Annulla
              </button>
              <button
                onClick={confirmRemovePhoto}
                disabled={deleting}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-[13px] font-semibold transition-colors disabled:opacity-60"
              >
                {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Elimina
              </button>
            </div>
          </div>
        </div>
      )}

      {showPlacementMap && (
        <PhotoPlacementMap
          activityId={activityId}
          trackPoints={trackPoints}
          photos={photos}
          onClose={() => { setShowPlacementMap(false); refreshPhotos() }}
          onUpdate={refreshPhotos}
        />
      )}
    </section>
  )
}
