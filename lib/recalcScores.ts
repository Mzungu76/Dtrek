// Shared batch-recompute logic for app/profilo/page.tsx's "ricalcola" buttons (one per
// score type + a master button). CTS spans activities + planned hikes (full trackPoints
// needed for TEI); SI/Safety/Sentinel2 only ever apply to planned hikes and only need the
// lightweight PlannedHikeMeta already returned by getAllPlanned() — no per-item fetch.
import { getAllPlanned, getPlannedById, updatePlannedMeta } from '@/lib/plannedStore'
import { getAllActivities, getActivityById, updateActivityMeta } from '@/lib/blobStore'
import { computeTrailScore, getCtsFallback, type CtsConfidence } from '@/lib/trailScore'
import { type BeautyScore } from '@/lib/beautyScore'
import { computeTEI, teiToBeautyScore, type OsmTeiData } from '@/lib/tei'
import type { TrailDtmProfile } from '@/lib/dtm/trailDtmProfile'
import type { TrailTerrainProfile } from '@/lib/terrain/trailTerrainProfile'
import { checkProtectedArea } from '@/lib/natura2000/checkProtectedArea'
import { type PoiItem } from '@/lib/overpass'
import { computeBbox, minDistToTrack } from '@/lib/geoUtils'
import { computeSafetyScore, type WildlifeRisk } from '@/lib/safetyScore'
import { fetchWildlifeRiskFromGbif } from '@/lib/wildlifeRiskFromGbif'

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

