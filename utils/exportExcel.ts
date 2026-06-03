import * as XLSX from 'xlsx'
import { StoredActivity } from '@/lib/blobStore'
import { formatDuration, msToKmh } from '@/lib/tcxParser'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'

export function exportActivityToExcel(activity: StoredActivity): void {
  const wb = XLSX.utils.book_new()

  // ── Foglio 1: Riepilogo ───────────────────────────────────────────────────
  const summary = [
    ['DIARIO ESCURSIONI – RIEPILOGO ATTIVITÀ', ''],
    ['', ''],
    ['Campo', 'Valore'],
    ['Titolo', activity.title ?? activity.notes ?? 'Escursione'],
    ['Data', format(new Date(activity.startTime), 'dd MMMM yyyy', { locale: it })],
    ['Ora inizio', format(new Date(activity.startTime), 'HH:mm:ss')],
    ['Ora fine', format(new Date(activity.endTime), 'HH:mm:ss')],
    ['Durata', formatDuration(activity.totalTimeSeconds)],
    ['Distanza (km)', (activity.distanceMeters / 1000).toFixed(2)],
    ['Distanza (m)', activity.distanceMeters.toFixed(0)],
    ['Calorie (kcal)', activity.calories],
    ['Dispositivo', activity.device],
    ['Sport', activity.sport],
    ['Note TCX', activity.notes],
    ['Note personali', activity.userNotes ?? ''],
    ['', ''],
    ['FREQUENZA CARDIACA', ''],
    ['FC Media (bpm)', activity.avgHeartRate],
    ['FC Massima (bpm)', activity.maxHeartRate],
    ['', ''],
    ['VELOCITÀ', ''],
    ['Velocità media (km/h)', msToKmh(activity.avgSpeedMs)],
    ['Velocità massima (km/h)', msToKmh(activity.maxSpeedMs)],
    ['', ''],
    ['ALTIMETRIA', ''],
    ['Quota minima (m)', activity.altitudeMin.toFixed(1)],
    ['Quota massima (m)', activity.altitudeMax.toFixed(1)],
    ['Dislivello positivo (m)', activity.elevationGain.toFixed(1)],
    ['Dislivello negativo (m)', activity.elevationLoss.toFixed(1)],
  ]

  const ws1 = XLSX.utils.aoa_to_sheet(summary)
  ws1['!cols'] = [{ wch: 30 }, { wch: 30 }]
  ws1['A1'] = { v: 'DIARIO ESCURSIONI – RIEPILOGO ATTIVITÀ', t: 's' }
  XLSX.utils.book_append_sheet(wb, ws1, 'Riepilogo')

  // ── Foglio 2: Trackpoints ─────────────────────────────────────────────────
  const tpHeader = [
    'Timestamp', 'Ora (locale)', 'Latitudine', 'Longitudine',
    'Quota (m)', 'FC (bpm)', 'Cadenza', 'Velocità (km/h)'
  ]
  const tpRows = activity.trackPoints.map(tp => [
    tp.time,
    format(new Date(tp.time), 'HH:mm:ss'),
    tp.lat ?? '',
    tp.lon ?? '',
    tp.altitudeMeters ?? '',
    tp.heartRateBpm ?? '',
    tp.cadence ?? '',
    tp.speedMs != null ? msToKmh(tp.speedMs) : '',
  ])

  const ws2 = XLSX.utils.aoa_to_sheet([tpHeader, ...tpRows])
  ws2['!cols'] = [
    { wch: 24 }, { wch: 10 }, { wch: 14 }, { wch: 14 },
    { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 14 }
  ]
  XLSX.utils.book_append_sheet(wb, ws2, 'Trackpoints')

  // ── Foglio 3: Statistiche per minuto ───────────────────────────────────────
  const minuteMap = new Map<string, { hrs: number[], spds: number[], alts: number[] }>()
  activity.trackPoints.forEach(tp => {
    const minute = tp.time.slice(0, 16)
    if (!minuteMap.has(minute)) minuteMap.set(minute, { hrs: [], spds: [], alts: [] })
    const entry = minuteMap.get(minute)!
    if (tp.heartRateBpm) entry.hrs.push(tp.heartRateBpm)
    if (tp.speedMs != null) entry.spds.push(tp.speedMs)
    if (tp.altitudeMeters != null) entry.alts.push(tp.altitudeMeters)
  })

  const minuteHeader = ['Minuto', 'FC media (bpm)', 'FC max (bpm)', 'Vel. media (km/h)', 'Quota media (m)']
  const minuteRows = Array.from(minuteMap.entries()).map(([min, data]) => {
    const avgHr = data.hrs.length ? Math.round(data.hrs.reduce((a, b) => a + b) / data.hrs.length) : ''
    const maxHr = data.hrs.length ? Math.max(...data.hrs) : ''
    const avgSpd = data.spds.length ? msToKmh(data.spds.reduce((a, b) => a + b) / data.spds.length) : ''
    const avgAlt = data.alts.length ? (data.alts.reduce((a, b) => a + b) / data.alts.length).toFixed(1) : ''
    return [min, avgHr, maxHr, avgSpd, avgAlt]
  })

  const ws3 = XLSX.utils.aoa_to_sheet([minuteHeader, ...minuteRows])
  ws3['!cols'] = [{ wch: 18 }, { wch: 14 }, { wch: 12 }, { wch: 18 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, ws3, 'Per minuto')

  // Salva
  const fileName = `escursione_${format(new Date(activity.startTime), 'yyyyMMdd_HHmm')}.xlsx`
  XLSX.writeFile(wb, fileName)
}

export function exportAllActivitiesToExcel(activities: StoredActivity[]): void {
  const wb = XLSX.utils.book_new()

  const header = [
    'Titolo', 'Data', 'Ora inizio', 'Durata', 'Distanza (km)',
    'Calorie', 'FC Media', 'FC Max', 'Vel. media (km/h)',
    'Vel. max (km/h)', 'Quota min (m)', 'Quota max (m)',
    'Dislivello + (m)', 'Dislivello - (m)', 'Dispositivo'
  ]

  const rows = activities.map(a => [
    a.title ?? a.notes ?? 'Escursione',
    format(new Date(a.startTime), 'dd/MM/yyyy'),
    format(new Date(a.startTime), 'HH:mm'),
    formatDuration(a.totalTimeSeconds),
    (a.distanceMeters / 1000).toFixed(2),
    a.calories,
    a.avgHeartRate,
    a.maxHeartRate,
    msToKmh(a.avgSpeedMs),
    msToKmh(a.maxSpeedMs),
    a.altitudeMin.toFixed(1),
    a.altitudeMax.toFixed(1),
    a.elevationGain.toFixed(1),
    a.elevationLoss.toFixed(1),
    a.device,
  ])

  const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
  ws['!cols'] = header.map(() => ({ wch: 18 }))
  XLSX.utils.book_append_sheet(wb, ws, 'Tutte le escursioni')
  XLSX.writeFile(wb, `diario_trekking_completo.xlsx`)
}
