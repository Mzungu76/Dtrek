// Shared batch-recompute logic for app/profilo/page.tsx's "ricalcola" buttons (one per
// score type + a master button). CTS spans activities + planned hikes (full trackPoints
// needed for TEI); Safety only ever applies to planned hikes and only needs the lightweight
// PlannedHikeMeta already returned by getAllPlanned() — no per-item fetch.
import { getAllPlanned, getPlannedById, updatePlannedMeta } from '@/lib/plannedStore'
import { getAllActivities, getActivityById, updateActivityMeta } from '@/lib/blobStore'
import { getCtsFallback } from '@/lib/trailScore'
import { computeCtsCore } from '@/lib/computeCtsForHike'
import { refreshTsForHike } from '@/lib/computeTsForHike'
import { computeBbox, minDistToTrack } from '@/lib/geoUtils'
import { type PoiItem, fetchTerrainContext } from '@/lib/overpass'
import { computeSafetyScore, refineSafetyWithTerrainSignals, type WildlifeRisk } from '@/lib/safetyScore'
import { fetchWildlifeRiskFromGbif } from '@/lib/wildlifeRiskFromGbif'
import { getUserSettingsCached } from '@/lib/sync/userSettingsStore'
import { effectiveHikeMetrics } from '@/lib/routeMode'

export async function batchUpdate<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  chunkSize = 5,
  delayMs = 200,
): Promise<{ ok: number; failed: number }> {
  let ok = 0, failed = 0
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize)
    await Promise.allSettled(chunk.map(async item => {
      try { await fn(item); ok++ }
      catch { failed++ }
    }))
    if (i + chunkSize < items.length) await new Promise(r => setTimeout(r, delayMs))
  }
  return { ok, failed }
}

export async function fetchPoisForGps(gps: [number, number][]): Promise<PoiItem[]> {
  if (gps.length < 2) return []
  const bbox = computeBbox(gps)
  try {
    const res = await fetch(`/api/pois?bbox=${bbox}`)
    if (!res.ok) return []
    const all: PoiItem[] = await res.json()
    return all.filter(p => minDistToTrack(p.lat, p.lon, gps) <= 300)
  } catch { return [] }
}

export interface CtsPrefs {
  hrRest: number
  hrMax: number | null
  prefSforzo: number
  prefDurata: number
}

/** Full from-scratch CTS recompute (TEI → BeautyScore → TrailScore, via lib/computeCtsForHike.ts's
 *  shared computeCtsCore — see its doc comment) for every activity and planned hike. Returns the
 *  number of CTS recomputed. */
export async function recalcAllCts(prefs: CtsPrefs, onProgress?: (text: string) => void): Promise<number> {
  let computed = 0
  const apiPrefs = await getUserSettingsCached()
  const [activities, hikes] = await Promise.all([getAllActivities(), getAllPlanned()])
  const total = activities.length + hikes.length
  const corePrefs = {
    prefSforzo: apiPrefs.prefSforzo ?? prefs.prefSforzo,
    prefDurata: apiPrefs.prefDurata ?? prefs.prefDurata,
    hrRest:     apiPrefs.hrRest ?? prefs.hrRest,
    hrMax:      apiPrefs.hrMax ?? prefs.hrMax ?? undefined,
  }

  let idx = 0
  await batchUpdate(activities, async meta => {
    onProgress?.(`${++idx}/${total} — ${meta.title ?? 'Escursione'}`)
    const full = await getActivityById(meta.id)
    if (!full) return
    const core = await computeCtsCore(full, { prefs: corePrefs })
    if (!core) return
    const finalTs = core.poisCount === 0 ? getCtsFallback(activities) : core.ts
    await updateActivityMeta(full.id, {
      linkedBeautyScore: core.beautyScore, trailScore: finalTs,
      trailScoreConfidence: core.poisCount === 0 ? 'default' : core.confidence,
      trailScoreComputedAt: new Date().toISOString(),
    })
    computed++
  })

  await batchUpdate(hikes, async meta => {
    onProgress?.(`${++idx}/${total} — ${meta.title ?? 'Pianificata'}`)
    const full = await getPlannedById(meta.id)
    if (!full) return
    const core = await computeCtsCore(full, { prefs: corePrefs })
    if (!core) return
    const finalTs = core.poisCount === 0 ? getCtsFallback(activities) : core.ts
    await updatePlannedMeta(full.id, {
      cachedBeautyScore: core.beautyScore, cachedTrailScore: finalTs,
      cachedTrailScoreConfidence: core.poisCount === 0 ? 'default' : core.confidence,
      cachedScoresComputedAt: new Date().toISOString(),
    })
    refreshTsForHike(full.id).catch(() => {})
    computed++
  })

  return computed
}

