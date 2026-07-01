'use client'
import { useEffect, useState } from 'react'
import { Download, CheckCircle2, Pause, Trash2, AlertTriangle } from 'lucide-react'
import {
  downloadOfflinePackage, pauseOfflinePackage, deleteOfflinePackage, estimatePackageSizeBytes, computeBboxFromTrack,
} from '@/lib/offline/packageManager'
import { loadManifest, isManifestValid, type OfflinePackageManifest } from '@/lib/offline/packageManifest'

interface Props {
  hikeId: string
  routePolyline: [number, number][]
}

function formatMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function OfflinePackageDownloader({ hikeId, routePolyline }: Props) {
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
      await downloadOfflinePackage(hikeId, routePolyline, (p) => {
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
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-700">
        <CheckCircle2 className="w-3.5 h-3.5" />
        Disponibile offline ({formatMB(manifest.sizeBytes)})
        <button onClick={handleDelete} className="ml-2 text-emerald-600 hover:text-emerald-900" title="Rimuovi pacchetto offline">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    )
  }

  if (downloading || manifest?.status === 'downloading' || manifest?.status === 'paused') {
    const pct = manifest && manifest.tileCount > 0 ? Math.round((manifest.downloadedCount / manifest.tileCount) * 100) : 0
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
