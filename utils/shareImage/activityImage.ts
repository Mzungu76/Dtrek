import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import type { ActivityMeta } from '@/lib/blobStore'
import { formatDuration } from '@/lib/tcxParser'
import { FONT, DARK, makeCanvas, isTall, drawDarkBg, rr, drawCard, drawLogo, drawElevationProfile, fitText, drawRouteAbstract, type ShareFormat } from './canvasHelpers'
import { drawTiledMap, drawRouteOnTiles } from './tileHelpers'

export interface ActivityShareOpts {
  showMap:       boolean   // real OSM/CartoDB tiles
  showRoute:     boolean   // abstract route (when showMap=false)
  showDistance:  boolean
  showElevation: boolean
  showDuration:  boolean
  showHR:        boolean
  showCalories:  boolean
  showDate:      boolean
  showProfile:   boolean   // elevation profile band
}

// ─── ACTIVITY IMAGE — full-bleed map layout ────────────────────────────────────
//
//  ┌──────────────────────────────────┐
//  │  [gradient top]                  │ ← title + date on dark gradient
//  │  Titolo escursione               │
//  │  23 maggio 2026                  │
//  │                                  │
//  │   ██ route on map tiles ██       │  ← tiles fill entire canvas
//  │                                  │
//  │  [gradient bottom]               │ ← stats on dark gradient
//  │  8.7 km   343 m   2h34m   117bpm │
//  └──────────────────────────────────┘

