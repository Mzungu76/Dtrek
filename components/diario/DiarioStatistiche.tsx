import { Route, Mountain, Clock, Flame, Trophy, TrendingUp } from 'lucide-react'
import { computeGlobalStats, type ActivityMeta } from '@/lib/blobStore'
import { formatDuration } from '@/lib/tcxParser'
import { PageHeader, PillHeader } from './PageHeader'
import { StatCard } from './StatCard'
import { MonthBarChart } from './MonthBarChart'
import { GREEN, AMBER, BLUE, VIOLET, type StatsToggles } from './types'

export function DiarioStatistiche({ activities, toggles }: { activities: ActivityMeta[]; toggles: StatsToggles }) {
  const gs = computeGlobalStats(activities)

  const longestAct = activities.reduce<ActivityMeta | null>((best, a) =>
    !best || a.distanceMeters > best.distanceMeters ? a : best, null)
  const highestAct = activities.reduce<ActivityMeta | null>((best, a) =>
    !best || a.altitudeMax > best.altitudeMax ? a : best, null)
  const maxD = activities.reduce((m, a) => Math.max(m, a.elevationGain), 0)

  // ── Year-by-year breakdown ──────────────────────────────────────────────────
  const yearMap = new Map<number, { count: number; km: number; elevGain: number }>()
  activities.forEach(a => {
    const year = new Date(a.startTime).getFullYear()
    const entry = yearMap.get(year) ?? { count: 0, km: 0, elevGain: 0 }
    entry.count++
    entry.km += a.distanceMeters / 1000
    entry.elevGain += a.elevationGain
    yearMap.set(year, entry)
  })
  const years = Array.from(yearMap.entries()).sort((a, b) => a[0] - b[0])

  // ── Best month (across all years, by total km) ─────────────────────────────
  const MONTH_NAMES = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']
  const monthKm = Array(12).fill(0)
  activities.forEach(a => { monthKm[new Date(a.startTime).getMonth()] += a.distanceMeters / 1000 })
  const bestMonthIdx = monthKm.reduce((best, v, i) => v > monthKm[best] ? i : best, 0)
  const bestMonthLabel = monthKm[bestMonthIdx] > 0 ? MONTH_NAMES[bestMonthIdx] : null

  // ── Narrative paragraph (uses DEP for an evocative comparison) ─────────────
  const italyLengths = gs.totalDepKm / 1300
  const narrative = activities.length > 0
    ? `In ${years.length} ${years.length === 1 ? 'anno' : 'anni'} di escursioni hai percorso ${gs.totalDistanceKm.toFixed(0)} km e accumulato ${Math.round(gs.totalElevationGain).toLocaleString('it')} m di dislivello positivo — l'equivalente di ${(gs.totalElevationGain / 8849).toFixed(1)} volte l'altezza dell'Everest. ` +
      `Considerando lo sforzo in DEP, hai coperto una distanza equivalente in piano di ${gs.totalDepKm.toFixed(0)} km: come attraversare l'Italia da nord a sud ${italyLengths.toFixed(1)} ${italyLengths === 1 ? 'volta' : 'volte'}. ` +
      (bestMonthLabel ? `Il tuo mese più attivo è stato ${bestMonthLabel}.` : '')
    : ''

  return (
    <div className="diario-page" style={{
      width: 794, minHeight: 1123, background: 'white', margin: '24px auto',
      padding: '72px 64px', boxShadow: '0 8px 56px rgba(0,0,0,0.28)',
    }}>
      <PageHeader label="Statistiche" title="I tuoi numeri" />

      {narrative && (
        <p className="pdf-block" style={{
          fontFamily: 'Lora, serif', fontSize: 13, lineHeight: 1.8, color: '#4d4740',
          margin: '-20px 0 32px', fontStyle: 'italic',
        }}>
          {narrative}
        </p>
      )}

      {years.length > 1 && (
        <div className="pdf-block" style={{ marginBottom: 32 }}>
          <PillHeader label="Anno per anno" accent={GREEN} />
          <table style={{ width: '100%', fontSize: 11, fontFamily: 'Arial, sans-serif', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: '#9ca3af', textTransform: 'uppercase', fontSize: 9, letterSpacing: 1 }}>
                <th style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid #e5e7eb' }}>Anno</th>
                <th style={{ textAlign: 'right', padding: '4px 8px', borderBottom: '1px solid #e5e7eb' }}>Escursioni</th>
                <th style={{ textAlign: 'right', padding: '4px 8px', borderBottom: '1px solid #e5e7eb' }}>Distanza</th>
                <th style={{ textAlign: 'right', padding: '4px 8px', borderBottom: '1px solid #e5e7eb' }}>Dislivello</th>
              </tr>
            </thead>
            <tbody>
              {years.map(([year, d]) => (
                <tr key={year} style={{ color: '#374151' }}>
                  <td style={{ padding: '6px 8px', borderBottom: '1px solid #f3f4f6', fontWeight: 700 }}>{year}</td>
                  <td style={{ padding: '6px 8px', borderBottom: '1px solid #f3f4f6', textAlign: 'right' }}>{d.count}</td>
                  <td style={{ padding: '6px 8px', borderBottom: '1px solid #f3f4f6', textAlign: 'right' }}>{d.km.toFixed(0)} km</td>
                  <td style={{ padding: '6px 8px', borderBottom: '1px solid #f3f4f6', textAlign: 'right' }}>{Math.round(d.elevGain).toLocaleString('it')} m</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {toggles.totali && (
        <div className="pdf-block" style={{ marginBottom: 32 }}>
          <PillHeader label="Totali" accent={GREEN} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <StatCard value={`${gs.totalDistanceKm.toFixed(0)} km`} label="Percorsi" icon={<Route style={{ color: GREEN.iconColor, width: 13, height: 13 }} />} accent={GREEN} />
            <StatCard value={`${gs.totalElevationGain.toFixed(0)} m`} label="Dislivello D+" icon={<Mountain style={{ color: GREEN.iconColor, width: 13, height: 13 }} />} accent={GREEN} />
            <StatCard value={formatDuration(gs.totalTimeSeconds)} label="In cammino" icon={<Clock style={{ color: GREEN.iconColor, width: 13, height: 13 }} />} accent={GREEN} />
            <StatCard value={`${gs.totalCalories.toFixed(0)}`} label="Calorie (kcal)" icon={<Flame style={{ color: GREEN.iconColor, width: 13, height: 13 }} />} accent={GREEN} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 12 }}>
            <StatCard value={`${gs.totalDepKm.toFixed(0)} km`} label="DEP totale" icon={<Route style={{ color: GREEN.iconColor, width: 13, height: 13 }} />} accent={GREEN} />
          </div>
        </div>
      )}

      {toggles.record && (
        <div className="pdf-block" style={{ marginBottom: 32 }}>
          <PillHeader label="Record personali" accent={AMBER} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <StatCard value={`${gs.longestKm.toFixed(1)} km`} label="Escursione più lunga" sub={longestAct?.title} icon={<Trophy style={{ color: AMBER.iconColor, width: 13, height: 13 }} />} accent={AMBER} />
            <StatCard value={`${gs.highestAlt} m`} label="Quota massima" sub={highestAct?.title} icon={<Mountain style={{ color: AMBER.iconColor, width: 13, height: 13 }} />} accent={AMBER} />
            <StatCard value={`${maxD.toFixed(0)} m D+`} label="Dislivello max" icon={<TrendingUp style={{ color: AMBER.iconColor, width: 13, height: 13 }} />} accent={AMBER} />
          </div>
        </div>
      )}

      {toggles.medie && activities.length > 0 && (
        <div className="pdf-block" style={{ marginBottom: 32 }}>
          <PillHeader label="Medie per uscita" accent={BLUE} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <StatCard value={`${(gs.totalDistanceKm / activities.length).toFixed(1)} km`} label="Distanza media" icon={<Route style={{ color: BLUE.iconColor, width: 13, height: 13 }} />} accent={BLUE} />
            <StatCard value={`${(gs.totalElevationGain / activities.length).toFixed(0)} m`} label="Dislivello medio" icon={<Mountain style={{ color: BLUE.iconColor, width: 13, height: 13 }} />} accent={BLUE} />
            <StatCard value={formatDuration(gs.totalTimeSeconds / activities.length)} label="Durata media" icon={<Clock style={{ color: BLUE.iconColor, width: 13, height: 13 }} />} accent={BLUE} />
          </div>
        </div>
      )}

      {toggles.andamento && (
        <div className="pdf-block">
          <PillHeader label="Andamento mensile" accent={VIOLET} />
          <div style={{ background: VIOLET.bg, borderRadius: 10, padding: '16px 20px', border: `1px solid ${VIOLET.border}` }}>
            <MonthBarChart activities={activities} />
          </div>
        </div>
      )}
    </div>
  )
}
