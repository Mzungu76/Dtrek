import type { ActivityMeta } from '@/lib/blobStore'
import { computeGlobalStats } from '@/lib/blobStore'
import { getPersonalRecords, computeStreaks, formatPaceMinkm } from '@/lib/stats'
import { FONT, DARK, makeCanvas, isTall, drawDarkBg, drawCard, drawLogo, type ShareFormat } from './canvasHelpers'

export interface StatsShareOpts {
  showTotals:  boolean
  showStreaks: boolean
  showRecords: boolean
}

// ─── STATS IMAGE ──────────────────────────────────────────────────────────────

export async function generateStatsImage(
  activities: ActivityMeta[],
  opts: StatsShareOpts,
  fmt: ShareFormat,
): Promise<string> {
  const [canvas, ctx, w, h] = makeCanvas(fmt)
  drawDarkBg(ctx, w, h)

  const PAD = 56
  let y = PAD + 16
  const stats   = computeGlobalStats(activities)
  const records = getPersonalRecords(activities)
  const streaks = computeStreaks(activities)

  ctx.font = `bold 38px ${FONT}`; ctx.fillStyle = DARK.accent; ctx.textAlign = 'left'
  ctx.fillText('DTrek', PAD, y + 32)
  ctx.font = `22px ${FONT}`; ctx.fillStyle = DARK.muted
  ctx.fillText('Le mie statistiche di trekking', PAD, y + 64)
  y += 96

  if (opts.showTotals) {
    const totals = [
      { label: 'Escursioni',      value: String(stats.totalActivities) },
      { label: 'Distanza totale', value: `${stats.totalDistanceKm.toFixed(0)} km` },
      { label: 'Dislivello D+',   value: `${Math.round(stats.totalElevationGain).toLocaleString('it')} m` },
      { label: 'Calorie totali',  value: `${stats.totalCalories.toLocaleString('it')} kcal` },
    ]
    const cols  = isTall(fmt) ? 2 : 4
    const pillW = Math.floor((w - 2 * PAD - (cols - 1) * 14) / cols)
    const pillH = 80
    totals.forEach((t, i) => {
      const px = PAD + (i % cols) * (pillW + 14)
      const py = y + Math.floor(i / cols) * (pillH + 10)
      drawCard(ctx, px, py, pillW, pillH, 14)
      ctx.font = `11px ${FONT}`; ctx.fillStyle = DARK.muted; ctx.textAlign = 'left'
      ctx.fillText(t.label.toUpperCase(), px + 14, py + 22)
      ctx.font = `bold 32px ${FONT}`; ctx.fillStyle = DARK.white
      ctx.fillText(t.value, px + 14, py + 64)
    })
    y += Math.ceil(totals.length / cols) * (pillH + 10) + 20
  }

  if (opts.showStreaks) {
    const sh = 90
    drawCard(ctx, PAD, y, w - 2 * PAD, sh, 14)
    ctx.font = `bold 11px ${FONT}`; ctx.fillStyle = DARK.muted; ctx.textAlign = 'left'
    ctx.fillText('STREAK', PAD + 16, y + 22)
    const items = [
      { label: 'Streak attuale', value: `${streaks.currentDays} gg` },
      { label: 'Record',         value: `${streaks.longestDays} gg` },
      { label: 'Sett. attive',   value: String(streaks.totalActiveWeeks) },
    ]
    const sw = Math.floor((w - 2 * PAD - 32) / items.length)
    items.forEach((s, i) => {
      const sx = PAD + 16 + i * sw
      ctx.font = `bold 30px ${FONT}`; ctx.fillStyle = DARK.accent; ctx.textAlign = 'left'
      ctx.fillText(s.value, sx, y + 64)
      ctx.font = `11px ${FONT}`; ctx.fillStyle = DARK.muted
      ctx.fillText(s.label, sx, y + 82)
    })
    y += sh + 18
  }

  if (opts.showRecords && isTall(fmt)) {
    const items: { label: string; value: string }[] = []
    if (records.longestKm)   items.push({ label: 'Più lunga',      value: `${(records.longestKm.distanceMeters / 1000).toFixed(1)} km` })
    if (records.highestGain) items.push({ label: 'Più dislivello', value: `${Math.round(records.highestGain.elevationGain)} m D+` })
    if (records.fastestPace) items.push({ label: 'Passo record',   value: formatPaceMinkm(records.fastestPace.distanceMeters, records.fastestPace.totalTimeSeconds) + ' /km' })
    if (records.highestAlt)  items.push({ label: 'Quota massima',  value: `${Math.round(records.highestAlt.altitudeMax)} m` })
    if (items.length > 0) {
      ctx.font = `bold 12px ${FONT}`; ctx.fillStyle = DARK.muted; ctx.textAlign = 'left'
      ctx.fillText('RECORD PERSONALI', PAD, y + 14)
      y += 24
      const rW = Math.floor((w - 2 * PAD - 12) / 2), rH = 70
      items.slice(0, 4).forEach((r, i) => {
        const px = PAD + (i % 2) * (rW + 12), py = y + Math.floor(i / 2) * (rH + 8)
        drawCard(ctx, px, py, rW, rH, 12)
        ctx.font = `10px ${FONT}`; ctx.fillStyle = DARK.muted; ctx.textAlign = 'left'
        ctx.fillText(r.label.toUpperCase(), px + 12, py + 18)
        ctx.font = `bold 26px ${FONT}`; ctx.fillStyle = DARK.accent
        ctx.fillText(r.value, px + 12, py + 54)
      })
    }
  }

  drawLogo(ctx, w, h)
  return canvas.toDataURL('image/png')
}
