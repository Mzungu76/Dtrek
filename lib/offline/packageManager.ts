import { runWithConcurrency } from '@/lib/promisePool'
import { lsGet, lsSet } from '@/lib/localStore'
import { fetchAndSaveTrailGraph, deleteTrailGraph } from '@/lib/navigation/trailGraphStore'
import { fetchAndSavePoiNotes, deletePoiNotes } from '@/lib/offline/poiNotesStore'
import { buildElevationProfile } from '@/lib/navigation/elevationProfile'
import { buildRouteInstructions } from '@/lib/navigation/routeInstructions'
import { detectRouteMoments } from '@/lib/navigation/routeMoments'
import type { TrackPoint } from '@/lib/tcxParser'
import {
  loadManifest, saveManifest, computeChecksum, deleteManifest,
  type OfflinePackageManifest, type OfflinePackageStatus,
} from './packageManifest'

// z13-16: enough to orient at trail scale without exploding storage — see
// the offline-tile licensing note in the plan (raster proxy only, not
// MapTiler vector tiles, until offline rights are confirmed for either).
const MIN_ZOOM = 13
const MAX_ZOOM = 16
const BBOX_BUFFER_DEG = 0.003 // ~300m
const DOWNLOAD_CONCURRENCY = 6
const TILE_CACHE_PREFIX = 'dtrek-tiles-'
const TILE_CACHE_VERSION = 1

function tileCacheName(hikeId: string): string {
  return `${TILE_CACHE_PREFIX}${hikeId}-v${TILE_CACHE_VERSION}`
}

interface TileCoord { z: number; x: number; y: number }

