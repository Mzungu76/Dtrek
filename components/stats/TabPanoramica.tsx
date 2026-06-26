'use client'
import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import StatCard from '@/components/StatCard'
import RecordCard from './RecordCard'
import InfoButton from './InfoButton'
import ShareModal from '@/components/ShareModal'
import { computeGlobalStats, type ActivityMeta } from '@/lib/blobStore'
import { formatDuration } from '@/lib/tcxParser'
import { formatPaceMinkm, difficultyIndex, caloriesPerHour, computeLifetimeDEP, type PersonalRecords, type Streaks } from '@/lib/stats'
import { format } from 'date-fns'
import {
  Route, Clock, Flame, Mountain, Heart, TrendingUp, Activity, Trophy,
  Zap, Target, ChevronUp, GitCommitHorizontal, Map, Info, Share2,
} from 'lucide-react'
import { msToKmh } from '@/lib/tcxParser'

const AllRoutesMap = dynamic(() => import('@/components/AllRoutesMap'), { ssr: false })

interface Props {
  activities: ActivityMeta[]
  records: PersonalRecords
  streaks: Streaks
  onGuideLink: (section: string) => void
}

export default function TabPanoramica({ activities, records, streaks, onGuideLink }: Props) {
  const stats = computeGlobalStats(activities)
  const [showShareMap, setShowShareMap] = useState(false)

  const routesWithPolyline = useMemo(
    () => activities.filter(a => a.routePolyline && a.routePolyline.length > 1),
    [activities],
  )
  const routesWithoutPolyline = activities.length - routesWithPolyline.length

  const mapRoutes = useMemo(
    () => routesWithPolyline.map(a => ({
      id: a.id,
      title: a.title ?? 'Escursione',
      startTime: a.startTime,
      polyline: a.routePolyline as [number, number][],
    })),
    [routesWithPolyline],
  )

  const lifetimeDEP = useMemo(() => computeLifetimeDEP(activities), [activities])

  return (
    <>
    <div className="space-y-8">
      {/* Volume storico (DEP cumulata) */}
      <div className="bg-gradient-to-br from-forest-800 to-forest-900 text-white rounded-2xl p-6 shadow-sm">
        <p className="text-xs uppercase tracking-wide text-forest-300 font-medium mb-1">Il tuo volume di trekking</p>
        <p className="font-display text-4xl sm:text-5xl font-bold">{lifetimeDEP.total.toFixed(0)} km <span className="text-lg font-normal text-forest-300">DEP</span></p>
        {lifetimeDEP.analogies.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm text-forest-200">
            {lifetimeDEP.analogies.map(a => <li key={a}>· {a}</li>)}
          </ul>
        )}
      </div>

      {/* Global KPI */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <span className="text-xs text-stone-400 font-medium uppercase tracking-wide">Totali storici</span>
          <InfoButton section="kpi" onGuideLink={onGuideLink} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
          <StatCard label="Distanza totale"   value={`${stats.totalDistanceKm.toFixed(1)} km`}                         color="forest" icon={<Route className="w-3.5 h-3.5"/>} />
          <StatCard label="Tempo totale"      value={formatDuration(stats.totalTimeSeconds)}                            color="terra"  icon={<Clock className="w-3.5 h-3.5"/>} />
          <StatCard label="Calorie totali"    value={`${stats.totalCalories.toLocaleString('it')} kcal`}               color="red"    icon={<Flame className="w-3.5 h-3.5"/>} />
          <StatCard label="Dislivello totale" value={`${Math.round(stats.totalElevationGain).toLocaleString('it')} m`} color="forest" icon={<Mountain className="w-3.5 h-3.5"/>} />
          <StatCard label="FC media storica"  value={`${stats.avgHeartRate} bpm`}                                      color="red"    icon={<Heart className="w-3.5 h-3.5"/>} />
          <StatCard label="Quota max mai"     value={`${Math.round(stats.highestAlt)} m`}                              color="blue"   icon={<TrendingUp className="w-3.5 h-3.5"/>} />
          <StatCard label="DEP totale"        value={`${stats.totalDepKm.toFixed(0)} km`}
            sub={`equivale all'Italia ×${(stats.totalDepKm / 1300).toFixed(1)}`}
            color="stone" icon={<Route className="w-3.5 h-3.5"/>}
            tooltip="Distanza Equivalente in Piano cumulata (formula CAI): somma di km + dislivello/100 di tutte le escursioni." />
        </div>
      </div>

      {/* Mappa generale */}
      <div>
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <h3 className="font-medium text-stone-700 flex items-center gap-2">
            <Map className="w-4 h-4 text-forest-600" /> Mappa generale
          </h3>
          {routesWithPolyline.length > 0 && (
            <button
              onClick={() => setShowShareMap(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-forest-600 hover:bg-forest-700 text-white rounded-xl text-xs font-medium transition-colors"
            >
              <Share2 className="w-3.5 h-3.5" /> Condividi mappa
            </button>
          )}
        </div>
        {routesWithPolyline.length > 0 ? (
          <AllRoutesMap routes={mapRoutes} height="380px" />
        ) : (
          <div
            className="flex items-center justify-center rounded-xl bg-stone-100 border border-stone-200 text-stone-400"
            style={{ height: '380px' }}
          >
            Nessun percorso GPS disponibile
          </div>
        )}
        {routesWithoutPolyline > 0 && (
          <div className="mt-3 flex items-start gap-2 text-sm text-stone-500 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <Info className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <span>
              {routesWithoutPolyline === 1
                ? '1 escursione non ha'
                : `${routesWithoutPolyline} escursioni non hanno`}{' '}
              il percorso GPS salvato — probabilmente caricate prima dell&apos;aggiornamento che supporta le polyline.
            </span>
          </div>
        )}
      </div>

      {/* Streak */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
        <h3 className="font-medium text-stone-700 mb-4 flex items-center gap-2">
          <Activity className="w-4 h-4 text-forest-600" /> Continuità
          <InfoButton section="streak" onGuideLink={onGuideLink} />
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
          <InfoButton section="records" onGuideLink={onGuideLink} />
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
                {[
                  { label: 'Data' }, { label: 'Titolo' }, { label: 'Distanza' }, { label: 'Durata' },
                  { label: 'Passo', section: 'passo' }, { label: 'D+/km', section: 'difficolta' },
                  { label: 'FC media', section: 'zone-fc' }, { label: 'Calorie' }, { label: 'Cal/h' },
                ].map(({ label, section }) => (
                  <th key={label} className="px-4 py-3 text-left font-medium whitespace-nowrap">
                    <span className="flex items-center gap-1">
                      {label}
                      {section && <InfoButton section={section} onGuideLink={onGuideLink} />}
                    </span>
                  </th>
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

    {showShareMap && (
      <ShareModal kind="map" activities={activities} onClose={() => setShowShareMap(false)} />
    )}
    </>
  )
}