/** Full from-scratch CTS recompute (TEI → BeautyScore → TrailScore) for every activity and planned hike. Returns the number of CTS recomputed. */
export async function recalcAllCts(prefs: CtsPrefs, onProgress?: (text: string) => void): Promise<number> {
  let computed = 0
  const apiPrefs = await fetch('/api/user-settings').then(r => r.json()).catch(() => ({}))
  const [activities, hikes] = await Promise.all([getAllActivities(), getAllPlanned()])
  const total = activities.length + hikes.length

  let idx = 0
  await batchUpdate(activities, async meta => {
    onProgress?.(`${++idx}/${total} — ${meta.title ?? 'Escursione'}`)
    const full = await getActivityById(meta.id)
    if (!full) return
    const gps = (full.trackPoints ?? [])
      .filter(p => p.lat && p.lon)
      .map(p => [p.lat!, p.lon!] as [number, number])

    const deadline = new Promise<null>(r => setTimeout(() => r(null), 25000))
    const bbox = computeBbox(gps)
    const [pois, osmData, dtmProfile, terrainProfile, inProtectedArea] = await Promise.all([
      Promise.race([fetchPoisForGps(gps), deadline]).then(r => r ?? []) as Promise<PoiItem[]>,
      Promise.race([
        fetch(`/api/tei-overpass?bbox=${bbox}`).then(r => r.json()) as Promise<OsmTeiData>,
        deadline,
      ]).then(r => r ?? undefined).catch(() => undefined),
      Promise.race([
        fetch(`/api/tei-dtm?track=${encodeURIComponent(JSON.stringify(gps))}`).then(r => r.json()) as Promise<TrailDtmProfile>,
        deadline,
      ]).then(r => r ?? undefined).catch(() => undefined),
      Promise.race([
        fetch(`/api/tei-terrain?track=${encodeURIComponent(JSON.stringify(gps))}`).then(r => r.json()) as Promise<TrailTerrainProfile>,
        deadline,
      ]).then(r => r ?? undefined).catch(() => undefined),
      Promise.race([
        checkProtectedArea(gps).then(r => r.inProtectedArea),
        deadline,
      ]).then(r => r ?? undefined).catch(() => undefined),
    ])

    const elevProfile = (full.trackPoints ?? [])
      .filter(p => p.lat && p.lon)
      .map(p => p.altitudeMeters ?? 0)

    const tei = computeTEI({
      track: gps,
      elevGain: full.elevationGain,
      distanceMeters: full.distanceMeters,
      altitudeMax: full.altitudeMax,
      elevProfile,
      pois,
      osmData,
      dtmProfile,
      terrainProfile,
      inProtectedArea,
    })
    const bs = teiToBeautyScore(tei)
    const confidence: CtsConfidence = pois.length === 0 ? 'default' : tei.confidence

    let finalTs: number
    if (pois.length === 0) {
      finalTs = getCtsFallback(activities)
    } else {
      const { ts } = computeTrailScore(bs, {
        distanceMeters: full.distanceMeters,
        elevationGain:  full.elevationGain,
        elevationLoss:  full.elevationLoss ?? 0,
        altitudeMax:    full.altitudeMax,
        avgHeartRate:   full.avgHeartRate,
        prefSforzo:     apiPrefs.prefSforzo ?? prefs.prefSforzo,
        prefDurata:     apiPrefs.prefDurata ?? prefs.prefDurata,
        hrRest:         apiPrefs.hrRest ?? prefs.hrRest,
        hrMax:          apiPrefs.hrMax ?? prefs.hrMax ?? undefined,
        avgSlopeDeg:    dtmProfile?.avgSlopeDeg ?? undefined,
      })
      finalTs = confidence === 'estimated' ? Math.round(ts * 0.9) : ts
    }
    await updateActivityMeta(full.id, { linkedBeautyScore: bs, trailScore: finalTs, trailScoreConfidence: confidence })
    computed++
  })

  await batchUpdate(hikes, async meta => {
    onProgress?.(`${++idx}/${total} — ${meta.title ?? 'Pianificata'}`)
    const full = await getPlannedById(meta.id)
    if (!full) return
    const gps = (full.trackPoints ?? [])
      .filter(p => p.lat && p.lon)
      .map(p => [p.lat!, p.lon!] as [number, number])

    const deadline = new Promise<null>(r => setTimeout(() => r(null), 25000))
    const bbox = computeBbox(gps)
    const [pois, osmData, dtmProfile, terrainProfile, inProtectedArea] = await Promise.all([
      Promise.race([fetchPoisForGps(gps), deadline]).then(r => r ?? []) as Promise<PoiItem[]>,
      Promise.race([
        fetch(`/api/tei-overpass?bbox=${bbox}`).then(r => r.json()) as Promise<OsmTeiData>,
        deadline,
      ]).then(r => r ?? undefined).catch(() => undefined),
      Promise.race([
        fetch(`/api/tei-dtm?track=${encodeURIComponent(JSON.stringify(gps))}`).then(r => r.json()) as Promise<TrailDtmProfile>,
        deadline,
      ]).then(r => r ?? undefined).catch(() => undefined),
      Promise.race([
        fetch(`/api/tei-terrain?track=${encodeURIComponent(JSON.stringify(gps))}`).then(r => r.json()) as Promise<TrailTerrainProfile>,
        deadline,
      ]).then(r => r ?? undefined).catch(() => undefined),
      Promise.race([
        checkProtectedArea(gps).then(r => r.inProtectedArea),
        deadline,
      ]).then(r => r ?? undefined).catch(() => undefined),
    ])

    const elevProfile = (full.trackPoints ?? [])
      .filter(p => p.lat && p.lon)
      .map(p => p.altitudeMeters ?? 0)

    const tei = computeTEI({
      track: gps,
      elevGain: full.elevationGain,
      distanceMeters: full.distanceMeters,
      altitudeMax: full.altitudeMax,
      elevProfile,
      pois,
      osmData,
      dtmProfile,
      terrainProfile,
      inProtectedArea,
    })
    const bs = teiToBeautyScore(tei)
    const confidence: CtsConfidence = pois.length === 0 ? 'default' : tei.confidence

    let finalTs: number
    if (pois.length === 0) {
      finalTs = getCtsFallback(activities)
    } else {
      const { ts } = computeTrailScore(bs, {
        distanceMeters: full.distanceMeters,
        elevationGain:  full.elevationGain,
        elevationLoss:  full.elevationLoss,
        altitudeMax:    full.altitudeMax,
        prefSforzo:     apiPrefs.prefSforzo ?? prefs.prefSforzo,
        prefDurata:     apiPrefs.prefDurata ?? prefs.prefDurata,
        hrRest:         apiPrefs.hrRest ?? prefs.hrRest,
        hrMax:          apiPrefs.hrMax ?? prefs.hrMax ?? undefined,
        avgSlopeDeg:    dtmProfile?.avgSlopeDeg ?? undefined,
      })
      finalTs = confidence === 'estimated' ? Math.round(ts * 0.9) : ts
    }
    await updatePlannedMeta(full.id, { cachedBeautyScore: bs, cachedTrailScore: finalTs, cachedTrailScoreConfidence: confidence })
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
    const poly = meta.routePolyline
    if (poly && poly.length >= 2) {
      const bbox = computeBbox(poly, 0.005) // minLat,minLon,maxLat,maxLon
      const [minLat, minLon, maxLat, maxLon] = bbox.split(',').map(Number)
      const animalsBbox = `${minLat},${maxLat},${minLon},${maxLon}` // /api/animals expects minLat,maxLat,minLon,maxLon
      const month = meta.plannedDate ? new Date(meta.plannedDate).getMonth() + 1 : new Date().getMonth() + 1

      const [gbifResult, guardianResult] = await Promise.allSettled([
        Promise.race([fetchWildlifeRiskFromGbif(animalsBbox, month), deadline]),
        Promise.race([
          fetch(`/api/trails/guardian-dogs?bbox=${encodeURIComponent(bbox)}`).then(r => r.json()) as Promise<{ present: boolean }>,
          deadline,
        ]),
      ])
      if (gbifResult.status === 'fulfilled' && gbifResult.value) gbifWildlifeRisks = gbifResult.value
      if (guardianResult.status === 'fulfilled' && guardianResult.value) guardianDogRisk = guardianResult.value
    }

    const safety = computeSafetyScore({
      distanceMeters: meta.distanceMeters,
      elevationGain: meta.elevationGain,
      elevationLoss: meta.elevationLoss,
      altitudeMax: meta.altitudeMax,
      altitudeMin: meta.altitudeMin,
      estimatedTimeSeconds: meta.estimatedTimeSeconds,
      routePolyline: meta.routePolyline,
      plannedDate: meta.plannedDate,
      gbifWildlifeRisks,
      guardianDogRisk,
    })
    await updatePlannedMeta(meta.id, { cachedSafetyScore: safety })
  })
  return ok
}

