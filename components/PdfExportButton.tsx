'use client'
import { useState } from 'react'
import { FileDown, Loader2 } from 'lucide-react'
import type { StoredActivity, ActivityMeta } from '@/lib/blobStore'
import type { PlannedHike } from '@/lib/plannedStore'

type Variant = 'activity' | 'planned' | 'stats' | 'map'

interface BaseProps {
  variant: Variant
  className?: string
  label?: string
  iconOnly?: boolean
}

interface ActivityProps extends BaseProps { variant: 'activity'; data: StoredActivity }
interface PlannedProps  extends BaseProps { variant: 'planned';  data: PlannedHike }
interface StatsProps    extends BaseProps { variant: 'stats';    data: ActivityMeta[] }
interface MapProps      extends BaseProps { variant: 'map';      data: ActivityMeta[] }

type Props = ActivityProps | PlannedProps | StatsProps | MapProps

export default function PdfExportButton({ variant, data, className, label, iconOnly }: Props) {
  const [busy, setBusy] = useState(false)

  async function handleClick() {
    if (busy) return
    setBusy(true)
    try {
      if (variant === 'activity') {
        const { exportActivityPdf } = await import('@/utils/pdfExport')
        await exportActivityPdf(data as StoredActivity)
      } else if (variant === 'planned') {
        const { exportPlannedPdf } = await import('@/utils/pdfExport')
        await exportPlannedPdf(data as PlannedHike)
      } else if (variant === 'stats') {
        const { exportStatsPdf } = await import('@/utils/pdfExport')
        await exportStatsPdf(data as ActivityMeta[])
      } else {
        const { exportMapPdf } = await import('@/utils/pdfExport')
        await exportMapPdf(data as ActivityMeta[])
      }
    } catch (e) {
      console.error('PDF export error', e)
    } finally {
      setBusy(false)
    }
  }

  const defaultLabel = variant === 'map' ? 'PDF Mappa' : 'PDF'
  const displayLabel = label ?? defaultLabel

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      title={displayLabel}
      className={className}
    >
      {busy
        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
        : <FileDown className="w-3.5 h-3.5" />
      }
      {!iconOnly && <span>{busy ? 'Generazione…' : displayLabel}</span>}
    </button>
  )
}
