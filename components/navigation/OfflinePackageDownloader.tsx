'use client'
import { useEffect, useState } from 'react'
import { Download, CheckCircle2, Pause, Trash2, AlertTriangle } from 'lucide-react'
import {
  downloadOfflinePackage, pauseOfflinePackage, deleteOfflinePackage, estimatePackageSizeBytes, computeBboxFromTrack,
  type OfflinePackageHikeData,
} from '@/lib/offline/packageManager'
import { loadManifest, isManifestValid, type OfflinePackageManifest } from '@/lib/offline/packageManifest'

interface Props {
  hikeId: string
  routePolyline: [number, number][]
  hikeData?: OfflinePackageHikeData
  /** Icon-only rendering (no size estimate/label text) — for tight spaces like a corner badge on a
   *  list card (app/navigatore/page.tsx), as opposed to the full inline control used inside live
   *  navigation (ActiveNavigationView.tsx's offline sheet). Same states/behavior either way. */
  compact?: boolean
}

function formatMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function OfflinePackageDownloader({ hikeId, routePolyline, hikeData, compact = false }: Props) {
  const [manifest, setManifest] = useState<OfflinePackageManifest | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { loadManifest(hikeId).then(setManifest) }, [hikeId])

  if (routePolyline.length < 2) return null

  const estimatedTiles = Math.round(
    // rough count without enumerating: (zoom levels) * (bbox area heuristic) — good enough for a pre-download estimate
    (routePolyline.length / 10 + 20) * 4,
  )

  const handleDownload = async () => {
    setDownloading(true)
    setError(null)
    try {
      await downloadOfflinePackage(hikeId, routePolyline, hikeData, (p) => {
        setManifest((prev) => prev ? { ...prev, status: p.status, downloadedCount: p.downloadedCount, tileCount: p.tileCount } : prev)
      })
      setManifest(await loadManifest(hikeId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download fallito')
    } finally {
      setDownloading(false)
    }
  }

  const handlePause = async () => {
    await pauseOfflinePackage(hikeId)
    setManifest(await loadManifest(hikeId))
    setDownloading(false)
  }

  const handleDelete = async () => {
    await deleteOfflinePackage(hikeId)
    setManifest(null)
  }

  if (isManifestValid(manifest)) {
    if (compact) {
      return (
        <div className="flex items-center gap-1 pl-2 pr-1 py-1 rounded-full bg-white/95 shadow-md text-emerald-700" title={`Disponibile offline (${formatMB(manifest!.sizeBytes)})`}>
          <CheckCircle2 className="w-3.5 h-3.5" />
          <button onClick={handleDelete} className="p-1 rounded-full hover:bg-emerald-50 text-emerald-600" title="Rimuovi pacchetto offline">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      )
    }
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-700">
        <CheckCircle2 className="w-3.5 h-3.5" />
        Disponibile offline ({formatMB(manifest!.sizeBytes)})
        <button onClick={handleDelete} className="ml-2 text-emerald-600 hover:text-emerald-900" title="Rimuovi pacchetto offline">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    )
  }

  if (downloading || manifest?.status === 'downloading' || manifest?.status === 'paused') {
    const pct = manifest && manifest.tileCount > 0 ? Math.round((manifest.downloadedCount / manifest.tileCount) * 100) : 0
    if (compact) {
      return (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/95 shadow-md text-sky-700 text-[11px] font-semibold" title={`Download offline: ${pct}%`}>
          {pct}%
          {downloading ? (
            <button onClick={handlePause} title="Metti in pausa"><Pause className="w-3 h-3" /></button>
          ) : (
            <button onClick={handleDownload} title="Riprendi download"><Download className="w-3 h-3" /></button>
          )}
        </div>
      )
    }
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-sky-50 border border-sky-200 text-xs font-semibold text-sky-700">
        <div className="w-20 h-1.5 rounded-full bg-sky-100 overflow-hidden">
          <div className="h-full bg-sky-500" style={{ width: `${pct}%` }} />
        </div>
        {pct}%
        {downloading ? (
          <button onClick={handlePause} title="Metti in pausa"><Pause className="w-3.5 h-3.5" /></button>
        ) : (
          <button onClick={handleDownload} title="Riprendi download">Riprendi</button>
        )}
      </div>
    )
  }

  if (compact) {
    return (
      <button
        onClick={handleDownload}
        className="flex items-center justify-center w-7 h-7 rounded-full bg-white/95 shadow-md text-slate-600 hover:text-slate-900"
        title={`Scarica per offline (~${formatMB(estimatePackageSizeBytes(estimatedTiles))})`}
      >
        {error ? <AlertTriangle className="w-3.5 h-3.5 text-red-600" /> : <Download className="w-3.5 h-3.5" />}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleDownload}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700"
        title="Scarica mappa e dati per l'uso offline durante l'escursione"
      >
        <Download className="w-3.5 h-3.5" /> Scarica per offline (~{formatMB(estimatePackageSizeBytes(estimatedTiles))})
      </button>
      {error && <span className="flex items-center gap-1 text-xs text-red-600"><AlertTriangle className="w-3.5 h-3.5" />{error}</span>}
    </div>
  )
}
