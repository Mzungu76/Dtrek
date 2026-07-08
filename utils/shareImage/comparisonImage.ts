import type { ActivityMeta } from '@/lib/blobStore'
import { formatDuration } from '@/lib/tcxParser'
import { formatPaceMinkm, COMPARISON_COLORS } from '@/lib/stats'
import { FONT, DARK, makeCanvas, drawDarkBg, rr, drawCard, drawLogo, fitText, type ShareFormat } from './canvasHelpers'

export interface ComparisonShareOpts {
  showDistance:  boolean
  showElevation: boolean
  showDuration:  boolean
  showHR:        boolean
  showCalories:  boolean
  showPace:      boolean
}

// ─── COMPARISON IMAGE ─────────────────────────────────────────────────────────

export async function generateComparisonImage(
  activities: ActivityMeta[],
  opts: ComparisonShareOpts,
  fmt: ShareFormat,
): Promise<string> {
  const [canvas, ctx, w, h] = makeCanvas(fmt)
  drawDarkBg(ctx, w, h)

  const PAD = 48
  let y = PAD + 16
  ctx.font = `bold 34px ${FONT}`; ctx.fillStyle = DARK.white; ctx.textAlign = 'left'
  ctx.fillText('Confronto escursioni', PAD, y + 32)
  y += 60

  const metrics: { label: string; fmt: (a: ActivityMeta) => string; get: (a: ActivityMeta) => number; higher: boolean }[] = []
  if (opts.showDistance)  metrics.push({ label: 'Distanza',   fmt: a => `${(a.distanceMeters/1000).toFixed(1)} km`,  get: a => a.distanceMeters,   higher: true  })
  if (opts.showElevation) metrics.push({ label: 'Dislivello', fmt: a => `${Math.round(a.elevationGain)} m`,           get: a => a.elevationGain,    higher: true  })
  if (opts.showDuration)  metrics.push({ label: 'Durata',     fmt: a => formatDuration(a.totalTimeSeconds),           get: a => a.totalTimeSeconds, higher: true  })
  if (opts.showHR)        metrics.push({ label: 'FC Media',   fmt: a => `${a.avgHeartRate} bpm`,                      get: a => a.avgHeartRate,     higher: false })
  if (opts.showCalories)  metrics.push({ label: 'Calorie',    fmt: a => `${a.calories} kcal`,                         get: a => a.calories,         higher: true  })
  if (opts.showPace)      metrics.push({ label: 'Passo',      fmt: a => formatPaceMinkm(a.distanceMeters, a.totalTimeSeconds) + '/km', get: a => a.distanceMeters / (a.totalTimeSeconds || 1), higher: true })

  const n    = activities.length
  const colW = Math.floor((w - 2 * PAD) / (n + 1))

  activities.forEach((a, i) => {
    const x = PAD + (i + 1) * colW
    drawCard(ctx, x + 2, y, colW - 4, 44, 8)
    ctx.font = `bold 12px ${FONT}`; ctx.fillStyle = COMPARISON_COLORS[i] ?? DARK.accent; ctx.textAlign = 'center'
    ctx.fillText(fitText(ctx, a.title ?? 'Escursione', colW - 16), x + colW / 2, y + 28)
  })
  y += 56

  const rowH = Math.floor(Math.min(52, (h - y - PAD - 10) / (metrics.length || 1)))
  metrics.forEach((m, ri) => {
    const ry = y + ri * (rowH + 4)
    if (ri % 2 === 0) { rr(ctx, PAD, ry, w - 2 * PAD, rowH, 8); ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fill() }
    ctx.font = `13px ${FONT}`; ctx.fillStyle = DARK.muted; ctx.textAlign = 'left'
    ctx.fillText(m.label, PAD + 10, ry + rowH / 2 + 5)
    const vals    = activities.map(a => m.get(a))
    const bestVal = m.higher ? Math.max(...vals) : Math.min(...vals)
    activities.forEach((a, i) => {
      const x     = PAD + (i + 1) * colW
      const isBest = m.get(a) === bestVal
      ctx.font      = `${isBest ? 'bold ' : ''}17px ${FONT}`
      ctx.fillStyle = isBest ? (COMPARISON_COLORS[i] ?? DARK.accent) : DARK.white
      ctx.textAlign = 'center'
      ctx.fillText(m.fmt(a), x + colW / 2, ry + rowH / 2 + 6)
    })
  })

  drawLogo(ctx, w, h)
  return canvas.toDataURL('image/png')
}