/** Recomputes Safety Score (pure/synchronous) for every planned hike, from the lightweight meta list. */
export async function recalcAllSafety(onProgress?: (text: string) => void): Promise<number> {
  const hikes = await getAllPlanned()
  let idx = 0
  const { ok } = await batchUpdate(hikes, async meta => {
    onProgress?.(`${++idx}/${hikes.length} — ${meta.title ?? 'Pianificata'}`)
    const deadline = new Promise<null>(r => setTimeout(() => r(null), 15000))

    let gbifWildlifeRisks: WildlifeRisk[] = []
    let guardianDogRisk: { present: boolean } | undefined
    let sacScale: string | undefined
    const poly = meta.routePolyline
    if (poly && poly.length >= 2) {
      const bbox = computeBbox(poly, 0.005) // minLat,minLon,maxLat,maxLon
      const [minLat, minLon, maxLat, maxLon] = bbox.split(',').map(Number)
      const animalsBbox = `${minLat},${maxLat},${minLon},${maxLon}` // /api/animals expects minLat,maxLat,minLon,maxLon
      const month = meta.plannedDate ? new Date(meta.plannedDate).getMonth() + 1 : new Date().getMonth() + 1

      const [gbifResult, guardianResult, terrainResult] = await Promise.allSettled([
        Promise.race([fetchWildlifeRiskFromGbif(animalsBbox, month), deadline]),
        Promise.race([
          fetch(`/api/trails/guardian-dogs?bbox=${encodeURIComponent(bbox)}`).then(r => r.json()) as Promise<{ present: boolean }>,
          deadline,
        ]),
        // Scala SAC via Overpass — non rate-limited come il DTM, stesso trattamento best-effort.
        Promise.race([fetchTerrainContext(poly), deadline]),
      ])
      if (gbifResult.status === 'fulfilled' && gbifResult.value) gbifWildlifeRisks = gbifResult.value
      if (guardianResult.status === 'fulfilled' && guardianResult.value) guardianDogRisk = guardianResult.value
      if (terrainResult.status === 'fulfilled' && terrainResult.value) sacScale = terrainResult.value.sacScale
    }

    // Cifre effettive: un andata e ritorno dichiarato vale il doppio (lib/routeMode.ts), esattamente
    // come in computeSafetyForHike — le due strade non devono dare risultati diversi.
    const effective = effectiveHikeMetrics(meta, meta.routeMode)
    let safety = computeSafetyScore({
      distanceMeters: effective.distanceMeters,
      elevationGain: effective.elevationGain,
      elevationLoss: effective.elevationLoss,
      altitudeMax: meta.altitudeMax,
      altitudeMin: meta.altitudeMin,
      estimatedTimeSeconds: effective.estimatedTimeSeconds,
      routePolyline: meta.routePolyline,
      plannedDate: meta.plannedDate,
      gbifWildlifeRisks,
      guardianDogRisk,
    })
    // meta.dtmProfile è già disponibile senza fetch aggiuntiva (PlannedHikeMeta lo include, vedi
    // lib/plannedStore.ts) — undefined solo se la Guida non è mai stata aperta per questa hike.
    safety = refineSafetyWithTerrainSignals(safety, { maxSlopeDeg: meta.dtmProfile?.maxSlopeDeg ?? undefined, sacScale })
    await updatePlannedMeta(meta.id, { cachedSafetyScore: safety, cachedSafetyComputedAt: new Date().toISOString() })
    refreshTsForHike(meta.id).catch(() => {})
  })
  return ok
}
