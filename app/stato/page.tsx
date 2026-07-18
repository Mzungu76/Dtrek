'use client'
import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { LineChart, Line, ResponsiveContainer } from 'recharts'
import { Activity, TrendingUp, Trophy, Flame, BarChart3, Loader2, Mountain } from 'lucide-react'
import Navbar from '@/components/Navbar'
import { getAllActivities, type ActivityMeta } from '@/lib/blobStore'
import { computeStreaks } from '@/lib/stats'
import { computeBadges } from '@/lib/badges'
import { computeTrainingLoad, activityStress, currentForm } from '@/lib/trainingLoad'
import { computeRecoveryScore } from '@/lib/bioMetrics'
import { pickRecoveryPhrase } from '@/lib/recoveryPhrases'
import { pickFormaPhrase } from '@/lib/formaPhrases'
import { pickStreakPhrase } from '@/lib/streakPhrases'
import { pickVolumePhrase } from '@/lib/volumePhrases'

// Centro di Controllo — sintesi di statistiche e badge in home, con AI riservata
// solo ai cambi di fascia (non ancora cablata: qui gira sempre il banco di frasi
// pre-scritte per Recovery, Stato forma, Streak e Volume settimanale). Vedi
// lib/recoveryPhrases.ts, lib/formaPhrases.ts, lib/streakPhrases.ts e
// lib/volumePhrases.ts per il meccanismo di rotazione/bucket di ciascuna.
export default function StatoPage() {
  const [activities, setActivities] = useState<ActivityMeta[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getAllActivities().then(setActivities).finally(() => setLoading(false))
  }, [])

  const streaks = useMemo(() => computeStreaks(activities), [activities])
  const badges  = useMemo(() => computeBadges(activities, streaks), [activities, streaks])

  const trainingLoadData = useMemo(() => {
    const events = activities.map(a => ({
      date:   format(new Date(a.startTime), 'yyyy-MM-dd'),
      stress: activityStress(a.distanceMeters, a.elevationGain, a.totalTimeSeconds),
    }))
    return computeTrainingLoad(events, 90)
  }, [activities])

  const latestLoad = trainingLoadData.length > 0 ? trainingLoadData[trainingLoadData.length - 1] : null
  const tsb = latestLoad?.tsb ?? 0

  const recovery = useMemo(() => computeRecoveryScore(tsb), [tsb])
  const forma    = useMemo(() => currentForm(tsb), [tsb])
  const recoveryPhrase = useMemo(
    () => pickRecoveryPhrase(recovery.label, recovery.suggestion),
    [recovery],
  )
  const formaPhrase = useMemo(
    () => pickFormaPhrase(forma.label, forma.description),
    [forma],
  )
  const streakPhrase = useMemo(
    () => pickStreakPhrase(streaks.currentWeeks),
    [streaks.currentWeeks],
  )

  const nearestBadge = useMemo(() => {
    const locked = badges.filter(b => !b.unlocked && typeof b.progressPct === 'number')
    if (!locked.length) return null
    return locked.reduce((best, b) => (b.progressPct! > best.progressPct! ? b : best))
  }, [badges])

  const weeklyVolume = useMemo(() => {
    const out: { week: string; km: number }[] = []
    for (let i = 7; i >= 0; i--) {
      const end   = new Date(); end.setDate(end.getDate() - i * 7)
      const start = new Date(end); start.setDate(start.getDate() - 6)
      const wActs = activities.filter(a => { const d = new Date(a.startTime); return d >= start && d <= end })
      out.push({
        week: format(start, 'dd/MM'),
        km:   Math.round(wActs.reduce((s, a) => s + a.distanceMeters / 1000, 0) * 10) / 10,
      })
    }
    return out
  }, [activities])

  const currentWeekKm = weeklyVolume.length > 0 ? weeklyVolume[weeklyVolume.length - 1].km : 0

  // Confronto contro la media delle settimane precedenti (non contro la singola
  // settimana prima, troppo rumorosa) — nessuna frase se non c'è ancora storico.
  const volumePhrase = useMemo(() => {
    const previous = weeklyVolume.slice(0, -1)
    if (previous.length === 0) return null
    const avgPrev = previous.reduce((s, w) => s + w.km, 0) / previous.length
    if (avgPrev <= 0) return null
    const deltaPct = ((currentWeekKm - avgPrev) / avgPrev) * 100
    return pickVolumePhrase(deltaPct)
  }, [weeklyVolume, currentWeekKm])

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50">
        <Navbar />
        <main className="max-w-6xl mx-auto px-4 py-24 flex items-center justify-center text-stone-400 gap-3">
          <Loader2 className="w-6 h-6 animate-spin" /><span>Caricamento dati…</span>
        </main>
      </div>
    )
  }

  if (activities.length === 0) {
    return (
      <div className="min-h-screen bg-stone-50">
        <Navbar />
        <main className="max-w-6xl mx-auto px-4 py-24 text-center text-stone-400">
          <Mountain className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">Nessuna escursione ancora</p>
          <p className="text-sm mt-1">Carica la tua prima uscita per vedere il tuo stato qui.</p>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-stone-50 pb-24 md:pb-8">
      <Navbar />
      <main className="max-w-6xl mx-auto px-3 sm:px-4 py-5 sm:py-8 fade-up">
        <div className="mb-5 sm:mb-6">
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-forest-900">Il tuo stato</h1>
          <p className="text-stone-400 text-sm mt-1">Statistiche e traguardi, in un unico posto</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          {/* Recovery */}
          <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
            <p className="text-xs text-stone-400 uppercase tracking-wide font-medium mb-2 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5" /> Recovery
            </p>
            <div className="flex items-end gap-2 mb-1">
              <p className="text-3xl font-bold font-display" style={{ color: recovery.color }}>{recovery.score}</p>
              <p className="text-stone-400 text-sm mb-1">/100 · {recovery.label}</p>
            </div>
            <p className="text-xs text-stone-500 mt-2 italic leading-relaxed">{recoveryPhrase}</p>
          </div>

          {/* Stato forma */}
          <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
            <p className="text-xs text-stone-400 uppercase tracking-wide font-medium mb-2 flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" /> Stato forma
            </p>
            <p className="text-2xl font-bold mt-1" style={{ color: forma.color }}>{forma.label}</p>
            <p className="text-xs text-stone-500 mt-1 italic leading-relaxed">{formaPhrase}</p>
            {latestLoad && (
              <p className="text-xs text-stone-400 mt-2 font-mono">CTL {latestLoad.ctl.toFixed(1)} · ATL {latestLoad.atl.toFixed(1)}</p>
            )}
          </div>

          {/* Traguardo più vicino */}
          <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
            <p className="text-xs text-stone-400 uppercase tracking-wide font-medium mb-2 flex items-center gap-1.5">
              <Trophy className="w-3.5 h-3.5" /> Traguardo più vicino
            </p>
            {nearestBadge ? (
              <>
                <p className="text-sm font-semibold text-stone-800 mt-1">{nearestBadge.icon} {nearestBadge.name}</p>
                <div className="h-1.5 bg-stone-200 rounded-full overflow-hidden mt-2.5">
                  <div className="h-1.5 bg-amber-500 rounded-full" style={{ width: `${nearestBadge.progressPct}%` }} />
                </div>
                <p className="text-xs text-stone-500 mt-1.5">
                  {nearestBadge.progressCurrent?.toLocaleString('it')}{nearestBadge.progressUnit ? ` ${nearestBadge.progressUnit}` : ''}
                  {' / '}
                  {nearestBadge.progressTarget?.toLocaleString('it')}{nearestBadge.progressUnit ? ` ${nearestBadge.progressUnit}` : ''}
                  {` (${nearestBadge.progressPct}%)`}
                </p>
              </>
            ) : (
              <p className="text-sm text-stone-400 mt-1">Tutti i badge sbloccati — niente male.</p>
            )}
          </div>

          {/* Streak */}
          <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
            <p className="text-xs text-stone-400 uppercase tracking-wide font-medium mb-2 flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5" /> Streak
            </p>
            <p className="text-3xl font-bold font-display text-forest-700">{streaks.currentWeeks}</p>
            <p className="text-xs text-stone-500 mt-1">settimane di fila con almeno un&apos;uscita</p>
            <p className="text-xs text-stone-500 mt-2 italic leading-relaxed">{streakPhrase}</p>
          </div>
        </div>

        {/* Volume settimanale */}
        <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <p className="text-xs text-stone-400 uppercase tracking-wide font-medium flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5" /> Volume settimanale
            </p>
            <p className="text-sm font-semibold text-forest-700">{currentWeekKm} km questa settimana</p>
          </div>
          <div style={{ width: '100%', height: 48 }}>
            <ResponsiveContainer>
              <LineChart data={weeklyVolume}>
                <Line type="monotone" dataKey="km" stroke="#378d44" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {volumePhrase && (
            <p className="text-xs text-stone-500 mt-3 italic leading-relaxed">{volumePhrase}</p>
          )}
        </div>
      </main>
    </div>
  )
}
