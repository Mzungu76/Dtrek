'use client'

import { useEffect, useState, useRef } from 'react'
import dynamic from 'next/dynamic'
import { haversineM } from '@/lib/geoUtils'
import type { TrackPoint } from '@/lib/tcxParser'
import { Upload, X, Pencil, Check, Camera, MapPin, ImageOff, Map } from 'lucide-react'

const RouteMap3D = dynamic(() => import('@/components/RouteMap3D'), { ssr: false })

// ── Types ──────────────────────────────────────────────────────────────────────

export interface RoutePhoto {
  id: string
  dataUrl: string
  progress: number   // 0–1 on route
  caption: string
  hasExifGps: boolean
  lat?: number
  lon?: number
}

// ── EXIF GPS parser (mirrors RouteMap3D logic) ─────────────────────────────────

async function readExifGps(file: File): Promise<{ lat: number; lon: number } | null> {
  return new Promise(resolve => {
    const reader = new FileReader()
    reader.onload = e => {
      const buf = e.target?.result as ArrayBuffer
      if (!buf) { resolve(null); return }
      const view = new DataView(buf)
      try {
        if (view.getUint16(0) !== 0xFFD8) { resolve(null); return }
        let off = 2
        while (off < view.byteLength - 2) {
          const marker = view.getUint16(off); off += 2
          if (marker === 0xFFE1) {
            const len = view.getUint16(off); off += 2; void len
            const hb = new Uint8Array(buf, off, 4)
            if (Array.from(hb).map(b => String.fromCharCode(b)).join('') !== 'Exif') { resolve(null); return }
            const ts = off + 6, tv = new DataView(buf, ts), le = tv.getUint16(0) === 0x4949
            const rd16 = (o: number) => tv.getUint16(o, le)
            const rd32 = (o: number) => tv.getUint32(o, le)
            const ifd0 = rd32(4), n0 = rd16(ifd0)
            let gOff = 0
            for (let i = 0; i < n0; i++) {
              const eo = ifd0 + 2 + i * 12
              if (rd16(eo) === 0x8825) { gOff = rd32(eo + 8); break }
            }
            if (!gOff) { resolve(null); return }
            const gN = rd16(gOff)
            const gd: Record<number, number[]> = {}
            for (let i = 0; i < gN; i++) {
              const eo = gOff + 2 + i * 12
              const tag = rd16(eo), type = rd16(eo + 2), count = rd32(eo + 4)
              if (type === 5) {
                const vOff = rd32(eo + 8)
                const vals: number[] = []
                for (let j = 0; j < count; j++) {
                  const n = rd32(vOff + j * 8), d = rd32(vOff + j * 8 + 4)
                  vals.push(d ? n / d : 0)
                }
                gd[tag] = vals
              }
            }
            const la = gd[2], lo = gd[4]
            if (!la || !lo) { resolve(null); return }
            resolve({ lat: la[0] + la[1] / 60 + la[2] / 3600, lon: lo[0] + lo[1] / 60 + lo[2] / 3600 })
            return
          }
          off += view.getUint16(off) - 2 + 2
        }
      } catch { /* ignore */ }
      resolve(null)
    }
    reader.readAsArrayBuffer(file.slice(0, 65536))
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function progressLabel(p: number): string {
  if (p < 0.15) return 'partenza'
  if (p < 0.4)  return 'primo tratto'
  if (p < 0.65) return 'metà percorso'
  if (p < 0.85) return 'tratto finale'
  return 'arrivo'
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  activityId: string
  trackPoints: TrackPoint[]
  activityTitle?: string
  distanceMeters?: number
  elevationGain?: number
}

export default function ActivityPhotoManager({
  activityId, trackPoints, activityTitle, distanceMeters, elevationGain,
}: Props) {
  const [photos,     setPhotos]     = useState<RoutePhoto[]>([])
  const [uploading,  setUploading]  = useState(false)
  const [editingId,  setEditingId]  = useState<string | null>(null)
  const [editCaption,setEditCaption]= useState('')
  const [dragging,   setDragging]   = useState(false)
  const [show3D,     setShow3D]     = useState(false)
  const fileRef  = useRef<HTMLInputElement>(null)
  const saveReady = useRef(false)

  // Load from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`dtrek_vp_${activityId}`)
      if (raw) {
        const parsed: RoutePhoto[] = JSON.parse(raw)
        setPhotos([...parsed].sort((a, b) => a.progress - b.progress))
      }
    } catch { /* ignore */ }
    saveReady.current = true
  }, [activityId])

  // Persist to localStorage on every change
  useEffect(() => {
    if (!saveReady.current) return
    try {
      if (photos.length === 0) localStorage.removeItem(`dtrek_vp_${activityId}`)
      else localStorage.setItem(`dtrek_vp_${activityId}`, JSON.stringify(photos))
    } catch { /* ignore */ }
  }, [photos, activityId])

  const pts = trackPoints.filter(p => p.lat && p.lon)

  async function processFiles(files: File[]) {
    const imgs = files.filter(f => f.type.startsWith('image/'))
    if (!imgs.length) return
    setUploading(true)
    const added: RoutePhoto[] = []

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

      // EXIF GPS → nearest trackpoint → progress
      const gps = await readExifGps(file)
      let progress = 0.5
      let hasExifGps = false
      let lat: number | undefined
      let lon: number | undefined

      if (gps && pts.length > 1) {
        hasExifGps = true
        lat = gps.lat
        lon = gps.lon
        let minD = Infinity, bestIdx = 0
        pts.forEach((pt, i) => {
          const d = haversineM(pt.lat!, pt.lon!, gps.lat, gps.lon)
          if (d < minD) { minD = d; bestIdx = i }
        })
        progress = bestIdx / (pts.length - 1)
      }

      added.push({
        id:         `photo-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        dataUrl:    cropped,
        progress,
        caption:    file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ').slice(0, 50),
        hasExifGps,
        ...(lat !== undefined && lon !== undefined ? { lat, lon } : {}),
      })
    }

    setPhotos(prev => [...prev, ...added].sort((a, b) => a.progress - b.progress))
    setUploading(false)
  }

  function removePhoto(id: string) {
    setPhotos(prev => prev.filter(p => p.id !== id))
  }

  function handleMapClose() {
    setShow3D(false)
    // Re-read updated positions from localStorage after RouteMap3D placement
    try {
      const raw = localStorage.getItem(`dtrek_vp_${activityId}`)
      if (raw) {
        const parsed: RoutePhoto[] = JSON.parse(raw)
        setPhotos([...parsed].sort((a, b) => a.progress - b.progress))
      }
    } catch { /* ignore */ }
  }

  function startEdit(photo: RoutePhoto) {
    setEditingId(photo.id)
    setEditCaption(photo.caption)
  }

  function saveCaption() {
    if (!editingId) return
    setPhotos(prev => prev.map(p => p.id === editingId ? { ...p, caption: editCaption.trim() || p.caption } : p))
    setEditingId(null)
  }

  return (
    <section className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm">
      <div className="flex items-start justify-between mb-1">
        <h2 className="font-display text-xl font-semibold text-stone-700">Foto del percorso</h2>
        {photos.length > 0 && (
          <span className="text-xs font-mono text-stone-400 mt-1">{photos.length} foto</span>
        )}
      </div>
      <p className="text-xs text-stone-400 italic mb-5 leading-snug">
        Le foto vengono usate nel resoconto e nella mappa 3D. Con GPS automatico vengono posizionate sul percorso;
        altrimenti clicca su una foto per aprire la mappa 3D e posizionarla manualmente.
      </p>

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
              <span className="text-xs text-stone-400">GPS automatico se presente nell'EXIF · più file supportati</span>
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
              {/* Thumbnail — click to open 3D map for placement */}
              <div className="relative cursor-pointer" onClick={() => setShow3D(true)}>
                <img src={photo.dataUrl} alt={photo.caption}
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
                {/* Delete */}
                <button
                  onClick={e => { e.stopPropagation(); removePhoto(photo.id) }}
                  className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 w-5 h-5 bg-red-500/90 hover:bg-red-600 text-white rounded-full flex items-center justify-center transition-opacity">
                  <X className="w-3 h-3" />
                </button>
              </div>

              {/* Caption */}
              <div className="px-2 py-1.5">
                {editingId === photo.id ? (
                  <div className="flex items-center gap-1">
                    <input
                      autoFocus
                      value={editCaption}
                      onChange={e => setEditCaption(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveCaption(); if (e.key === 'Escape') setEditingId(null) }}
                      className="flex-1 text-[11px] border-b border-forest-400 outline-none text-stone-700 bg-transparent"
                    />
                    <button onClick={saveCaption}><Check className="w-3 h-3 text-forest-600" /></button>
                  </div>
                ) : (
                  <button onClick={() => startEdit(photo)}
                    className="w-full flex items-center justify-between gap-1 group/cap">
                    <span className="text-[11px] text-stone-600 truncate leading-snug text-left">
                      {photo.caption || <span className="italic text-stone-400">senza nome</span>}
                    </span>
                    <Pencil className="w-2.5 h-2.5 text-stone-300 group-hover/cap:text-forest-500 shrink-0" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {show3D && (
        <RouteMap3D
          trackPoints={trackPoints}
          title={activityTitle}
          onClose={handleMapClose}
          activityId={activityId}
          distanceMeters={distanceMeters ?? 0}
          elevationGain={elevationGain ?? 0}
        />
      )}
    </section>
  )
}
