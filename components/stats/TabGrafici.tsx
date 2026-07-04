'use client'
import { useMemo, useState } from 'react'
import ActivityHeatmap from './ActivityHeatmap'
import InfoButton from './InfoButton'
import { ActivityMeta } from '@/lib/blobStore'
import { computeSeasonalStats, movingAverage, linearRegression } from '@/lib/stats'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, ScatterChart, Scatter, ZAxis, Legend,
  ComposedChart, ReferenceLine,
} from 'recharts'
import { CalendarDays, BarChart2, TrendingUp, Star, Sun } from 'lucide-react'

interface Props { activities: ActivityMeta[]; onGuideLink: (section: string) => void }

export default function TabGrafici({ activities, onGuideLink }: Props) {
  const [heatmapYear, setHeatmapYear] = useState(new Date().getFullYear())

  const years = useMemo(() => {
    if (!activities.length) return [new Date().getFullYear()]
    const ys = Array.from(new Set(activities.map(a => new Date(a.startTime).getFullYear()))).sort()
    if (!ys.includes(new Date().getFullYear())) ys.push(new Date().getFullYear())
    return ys
  }, [activities])

  const monthlyData = useMemo(() =>
    activities.reduce((acc, a) => {
      const month = format(new Date(a.startTime), 'MMM yy', { locale: it })
      const ex = acc.find(d => d.month === month)
      if (ex) { ex.km += a.distanceMeters / 1000; ex.gain += a.elevationGain; ex.count++ }
      else acc.push({ month, km: a.distanceMeters / 1000, gain: a.elevationGain, count: 1 })
      return acc
    }, [] as { month: string; km: number; gain: number; count: number }[])
      .map(d => ({ ...d, km: Math.round(d.km * 10) / 10, gain: Math.round(d.gain) }))
      .slice(-12)
  , [activities])

  const fcTrend = useMemo(() =>
    [...activities]
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
      .map(a => ({ data: format(new Date(a.startTime), 'dd/MM'), fc: a.avgHeartRate ?? 0, km: +(a.distanceMeters / 1000).toFixed(1) }))
  , [activities])

  const scatterData = useMemo(() =>
    activities.map(a => ({ km: +(a.distanceMeters / 1000).toFixed(2), gain: Math.round(a.elevationGain), title: a.title ?? 'Escursione', id: a.id }))
  , [activities])

  const weekdayData = useMemo(() => {
    const labels = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']
    const counts = [0, 0, 0, 0, 0, 0, 0]
    for (const a of activities) { const dow = new Date(a.startTime).getDay(); counts[dow === 0 ? 6 : dow - 1]++ }
    return labels.map((day, i) => ({ day, count: counts[i] }))
  }, [activities])

  const annualData = useMemo(() => {
    const map = new Map<number, { year: number; km: number; gain: number; count: number }>()
    for (const a of activities) {
      const y = new Date(a.startTime).getFullYear()
      const ex = map.get(y) ?? { year: y, km: 0, gain: 0, count: 0 }
      ex.km += a.distanceMeters / 1000; ex.gain += a.elevationGain; ex.count++
      map.set(y, ex)
    }
    return Array.from(map.values()).sort((a, b) => a.year - b.year)
      .map(d => ({ year: String(d.year), km: Math.round(d.km), gain: Math.round(d.gain), count: d.count }))
  }, [activities])

  const distHistogram = useMemo(() => [
    { label: '0–5 km',   count: activities.filter(a => a.distanceMeters < 5000).length },
    { label: '5–10 km',  count: activities.filter(a => a.distanceMeters >= 5000  && a.distanceMeters < 10000).length },
    { label: '10–15 km', count: activities.filter(a => a.distanceMeters >= 10000 && a.distanceMeters < 15000).length },
    { label: '15–20 km', count: activities.filter(a => a.distanceMeters >= 15000 && a.distanceMeters < 20000).length },
    { label: '20+ km',   count: activities.filter(a => a.distanceMeters >= 20000).length },
  ], [activities])

  // ── Score evolution (new) ──────────────────────────────────────────────────
  const scoreEvolution = useMemo(() => {
    const sorted = [...activities].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    const trailRaw  = sorted.filter(a => (a.trailScore ?? 0) > 0).map(a => ({ date: a.startTime, value: a.trailScore! }))
    const soddRaw   = sorted.filter(a => (a.soddisfazione ?? 0) > 0).map(a => ({ date: a.startTime, value: a.soddisfazione! * 10 }))
    const ratingRaw = sorted.filter(a => (a.userRating ?? 0) > 0).map(a => ({ date: a.startTime, value: a.userRating! * 10 }))
    return {
      trail:  trailRaw.length  >= 3 ? movingAverage(trailRaw,  5) : [],
      sodd:   soddRaw.length   >= 3 ? movingAverage(soddRaw,   5) : [],
      rating: ratingRaw.length >= 3 ? movingAverage(ratingRaw, 5) : [],
      trailRaw, soddRaw, ratingRaw,
    }
  }, [activities])

  const trailTrend = useMemo(() => {
    if (scoreEvolution.trail.length < 4) return null
    const pts = scoreEvolution.trail.map((d, i) => ({ x: i, y: d.value })).filter(p => p.y > 0)
    return linearRegression(pts)
  }, [scoreEvolution])

  // ── Seasonal analysis (new) ───────────────────────────────────────────────
  const seasonalStats = useMemo(() => computeSeasonalStats(activities), [activities])
  const seasonalBarData = useMemo(() =>
    seasonalStats.map(s => ({ name: s.label, km: s.avgKm, gain: s.avgGain, uscite: s.count, sodd: s.avgSatisfaction }))
  , [seasonalStats])

  // ── Altitude distribution (new) ───────────────────────────────────────────
  const altBands = useMemo(() => [
    { label: '0–500m',    count: activities.filter(a => (a.altitudeMax ?? 0) < 500).length },
    { label: '500–1000m', count: activities.filter(a => (a.altitudeMax ?? 0) >= 500  && (a.altitudeMax ?? 0) < 1000).length },
    { label: '1000–1500m',count: activities.filter(a => (a.altitudeMax ?? 0) >= 1000 && (a.altitudeMax ?? 0) < 1500).length },
    { label: '1500–2000m',count: activities.filter(a => (a.altitudeMax ?? 0) >= 1500 && (a.altitudeMax ?? 0) < 2000).length },
    { label: '2000–2500m',count: activities.filter(a => (a.altitudeMax ?? 0) >= 2000 && (a.altitudeMax ?? 0) < 2500).length },
    { label: '2500–3000m',count: activities.filter(a => (a.altitudeMax ?? 0) >= 2500 && (a.altitudeMax ?? 0) < 3000).length },
    { label: '3000+m',    count: activities.filter(a => (a.altitudeMax ?? 0) >= 3000).length },
  ].filter(b => b.count > 0), [activities])

  const hasScoreData = scoreEvolution.trail.length > 0 || scoreEvolution.sodd.length > 0 || scoreEvolution.rating.length > 0
  const hasSeasonal  = activities.length >= 4

  return (
    <div className="space-y-6">
      {/* Annual heatmap */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium text-stone-700 flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-forest-600" /> Attività annuale
            <InfoButton section="heatmap" onGuideLink={onGuideLink} />
          </h3>
          <div className="flex gap-1">
            {years.map(y => (
              <button key={y} onClick={() => setHeatmapYear(y)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  y === heatmapYear ? 'bg-forest-100 text-forest-700' : 'text-stone-400 hover:text-stone-600'
                }`}>{y}</button>
            ))}
          </div>
        </div>
        <ActivityHeatmap activities={activities} year={heatmapYear} />
      </div>

      {/* Annual comparison */}
      {annualData.length > 1 && (
        <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
          <h3 className="font-medium text-stone-700 mb-1 flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-forest-600" /> Confronto annuale
            <InfoButton section="confronto-annuale" onGuideLink={onGuideLink} />
          </h3>
          <p className="text-xs text-stone-400 mb-4">Distanza totale e dislivello anno per anno.</p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={annualData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8e4dc" />
                <XAxis dataKey="year" tick={{ fontSize: 12 }} tickLine={false} />
                <YAxis yAxisId="km"   orientation="left"  tick={{ fontSize: 11 }} tickLine={false} axisLine={false} unit=" km" width={52} />
                <YAxis yAxisId="gain" orientation="right" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} unit=" m"  width={56} />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e8e4dc', fontSize: 12 }}
                  formatter={(v: any, name: string) => [name === 'km' ? `${v} km` : `${v} m`, name === 'km' ? 'Distanza' : 'Dislivello D+']} />
                <Legend formatter={(v: string) => v === 'km' ? 'Distanza (km)' : 'Dislivello D+ (m)'} wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="km"   dataKey="km"   fill="#378d44" radius={[4,4,0,0]} />
                <Bar yAxisId="gain" dataKey="gain" fill="#c05a17" radius={[4,4,0,0]} opacity={0.8} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Monthly */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
        <h3 className="font-medium text-stone-700 mb-4">Distanza e dislivello mensili</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8e4dc" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} />
              <YAxis yAxisId="km"   orientation="left"  tick={{ fontSize: 11 }} tickLine={false} axisLine={false} unit=" km" width={48} />
              <YAxis yAxisId="gain" orientation="right" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} unit=" m"  width={52} />
              <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e8e4dc', fontSize: 12 }}
                formatter={(v: any, name: string) => [name === 'km' ? `${v} km` : `${v} m`, name === 'km' ? 'Distanza' : 'Dislivello']} />
              <Legend formatter={(v: string) => v === 'km' ? 'Distanza (km)' : 'Dislivello D+ (m)'} wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="km"   dataKey="km"   fill="#378d44" radius={[4,4,0,0]} />
              <Bar yAxisId="gain" dataKey="gain" fill="#c05a17" radius={[4,4,0,0]} opacity={0.8} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* NEW: Score evolution */}
      {hasScoreData && (
        <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
          <h3 className="font-medium text-stone-700 mb-1 flex items-center gap-2">
            <Star className="w-4 h-4 text-terra-500" /> Evoluzione Score nel Tempo
            <InfoButton section="score-evolution" onGuideLink={onGuideLink} />
          </h3>
          <p className="text-xs text-stone-400 mb-1">Media mobile su 5 uscite. Trail Score (0-100) · Soddisfazione e Rating scalati a 100.</p>
          {trailTrend && (
            <p className={`text-xs font-medium mb-3 ${trailTrend.slope > 0 ? 'text-green-600' : trailTrend.slope < -0.05 ? 'text-red-500' : 'text-stone-500'}`}>
              Trend Trail Score: {trailTrend.slope > 0.05 ? '↑ in miglioramento' : trailTrend.slope < -0.05 ? '↓ in calo' : '→ stabile'}
            </p>
          )}
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8e4dc" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} hide />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={32} />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e8e4dc', fontSize: 12 }}
                  labelFormatter={() => ''}
                  formatter={(v: any, name: string) => {
                    const labels: Record<string, string> = { trail: 'Trail Score (MA)', sodd: 'Soddisfazione ×10 (MA)', rating: 'Rating ×10 (MA)' }
                    return [`${v}`, labels[name] ?? name]
                  }} />
                {scoreEvolution.trail.length > 0 && (
                  <Line data={scoreEvolution.trail} type="monotone" dataKey="value" name="trail"
                    stroke="#378d44" strokeWidth={2.5} dot={false} />
                )}
                {scoreEvolution.sodd.length > 0 && (
                  <Line data={scoreEvolution.sodd} type="monotone" dataKey="value" name="sodd"
                    stroke="#c05a17" strokeWidth={2} dot={false} strokeDasharray="4 2" />
                )}
                {scoreEvolution.rating.length > 0 && (
                  <Line data={scoreEvolution.rating} type="monotone" dataKey="value" name="rating"
                    stroke="#2563eb" strokeWidth={2} dot={false} strokeDasharray="2 3" />
                )}
                <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v: string) => ({ trail: 'Trail Score', sodd: 'Soddisfazione', rating: 'Rating' }[v] ?? v)} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* NEW: Seasonal analysis */}
      {hasSeasonal && (
        <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
          <h3 className="font-medium text-stone-700 mb-1 flex items-center gap-2">
            <Sun className="w-4 h-4 text-yellow-500" /> Analisi Stagionale
            <InfoButton section="stagionale" onGuideLink={onGuideLink} />
          </h3>
          <p className="text-xs text-stone-400 mb-4">Km medi e dislivello medio per stagione.</p>
          {/* Season cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            {seasonalStats.map(s => (
              <div key={s.season} className="rounded-xl border p-3 text-center" style={{ borderColor: s.color + '50', backgroundColor: s.color + '10' }}>
                <p className="text-xs font-semibold mb-2" style={{ color: s.color }}>{s.label}</p>
                <p className="font-display text-2xl font-bold text-stone-800">{s.count}</p>
                <p className="text-xs text-stone-400">uscite</p>
                {s.count > 0 && (
                  <div className="mt-2 space-y-0.5 text-xs text-stone-500">
                    <p>{s.avgKm} km medi</p>
                    <p>↑ {s.avgGain} m medi</p>
                    {s.avgHR > 0 && <p className="text-red-500">{s.avgHR} bpm</p>}
                    {s.avgSatisfaction > 0 && <p className="text-amber-600">😊 {s.avgSatisfaction}/10</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
          {seasonalBarData.some(d => d.km > 0) && (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={seasonalBarData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8e4dc" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} />
                  <YAxis yAxisId="km"   orientation="left"  tick={{ fontSize: 10 }} tickLine={false} axisLine={false} unit=" km" width={44} />
                  <YAxis yAxisId="gain" orientation="right" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} unit=" m"  width={48} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e8e4dc', fontSize: 12 }}
                    formatter={(v: any, name: string) => [name === 'km' ? `${v} km` : `${v} m`, name === 'km' ? 'Km medi' : 'D+ medio']} />
                  <Legend formatter={(v: string) => v === 'km' ? 'Km medi/uscita' : 'D+ medio/uscita'} wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="km"   dataKey="km"   fill="#378d44" radius={[4,4,0,0]} />
                  <Bar yAxisId="gain" dataKey="gain" fill="#c05a17" radius={[4,4,0,0]} opacity={0.8} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Weekday distribution */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
        <h3 className="font-medium text-stone-700 mb-1">Distribuzione per giorno della settimana</h3>
        <p className="text-xs text-stone-400 mb-4">In quale giorno esci di più?</p>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weekdayData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8e4dc" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 12, fontWeight: 600 }} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={28} allowDecimals={false} />
              <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e8e4dc', fontSize: 12 }}
                formatter={(v: any) => [v, 'Escursioni']} />
              <Bar dataKey="count" fill="#378d44" radius={[6,6,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Distance histogram */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
        <h3 className="font-medium text-stone-700 mb-1">Distribuzione per lunghezza</h3>
        <p className="text-xs text-stone-400 mb-4">Quante escursioni rientrano in ciascuna fascia di distanza?</p>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={distHistogram} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8e4dc" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={28} allowDecimals={false} />
              <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e8e4dc', fontSize: 12 }}
                formatter={(v: any) => [v, 'Escursioni']} />
              <Bar dataKey="count" fill="#c05a17" radius={[6,6,0,0]} opacity={0.85} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Altitude distribution (new) */}
      {altBands.length > 1 && (
        <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
          <h3 className="font-medium text-stone-700 mb-1 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-forest-600" /> Distribuzione per quota massima
            <InfoButton section="altimetrica" onGuideLink={onGuideLink} />
          </h3>
          <p className="text-xs text-stone-400 mb-4">Fino a che quota arrivi più spesso?</p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={altBands} layout="vertical" margin={{ top: 4, right: 40, bottom: 0, left: 56 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8e4dc" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={64} />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e8e4dc', fontSize: 12 }}
                  formatter={(v: any) => [v, 'Escursioni']} />
                <Bar dataKey="count" fill="#0284c7" radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* FC trend */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
        <h3 className="font-medium text-stone-700 mb-1 flex items-center gap-2">
          Trend fitness (FC media) <InfoButton section="fc-trend" onGuideLink={onGuideLink} />
        </h3>
        <p className="text-xs text-stone-400 mb-4">Se la FC media scende nel tempo mantenendo distanze simili, stai migliorando.</p>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={fcTrend.filter(d => d.fc > 0)} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8e4dc" />
              <XAxis dataKey="data" tick={{ fontSize: 11 }} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} unit=" bpm" width={60} />
              <Tooltip formatter={(v: number) => [`${v} bpm`, 'FC media']} contentStyle={{ borderRadius: 8, border: '1px solid #e8e4dc', fontSize: 12 }} />
              <Line type="monotone" dataKey="fc" stroke="#C0392B" strokeWidth={2} dot={{ r: 3, fill: '#C0392B' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Scatter km vs D+ */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
        <h3 className="font-medium text-stone-700 mb-1">Distanza vs Dislivello</h3>
        <p className="text-xs text-stone-400 mb-4">In alto a destra le escursioni più impegnative.</p>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8e4dc" />
              <XAxis type="number" dataKey="km" name="Distanza" unit=" km" tick={{ fontSize: 11 }} tickLine={false} />
              <YAxis type="number" dataKey="gain" name="Dislivello" unit=" m" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={56} />
              <ZAxis range={[60, 60]} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ borderRadius: 8, border: '1px solid #e8e4dc', fontSize: 12 }}
                content={({ payload }) => {
                  if (!payload?.length) return null
                  const d = payload[0].payload
                  return (
                    <div className="bg-white border border-stone-200 rounded-lg p-2 text-xs shadow">
                      <p className="font-medium text-stone-700 mb-1">{d.title}</p>
                      <p className="text-forest-700">{d.km} km</p>
                      <p className="text-terra-600">↑ {d.gain} m</p>
                    </div>
                  )
                }} />
              <Scatter data={scatterData} fill="#378d44" fillOpacity={0.75}
                onClick={(d: any) => window.location.href = `/resoconto/${encodeURIComponent(d.id)}`}
                style={{ cursor: 'pointer' }} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
