'use client'
import { useState } from 'react'
import { FileDown, Loader2 } from 'lucide-react'
import type { ActivityMeta } from '@/lib/blobStore'

// 'activity' e 'planned' sono stati ritirati in Fase 4: producevano un secondo documento jsPDF,
// fuori stile, per lo stesso oggetto già esportabile via template DOM (vedi GuidaHub.tsx per la
// guida, ReportReader.tsx per il resoconto). 'stats' e 'map' restano — sono schede dati, non
// documenti editoriali, e non hanno un equivalente DOM-based in questa fase.
type Variant = 'stats' | 'map'

interface BaseProps {
  variant: Variant
  className?: string
  label?: string
  iconOnly?: boolean
}

interface StatsProps { variant: 'stats'; data: ActivityMeta[] }
interface MapProps    { variant: 'map';   data: ActivityMeta[] }

type Props = BaseProps & (StatsProps | MapProps)

export default function PdfExportButton({ variant, data, className, label, iconOnly }: Props) {
  const [busy, setBusy] = useState(false)

  async function handleClick() {
    if (busy) return
    setBusy(true)
    try {
      if (variant === 'stats') {
        const { exportStatsPdf } = await import('@/utils/pdfExport')
        await exportStatsPdf(data)
      } else {
        const { exportMapPdf } = await import('@/utils/pdfExport')
        await exportMapPdf(data)
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
