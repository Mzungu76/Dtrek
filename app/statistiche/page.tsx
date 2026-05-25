'use client'
import { useEffect, useState } from 'react'
import Navbar from '@/components/Navbar'
import StatCard from '@/components/StatCard'
import { getAllActivities, getGlobalStats, type StoredActivity } from '@/lib/store'
import { exportAllActivitiesToExcel } from '@/utils/exportExcel'
import { formatDuration, msToKmh } from '@/lib/tcxParser'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line,
} from 'recharts'
import { FileSpreadsheet, TrendingUp, Mountain, Heart, Route, Flame, Clock } from 'lucide-react'

export default function StatistichePage() {
  const [activities, setActivities] = useState<StoredActivity[]>([])
  const [stats, setStats] = useState(getGlobalStats())

  useEffect(() => {
    const all = getAllActivities()
    setActivities(all)
    setStats(getGlobalStats())
  }, [])

  // Dati per grafico distanza mensile
  const monthlyData = activities.reduce((acc, a) => {
    const month = format(new Date(a.startTime), 'MMM yy', { locale: it })
    const existing = acc.find(d => d.month === month)
    if (existing) {
      existing.km += a.distanceMeters / 1000
      existing.count += 1
    } else {
      acc.push({ month, km: a.distanceMeters / 1000, count: 1 })
    }
    return acc
  }, [] as { month: string; km: number; count: number }[])
    .map(d => ({ ...d, km: Math.round(d.km * 10) / 10 }))
    .slice(-12)

  // Dati FC nel tempo
  const fcData = [...activities]
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    .map(a => ({
      data: format(new Date(a.startTime), 'dd/MM'),
      fc: a.avgHeartRate,
    }))

  return (
    <div className="min-h-screen bg-stone-50">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 py-8 fade-up">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display text-3xl font-semibold text-stone-800">Statistiche globali</h1>
            <p className="text-stone-500 text-sm mt-1">{stats.totalActivities} escursioni registrate</p>
          </div>
          {activities.length > 0 && (
            <button
              onClick={() => exportAllActivitiesToExcel(activities)}
              className="flex items-center gap-2 px-4 py-2 bg-forest-700 text-white rounded-xl text-sm hover:bg-forest-600 transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4" /> Esporta tutto in Excel
            </button>
          )}
        </div>

        {activities.length === 0 ? (
          <div className="text-center py-24 text-stone-400">
            <Mountain className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium">Nessuna escursione ancora</p>
            <p className="text-sm mt-1">Carica il tuo primo file TCX per vedere le statistiche</p>
          </div>
        ) : (
          <>
            {/* Totali */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
              <StatCard label="Distanza totale"   value={`${stats.totalDistanceKm.toFixed(1)} km`} color="forest" icon={<Route className="w-3.5 h-3.5"/>} />
              <StatCard label="Tempo totale"      value={formatDuration(stats.totalTimeSeconds)}   color="terra"  icon={<Clock className="w-3.5 h-3.5"/>} />
              <StatCard label="Calorie totali"    value={`${stats.totalCalories.toLocaleString('it')} kcal`} color="red" icon={<Flame className="w-3.5 h-3.5"/>} />
              <StatCard label="Dislivello totale" value={`${Math.round(stats.totalElevationGain).toLocaleString('it')} m`} color="forest" icon={<Mountain className="w-3.5 h-3.5"/>} />
              <StatCard label="FC media storica"  value={`${stats.avgHeartRate} bpm`} color="red" icon={<Heart className="w-3.5 h-3.5"/>} />
              <StatCard label="Quota massima mai" value={`${Math.round(stats.highestAlt)} m`} color="blue" icon={<TrendingUp className="w-3.5 h-3.5"/>} />
            </div>

            {/* Grafici */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              {/* Distanza mensile */}
              <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
                <h3 className="font-medium text-stone-700 mb-4">Distanza mensile (km)</h3>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e8e4dc" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} />
                      <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} unit=" km" width={50} />
                      <Tooltip
                        formatter={(v: number) => [`${v} km`, 'Distanza']}
                        contentStyle={{ borderRadius: 8, border: '1px solid #e8e4dc', fontSize: 13 }}
                      />
                      <Bar dataKey="km" fill="#378d44" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* FC nel tempo */}
              <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
                <h3 className="font-medium text-stone-700 mb-4">FC media per escursione</h3>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={fcData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e8e4dc" />
                      <XAxis dataKey="data" tick={{ fontSize: 11 }} tickLine={false} />
                      <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} unit=" bpm" width={60} />
                      <Tooltip
                        formatter={(v: number) => [`${v} bpm`, 'FC media']}
                        contentStyle={{ borderRadius: 8, border: '1px solid #e8e4dc', fontSize: 13 }}
                      />
                      <Line type="monotone" dataKey="fc" stroke="#C0392B" strokeWidth={2} dot={{ r: 4, fill: '#C0392B' }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Tabella escursioni */}
            <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-stone-100">
                <h3 className="font-medium text-stone-700">Tutte le escursioni</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-stone-50 text-stone-500 text-xs uppercase tracking-wider">
                    <tr>
                      {['Data', 'Titolo', 'Distanza', 'Durata', 'FC media', 'Dislivello ↑', 'Calorie'].map(h => (
                        <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {activities.map(a => (
                      <tr
                        key={a.id}
                        className="hover:bg-stone-50 cursor-pointer transition-colors"
                        onClick={() => window.location.href = `/escursione/${encodeURIComponent(a.id)}`}
                      >
                        <td className="px-4 py-3 text-stone-500 whitespace-nowrap">
                          {format(new Date(a.startTime), 'dd/MM/yy')}
                        </td>
                        <td className="px-4 py-3 font-medium text-stone-700">
                          {a.title ?? a.notes ?? 'Escursione'}
                        </td>
                        <td className="px-4 py-3 font-mono text-stone-600">{(a.distanceMeters / 1000).toFixed(2)} km</td>
                        <td className="px-4 py-3 font-mono text-stone-600">{formatDuration(a.totalTimeSeconds)}</td>
                        <td className="px-4 py-3 font-mono text-red-600">{a.avgHeartRate} bpm</td>
                        <td className="px-4 py-3 font-mono text-forest-600">↑ {a.elevationGain.toFixed(0)} m</td>
                        <td className="px-4 py-3 font-mono text-terra-600">{a.calories} kcal</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
