'use client'
import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  BarChart, Bar, LineChart, Line, ComposedChart, ScatterChart, Scatter, ZAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import type { ActivityMeta } from '@/lib/blobStore'
import { computeSeasonalStats, movingAverage, linearRegression } from '@/lib/stats'
import { computeTrainingLoad, activityStress } from '@/lib/trainingLoad'
import { computeEFTrend, computeIEVTrend, computeCalorieEfficiency } from '@/lib/bioMetrics'
import ActivityHeatmap from '@/components/stats/ActivityHeatmap'

// Stile condiviso da ogni grafico di Bacheca: pensato per stare in sovraimpressione su una foto
// scurita (pannello bg-black/30 backdrop-blur-md), non su una card bianca come in /statistiche —
// colori delle linee/barre schiariti, testo/griglia chiari, tooltip scuro.
export const CHART_TICK = { fontSize: 10, fill: 'rgba(255,255,255,0.7)' }
export const CHART_GRID = 'rgba(255,255,255,0.15)'
const tt = {
  contentStyle: { background: 'rgba(15,15,15,0.88)', border: 'none', borderRadius: 8, fontSize: 12 },
  labelStyle: { color: '#fff' },
  itemStyle: { color: '#fff' },
}

// ── Attività annuale (heatmap) ──────────────────────────────────────────────
export function HeatmapPanel({ activities }: { activities: ActivityMeta[] }) {
  const [year, setYear] = useState(new Date().getFullYear())
  const years = useMemo(() => {
    if (!activities.length) return [new Date().getFullYear()]
    const ys = Array.from(new Set(activities.map(a => new Date(a.startTime).getFullYear()))).sort()
    if (!ys.includes(new Date().getFullYear())) ys.push(new Date().getFullYear())
    return ys
  }, [activities])
  return (
    <div>
      {years.length > 1 && (
        <div className="flex gap-1 mb-2 justify-end">
          {years.map(y => (
            <button key={y} onClick={() => setYear(y)}
              className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${y === year ? 'bg-white text-stone-800' : 'bg-white/20 text-white/70'}`}>
              {y}
            </button>
          ))}
        </div>
      )}
      <div className="bg-white/95 rounded-xl p-2.5 overflow-x-auto">
        <ActivityHeatmap activities={activities} year={year} />
      </div>
    </div>
  )
}

// ── Confronto annuale ────────────────────────────────────────────────────────
export function AnnualBarChart({ activities }: { activities: ActivityMeta[] }) {
  const data = useMemo(() => {
    const map = new Map<number, { year: number; km: number; gain: number }>()
    for (const a of activities) {
      const y = new Date(a.startTime).getFullYear()
      const ex = map.get(y) ?? { year: y, km: 0, gain: 0 }
      ex.km += a.distanceMeters / 1000; ex.gain += a.elevationGain
      map.set(y, ex)
    }
    return Array.from(map.values()).sort((a, b) => a.year - b.year)
      .map(d => ({ year: String(d.year), km: Math.round(d.km), gain: Math.round(d.gain) }))
  }, [activities])
  return (
    <ResponsiveContainer width="100%" height={170}>
      <BarChart data={data}>
        <CartesianGrid vertical={false} stroke={CHART_GRID} />
        <XAxis dataKey="year" tick={CHART_TICK} />
        <YAxis yAxisId="km" hide /><YAxis yAxisId="gain" hide orientation="right" />
        <Tooltip {...tt} formatter={(v: number, name: string) => [name === 'km' ? `${v} km` : `${v} m`, name === 'km' ? 'Distanza' : 'Dislivello']} />
        <Bar yAxisId="km" dataKey="km" fill="#8cc894" radius={[4, 4, 0, 0]} />
        <Bar yAxisId="gain" dataKey="gain" fill="#e9ab64" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Distanza e dislivello mensili (ultimi 12 mesi) ──────────────────────────
export function MonthlyBarChart({ activities }: { activities: ActivityMeta[] }) {
  const data = useMemo(() =>
    activities.reduce((acc, a) => {
      const month = format(new Date(a.startTime), 'MMM yy', { locale: it })
      const ex = acc.find(d => d.month === month)
      if (ex) { ex.km += a.distanceMeters / 1000; ex.gain += a.elevationGain }
      else acc.push({ month, km: a.distanceMeters / 1000, gain: a.elevationGain })
      return acc
    }, [] as { month: string; km: number; gain: number }[])
      .map(d => ({ ...d, km: Math.round(d.km * 10) / 10, gain: Math.round(d.gain) }))
      .slice(-12)
  , [activities])
  return (
    <ResponsiveContainer width="100%" height={170}>
      <BarChart data={data}>
        <CartesianGrid vertical={false} stroke={CHART_GRID} />
        <XAxis dataKey="month" tick={CHART_TICK} interval={1} />
        <YAxis yAxisId="km" hide /><YAxis yAxisId="gain" hide orientation="right" />
        <Tooltip {...tt} formatter={(v: number, name: string) => [name === 'km' ? `${v} km` : `${v} m`, name === 'km' ? 'Distanza' : 'Dislivello']} />
        <Bar yAxisId="km" dataKey="km" fill="#8cc894" radius={[4, 4, 0, 0]} />
        <Bar yAxisId="gain" dataKey="gain" fill="#e9ab64" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Analisi stagionale ──────────────────────────────────────────────────────
export function SeasonalBarChart({ activities }: { activities: ActivityMeta[] }) {
  const data = useMemo(() =>
    computeSeasonalStats(activities).map(s => ({ name: s.label, km: s.avgKm, gain: s.avgGain }))
  , [activities])
  return (
    <ResponsiveContainer width="100%" height={170}>
      <BarChart data={data}>
        <CartesianGrid vertical={false} stroke={CHART_GRID} />
        <XAxis dataKey="name" tick={CHART_TICK} />
        <YAxis yAxisId="km" hide /><YAxis yAxisId="gain" hide orientation="right" />
        <Tooltip {...tt} formatter={(v: number, name: string) => [name === 'km' ? `${v} km` : `${v} m`, name === 'km' ? 'Km medi' : 'D+ medio']} />
        <Bar yAxisId="km" dataKey="km" fill="#8cc894" radius={[4, 4, 0, 0]} />
        <Bar yAxisId="gain" dataKey="gain" fill="#e9ab64" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Distribuzione per giorno della settimana ────────────────────────────────
export function WeekdayBarChart({ activities }: { activities: ActivityMeta[] }) {
  const data = useMemo(() => {
    const labels = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']
    const counts = [0, 0, 0, 0, 0, 0, 0]
    for (const a of activities) { const dow = new Date(a.startTime).getDay(); counts[dow === 0 ? 6 : dow - 1]++ }
    return labels.map((day, i) => ({ day, count: counts[i] }))
  }, [activities])
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data}>
        <CartesianGrid vertical={false} stroke={CHART_GRID} />
        <XAxis dataKey="day" tick={{ ...CHART_TICK, fontWeight: 600 }} />
        <YAxis hide allowDecimals={false} />
        <Tooltip {...tt} formatter={(v: number) => [v, 'Escursioni']} />
        <Bar dataKey="count" fill="#8cc894" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Distribuzione per lunghezza ──────────────────────────────────────────────
export function DistanceHistogramChart({ activities }: { activities: ActivityMeta[] }) {
  const data = useMemo(() => [
    { label: '0–5',   count: activities.filter(a => a.distanceMeters < 5000).length },
    { label: '5–10',  count: activities.filter(a => a.distanceMeters >= 5000  && a.distanceMeters < 10000).length },
    { label: '10–15', count: activities.filter(a => a.distanceMeters >= 10000 && a.distanceMeters < 15000).length },
    { label: '15–20', count: activities.filter(a => a.distanceMeters >= 15000 && a.distanceMeters < 20000).length },
    { label: '20+',   count: activities.filter(a => a.distanceMeters >= 20000).length },
  ], [activities])
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data}>
        <CartesianGrid vertical={false} stroke={CHART_GRID} />
        <XAxis dataKey="label" tick={CHART_TICK} unit=" km" />
        <YAxis hide allowDecimals={false} />
        <Tooltip {...tt} formatter={(v: number) => [v, 'Escursioni']} />
        <Bar dataKey="count" fill="#e9ab64" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Distribuzione per quota massima ─────────────────────────────────────────
export function altitudeBands(activities: ActivityMeta[]) {
  return [
    { label: '0–500m',    count: activities.filter(a => (a.altitudeMax ?? 0) < 500).length },
    { label: '500–1000m', count: activities.filter(a => (a.altitudeMax ?? 0) >= 500  && (a.altitudeMax ?? 0) < 1000).length },
    { label: '1000–1500m', count: activities.filter(a => (a.altitudeMax ?? 0) >= 1000 && (a.altitudeMax ?? 0) < 1500).length },
    { label: '1500–2000m', count: activities.filter(a => (a.altitudeMax ?? 0) >= 1500 && (a.altitudeMax ?? 0) < 2000).length },
    { label: '2000–2500m', count: activities.filter(a => (a.altitudeMax ?? 0) >= 2000 && (a.altitudeMax ?? 0) < 2500).length },
    { label: '2500–3000m', count: activities.filter(a => (a.altitudeMax ?? 0) >= 2500 && (a.altitudeMax ?? 0) < 3000).length },
    { label: '3000m+',    count: activities.filter(a => (a.altitudeMax ?? 0) >= 3000).length },
  ].filter(b => b.count > 0)
}
export function AltitudeBarChart({ activities }: { activities: ActivityMeta[] }) {
  const data = useMemo(() => altitudeBands(activities), [activities])
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} layout="vertical" margin={{ left: 8 }}>
        <CartesianGrid horizontal={false} stroke={CHART_GRID} />
        <XAxis type="number" tick={CHART_TICK} allowDecimals={false} />
        <YAxis type="category" dataKey="label" tick={CHART_TICK} width={68} />
        <Tooltip {...tt} formatter={(v: number) => [v, 'Escursioni']} />
        <Bar dataKey="count" fill="#7dd3fc" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Trend FC media ───────────────────────────────────────────────────────────
export function FcTrendChart({ activities }: { activities: ActivityMeta[] }) {
  const data = useMemo(() =>
    [...activities]
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
      .map(a => ({ data: format(new Date(a.startTime), 'dd/MM'), fc: a.avgHeartRate ?? 0 }))
      .filter(d => d.fc > 0)
  , [activities])
  return (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={data}>
        <CartesianGrid vertical={false} stroke={CHART_GRID} />
        <XAxis dataKey="data" tick={CHART_TICK} />
        <YAxis hide unit=" bpm" />
        <Tooltip {...tt} formatter={(v: number) => [`${v} bpm`, 'FC media']} />
        <Line type="monotone" dataKey="fc" stroke="#f87171" strokeWidth={2} dot={{ r: 2.5, fill: '#f87171' }} isAnimationActive animationDuration={900} />
      </LineChart>
    </ResponsiveContainer>
  )
}

// ── Distanza vs dislivello ───────────────────────────────────────────────────
export function DistanceVsGainScatter({ activities }: { activities: ActivityMeta[] }) {
  const data = useMemo(() =>
    activities.map(a => ({ km: +(a.distanceMeters / 1000).toFixed(2), gain: Math.round(a.elevationGain), title: a.title ?? 'Escursione', id: a.id }))
  , [activities])
  return (
    <ResponsiveContainer width="100%" height={170}>
      <ScatterChart>
        <CartesianGrid stroke={CHART_GRID} />
        <XAxis type="number" dataKey="km" name="Distanza" unit=" km" tick={CHART_TICK} />
        <YAxis type="number" dataKey="gain" name="Dislivello" unit=" m" tick={CHART_TICK} />
        <ZAxis range={[50, 50]} />
        <Tooltip {...tt} cursor={{ strokeDasharray: '3 3' }} formatter={(v: number, name: string) => [name === 'km' ? `${v} km` : `${v} m`, name === 'km' ? 'Distanza' : 'Dislivello']} />
        <Scatter data={data} fill="#8cc894" fillOpacity={0.85} />
      </ScatterChart>
    </ResponsiveContainer>
  )
}

// ── Carico giornaliero (TSS stimato) ────────────────────────────────────────
export function TssBarChart({ activities }: { activities: ActivityMeta[] }) {
  const data = useMemo(() => {
    const events = activities.map(a => ({
      date: format(new Date(a.startTime), 'yyyy-MM-dd'),
      stress: activityStress(a.distanceMeters, a.elevationGain, a.totalTimeSeconds),
    }))
    return computeTrainingLoad(events, 90).filter(d => d.stress > 0)
  }, [activities])
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data}>
        <CartesianGrid vertical={false} stroke={CHART_GRID} />
        <XAxis dataKey="date" tick={CHART_TICK} tickFormatter={d => format(new Date(d), 'd/M')} minTickGap={40} />
        <YAxis hide />
        <Tooltip {...tt} labelFormatter={d => format(new Date(d), 'd MMM', { locale: it })} formatter={(v: number) => [v, 'TSS stimato']} />
        <Bar dataKey="stress" fill="#8cc894" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Zone di frequenza cardiaca (distribuzione polarizzata) ──────────────────
export function ZoneFcBarChart({ activities, maxHR }: { activities: ActivityMeta[]; maxHR: number }) {
  const data = useMemo(() => {
    const totals = [0, 0, 0, 0, 0]
    for (const a of activities) {
      if (!a.avgHeartRate || a.avgHeartRate <= 0 || !a.totalTimeSeconds) continue
      const ratio = a.avgHeartRate / maxHR
      const zone = ratio < 0.6 ? 0 : ratio < 0.7 ? 1 : ratio < 0.8 ? 2 : ratio < 0.9 ? 3 : 4
      totals[zone] += a.totalTimeSeconds / 60
    }
    return ['Z1', 'Z2', 'Z3', 'Z4', 'Z5'].map((z, i) => ({ zone: z, minuti: Math.round(totals[i]) }))
  }, [activities, maxHR])
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data}>
        <CartesianGrid vertical={false} stroke={CHART_GRID} />
        <XAxis dataKey="zone" tick={CHART_TICK} />
        <YAxis hide />
        <Tooltip {...tt} formatter={(v: number) => [`${v} min`, 'Tempo in zona']} />
        <Bar dataKey="minuti" fill="#7dd3fc" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Efficienza aerobica nel tempo (EF) ───────────────────────────────────────
export function EfTrendChart({ activities }: { activities: ActivityMeta[] }) {
  const data = useMemo(() => computeEFTrend(activities), [activities])
  return (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={data}>
        <CartesianGrid vertical={false} stroke={CHART_GRID} />
        <XAxis dataKey="date" tick={CHART_TICK} tickFormatter={d => format(new Date(d), 'd/M')} minTickGap={40} />
        <YAxis hide />
        <Tooltip {...tt} labelFormatter={d => format(new Date(d), 'd MMM', { locale: it })} />
        <Line type="monotone" dataKey="ef" stroke="rgba(255,255,255,0.4)" strokeWidth={1.5} dot={false} />
        <Line type="monotone" dataKey="efSmoothed" name="Tendenza" stroke="#8cc894" strokeWidth={2.5} dot={false} isAnimationActive animationDuration={900} />
      </LineChart>
    </ResponsiveContainer>
  )
}

// ── Indice efficienza verticale nel tempo (IEV) ─────────────────────────────
export function IevTrendChart({ activities }: { activities: ActivityMeta[] }) {
  const data = useMemo(() => computeIEVTrend(activities), [activities])
  return (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={data}>
        <CartesianGrid vertical={false} stroke={CHART_GRID} />
        <XAxis dataKey="date" tick={CHART_TICK} tickFormatter={d => format(new Date(d), 'd/M')} minTickGap={40} />
        <YAxis hide />
        <Tooltip {...tt} labelFormatter={d => format(new Date(d), 'd MMM', { locale: it })} />
        <Line type="monotone" dataKey="iev" stroke="rgba(255,255,255,0.4)" strokeWidth={1.5} dot={false} />
        <Line type="monotone" dataKey="ievSmoothed" name="Tendenza" stroke="#e9ab64" strokeWidth={2.5} dot={false} isAnimationActive animationDuration={900} />
      </LineChart>
    </ResponsiveContainer>
  )
}

// ── Efficienza metabolica (kcal/kg/h) ────────────────────────────────────────
export function CalorieBarChart({ activities, weightKg }: { activities: ActivityMeta[]; weightKg: number }) {
  const data = useMemo(() =>
    activities
      .filter(a => a.calories > 0)
      .slice(-8)
      .map(a => ({ title: a.title ?? 'Escursione', date: format(new Date(a.startTime), 'dd/MM'), eff: computeCalorieEfficiency(a, weightKg) }))
  , [activities, weightKg])
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data}>
        <CartesianGrid vertical={false} stroke={CHART_GRID} />
        <XAxis dataKey="date" tick={CHART_TICK} />
        <YAxis hide />
        <Tooltip {...tt} formatter={(v: number) => [`${v} kcal/kg/h`, 'Efficienza']} />
        <Bar dataKey="eff" fill="#e9ab64" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Evoluzione score nel tempo (Trail Score / soddisfazione / voto) ─────────
export function ScoreEvolutionChart({ activities }: { activities: ActivityMeta[] }) {
  const evo = useMemo(() => {
    const sorted = [...activities].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    const trailRaw  = sorted.filter(a => (a.trailScore ?? 0) > 0).map(a => ({ date: a.startTime, value: a.trailScore! }))
    const soddRaw   = sorted.filter(a => (a.soddisfazione ?? 0) > 0).map(a => ({ date: a.startTime, value: a.soddisfazione! * 10 }))
    const ratingRaw = sorted.filter(a => (a.userRating ?? 0) > 0).map(a => ({ date: a.startTime, value: a.userRating! * 10 }))
    return {
      trail:  trailRaw.length  >= 3 ? movingAverage(trailRaw,  5) : [],
      sodd:   soddRaw.length   >= 3 ? movingAverage(soddRaw,   5) : [],
      rating: ratingRaw.length >= 3 ? movingAverage(ratingRaw, 5) : [],
    }
  }, [activities])
  const trend = useMemo(() => {
    if (evo.trail.length < 4) return null
    return linearRegression(evo.trail.map((d, i) => ({ x: i, y: d.value })).filter(p => p.y > 0))
  }, [evo])
  return (
    <div>
      {trend && (
        <p className="text-[11px] font-medium text-white/80 mb-1">
          Trend Trail Score: {trend.slope > 0.05 ? '↑ in miglioramento' : trend.slope < -0.05 ? '↓ in calo' : '→ stabile'}
        </p>
      )}
      <ResponsiveContainer width="100%" height={150}>
        <ComposedChart>
          <CartesianGrid vertical={false} stroke={CHART_GRID} />
          <XAxis dataKey="date" tick={false} hide />
          <YAxis domain={[0, 100]} tick={CHART_TICK} />
          <Tooltip {...tt} labelFormatter={() => ''} />
          {evo.trail.length > 0 && <Line data={evo.trail} type="monotone" dataKey="value" name="Trail Score" stroke="#8cc894" strokeWidth={2.5} dot={false} />}
          {evo.sodd.length > 0 && <Line data={evo.sodd} type="monotone" dataKey="value" name="Soddisfazione" stroke="#e9ab64" strokeWidth={2} dot={false} strokeDasharray="4 2" />}
          {evo.rating.length > 0 && <Line data={evo.rating} type="monotone" dataKey="value" name="Voto" stroke="#7dd3fc" strokeWidth={2} dot={false} strokeDasharray="2 3" />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

export function hasScoreEvolutionData(activities: ActivityMeta[]): boolean {
  return activities.some(a => (a.trailScore ?? 0) > 0) || activities.some(a => (a.soddisfazione ?? 0) > 0) || activities.some(a => (a.userRating ?? 0) > 0)
}