function clSentinelQuery(meta: { osmId?: number; routePolyline?: [number, number][]; id: string }): string | null {
  const plannedSuffix = `&planned_id=${encodeURIComponent(meta.id)}`
  if (meta.osmId != null) return `osm_relation_id=${meta.osmId}${plannedSuffix}`
  if (meta.routePolyline && meta.routePolyline.length >= 2) {
    return `polyline=${encodeURIComponent(JSON.stringify(meta.routePolyline))}${plannedSuffix}`
  }
  return null
}

/** Forces a CL recompute (server-side, 24h cooldown) for every planned hike that has either an OSM match or a polyline. */
export async function recalcAllCL(onProgress?: (text: string) => void): Promise<{ ok: number; rateLimited: number; failed: number }> {
  const hikes = await getAllPlanned()
  let ok = 0, rateLimited = 0, failed = 0
  let idx = 0
  const eligible = hikes.filter(h => clSentinelQuery(h) != null)
  await batchUpdate(eligible, async meta => {
    onProgress?.(`${++idx}/${eligible.length} — ${meta.title ?? 'Pianificata'}`)
    const qs = clSentinelQuery(meta)
    if (!qs) return
    const res = await fetch(`/api/trails/cl?${qs}&force=1`)
    if (res.status === 429) { rateLimited++; return }
    if (!res.ok) { failed++; return }
    ok++
  })
  return { ok, rateLimited, failed }
}

/** Forces a Sentinel-2 recompute (server-side, bypasses the 7-day/90-day TTL caches) for every planned hike that has either an OSM match or a polyline. */
export async function recalcAllSentinel2(onProgress?: (text: string) => void): Promise<{ ok: number; failed: number }> {
  const hikes = await getAllPlanned()
  let idx = 0
  const eligible = hikes.filter(h => clSentinelQuery(h) != null)
  const { ok, failed } = await batchUpdate(eligible, async meta => {
    onProgress?.(`${++idx}/${eligible.length} — ${meta.title ?? 'Pianificata'}`)
    const qs = clSentinelQuery(meta)
    if (!qs) return
    const res = await fetch(`/api/trails/sentinel2?${qs}&force=1`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  })
  return { ok, failed }
}