function lon2tileX(lon: number, z: number): number {
  return Math.floor((lon + 180) / 360 * Math.pow(2, z))
}
function lat2tileY(lat: number, z: number): number {
  const rad = lat * Math.PI / 180
  return Math.floor((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * Math.pow(2, z))
}

export function computeBboxFromTrack(track: [number, number][], bufferDeg = BBOX_BUFFER_DEG) {
  const lats = track.map((p) => p[0]), lons = track.map((p) => p[1])
  return {
    minLat: Math.min(...lats) - bufferDeg,
    maxLat: Math.max(...lats) + bufferDeg,
    minLon: Math.min(...lons) - bufferDeg,
    maxLon: Math.max(...lons) + bufferDeg,
  }
}

/** Same bbox shape as computeBboxFromTrack, but centered on a single point with a radius in km — for prefetchTilesAroundPoint below, where there's no route/track yet to derive a bbox from. */
function computeBboxFromPoint(lat: number, lon: number, radiusKm: number) {
  const latDeg = radiusKm / 111 // ~111km per degree of latitude, everywhere
  const lonDeg = radiusKm / (111 * Math.max(0.1, Math.cos(lat * Math.PI / 180))) // degrees of longitude shrink with latitude
  return { minLat: lat - latDeg, maxLat: lat + latDeg, minLon: lon - lonDeg, maxLon: lon + lonDeg }
}

function enumerateTiles(bbox: ReturnType<typeof computeBboxFromTrack>, minZoom = MIN_ZOOM, maxZoom = MAX_ZOOM): TileCoord[] {
  const tiles: TileCoord[] = []
  for (let z = minZoom; z <= maxZoom; z++) {
    const xMin = lon2tileX(bbox.minLon, z), xMax = lon2tileX(bbox.maxLon, z)
    const yMin = lat2tileY(bbox.maxLat, z), yMax = lat2tileY(bbox.minLat, z) // lat is inverted in tile Y
    for (let x = xMin; x <= xMax; x++) for (let y = yMin; y <= yMax; y++) tiles.push({ z, x, y })
  }
  return tiles
}

/** Rough size estimate shown to the user before they commit to a download (actual avg. observed for this raster proxy). */
export function estimatePackageSizeBytes(tileCount: number): number {
  return tileCount * 20_000 // ~20KB/tile average for the CartoDB/OSM raster proxy
}

export interface DownloadProgress {
  status: OfflinePackageStatus
  downloadedCount: number
  tileCount: number
}

export interface OfflinePackageHikeData {
  trackPoints?: TrackPoint[]
  cachedPois?: unknown[]
}

/**
 * Downloads a tile package for offline navigation, in a resumable
 * queued→downloading→(paused)→ready lifecycle: progress is persisted in the
 * manifest after every tile, so a browser closed mid-download resumes from
 * where it left off instead of restarting or being left silently corrupt.
 */
export async function downloadOfflinePackage(
  hikeId: string,
  routePolyline: [number, number][],
  hikeData?: OfflinePackageHikeData,
  onProgress?: (p: DownloadProgress) => void,
): Promise<void> {
  const bbox = computeBboxFromTrack(routePolyline)
  const allTiles = enumerateTiles(bbox)

  const existing = await loadManifest(hikeId)
  const isResume = existing != null && existing.status === 'paused' && existing.tileCount === allTiles.length

  // Non-null by construction: either isResume is true (so `existing` was truthy) or the branch
  // below creates one — asserted once here instead of scattering `!` through the rest of the function.
  const manifest: OfflinePackageManifest = isResume ? existing! : {
    hikeId, version: 1, status: 'queued', bbox, zoomLevels: Array.from({ length: MAX_ZOOM - MIN_ZOOM + 1 }, (_, i) => MIN_ZOOM + i),
    tileCount: allTiles.length, downloadedCount: 0, sizeBytes: 0, createdAt: Date.now(), updatedAt: Date.now(),
  }
  if (!isResume) {
    await saveManifest(manifest)
    // Fresh download: clear any earlier partial cache for this hike so we never mix versions/zoom ranges.
    if ('caches' in window) await caches.delete(tileCacheName(hikeId))
  }

  const doneKey = `offline-done-tiles:${hikeId}`
  const alreadyDone = new Set((await lsGet<string[]>(doneKey)) ?? [])
  const remaining = allTiles.filter((t) => !alreadyDone.has(`${t.z}/${t.x}/${t.y}`))

  manifest.status = 'downloading'
  await saveManifest(manifest)
  onProgress?.({ status: 'downloading', downloadedCount: manifest.downloadedCount, tileCount: manifest.tileCount })

  const cache = await caches.open(tileCacheName(hikeId))
  const tileSizes: number[] = []
  let totalBytes = manifest.sizeBytes

  await runWithConcurrency(remaining, DOWNLOAD_CONCURRENCY, async (tile) => {
    const url = `/api/tile?z=${tile.z}&x=${tile.x}&y=${tile.y}&style=voyager`
    const response = await fetch(url)
    if (!response.ok) throw new Error(`tile ${url} failed`)
    const blob = await response.blob()
    await cache.put(url, new Response(blob, { headers: response.headers }))
    return blob.size
  }, (tile, size) => {
    alreadyDone.add(`${tile.z}/${tile.x}/${tile.y}`)
    tileSizes.push(size)
    totalBytes += size
    manifest.downloadedCount = alreadyDone.size
    manifest.sizeBytes = totalBytes
    onProgress?.({ status: 'downloading', downloadedCount: manifest.downloadedCount, tileCount: manifest.tileCount })
  })

  await lsSet(doneKey, Array.from(alreadyDone))

  const complete = alreadyDone.size === allTiles.length
  manifest.status = complete ? 'ready' : 'paused'
  manifest.checksum = complete ? computeChecksum(tileSizes) : manifest.checksum

  // Best-effort: the trail graph (prerequisite for Map Matching/Escape Engine, see
  // lib/navigation/trailGraphStore.ts) is fetched from Overpass, a shared public service that can
  // be slow or unavailable — its failure must never fail an otherwise-complete tile package, so
  // this is deliberately not inside the tile download's own error path above.
  if (complete && !manifest.hasTrailGraph) {
    try {
      const { nodeCount } = await fetchAndSaveTrailGraph(hikeId, routePolyline)
      manifest.hasTrailGraph = true
      manifest.trailGraphNodeCount = nodeCount
    } catch {
      manifest.hasTrailGraph = false
    }
  }

  // Same best-effort treatment as the trail graph above — a live Supabase read (lib/poiNotes.ts's
  // shared per-POI cache, Guida IA), never allowed to fail an otherwise-complete tile package.
  if (complete && !manifest.hasPoiNotes) {
    try {
      const poiIds = ((hikeData?.cachedPois ?? []) as { id: number }[]).map((p) => p.id)
      manifest.poiNotesCount = await fetchAndSavePoiNotes(hikeId, poiIds)
      manifest.hasPoiNotes = true
    } catch {
      manifest.hasPoiNotes = false
    }
  }

  // Readiness signals for the rest of the package (roadmap Fase 6) — all pure functions of data
  // already on the cached PlannedHike record, nothing to fetch, just recorded here so a hiker can
  // be warned before losing signal if the *source* data (trackPoint altitude, cachedPois) turns
  // out to be thin or missing, instead of discovering it mid-hike. See packageManifest.ts's doc
  // comment on these fields for why this doesn't belong inside isManifestValid().
  if (complete) {
    const trackPoints = hikeData?.trackPoints ?? []
    const elevationProfile = buildElevationProfile(trackPoints)
    manifest.hasElevationProfile = elevationProfile.length > 1
    manifest.elevationProfilePointCount = elevationProfile.length

    const pois = hikeData?.cachedPois ?? []
    manifest.hasPois = pois.length > 0
    manifest.poiCount = pois.length

    const instructions = routePolyline.length > 1 ? buildRouteInstructions(routePolyline) : []
    const moments = detectRouteMoments(trackPoints)
    manifest.hasNavInstructions = instructions.length > 0
    manifest.navInstructionCount = instructions.length
    manifest.navMomentCount = moments.length
  }

  await saveManifest(manifest)
  onProgress?.({ status: manifest.status, downloadedCount: manifest.downloadedCount, tileCount: manifest.tileCount })
}

export async function pauseOfflinePackage(hikeId: string): Promise<void> {
  const manifest = await loadManifest(hikeId)
  if (manifest && manifest.status === 'downloading') {
    manifest.status = 'paused'
    await saveManifest(manifest)
  }
}

export async function deleteOfflinePackage(hikeId: string): Promise<void> {
  if ('caches' in window) await caches.delete(tileCacheName(hikeId))
  await lsSet(`offline-done-tiles:${hikeId}`, [])
  await deleteManifest(hikeId)
  await deleteTrailGraph(hikeId)
  await deletePoiNotes(hikeId)
}

const PREFETCH_RADIUS_KM = 3
const PREFETCH_MIN_ZOOM = 13
const PREFETCH_MAX_ZOOM = 15 // one level short of a full download package (MAX_ZOOM=16) — this is a
                              // best-effort safety net around a starting point with no known route,
                              // not a full offline package, so it stays cheaper by design.

/**
 * Best-effort "cache the area around here" prefetch for a hike with no planned route to build an
 * offline package from — the free-track/"Registra un percorso" flow (app/navigatore/traccia), which
 * previously had zero offline tile support: FreeTrackMap.tsx always hit the live /api/tile proxy
 * with nothing cached, so losing signal mid-recording in an area never visited before left the map
 * blank (see docs discussion on this — "in assenza di internet, la mappa non si visualizza").
 *
 * Deliberately does NOT write into a per-hike Cache Storage bucket the way downloadOfflinePackage()
 * does (there is no hikeId yet worth keying a package to at recording start): each fetch() below
 * goes through the app's own Service Worker (public/sw.js), whose fetch handler already caches any
 * successful /api/tile response into the shared 'dtrek-tiles-shared-v1' bucket and serves cache-first
 * from ANY tile bucket (shared or per-hike) afterwards — so this only needs to warm that shared cache
 * while there's still connectivity, typically at the trailhead before a hiker heads into a dead zone.
 * A no-op with no error surfaced if it fails (offline already, SW not yet controlling the page, etc.)
 * — this is a nice-to-have, never allowed to block or interrupt starting a recording.
 */
export async function prefetchTilesAroundPoint(lat: number, lon: number, radiusKm = PREFETCH_RADIUS_KM): Promise<void> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return
  if (navigator.onLine === false) return
  const bbox = computeBboxFromPoint(lat, lon, radiusKm)
  const tiles = enumerateTiles(bbox, PREFETCH_MIN_ZOOM, PREFETCH_MAX_ZOOM)
  await runWithConcurrency(
    tiles, DOWNLOAD_CONCURRENCY,
    (tile) => fetch(`/api/tile?z=${tile.z}&x=${tile.x}&y=${tile.y}&style=voyager`),
    () => {},
  )
}
