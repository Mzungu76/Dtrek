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
  const pts = (hike.trackPoints ?? [])
    .filter(p => p.lat && p.lon)
    .map(p => [p.lat!, p.lon!] as [number, number])
  const step    = Math.max(1, Math.ceil(pts.length / 300))
  const sampled = pts.length > 1
    ? pts.filter((_, i) => i % step === 0)
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

/** Fetch Wikimedia Commons landscape photos near the route midpoint */
async function fetchCoverPhotos(hike: PlannedHike): Promise<string[]> {
  try {
    const pts = (hike.trackPoints ?? []).filter(p => p.lat && p.lon)
    const poly = (pts.length > 0 ? pts : hike.routePolyline ?? []) as { lat?: number; lon?: number }[] | [number, number][]
    if (!poly.length) return []
    const midIdx = Math.floor(poly.length / 2)
    const mid = poly[midIdx]
    const [lat, lon] = Array.isArray(mid) ? mid : [mid.lat!, mid.lon!]
    if (!lat || !lon) return []
    const photos  = await fetchRoutePhotos(lat, lon, 15000, 6)
    const dataUrls = await Promise.all(photos.map(p => toDataUrlSafe(p.url)))
    return dataUrls.filter((u): u is string => !!u)
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

export async function exportGuidePdfHtml(hike: PlannedHike, guideText: string): Promise<void> {
  const [{ cover, mini }, thumbs, coverPhotos] = await Promise.all([
    buildMapImages(hike),
    prefetchThumbs(hike),
    fetchCoverPhotos(hike),
  ])

  const data = buildGuideContent(hike, guideText, cover, thumbs, coverPhotos, mini || undefined)

  // Create a hidden off-screen container
  const container = document.createElement('div')
  container.style.cssText = 'position:fixed;left:-9999px;top:0;z-index:-1;'
  document.body.appendChild(container)

  const root = createRoot(container)
  flushSync(() => root.render(
    React.createElement(GuideTemplate, { data, forPrint: true }),
  ))

  // Safety net: wait for any <img> that isn't a data URL to finish loading
  const imgs = Array.from(container.querySelectorAll<HTMLImageElement>('img'))
  await Promise.all(imgs.map(img =>
    new Promise<void>(resolve => {
      if (img.complete) { resolve(); return }
      img.onload  = () => resolve()
      img.onerror = () => resolve()
    }),
  ))

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
