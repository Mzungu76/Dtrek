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

/** Re-use the OSM tile stitcher already in utils/pdfExport.ts */
async function buildMapImage(hike: PlannedHike): Promise<string> {
  const pts = (hike.trackPoints ?? [])
    .filter(p => p.lat && p.lon)
    .map(p => [p.lat!, p.lon!] as [number, number])
  const step    = Math.max(1, Math.ceil(pts.length / 300))
  const sampled = pts.length > 1
    ? pts.filter((_, i) => i % step === 0)
    : (hike.routePolyline ?? []) as [number, number][]

  if (sampled.length < 2) return ''

  const { fetchSatMap } = await import('@/utils/pdfExport')
  // 794×630: matches cover CSS (794px wide, 630≈56% of A4 height) at 2× for quality
  return fetchSatMap(sampled, 794 * 2, 630 * 2, '#f59e0b')
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
  const [mapImage, thumbs, coverPhotos] = await Promise.all([
    buildMapImage(hike),
    prefetchThumbs(hike),
    fetchCoverPhotos(hike),
  ])

  const data = buildGuideContent(hike, guideText, mapImage, thumbs, coverPhotos)

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
    const html2pdf = (await import('html2pdf.js')).default

    const filename = `dtrek-guida-${hike.title.replace(/\s+/g, '-').replace(/[^a-z0-9-]/gi, '').slice(0, 40)}.pdf`

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (html2pdf() as any)
      .set({
        margin:      0,
        filename,
        image:       { type: 'jpeg', quality: 0.95 },
        html2canvas: {
          scale:           2,
          useCORS:         true,
          letterRendering: true,
          logging:         false,
        },
        jsPDF: {
          unit:        'px',
          format:      [794, 1123],
          orientation: 'portrait',
        },
        pagebreak: {
          mode:   'css',
          before: '.guide-page',
        },
      })
      .from(container.querySelector('.guide-root') as HTMLElement)
      .save()
  } finally {
    root.unmount()
    document.body.removeChild(container)
  }
}

/** Simple element-ID based export (for preview page usage) */
export async function exportGuidePDF(elementId: string, filename: string): Promise<void> {
  const html2pdf = (await import('html2pdf.js')).default
  const element  = document.getElementById(elementId)
  if (!element) throw new Error('Guide element not found')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (html2pdf() as any)
    .set({
      margin:      0,
      filename:    `${filename}.pdf`,
      image:       { type: 'jpeg', quality: 0.95 },
      html2canvas: {
        scale:    2,
        useCORS:  true,
        logging:  false,
      },
      jsPDF: {
        unit:        'px',
        format:      [794, 1123],
        orientation: 'portrait',
      },
      pagebreak: {
        mode:   'css',
        before: '.guide-page',
      },
    })
    .from(element)
    .save()
}
