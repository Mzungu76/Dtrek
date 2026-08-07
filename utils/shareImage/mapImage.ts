import type { ActivityMeta } from '@/lib/blobStore'
import { FONT, makeCanvas, drawDarkBg, drawLogo, loadImageEl, DARK, type ShareFormat } from './canvasHelpers'
import { renderRouteMap } from '@/lib/mapSnapshot'
import { ROUTE_COLORS } from '@/lib/designTokens'

export interface MapShareOpts {
  showCount: boolean
}

// ─── MAP IMAGE — all routes on full-bleed map ──────────────────────────────────

export async function generateMapImage(
  activities: ActivityMeta[],
  opts: MapShareOpts,
  fmt: ShareFormat,
): Promise<string> {
  const [canvas, ctx, w, h] = makeCanvas(fmt)

  const polylines = activities
    .filter(a => a.routePolyline && a.routePolyline.length > 1)
    .map(a => a.routePolyline as [number, number][])

  if (polylines.length === 0) {
    drawDarkBg(ctx, w, h)
    ctx.font = `bold 38px ${FONT}`; ctx.fillStyle = DARK.white; ctx.textAlign = 'left'
    ctx.fillText('Le mie escursioni', 56, 56 + 38)
    drawLogo(ctx, w, h)
    return canvas.toDataURL('image/png')
  }

  // Full-bleed map — tutti i percorsi, ognuno con il proprio colore dalla palette DTrek condivisa
  const mapDataUrl = await renderRouteMap({
    polylines, width: w, height: h, pixelRatio: 2, colors: ROUTE_COLORS,
  })
  const mapImg = await loadImageEl(mapDataUrl)
  ctx.drawImage(mapImg, 0, 0, w, h)

  // Top header gradient + text
  const headerH = 140
  const topGrad = ctx.createLinearGradient(0, 0, 0, headerH)
  topGrad.addColorStop(0,   'rgba(0,0,0,0.88)')
  topGrad.addColorStop(0.8, 'rgba(0,0,0,0.25)')
  topGrad.addColorStop(1,   'rgba(0,0,0,0)')
  ctx.fillStyle = topGrad; ctx.fillRect(0, 0, w, headerH)

  const PAD = 48
  ctx.font = `bold 40px ${FONT}`; ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left'
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 8
  ctx.fillText('Le mie escursioni', PAD, PAD + 38)
  if (opts.showCount) {
    ctx.font = `20px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.shadowBlur = 4
    ctx.fillText(
      `${activities.length} percors${activities.length === 1 ? 'o' : 'i'} registrat${activities.length === 1 ? 'o' : 'i'}`,
      PAD, PAD + 72,
    )
  }
  ctx.shadowBlur = 0

  drawLogo(ctx, w, h)
  return canvas.toDataURL('image/png')
}
