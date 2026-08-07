// Modalità "carosello": una serie di immagini PNG (copertina + una scheda per foto + eventuale
// scheda dati + chiusura), pensata per il carosello di Instagram o una sequenza di storie.
//
// Il grosso del disegno è preso in prestito dallo Studio Video (lib/videoOverlays.ts,
// lib/videoPhotoCarousel.ts): è già codice puro — nessun DOM, nessun React — pensato per disegnare
// esattamente questo genere di card (polaroid con didascalia, mini-mappa d'insieme, pannelli dati)
// su un canvas 2D. Qui lo stesso codice produce fotogrammi statici invece che i frame di un video.
//
// "Effetti" qui non significa Ken Burns o dissolvenze — sono movimento e non hanno senso su
// un'immagine ferma. Significa invece: cornice polaroid con didascalia, mini-mappa sì/no, pin
// numerati sulla copertina. Se in futuro servisse il movimento (es. un'anteprima animata prima
// dell'esportazione), la curva è già pronta in `stopPhotoZoomAt`.

import type { ActivityMeta } from '@/lib/blobStore'
import type { RoutePhoto } from '@/lib/activityPhotos'
import { formatDuration } from '@/lib/tcxParser'
import { renderRouteMap } from '@/lib/mapSnapshot'
import { ROUTE_START } from '@/lib/designTokens'
import {
  drawMiniMap, drawStopPhotoZoom, drawEndCard, drawNumbersBeat, drawElevationBeat,
  buildMiniRoute, safeInsetsFor, hexToRgb, type StopPhoto,
} from '@/lib/videoOverlays'
import { groupPhotoTimings, buildCumulativeDistances, progressToDistanceM } from '@/lib/videoPhotoCarousel'
import { makeCanvas, drawDarkBg, drawLogo, loadImageEl, loadRemoteImageEl, DARK, FONT, type ShareFormat } from './canvasHelpers'
import { drawActivityMapCard, type ActivityShareOpts } from './activityImage'

export interface CarouselOpts {
  /** Riusa le stesse opzioni della scheda singola (mappa/statistiche) per la copertina. */
  mapOpts: ActivityShareOpts
  /** Foto incluse nel carosello, nell'ordine in cui compariranno. */
  includePhotoIds: string[]
  /** Didascalie personalizzate per questo carosello, per id foto — sovrascrivono quella salvata. */
  captions?: Record<string, string>
  /** Scheda dati (numeri o, se disponibile, profilo altimetrico) prima della chiusura. */
  showDataSlide: boolean
  /** Distanza minima (metri) sotto la quale foto vicine confluiscono nella stessa scheda. */
  groupMinGapM?: number
}

export interface CarouselSlide { url: string; kind: 'cover' | 'photo' | 'data' | 'end' }

const ROUTE_START_RGB = hexToRgb(ROUTE_START)

function drawSlideIndex(ctx: CanvasRenderingContext2D, w: number, h: number, i: number, total: number, sc: number) {
  const text = `${i + 1} / ${total}`
  const pad = 14 * sc
  ctx.save()
  ctx.font = `700 ${Math.round(15 * sc)}px ${FONT}`
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
  const tw = ctx.measureText(text).width
  const bx = pad, by = pad, bw = tw + pad * 1.4, bh = 30 * sc
  ctx.fillStyle = 'rgba(0,0,0,0.4)'
  ctx.beginPath()
  ctx.roundRect ? ctx.roundRect(bx, by, bw, bh, bh / 2) : ctx.rect(bx, by, bw, bh)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.fillText(text, bx + pad * 0.7, by + bh / 2 + 1)
  ctx.restore()
}

/**
 * Genera la sequenza di immagini del carosello. La mappa (la parte costosa, resa via MapLibre) è
 * calcolata UNA sola volta e riusata per la copertina e per la scheda di chiusura — `drawImage` da
 * lì in poi, nessuna seconda istanza di MapLibre.
 */
