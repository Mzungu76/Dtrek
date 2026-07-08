/**
 * DTrek PDF export — jsPDF + inline Canvas charts + OpenStreetMap tiles.
 * Split into per-concern submodules (mapTiles, canvasCharts, docHelpers, one
 * file per export*Pdf) — this barrel re-exports the same public API so every
 * existing `@/utils/pdfExport` import keeps working unchanged.
 */

export { mapBoxAspect, fetchSatMap, fetchAllRoutesSatMap, chartAllRoutes } from './mapTiles'
export { exportActivityPdf } from './activity'
export { exportPlannedPdf } from './planned'
export { exportStatsPdf } from './stats'
export { exportMapPdf } from './map'

// ── Guide PDF (Magazine Layout) ────────────────────────────────────────────────
import type { PlannedHike } from '@/lib/plannedStore'

export async function exportGuidePdf(hike: PlannedHike, guideText: string): Promise<void> {
  const { exportGuidePdfHtml } = await import('@/app/lib/guide/usePDFExport')
  return exportGuidePdfHtml(hike, guideText)
}
