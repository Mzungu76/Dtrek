'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { LineChart, Line, ResponsiveContainer } from 'recharts'
import { Activity, TrendingUp, Trophy, Flame, BarChart3, Loader2, Mountain, Upload } from 'lucide-react'
import Navbar from '@/components/Navbar'
import RouteThumb from '@/components/RouteThumb'
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
// Hero ed empty state ricalcano lo stesso schema di app/resoconto/elenco/page.tsx
// (gradiente forest + bg-topography, cerchio icona + CTA) per coerenza visiva.
export default function StatoPage() {
  const [activities, setActivities] = useState<ActivityMeta[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getAllActivities().then(setActivities).finally(() => setLoading(false))
  }, [])

  const streaks = useMemo(() => computeStreaks(activities), [activities])
  const badges  = useMemo(() => computeBadges(activities, streaks), [activities, streaks])
  const hasEnoughHistory = activities.length >= 3

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
  const lowHistoryNote = 'Servono almeno 3 uscite per un quadro affidabile — continua a caricare le tue attività.'

  const nearestBadge = useMemo(() => {
    const locked = badges.filter(b => !b.unlocked && typeof b.progressPct === 'number')
    if (!locked.length) return null
    return locked.reduce((best, b) => (b.progressPct! > best.progressPct! ? b : best))
  }, [badges])
  const badgeIsClose = (nearestBadge?.progressPct ?? 0) >= 80

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

  const heroRoute = useMemo(() => {
    const sorted = [...activities].sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
    const withRoute = sorted.find(a => a.routePolyline && a.routePolyline.length > 1)
    return withRoute?.routePolyline ?? null
  }, [activities])

  const heroHeadline = loading
    ? 'Caricamento…'
    : activities.length === 0
      ? 'Pronto per la tua prima uscita'
      : recovery.label
  const heroSubtitle = loading
    ? ''
    : activities.length === 0
      ? 'Carica un\'escursione per iniziare a vedere qui il tuo stato.'
      : (hasEnoughHistory ? recoveryPhrase : lowHistoryNote)

  return (
    <div className="min-h-screen bg-stone-50 pb-24 md:pb-8">
      <Navbar />

      {/* ── Hero ── */}
      <div className="relative h-[220px] sm:h-[260px] overflow-hidden bg-gradient-to-br from-forest-800 to-forest-900 bg-topography">
        {heroRoute && (
          <div className="absolute inset-0 opacity-80">
            <RouteThumb polyline={heroRoute} color="#8cc894" strokeWidth={3} />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-forest-900/15 to-forest-900/85" />
        <div className="absolute left-6 right-6 bottom-6 sm:left-10 sm:right-10 sm:bottom-8">
          <div className="max-w-6xl mx-auto px-0 sm:px-4">
            <p className="text-forest-300 text-[13px] font-semibold mb-1.5">Stato</p>
            <h1 className="font-display text-[26px] sm:text-4xl font-bold text-white leading-tight">
              {heroHeadline}
            </h1>
            {heroSubtitle && (
              <p className="text-forest-100/90 text-sm mt-2 max-w-md leading-relaxed">{heroSubtitle}</p>
            )}
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-3 sm:px-4 py-5 sm:py-8 fade-up">
        {loading ? (
          <div className="flex items-center justify-center py-24 text-stone-400 gap-3">
            <Loader2 className="w-6 h-6 animate-spin" /><span>Caricamento dati…</span>
          </div>

        ) : activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-20 h-20 rounded-full bg-forest-50 border border-forest-200 flex items-center justify-center mb-6">
              <Mountain className="w-10 h-10 text-forest-400" />
            </div>
            <h2 className="font-display text-2xl font-semibold text-stone-700 mb-2">Il tuo stato comincia qui</h2>
            <p className="text-stone-400 text-sm max-w-sm mb-6 px-4">
              Recovery, stato forma, traguardi e streak si calcolano dalle escursioni che carichi —
              carica la prima per iniziare a vedere qualcosa qui.
            </p>
            <Link
              href="/upload?tab=activity"
              className="flex items-center gap-2 px-6 py-3 bg-forest-600 hover:bg-forest-700 text-white rounded-xl font-medium transition-colors"
            >
              <Upload className="w-5 h-5" /> Carica un&apos;escursione
            </Link>
          </div>

        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              {/* Recovery */}
              <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
                <div className="flex items-center gap-2.5 mb-3">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${recovery.color}1a` }}
                  >
                    <Activity className="w-4 h-4" style={{ color: recovery.color }} />
                  </div>
                  <p className="text-xs text-stone-400 uppercase tracking-wide font-medium">Recovery</p>
                </div>
                <div className="flex items-end gap-2 mb-1">
                  <p className="text-3xl font-bold font-display" style={{ color: recovery.color }}>{recovery.score}</p>
                  <p className="text-stone-400 text-sm mb-1">/100 · {recovery.label}</p>
                </div>
                <p className="text-xs text-stone-500 mt-2 italic leading-relaxed">
                  {hasEnoughHistory ? recoveryPhrase : lowHistoryNote}
                </p>
              </div>

              {/* Stato forma */}
              <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
                <div className="flex items-center gap-2.5 mb-3">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${forma.color}1a` }}
                  >
                    <TrendingUp className="w-4 h-4" style={{ color: forma.color }} />
                  </div>
                  <p className="text-xs text-stone-400 uppercase tracking-wide font-medium">Stato forma</p>
                </div>
                <p className="text-2xl font-bold mt-1" style={{ color: forma.color }}>{forma.label}</p>
                <p className="text-xs text-stone-500 mt-1 italic leading-relaxed">
                  {hasEnoughHistory ? formaPhrase : lowHistoryNote}
                </p>
                {latestLoad && hasEnoughHistory && (
                  <p className="text-xs text-stone-400 mt-2 font-mono">CTL {latestLoad.ctl.toFixed(1)} · ATL {latestLoad.atl.toFixed(1)}</p>
                )}
              </div>

              {/* Traguardo più vicino */}
              <div className={`rounded-2xl border p-5 shadow-sm transition-colors ${
                badgeIsClose ? 'bg-amber-50/60 border-amber-300' : 'bg-white border-stone-200'
              }`}>
                <div className="flex items-center gap-2.5 mb-3">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${badgeIsClose ? 'bg-amber-200' : 'bg-amber-100'}`}>
                    <Trophy className="w-4 h-4 text-amber-600" />
                  </div>
                  <p className="text-xs text-stone-400 uppercase tracking-wide font-medium">Traguardo più vicino</p>
                  {badgeIsClose && (
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-100 rounded-full px-2 py-0.5 ml-auto">quasi ce l&apos;hai</span>
                  )}
                </div>
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
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-9 h-9 rounded-full bg-terra-100 flex items-center justify-center shrink-0">
                    <Flame className="w-4 h-4 text-terra-600" />
                  </div>
                  <p className="text-xs text-stone-400 uppercase tracking-wide font-medium">Streak</p>
                </div>
                <p className="text-3xl font-bold font-display text-forest-700">{streaks.currentWeeks}</p>
                <p className="text-xs text-stone-500 mt-1">settimane di fila con almeno un&apos;uscita</p>
                <p className="text-xs text-stone-500 mt-2 italic leading-relaxed">{streakPhrase}</p>
              </div>
            </div>

            {/* Volume settimanale */}
            <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-forest-100 flex items-center justify-center shrink-0">
                    <BarChart3 className="w-4 h-4 text-forest-700" />
                  </div>
                  <p className="text-xs text-stone-400 uppercase tracking-wide font-medium">Volume settimanale</p>
                </div>
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
          </>
        )}
      </main>
    </div>
  )
}