export async function generateActivityImage(
  activity: ActivityMeta,
  opts: ActivityShareOpts,
  fmt: ShareFormat,
): Promise<string> {
  const [canvas, ctx, w, h] = makeCanvas(fmt)

  const hasPolyline = !!(activity.routePolyline && activity.routePolyline.length > 1)
  const useMap      = opts.showMap && hasPolyline
  const useAbstract = !useMap && opts.showRoute && hasPolyline

  const profile        = activity.elevationProfile
  const showProfileBand = opts.showProfile && !!(profile && profile.length > 3)

  // ── Full-bleed map ────────────────────────────────────────────────────────
  if (useMap) {
    const topH = fmt === '9:16' ? 300 : fmt === '1:1' ? 210 : 175    // gradient header height
    const botH = showProfileBand
      ? (fmt === '9:16' ? 460 : fmt === '1:1' ? 330 : 250)
      : (fmt === '9:16' ? 300 : fmt === '1:1' ? 190 : 160)

    // 1. Map tiles fill the whole canvas
    const tileCtx = await drawTiledMap(
      ctx, [activity.routePolyline!],
      0, 0, w, h,
      { radius: 0, style: 'voyager', fillCanvas: true },
    )

    // 2. Route
    drawRouteOnTiles(ctx, activity.routePolyline!, tileCtx.pixelOf, '#3b82f6', 5)

    // 3. Top gradient — stronger to ensure white text reads over Voyager's light tiles
    const topGrad = ctx.createLinearGradient(0, 0, 0, topH)
    topGrad.addColorStop(0,   'rgba(0,0,0,0.88)')
    topGrad.addColorStop(0.65,'rgba(0,0,0,0.45)')
    topGrad.addColorStop(1,   'rgba(0,0,0,0)')
    ctx.fillStyle = topGrad; ctx.fillRect(0, 0, w, topH)

    // 4. Bottom gradient — stronger for the same reason
    const botGrad = ctx.createLinearGradient(0, h - botH, 0, h)
    botGrad.addColorStop(0,   'rgba(0,0,0,0)')
    botGrad.addColorStop(0.35,'rgba(0,0,0,0.60)')
    botGrad.addColorStop(1,   'rgba(0,0,0,0.92)')
    ctx.fillStyle = botGrad; ctx.fillRect(0, h - botH, w, botH)

    // 5. Title
    const PAD  = isTall(fmt) ? 56 : 44
    const titleSz = fmt === '9:16' ? 74 : fmt === '1:1' ? 62 : 48
    const badgeScale = fmt === '9:16' ? 1.2 : fmt === '1:1' ? 1.0 : 0.8
    const titleMaxW  = w - 2 * PAD
    ctx.font = `bold ${titleSz}px ${FONT}`
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'left'
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 8
    ctx.fillText(fitText(ctx, activity.title ?? 'Escursione', titleMaxW), PAD, PAD + titleSz * 0.82)
    ctx.shadowBlur = 0

    if (opts.showDate) {
      const dateSz = fmt === '9:16' ? 30 : fmt === '1:1' ? 26 : 22
      ctx.font = `${dateSz}px ${FONT}`
      ctx.fillStyle = 'rgba(255,255,255,0.75)'
      ctx.fillText(
        format(new Date(activity.startTime), 'd MMMM yyyy', { locale: it }),
        PAD, PAD + titleSz * 0.82 + dateSz + 10,
      )
    }

    // 6. Stats row at bottom
    const pillData: { label: string; value: string }[] = []
    if (opts.showDistance)  pillData.push({ label: 'Distanza',   value: `${(activity.distanceMeters / 1000).toFixed(1)} km` })
    if (opts.showElevation) pillData.push({ label: 'Dislivello', value: `${Math.round(activity.elevationGain)} m` })
    if (opts.showDuration)  pillData.push({ label: 'Durata',     value: formatDuration(activity.totalTimeSeconds) })
    if (opts.showHR)        pillData.push({ label: 'FC Media',   value: `${activity.avgHeartRate} bpm` })
    if (opts.showCalories)  pillData.push({ label: 'Calorie',    value: `${activity.calories} kcal` })

    const valY    = h - (fmt === '9:16' ? 110 : fmt === '1:1' ? 52 : 44)
    const valSz   = fmt === '9:16' ? 42 : fmt === '1:1' ? 34 : 28

    // 6a. Elevation profile band — sits just above the stats row
    if (showProfileBand) {
      const profH = fmt === '9:16' ? 165 : fmt === '1:1' ? 115 : 82
      const profBottom = valY - valSz - (fmt === '16:9' ? 14 : 22)
      const profTop    = profBottom - profH
      ctx.save()
      ctx.font = `bold ${fmt === '16:9' ? 11 : 13}px ${FONT}`
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.textAlign = 'left'
      ctx.fillText('ALTIMETRIA', PAD, profTop - 8)
      ctx.restore()
      drawElevationProfile(ctx, profile!, PAD, profTop, w - 2 * PAD, profH, fmt === '16:9' ? 0.85 : 1)
    }

    if (pillData.length > 0) {
      const colW    = Math.floor((w - 2 * PAD) / pillData.length)
      const lblY    = valY + (fmt === '9:16' ? 32 : fmt === '1:1' ? 28 : 24)
      const lblSz   = fmt === '9:16' ? 15 : fmt === '1:1' ? 13 : 11

      pillData.forEach((p, i) => {
        const cx = PAD + i * colW + colW / 2
        ctx.textAlign = 'center'
        ctx.font = `bold ${valSz}px ${FONT}`
        ctx.fillStyle = '#ffffff'
        ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 4
        ctx.fillText(p.value, cx, valY)
        ctx.shadowBlur = 0
        ctx.font = `${lblSz}px ${FONT}`
        ctx.fillStyle = 'rgba(255,255,255,0.6)'
        ctx.fillText(p.label.toUpperCase(), cx, lblY)
      })
    }

    drawLogo(ctx, w, h)
    return canvas.toDataURL('image/png')
  }

  // ── Dark background (abstract route or no route) ─────────────────────────
  drawDarkBg(ctx, w, h)

  const PAD = isTall(fmt) ? 56 : 50
  const pillData: { label: string; value: string }[] = []
  if (opts.showDistance)  pillData.push({ label: 'Distanza',   value: `${(activity.distanceMeters / 1000).toFixed(1)} km` })
  if (opts.showElevation) pillData.push({ label: 'Dislivello', value: `${Math.round(activity.elevationGain)} m` })
  if (opts.showDuration)  pillData.push({ label: 'Durata',     value: formatDuration(activity.totalTimeSeconds) })
  if (opts.showHR)        pillData.push({ label: 'FC Media',   value: `${activity.avgHeartRate} bpm` })
  if (opts.showCalories)  pillData.push({ label: 'Calorie',    value: `${activity.calories} kcal` })

  const dBadgeScale = 0.95
  let y = PAD + 44
  ctx.font = `bold 50px ${FONT}`; ctx.fillStyle = DARK.white; ctx.textAlign = 'left'
  ctx.fillText(fitText(ctx, activity.title ?? 'Escursione', w - 2 * PAD), PAD, y)
  y += 14
  if (opts.showDate) {
    ctx.font = `22px ${FONT}`; ctx.fillStyle = DARK.muted
    ctx.fillText(format(new Date(activity.startTime), 'd MMMM yyyy', { locale: it }), PAD, y + 30)
    y += 60
  } else { y += 20 }

  if (useAbstract) {
    const pillsH = pillData.length > 0 ? 78 : 0
    const profH  = showProfileBand ? 150 : 0
    const routeH = Math.min(440, h - y - PAD - pillsH - profH - 48)
    if (routeH > 80) {
      const ry = y + 12
      rr(ctx, PAD, ry, w - 2 * PAD, routeH, 20)
      ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fill()
      drawRouteAbstract(ctx, activity.routePolyline!, PAD + 12, ry + 12, w - 2 * PAD - 24, routeH - 24)
      y = ry + routeH + 24
    }
  }

  if (showProfileBand) {
    const profH = 150
    const ry = y + 8
    rr(ctx, PAD, ry, w - 2 * PAD, profH, 16)
    ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fill()
    ctx.font = `bold 12px ${FONT}`; ctx.fillStyle = DARK.muted; ctx.textAlign = 'left'
    ctx.fillText('ALTIMETRIA', PAD + 14, ry + 24)
    drawElevationProfile(ctx, profile!, PAD + 14, ry + 34, w - 2 * PAD - 28, profH - 48)
    y = ry + profH + 20
  }

  if (pillData.length > 0) {
    const pillW = Math.floor((w - 2 * PAD - (pillData.length - 1) * 10) / pillData.length)
    const pillH = 68
    pillData.forEach((p, i) => {
      const px = PAD + i * (pillW + 10)
      drawCard(ctx, px, y, pillW, pillH, 12)
      ctx.font = `10px ${FONT}`; ctx.fillStyle = DARK.muted; ctx.textAlign = 'left'
      ctx.fillText(p.label.toUpperCase(), px + 12, y + 18)
      ctx.font = `bold 20px ${FONT}`; ctx.fillStyle = DARK.accent
      ctx.fillText(p.value, px + 12, y + pillH - 12)
    })
  }

  drawLogo(ctx, w, h)
  return canvas.toDataURL('image/png')
}