export async function generateCarousel(
  activity: ActivityMeta,
  photos: RoutePhoto[],
  opts: CarouselOpts,
  fmt: ShareFormat,
): Promise<CarouselSlide[]> {
  const polyline = activity.routePolyline
  const hasPolyline = !!(polyline && polyline.length > 1)
  const [, , w, h] = makeCanvas(fmt)
  const sc = Math.min(w, h) / 1080
  const ins = safeInsetsFor(w, h)

  const selected = opts.includePhotoIds
    .map(id => photos.find(p => p.id === id))
    .filter((p): p is RoutePhoto => !!p)

  // 1. Mappa resa una sola volta — marker di inizio/fine più un pin numerato per ogni foto inclusa
  //    con posizione nota, così la copertina mostra a colpo d'occhio dove sono state scattate.
  let mapImg: HTMLImageElement | null = null
  if (hasPolyline) {
    const photoMarkers = selected
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.lat != null && p.lon != null)
      .map(({ p, i }) => ({ lat: p.lat!, lon: p.lon!, kind: 'photo' as const, label: String(i + 1) }))
    const mapDataUrl = await renderRouteMap({
      polylines: [polyline!], width: w, height: h, pixelRatio: 2,
      markers: [
        { lat: polyline![0][0], lon: polyline![0][1], kind: 'start' },
        { lat: polyline![polyline!.length - 1][0], lon: polyline![polyline!.length - 1][1], kind: 'end' },
        ...photoMarkers,
      ],
    })
    mapImg = await loadImageEl(mapDataUrl)
  }

  const slides: CarouselSlide[] = []

  // 2. Copertina — la stessa scheda "mappa a tutto campo" della condivisione singola.
  {
    const [canvas, ctx] = makeCanvas(fmt)
    if (mapImg) {
      await drawActivityMapCard(ctx, activity, opts.mapOpts, fmt, w, h, mapImg)
    } else {
      drawDarkBg(ctx, w, h)
      ctx.font = `bold 44px ${FONT}`; ctx.fillStyle = DARK.white; ctx.textAlign = 'left'
      ctx.fillText(activity.title ?? 'Escursione', 56, 100)
      drawLogo(ctx, w, h)
    }
    slides.push({ url: canvas.toDataURL('image/png'), kind: 'cover' })
  }

  // 3. Una scheda per gruppo di foto vicine (raggruppate per non spezzettare uno stesso momento in
  //    tante schede identiche — stesso criterio dello Studio Video).
  if (selected.length > 0) {
    const cumDist = hasPolyline ? buildCumulativeDistances(polyline!.map(([lat, lon]) => ({ lat, lon }))) : new Float64Array(0)
    const timings = selected.map(p => ({
      id: p.id, progress: p.progress,
      distanceM: hasPolyline ? progressToDistanceM(p.progress, cumDist) : 0,
    }))
    const groups = hasPolyline
      ? groupPhotoTimings(timings, opts.groupMinGapM ?? 50)
      : timings.map(t => ({ ids: [t.id], progress: t.progress, distanceM: t.distanceM }))

    const miniRoute = hasPolyline ? buildMiniRoute(polyline!.map(([lat, lon]) => ({ lat, lon }))) : []
    const byId = new Map(selected.map(p => [p.id, p]))

    for (const group of groups) {
      const groupPhotos = group.ids.map(id => byId.get(id)).filter((p): p is RoutePhoto => !!p)
      if (groupPhotos.length === 0) continue

      const stopPhotos: StopPhoto[] = await Promise.all(groupPhotos.map(async p => ({
        id: p.id,
        caption: opts.captions?.[p.id] ?? p.caption,
        img: await loadRemoteImageEl(p.url),
      })))

      const [canvas, ctx] = makeCanvas(fmt)
      drawDarkBg(ctx, w, h)
      drawStopPhotoZoom(ctx, w, h, sc, stopPhotos, 1, 0)
      if (miniRoute.length > 1) {
        const size = Math.min(w, h) * 0.22
        drawMiniMap(ctx, ins.left + 16 * sc, ins.top + 16 * sc, size, sc, miniRoute, group.progress, ROUTE_START_RGB)
      }
      drawLogo(ctx, w, h)
      slides.push({ url: canvas.toDataURL('image/png'), kind: 'photo' })
    }
  }

  // 4. Scheda dati opzionale — profilo altimetrico se disponibile, altrimenti i numeri principali.
  if (opts.showDataSlide) {
    const [canvas, ctx] = makeCanvas(fmt)
    drawDarkBg(ctx, w, h)
    const rows = [
      { k: 'Distanza',   v: `${(activity.distanceMeters / 1000).toFixed(1)} km` },
      { k: 'Dislivello', v: `${Math.round(activity.elevationGain)} m` },
      { k: 'Durata',     v: formatDuration(activity.totalTimeSeconds) },
    ]
    const profile = activity.elevationProfile
    if (profile && profile.length > 3) {
      drawElevationBeat(ctx, w, h, sc, profile, rows, 0.85)
    } else {
      drawNumbersBeat(ctx, w, h, sc, rows, 0.85)
    }
    drawLogo(ctx, w, h)
    slides.push({ url: canvas.toDataURL('image/png'), kind: 'data' })
  }

  // 5. Chiusura — riusa la mappa già resa come sfondo, se c'è.
  {
    const [canvas, ctx] = makeCanvas(fmt)
    if (mapImg) ctx.drawImage(mapImg, 0, 0, w, h)
    else drawDarkBg(ctx, w, h)
    drawEndCard(ctx, w, h, sc, {
      title: activity.title ?? 'Escursione',
      km: activity.distanceMeters / 1000,
      elevGain: activity.elevationGain,
    }, 1)
    slides.push({ url: canvas.toDataURL('image/png'), kind: 'end' })
  }

  return withSlideIndex(slides, fmt)
}

/** Ridisegna ogni scheda con il pallino "N / totale" in alto a sinistra — fatto in un secondo
 *  passaggio sul PNG già prodotto invece che dentro ogni ramo sopra, per tenere la numerazione in
 *  un solo posto indipendentemente da quante schede finiscono per esserci. */
async function withSlideIndex(slides: CarouselSlide[], fmt: ShareFormat): Promise<CarouselSlide[]> {
  if (slides.length <= 1) return slides
  const [, , w, h] = makeCanvas(fmt)
  const sc = Math.min(w, h) / 1080
  const out: CarouselSlide[] = []
  for (let i = 0; i < slides.length; i++) {
    const [canvas, ctx] = makeCanvas(fmt)
    const img = await loadImageEl(slides[i].url)
    ctx.drawImage(img, 0, 0, w, h)
    drawSlideIndex(ctx, w, h, i, slides.length, sc)
    out.push({ url: canvas.toDataURL('image/png'), kind: slides[i].kind })
  }
  return out
}
