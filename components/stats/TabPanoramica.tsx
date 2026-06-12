'use client'
import StatCard from '@/components/StatCard'
import RecordCard from './RecordCard'
import { computeGlobalStats, type ActivityMeta } from '@/lib/blobStore'
import { formatDuration } from '@/lib/tcxParser'
import { formatPaceMinkm, difficultyIndex, caloriesPerHour, type PersonalRecords, type Streaks } from '@/lib/stats'
import { format } from 'date-fns'
import {
  Route, Clock, Flame, Mountain, Heart, TrendingUp, Activity, Trophy,
  Zap, Target, ChevronUp, GitCommitHorizontal,
} from 'lucide-react'
import { msToKmh } from '@/lib/tcxParser'

interface Props {
  activities: ActivityMeta[]
  records: PersonalRecords
  streaks: Streaks
}

export default function TabPanoramica({ activities, records, streaks }: Props) {
  const stats = computeGlobalStats(activities)

  return (
    <div className="space-y-8">
      {/* Global KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Distanza totale"   value={`${stats.totalDistanceKm.toFixed(1)} km`}                         color="forest" icon={<Route className="w-3.5 h-3.5"/>} />
        <StatCard label="Tempo totale"      value={formatDuration(stats.totalTimeSeconds)}                            color="terra"  icon={<Clock className="w-3.5 h-3.5"/>} />
        <StatCard label="Calorie totali"    value={`${stats.totalCalories.toLocaleString('it')} kcal`}               color="red"    icon={<Flame className="w-3.5 h-3.5"/>} />
        <StatCard label="Dislivello totale" value={`${Math.round(stats.totalElevationGain).toLocaleString('it')} m`} color="forest" icon={<Mountain className="w-3.5 h-3.5"/>} />
        <StatCard label="FC media storica"  value={`${stats.avgHeartRate} bpm`}                                      color="red"    icon={<Heart className="w-3.5 h-3.5"/>} />
        <StatCard label="Quota max mai"     value={`${Math.round(stats.highestAlt)} m`}                              color="blue"   icon={<TrendingUp className="w-3.5 h-3.5"/>} />
      </div>

      {/* Streak */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
        <h3 className="font-medium text-stone-700 mb-4 flex items-center gap-2">
          <Activity className="w-4 h-4 text-forest-600" /> Continuità
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: 'Streak attuale (giorni)',    value: streaks.currentDays },
            { label: 'Record streak (giorni)',     value: streaks.longestDays },
            { label: 'Streak attuale (settimane)', value: streaks.currentWeeks },
            { label: 'Record streak (settimane)',  value: streaks.longestWeeks },
            { label: 'Giorni attivi totali',       value: streaks.totalActiveDays },
            { label: 'Settimane attive totali',    value: streaks.totalActiveWeeks },
          ].map(({ label, value }) => (
            <div key={label} className="text-center">
              <p className="font-display text-3xl font-bold text-forest-700">{value}</p>
              <p className="text-xs text-stone-400 mt-1 leading-tight">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Personal records */}
      <div>
        <h3 className="font-medium text-stone-700 mb-3 flex items-center gap-2">
          <Trophy className="w-4 h-4 text-terra-500" /> Record personali
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {records.longestKm && (
            <RecordCard label="Più lunga" icon={<Route className="w-4 h-4"/>}
              value={`${(records.longestKm.distanceMeters/1000).toFixed(2)} km`}
              sub={records.longestKm.title ?? 'Escursione'}
              polyline={records.longestKm.routePolyline}
              href={`/escursione/${encodeURIComponent(records.longestKm.id)}`}
            />
          )}
          {records.highestGain && (
            <RecordCard label="Più dislivello" icon={<Mountain className="w-4 h-4"/>}
              value={`${Math.round(records.highestGain.elevationGain)} m D+`}
              sub={records.highestGain.title ?? 'Escursione'}
              polyline={records.highestGain.routePolyline}
              href={`/escursione/${encodeURIComponent(records.highestGain.id)}`}
            />
          )}
          {records.fastestPace && (
            <RecordCard label="Passo più veloce" icon={<Zap className="w-4 h-4"/>}
              value={formatPaceMinkm(records.fastestPace.distanceMeters, records.fastestPace.totalTimeSeconds)}
              sub={records.fastestPace.title ?? 'Escursione'}
              polyline={records.fastestPace.routePolyline}
              href={`/escursione/${encodeURIComponent(records.fastestPace.id)}`}
            />
          )}
          {records.mostCalories && (
            <RecordCard label="Più calorie" icon={<Flame className="w-4 h-4"/>}
              value={`${records.mostCalories.calories} kcal`}
              sub={records.mostCalories.title ?? 'Escursione'}
              polyline={records.mostCalories.routePolyline}
              href={`/escursione/${encodeURIComponent(records.mostCalories.id)}`}
            />
          )}
          {records.highestAlt && (
            <RecordCard label="Quota massima" icon={<ChevronUp className="w-4 h-4"/>}
              value={`${Math.round(records.highestAlt.altitudeMax)} m slm`}
              sub={records.highestAlt.title ?? 'Escursione'}
              polyline={records.highestAlt.routePolyline}
              href={`/escursione/${encodeURIComponent(records.highestAlt.id)}`}
            />
          )}
          {records.longestDuration && (
            <RecordCard label="Più lunga (durata)" icon={<Clock className="w-4 h-4"/>}
              value={formatDuration(records.longestDuration.totalTimeSeconds)}
              sub={records.longestDuration.title ?? 'Escursione'}
              polyline={records.longestDuration.routePolyline}
              href={`/escursione/${encodeURIComponent(records.longestDuration.id)}`}
            />
          )}
          {records.highestHR && (
            <RecordCard label="FC massima registrata" icon={<Heart className="w-4 h-4"/>}
              value={`${records.highestHR.maxHeartRate} bpm`}
              sub={records.highestHR.title ?? 'Escursione'}
              polyline={records.highestHR.routePolyline}
              href={`/escursione/${encodeURIComponent(records.highestHR.id)}`}
            />
          )}
          {records.highestDifficulty && (
            <RecordCard label="Più difficile (D+/km)" icon={<Target className="w-4 h-4"/>}
              value={`${difficultyIndex(records.highestDifficulty.elevationGain, records.highestDifficulty.distanceMeters)} m/km`}
              sub={records.highestDifficulty.title ?? 'Escursione'}
              polyline={records.highestDifficulty.routePolyline}
              href={`/escursione/${encodeURIComponent(records.highestDifficulty.id)}`}
            />
          )}
        </div>
      </div>

      {/* Peak bagging shortcut */}
      <a href="/vette"
        className="flex items-center gap-4 bg-gradient-to-r from-forest-700 to-forest-800 text-white rounded-2xl p-5 hover:from-forest-600 hover:to-forest-700 transition-all">
        <Mountain className="w-8 h-8 text-forest-300 shrink-0" />
        <div>
          <p className="font-semibold text-lg">Vette Conquistate</p>
          <p className="text-forest-300 text-sm">Visualizza tutte le cime raggiunte durante le tue escursioni →</p>
        </div>
      </a>

      {/* Activities table */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-stone-100">
          <h3 className="font-medium text-stone-700">Tutte le escursioni</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-stone-500 text-xs uppercase tracking-wider">
              <tr>
                {['Data','Titolo','Distanza','Durata','Passo','D+/km','FC media','Calorie','Cal/h'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {activities.map(a => (
                <tr key={a.id} className="hover:bg-stone-50 cursor-pointer transition-colors"
                  onClick={() => window.location.href = `/escursione/${encodeURIComponent(a.id)}`}>
                  <td className="px-4 py-3 text-stone-500 whitespace-nowrap">{format(new Date(a.startTime), 'dd/MM/yy')}</td>
                  <td className="px-4 py-3 font-medium text-stone-700 max-w-[180px] truncate">{a.title ?? 'Escursione'}</td>
                  <td className="px-4 py-3 font-mono text-stone-600">{(a.distanceMeters/1000).toFixed(2)} km</td>
                  <td className="px-4 py-3 font-mono text-stone-600">{formatDuration(a.totalTimeSeconds)}</td>
                  <td className="px-4 py-3 font-mono text-terra-600">{formatPaceMinkm(a.distanceMeters, a.totalTimeSeconds)}</td>
                  <td className="px-4 py-3 font-mono text-forest-600">{difficultyIndex(a.elevationGain, a.distanceMeters)} m/km</td>
                  <td className="px-4 py-3 font-mono text-red-600">{a.avgHeartRate ? `${a.avgHeartRate} bpm` : '—'}</td>
                  <td className="px-4 py-3 font-mono text-terra-600">{a.calories ? `${a.calories} kcal` : '—'}</td>
                  <td className="px-4 py-3 font-mono text-stone-500">{a.calories ? `${caloriesPerHour(a.calories, a.totalTimeSeconds)} kcal/h` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
