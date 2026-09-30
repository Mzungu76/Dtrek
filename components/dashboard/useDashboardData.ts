'use client'
import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { getAllActivities, computeGlobalStats, type ActivityMeta } from '@/lib/blobStore'
import { getAllPlanned, type PlannedHikeMeta } from '@/lib/plannedStore'
import { recoCardSummary, type RecoCardSummary } from '@/lib/routeBuilder/recoCardSummary'
import type { RecommendationCard } from '@/lib/routeBuilder/generateRecommendations'
import { useCtsUpdated } from '@/lib/sync/useCtsUpdated'
import { computeStreaks, getPersonalRecords } from '@/lib/stats'
import { computeBadges } from '@/lib/badges'
import { computeTrainingLoad, activityStress, currentForm } from '@/lib/trainingLoad'
import { computeRecoveryScore } from '@/lib/bioMetrics'
import { pickRecoveryPhrase } from '@/lib/recoveryPhrases'
import { pickFormaPhrase } from '@/lib/formaPhrases'
import { pickVolumePhrase } from '@/lib/volumePhrases'
import { pickStreakPhrase } from '@/lib/streakPhrases'
import { fetchForecastWeather } from '@/lib/weather'
import type { DiarySummary } from '@/app/api/diaries/route'
import type { CollectionSummary } from '@/app/api/collections/route'
import type { DashboardData, NextOuting } from './types'

const LOW_HISTORY_NOTE = 'Servono almeno 3 uscite per un quadro affidabile — continua a caricare le tue attività.'

/** Stessi calcoli già in uso nella vecchia Bacheca a galleria (recovery, forma, volume, streak,
 *  traguardi) più tre fonti nuove per i widget "Direzione C" del mockup: Prossima uscita (Meta
 *  pianificata più vicina, con meteo se ha lat/lon), Diario attivo (il Diario di default) e
 *  Raccolte pubblicate — calcolato una sola volta, condiviso da tutti i widget della pagina. */
export function useDashboardData(): { data: DashboardData; loading: boolean } {
  const [activities, setActivities] = useState<ActivityMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [nextOuting, setNextOuting] = useState<NextOuting | null>(null)
  const [nextOutingLoading, setNextOutingLoading] = useState(true)
  const [defaultDiary, setDefaultDiary] = useState<DiarySummary | null>(null)
  const [publishedCollections, setPublishedCollections] = useState<CollectionSummary[]>([])
  const [percorsiPerTe, setPercorsiPerTe] = useState<DashboardData['percorsiPerTe']>({ status: 'loading', count: 0, firstCard: null, firstCardRaw: null })
  const [plannedHikes, setPlannedHikes] = useState<PlannedHikeMeta[]>([])

  useEffect(() => {
    getAllActivities().then(setActivities).finally(() => setLoading(false))
  }, [])
  useCtsUpdated(() => { getAllActivities().then(setActivities) })
  useCtsUpdated(() => { getAllPlanned().then(list => setPlannedHikes(list.filter(h => !h.archivedAt))) })

  useEffect(() => {
    fetch('/api/diaries').then(r => r.ok ? r.json() : []).then((ds: DiarySummary[]) => {
      setDefaultDiary(ds.find(d => d.isDefault && !d.archivedAt) ?? null)
    }).catch(() => {})
    fetch('/api/collections').then(r => r.ok ? r.json() : []).then((cs: CollectionSummary[]) => {
      setPublishedCollections(cs.filter(c => c.isPublished))
    }).catch(() => {})
    fetch('/api/percorsi-per-te?peek=1').then(r => r.ok ? r.json() : Promise.reject())
      .then(d => {
        const cards = (d.cards ?? []) as RecommendationCard[]
        const first = cards[0] ?? null
        setPercorsiPerTe({
          status: d.status, count: cards.length,
          firstCard: first ? recoCardSummary(first) : null,
          firstCardRaw: first,
        })
      })
      .catch(() => setPercorsiPerTe({ status: 'error', count: 0, firstCard: null, firstCardRaw: null }))
  }, [])

  // Prossima uscita: la Meta pianificata più vicina da oggi in poi, con meteo previsto se ha una
  // posizione nota — best-effort, mai bloccante (un errore di rete qui non deve rompere la scheda).
  useEffect(() => {
    let cancelled = false
    setNextOutingLoading(true)
    getAllPlanned().then(async list => {
      if (cancelled) return
      setPlannedHikes(list.filter(h => !h.archivedAt))
      const today = format(new Date(), 'yyyy-MM-dd')
      const upcoming = list
        .filter(h => h.plannedDate && h.plannedDate >= today && !h.archivedAt)
        .sort((a, b) => (a.plannedDate as string).localeCompare(b.plannedDate as string))
      const next = upcoming[0]
      if (!next) { setNextOuting(null); return }
      const base: NextOuting = {
        id: next.id, title: next.title, plannedDate: next.plannedDate as string,
        distanceMeters: next.distanceMeters, elevationGain: next.elevationGain,
      }
      if (next.latitude == null || next.longitude == null) { setNextOuting(base); return }
      try {
        const forecast = await fetchForecastWeather(next.latitude, next.longitude, 14)
        const day = forecast.find(d => d.date === next.plannedDate)
        if (cancelled) return
        setNextOuting({
          ...base,
          weather: day ? { tempMax: day.tempMax, tempMin: day.tempMin, weathercode: day.weathercode } : null,
        })
      } catch {
        if (!cancelled) setNextOuting({ ...base, weather: null })
      }
    }).catch(() => { if (!cancelled) setNextOuting(null) })
      .finally(() => { if (!cancelled) setNextOutingLoading(false) })
    return () => { cancelled = true }
  }, [])

  const streaks = useMemo(() => computeStreaks(activities), [activities])
  const badges  = useMemo(() => computeBadges(activities, streaks), [activities, streaks])
  const personalRecords = useMemo(() => getPersonalRecords(activities), [activities])
  const globalStats = useMemo(() => computeGlobalStats(activities), [activities])
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
  const recoveryPhrase = useMemo(() => pickRecoveryPhrase(recovery.label, recovery.suggestion), [recovery])
  const formaPhrase    = useMemo(() => pickFormaPhrase(forma.label, forma.description), [forma])
  const streakPhrase   = useMemo(() => pickStreakPhrase(streaks.currentWeeks), [streaks.currentWeeks])

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
  const volumePhrase = useMemo(() => {
    const previous = weeklyVolume.slice(0, -1)
    if (previous.length === 0) return null
    const avgPrev = previous.reduce((s, w) => s + w.km, 0) / previous.length
    if (avgPrev <= 0) return null
    return pickVolumePhrase(((currentWeekKm - avgPrev) / avgPrev) * 100)
  }, [weeklyVolume, currentWeekKm])

  const data: DashboardData = {
    activities, hasEnoughHistory, lowHistoryNote: LOW_HISTORY_NOTE,
    streaks, badges, nearestBadge, badgeIsClose,
    globalStats,
    trainingLoadData, recovery, forma, recoveryPhrase, formaPhrase,
    weeklyVolume, currentWeekKm, volumePhrase,
    streakPhrase,
    nextOuting, nextOutingLoading,
    defaultDiary, publishedCollections,
    percorsiPerTe,
    plannedHikes,
  }

  return { data, loading }
}
