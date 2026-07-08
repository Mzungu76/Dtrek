import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { computeGlobalStats, type ActivityMeta } from '@/lib/blobStore'
import { formatDuration } from '@/lib/tcxParser'
import { getPersonalRecords, computeStreaks } from '@/lib/stats'
import { chartBar } from './canvasCharts'
import { safeText, txt, sectionBar, statBox, footer, FOREST, STONE, STONE50, WHITE } from './docHelpers'

// ── Statistics PDF ─────────────────────────────────────────────────────────────
export async function exportStatsPdf(activities: ActivityMeta[]): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const M = 14, W = 182
  let y = 0

  const stats   = computeGlobalStats(activities)
  const records = getPersonalRecords(activities)
  const streaks = computeStreaks(activities)

  // Header
  doc.setFillColor(22, 78, 50); doc.rect(0, 0, 210, 32, 'F')
  txt(doc, 'DTrek', M, 9, { size: 12, bold: true, color: WHITE })
  txt(doc, 'Statistiche & Record Personali', M, 14, { size: 7.5, color: [180, 240, 180] as [number,number,number] })
  txt(doc, `${activities.length} escursioni · aggiornato ${format(new Date(),'dd/MM/yyyy')}`, M, 27, { size: 8, color: [180, 240, 180] as [number,number,number] })
  y = 35

  // Totals grid
  y = sectionBar(doc, 'Totali Generali', M, y, W, FOREST)
  const totals = [
    { label: 'Escursioni',   value: String(stats.totalActivities) },
    { label: 'Km totali',    value: `${stats.totalDistanceKm.toFixed(1)} km` },
    { label: 'Dislivello',   value: `${(stats.totalElevationGain/1000).toFixed(1)} km su` },
    { label: 'Ore totali',   value: `${(stats.totalTimeSeconds/3600).toFixed(0)} h` },
    { label: 'Calorie',      value: `${Math.round(stats.totalCalories/1000)} kcal x1000` },
    { label: 'FC media',     value: `${stats.avgHeartRate} bpm` },
    { label: 'Max distanza', value: `${stats.longestKm.toFixed(1)} km` },
    { label: 'Max quota',    value: `${stats.highestAlt.toFixed(0)} m` },
  ]
  const bw2 = (W - 3*2) / 4, bh2 = 15
  totals.forEach((s, i) => statBox(doc, s.label, s.value, undefined, M+(i%4)*(bw2+2), y+Math.floor(i/4)*(bh2+2), bw2, bh2))
  y += 2*(bh2+2) + 4

  // Streaks
  y = sectionBar(doc, 'Serie & Consistenza', M, y, W, FOREST)
  const stData = [
    { label: 'Serie corrente', value: `${streaks.currentDays} giorni` },
    { label: 'Serie record',   value: `${streaks.longestDays} giorni` },
    { label: 'Sett. corrente', value: `${streaks.currentWeeks} sett.` },
    { label: 'Sett. record',   value: `${streaks.longestWeeks} sett.` },
    { label: 'Giorni attivi',  value: String(streaks.totalActiveDays) },
    { label: 'Sett. attive',   value: String(streaks.totalActiveWeeks) },
  ]
  const bw3 = (W - 5*2) / 6
  stData.forEach((s, i) => statBox(doc, s.label, s.value, undefined, M + i*(bw3+2), y, bw3, 14))
  y += 14 + 5

  // Personal records table
  y = sectionBar(doc, 'Record Personali', M, y, W, FOREST)
  const recRows = [
    ['Distanza maggiore',  records.longestKm,       (a: ActivityMeta) => `${(a.distanceMeters/1000).toFixed(2)} km`],
    ['Dislivello maggiore',records.highestGain,      (a: ActivityMeta) => `${a.elevationGain.toFixed(0)} m D+`],
    ['Quota massima',      records.highestAlt,       (a: ActivityMeta) => `${a.altitudeMax.toFixed(0)} m slm`],
    ['Durata maggiore',    records.longestDuration,  (a: ActivityMeta) => formatDuration(a.totalTimeSeconds)],
    ['Piu calorie',        records.mostCalories,     (a: ActivityMeta) => `${a.calories} kcal`],
    ['FC piu alta',        records.highestHR,        (a: ActivityMeta) => `${a.maxHeartRate} bpm`],
  ] as [string, ActivityMeta|null, (a: ActivityMeta) => string][]

  doc.setFillColor(220, 252, 231); doc.rect(M, y, W, 6, 'F')
  txt(doc, 'Categoria',  M+2,   y+4.2, { size: 7.5, bold: true, color: FOREST })
  txt(doc, 'Valore',     M+65,  y+4.2, { size: 7.5, bold: true, color: FOREST })
  txt(doc, 'Escursione', M+100, y+4.2, { size: 7.5, bold: true, color: FOREST })
  txt(doc, 'Data',       M+160, y+4.2, { size: 7.5, bold: true, color: FOREST })
  y += 6
  recRows.forEach(([label, act, valFn], i) => {
    if (!act) return
    if (i%2===0) { doc.setFillColor(...STONE50); doc.rect(M, y, W, 5.5, 'F') }
    txt(doc, label, M+2, y+4, { size: 8 })
    txt(doc, valFn(act), M+65, y+4, { size: 8, bold: true })
    txt(doc, safeText((act.title ?? 'Escursione').slice(0, 30)), M+100, y+4, { size: 8 })
    txt(doc, format(new Date(act.startTime), 'dd/MM/yyyy'), M+160, y+4, { size: 8, color: STONE })
    y += 5.5
  })
  y += 5

  // Monthly bar chart
  if (y + 50 > 270) { doc.addPage(); y = 14 }
  y = sectionBar(doc, 'Attivita Mensili (ultimi 12 mesi)', M, y, W, FOREST)
  const now = new Date()
  const monthlyBars = Array.from({length: 12}, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1)
    const key = format(d, 'yyyy-MM')
    const label = format(d, 'MMM', { locale: it })
    const count = activities.filter(a => a.startTime.startsWith(key)).length
    return { label, value: count }
  })
  const bImg = chartBar(monthlyBars, 540, 160, '#16a34a')
  if (bImg) { doc.addImage(bImg, 'PNG', M, y, W, 38); y += 41 }

  // Year bar chart
  if (y + 45 > 270) { doc.addPage(); y = 14 }
  y = sectionBar(doc, 'Anno per Anno', M, y, W, FOREST)
  const yearMap = new Map<number, number>()
  activities.forEach(a => {
    const yr = new Date(a.startTime).getFullYear()
    yearMap.set(yr, (yearMap.get(yr) ?? 0) + 1)
  })
  const yearBars = Array.from(yearMap.entries()).sort((a,b) => a[0]-b[0]).map(([yr, cnt]) => ({ label: String(yr), value: cnt }))
  const yImg = chartBar(yearBars, 540, 160, '#0369a1')
  if (yImg) { doc.addImage(yImg, 'PNG', M, y, W, 38); y += 41 }

  // Top 10 table
  if (y + 40 > 270) { doc.addPage(); y = 14 }
  y = sectionBar(doc, 'Top 10 per Distanza', M, y, W, FOREST)
  const top10 = [...activities].sort((a,b) => b.distanceMeters - a.distanceMeters).slice(0, 10)
  doc.setFillColor(220, 252, 231); doc.rect(M, y, W, 5.5, 'F')
  const cols2 = [
    { h: 'N.',     x: M,     w: 9  },
    { h: 'Data',   x: M+10,  w: 24 },
    { h: 'Titolo', x: M+35,  w: 90 },
    { h: 'Km',     x: M+127, w: 18 },
    { h: 'D+',     x: M+147, w: 22 },
    { h: 'Quota',  x: M+172, w: 24 },
  ]
  cols2.forEach(col => txt(doc, col.h, col.x+1, y+4, { size: 7.5, bold: true, color: FOREST }))
  y += 5.5
  top10.forEach((a, i) => {
    if (y > 280) { doc.addPage(); y = 14 }
    if (i%2===0) { doc.setFillColor(...STONE50); doc.rect(M, y, W, 5.5, 'F') }
    const cells = [
      String(i+1),
      format(new Date(a.startTime), 'dd/MM/yy'),
      safeText(a.title ?? 'Escursione').slice(0, 38),
      `${(a.distanceMeters/1000).toFixed(1)} km`,
      `${a.elevationGain.toFixed(0)} m`,
      `${a.altitudeMax.toFixed(0)} m`,
    ]
    cols2.forEach((col, ci) => txt(doc, cells[ci], col.x+1, y+4, { size: 7.5 }))
    y += 5.5
  })

  footer(doc, `Statistiche DTrek · ${activities.length} escursioni · generato il ${format(new Date(),'dd/MM/yyyy HH:mm')}`)
  doc.save(`dtrek-statistiche-${format(new Date(),'yyyyMMdd')}.pdf`)
}
