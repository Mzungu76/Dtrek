// Shared batch-recompute logic for app/profilo/page.tsx's "ricalcola" buttons (one per
// score type + a master button). CTS spans activities + planned hikes (full trackPoints
// needed for TEI); SI/Safety/Sentinel2 only ever apply to planned hikes and only need the
// lightweight PlannedHikeMeta already returned by getAllPlanned() — no per-item fetch.
import { getAllPlanned, getPlannedById, updatePlannedMeta } from '@/lib/plannedStore'
import { getAllActivities, getActivityById, updateActivityMeta } from '@/lib/blobStore'
import { getCtsFallback } from '@/lib/trailScore'
import { computeCtsCore } from '@/lib/computeCtsForHike'
import { refreshTsForHike } from '@/lib/computeTsForHike'
import { computeBbox, minDistToTrack } from '@/lib/geoUtils'
import { type PoiItem } from '@/lib/overpass'
import { computeSafetyScore, type WildlifeRisk } from '@/lib/safetyScore'
import { fetchWildlifeRiskFromGbif } from '@/lib/wildlifeRiskFromGbif'
import { getUserSettingsCached } from '@/lib/sync/userSettingsStore'

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
    await updatePlannedMeta(meta.id, { cachedSafetyScore: safety, cachedSafetyComputedAt: new Date().toISOString() })
    refreshTsForHike(meta.id).catch(() => {})
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

/** Forces a CL recompute for every planned hike that has either an OSM match or a polyline.
 *  bypass_cooldown=1 skips the 24h anti-mash cooldown meant for the per-hike "Aggiorna CL"
 *  button — legitimate here since this is itself the explicit, consciously-triggered bulk
 *  action (see the comment on bypassCooldown in lib/cl/computeCL.ts). */
// chunkSize/delayMs più bassi del default di batchUpdate (5/200ms): ogni CL forzato con force=1
// riattiva ANCHE i collector "static" (OSM tags + densità), entrambi via Overpass (vedi
// lib/overpassTrails.ts) — con 5 sentieri in parallelo, ciascuno dei quali corre già su 3 mirror
// Overpass contemporaneamente, un ricalcolo massivo generava fino a ~30 richieste concorrenti agli
// stessi mirror pubblici, che rispondevano 429/504 in blocco. computeCL non fa distinzione tra
// "nessuna penalità" e "il collector è andato in timeout" (torna comunque un punteggio, solo da
// segnali neutri) — il ricalcolo massivo appariva quindi "completato" ma senza che nulla fosse
// davvero stato ricalcolato. Vedi anche il retry aggiunto a fetchOverpass, che coper questo caso
// anche per le chiamate singole (non solo il batch).
const EXTERNAL_API_CHUNK_SIZE = 2
const EXTERNAL_API_DELAY_MS = 1500

export async function recalcAllCL(onProgress?: (text: string) => void): Promise<{ ok: number; rateLimited: number; failed: number }> {
  const hikes = await getAllPlanned()
  let ok = 0, rateLimited = 0, failed = 0
  let idx = 0
  const eligible = hikes.filter(h => clSentinelQuery(h) != null)
  await batchUpdate(eligible, async meta => {
    onProgress?.(`${++idx}/${eligible.length} — ${meta.title ?? 'Pianificata'}`)
    const qs = clSentinelQuery(meta)
    if (!qs) return
    const res = await fetch(`/api/trails/cl?${qs}&force=1&bypass_cooldown=1`)
    if (res.status === 429) { rateLimited++; return }
    if (!res.ok) { failed++; return }
    ok++
  }, EXTERNAL_API_CHUNK_SIZE, EXTERNAL_API_DELAY_MS)
  return { ok, rateLimited, failed }
}

/** Forces an Ombra&Acqua recompute (server-side, bypasses the 30-day TTL cache) for every planned
 *  hike that has either an OSM match or a polyline — and, when it lands, refreshes the Trail
 *  Score v2 aggregate (lib/computeTsForHike.ts) that depends on it. */
export async function recalcAllSentinel2(onProgress?: (text: string) => void): Promise<{ ok: number; failed: number }> {
  const hikes = await getAllPlanned()
  let idx = 0
  let ok = 0
  let failed = 0
  const eligible = hikes.filter(h => clSentinelQuery(h) != null)
  await batchUpdate(eligible, async meta => {
    onProgress?.(`${++idx}/${eligible.length} — ${meta.title ?? 'Pianificata'}`)
    const qs = clSentinelQuery(meta)
    if (!qs) return
    try {
      const res = await fetch(`/api/trails/sentinel2?${qs}&force=1`)
      if (!res.ok) { failed++; return }
      const data = await res.json().catch(() => null) as { available?: boolean } | null
      // La route risponde 200 anche quando il calcolo interno è fallito silenziosamente (Overpass
      // irraggiungibile, nessuna geometria…) — vedi runShadeWaterPipeline in
      // lib/shadeWater/computeShadeWater.ts, che intercetta l'errore e torna { available: false }
      // invece di propagarlo. Contare questi come "ok" solo perché l'HTTP status è 200 nascondeva
      // un ricalcolo che, di fatto, non aveva prodotto nulla di nuovo — da qui la percezione che il
      // pulsante "non facesse niente".
      if (data?.available) { ok++; refreshTsForHike(meta.id).catch(() => {}) }
      else failed++
    } catch { failed++ }
  }, EXTERNAL_API_CHUNK_SIZE, EXTERNAL_API_DELAY_MS)
  return { ok, failed }
}
