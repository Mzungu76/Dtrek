// Statistiche complessive per il sito pubblico del Diario/della Raccolta — stesso calcolo di
// computeGlobalStats (lib/blobStore.ts), duplicato qui invece di importato perché blobStore.ts è
// un modulo lato client (IndexedDB, motore di sync) con effetti a livello di modulo che non vanno
// caricati in un componente server. Lavora su PublicDiaryEntry, non su ActivityMeta: meno campi
// disponibili (niente frequenza cardiaca o velocità media), ma sufficienti per "Anno per anno" e
// "Record personali".

import type { PublicDiaryEntry } from './sharePublicDiary'
import { metaHasHikingMetrics } from './metaTypes'

export interface PublicDiaryYearStats {
  year:     number
  count:    number
  km:       number
  elevGain: number
}

export interface PublicDiaryStats {
  totalDistanceKm:    number
  totalElevationGain: number
  totalTimeSeconds:   number
  totalCalories:      number
  longestKm:          number
  longestTitle:       string | null
  highestAlt:         number
  highestTitle:       string | null
  maxElevationGain:   number
  years:              PublicDiaryYearStats[]
}

// Cifre, record e totali contano solo i Reportage con metriche escursionistiche: un Borgo/Città o
// un Sito ha distanza/dislivello a zero (o non sono cammino), e sommarli falserebbe "la più
// lunga", "la più alta" e i chilometri totali. Il conteggio per anno resta su tutti i Reportage.
export function computePublicDiaryStats(allEntries: PublicDiaryEntry[]): PublicDiaryStats {
  const entries = allEntries.filter(e => metaHasHikingMetrics(e.metaType))
  const longest = entries.reduce<PublicDiaryEntry | null>((best, e) =>
    !best || e.distanceMeters > best.distanceMeters ? e : best, null)
  const highest = entries.reduce<PublicDiaryEntry | null>((best, e) =>
    (e.altitudeMax ?? -Infinity) > (best?.altitudeMax ?? -Infinity) ? e : best, null)

  const yearMap = new Map<number, PublicDiaryYearStats>()
  allEntries.forEach(e => {
    const year = new Date(e.startTime).getFullYear()
    const stats = yearMap.get(year) ?? { year, count: 0, km: 0, elevGain: 0 }
    stats.count++
    if (metaHasHikingMetrics(e.metaType)) {
      stats.km += e.distanceMeters / 1000
      stats.elevGain += e.elevationGain
    }
    yearMap.set(year, stats)
  })
  return {
    totalDistanceKm:    entries.reduce((s, e) => s + e.distanceMeters / 1000, 0),
    totalElevationGain: entries.reduce((s, e) => s + e.elevationGain, 0),
    totalTimeSeconds:   entries.reduce((s, e) => s + e.totalTimeSeconds, 0),
    totalCalories:      entries.reduce((s, e) => s + (e.calories ?? 0), 0),
    longestKm:          longest ? longest.distanceMeters / 1000 : 0,
    longestTitle:       longest?.title ?? null,
    highestAlt:         highest?.altitudeMax ?? 0,
    highestTitle:       highest?.altitudeMax != null ? highest.title : null,
    maxElevationGain:   entries.reduce((m, e) => Math.max(m, e.elevationGain), 0),
    years:              Array.from(yearMap.values()).sort((a, b) => a.year - b.year),
  }
}
