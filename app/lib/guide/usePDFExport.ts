'use client'

import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import React from 'react'
import type { PlannedHike } from '@/lib/plannedStore'
import type { WikiPage }    from '@/lib/wikipedia'
import type { PoiItem }     from '@/lib/overpass'
import { buildGuideContent } from './buildGuideContent'
import { fetchRoutePhotos }  from './fetchRoutePhotos'
import GuideTemplate         from '@/app/components/guide/GuideTemplate'
import type { GuideSectionPhoto } from '@/app/components/guide/GuideSection'

async function toDataUrl(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
  const blob = await res.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

async function toDataUrlSafe(url: string): Promise<string | undefined> {
  try { return await toDataUrl(url) } catch { return undefined }
}

/** Re-use the OSM tile stitcher already in utils/pdfExport.ts. Builds two crops from the
 *  same route: a full-bleed cover (fit:'cover', exact A4 page aspect — no CSS object-fit left
 *  to html2canvas at capture time, which is what produced the vertically-stretched cover) and
 *  a small "whole route visible" overview mini-map (fit:'contain'). */
async function buildMapImages(hike: PlannedHike): Promise<{ cover: string; mini: string }> {
  // lib/downsamplePolyline.ts, non un campionamento a modulo scritto qui a mano (era la terza
  // copia della stessa idea: le altre due, in utils/pdfExport/{activity,planned}.ts, sono state
  // ritirate in questa fase insieme ai documenti jsPDF che le usavano).
  const { downsamplePolyline } = await import('@/lib/downsamplePolyline')
  const sampled = (hike.trackPoints?.length ?? 0) > 1
    ? downsamplePolyline(hike.trackPoints!, 300)
    : (hike.routePolyline ?? []) as [number, number][]

  if (sampled.length < 2) return { cover: '', mini: '' }

  const { fetchSatMap } = await import('@/utils/pdfExport')
  const [cover, mini] = await Promise.all([
    // 794×1123 (A4 page @2x): fit:'cover' crops to fill the whole cover, never stretched.
    fetchSatMap(sampled, 794 * 2, 1123 * 2, '#f59e0b', 'cover'),
    // Small landscape overview map for the "a colpo d'occhio" page: fit:'contain' keeps the
    // whole route visible instead of cropping it.
    fetchSatMap(sampled, 680 * 2, 260 * 2, '#c05a17', 'contain'),
  ])
  return { cover, mini }
}

/** Fetch Wikimedia Commons landscape photos near the route midpoint — url e credito insieme
 *  (B16: prima il credito reale con l'autore veniva scartato qui e GuideSection.tsx mostrava
 *  "© Wikimedia Commons" cablato, senza attribuzione nominale — una violazione di licenza per
 *  foto CC-BY, che la richiedono esplicitamente). */
async function fetchCoverPhotos(hike: PlannedHike): Promise<GuideSectionPhoto[]> {
  try {
    const pts = (hike.trackPoints ?? []).filter(p => p.lat && p.lon)
    const poly = (pts.length > 0 ? pts : hike.routePolyline ?? []) as { lat?: number; lon?: number }[] | [number, number][]
    if (!poly.length) return []
    const midIdx = Math.floor(poly.length / 2)
    const mid = poly[midIdx]
    const [lat, lon] = Array.isArray(mid) ? mid : [mid.lat!, mid.lon!]
    if (!lat || !lon) return []
    const photos = await fetchRoutePhotos(lat, lon, 15000, 6)
    const withDataUrls = await Promise.all(photos.map(async p => {
      const url = await toDataUrlSafe(p.url)
      return url ? { url, credit: p.credit } : null
    }))
    return withDataUrls.filter((p): p is GuideSectionPhoto => !!p)
  } catch {
    return []
  }
}

/** Fetch Wikipedia thumbnails for all wiki POIs */
async function prefetchThumbs(hike: PlannedHike): Promise<Map<number, string>> {
  const wikiEntries = (hike.cachedPoiWiki ?? []) as { poi: PoiItem; wiki: WikiPage }[]
  const thumbs      = new Map<number, string>()
  await Promise.allSettled(
    wikiEntries
      .filter(e => e.wiki.thumbnail)
      .map(async e => {
        const dataUrl = await toDataUrlSafe(e.wiki.thumbnail!)
        if (dataUrl) thumbs.set(e.wiki.pageid, dataUrl)
      }),
  )
  return thumbs
}

/** Legge la cache condivisa per-POI (lib/poiNotes.ts, /api/poi-notes) — quando presente, un
 *  racconto più ricco della sola frase Wikipedia per lo stesso luogo (decisione 1/2, artifact "La
 *  Guida IA"). Best-effort come prefetchThumbs: un fallimento qui lascia semplicemente la mappa
 *  vuota, buildGuideContent ricade sull'estratto Wikipedia di sempre. */
async function prefetchPoiNotes(hike: PlannedHike): Promise<Map<number, string>> {
  const ids = Array.from(new Set(((hike.cachedPois ?? []) as PoiItem[]).map(p => p.id)))
  if (ids.length === 0) return new Map()
  try {
    const res = await fetch(`/api/poi-notes?ids=${ids.join(',')}`, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return new Map()
    const data = await res.json() as Record<string, { text: string }>
    return new Map(Object.entries(data).map(([id, v]) => [Number(id), v.text]))
  } catch {
    return new Map()
  }
}

export async function exportGuidePdfHtml(hike: PlannedHike, guideText: string): Promise<void> {
  const [{ cover, mini }, thumbs, coverPhotos, poiNotes] = await Promise.all([
    buildMapImages(hike),
    prefetchThumbs(hike),
    fetchCoverPhotos(hike),
    prefetchPoiNotes(hike),
  ])

  const data = buildGuideContent(hike, guideText, cover, thumbs, coverPhotos, mini || undefined, poiNotes)

  // Create a hidden off-screen container
  const container = document.createElement('div')
  container.style.cssText = 'position:fixed;left:-9999px;top:0;z-index:-1;'
  document.body.appendChild(container)

  const root = createRoot(container)
  flushSync(() => root.render(
    React.createElement(GuideTemplate, { data, forPrint: true }),
  ))

  // Attesa del caricamento immagini, ora nell'helper condiviso lib/pdfImages.ts: era l'unico dei
  // tre percorsi PDF a farlo, e Diario e Resoconto ne avevano bisogno quanto questo.
  const { waitForImages } = await import('@/lib/pdfImages')
  await waitForImages(container)

  try {
    // lib/pdfPaginate.ts (already used by Diario) instead of html2pdf.js: it measures each
    // top-level page and only ever slices at safe .pdf-block boundaries, which is what avoids
    // the blank-page bug html2pdf's own CSS pagebreak mode has when combined with fixed-height
    // canvas slicing on variable-height content.
    const { paginateToPdf, nextLayout } = await import('@/lib/pdfPaginate')
    const pages = Array.from(container.querySelectorAll<HTMLElement>('.guide-print-page'))
    await nextLayout()
    const blob = await paginateToPdf(pages, '.pdf-block', { diaryTitle: hike.title })

    const filename = `dtrek-guida-${hike.title.replace(/\s+/g, '-').replace(/[^a-z0-9-]/gi, '').slice(0, 40)}.pdf`
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = filename
    a.click(); URL.revokeObjectURL(url)
  } finally {
    root.unmount()
    document.body.removeChild(container)
  }
}
