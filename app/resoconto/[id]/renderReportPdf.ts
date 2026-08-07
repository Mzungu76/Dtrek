// Motore unico per il PDF del resoconto — prima ce n'erano due: `utils/pdfExport/activity.ts`
// (jsPDF, un download rapido dal pannello strumenti) e questa via DOM (HiddenPdfRoot.tsx, usata
// solo per "Pubblica"), con stile, contenuto e persino colori diversi per lo stesso oggetto. Il
// primo è stato ritirato — questo è l'unico ora, sia per lo scarico locale sia per la
// pubblicazione, sullo stesso modello già in uso per la Guida (app/lib/guide/usePDFExport.ts).
//
// HiddenPdfRoot non è più montato permanentemente nel DOM di ReportReader: viene creato qui, al
// momento della cattura, e smontato subito dopo — prima ogni foto veniva scaricata due volte
// (una per la vista a schermo, una per la radice nascosta sempre presente).

import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import React from 'react'
import type { StoredActivity } from '@/lib/blobStore'
import type { RoutePhoto } from '@/lib/activityPhotos'
import type { Section } from '@/lib/reportStore'
import type { PoiItem } from '@/lib/overpass'
import type { WikiPage } from '@/lib/wikipedia'
import { HiddenPdfRoot } from './HiddenPdfRoot'

export interface ReportPdfParams {
  activity: StoredActivity
  heroPhoto: RoutePhoto | null
  dateStr: string
  sections: Section[]
  photos: RoutePhoto[]
  poiWikiEntries?: { poi: PoiItem; wiki: WikiPage }[]
}

async function buildMapImage(activity: StoredActivity): Promise<string | undefined> {
  const polyline = activity.trackPoints
    .filter(p => p.lat !== undefined && p.lon !== undefined)
    .map(p => [p.lat!, p.lon!] as [number, number])
  if (polyline.length < 2) return undefined
  try {
    const { renderRouteMap } = await import('@/lib/mapSnapshot')
    return await renderRouteMap({
      polylines: [polyline],
      width: 1460, height: 600, pixelRatio: 1,
      markers: [
        { lat: polyline[0][0], lon: polyline[0][1], kind: 'start' },
        { lat: polyline[polyline.length - 1][0], lon: polyline[polyline.length - 1][1], kind: 'end' },
      ],
    })
  } catch (err) {
    console.warn('[renderReportPdf] mappa non disponibile:', err)
    return undefined
  }
}

/** Rende il PDF completo del resoconto e ne restituisce il blob — usata sia per lo scarico locale
 *  sia, dal chiamante, per la pubblicazione (upload + link condivisibile). */
export async function renderReportPdfBlob(
  params: ReportPdfParams,
  onProgress?: (done: number, total: number) => void,
): Promise<Blob> {
  const mapImage = await buildMapImage(params.activity)

  const container = document.createElement('div')
  container.style.cssText = 'position:fixed;left:-9999px;top:0;z-index:-1'
  document.body.appendChild(container)

  const root = createRoot(container)
  flushSync(() => root.render(
    React.createElement(HiddenPdfRoot, { ...params, mapImage }),
  ))

  try {
    const { waitForImages } = await import('@/lib/pdfImages')
    await waitForImages(container)

    const { paginateToPdf, nextLayout } = await import('@/lib/pdfPaginate')
    await nextLayout()
    const printRoot = container.querySelector<HTMLElement>('#resoconto-print-root')
    if (!printRoot) throw new Error('Layout del PDF non trovato')
    return await paginateToPdf([printRoot], '.pdf-block', { diaryTitle: params.activity.title, onProgress })
  } finally {
    root.unmount()
    document.body.removeChild(container)
  }
}

/** Genera e scarica localmente il PDF, senza pubblicarlo. */
export async function downloadReportPdf(params: ReportPdfParams): Promise<void> {
  const blob = await renderReportPdfBlob(params)
  const filename = `dtrek-resoconto-${(params.activity.title ?? 'escursione').replace(/\s+/g, '-').replace(/[^a-z0-9-]/gi, '').slice(0, 40)}.pdf`
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = filename
  a.click(); URL.revokeObjectURL(url)
}
