import { runWithConcurrency } from '@/lib/promisePool'
import { lsGet, lsSet } from '@/lib/localStore'
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

/**
 * Downloads a tile package for offline navigation, in a resumable
 * queued→downloading→(paused)→ready lifecycle: progress is persisted in the
 * manifest after every tile, so a browser closed mid-download resumes from
 * where it left off instead of restarting or being left silently corrupt.
 */
export async function downloadOfflinePackage(
  hikeId: string,
  routePolyline: [number, number][],
  onProgress?: (p: DownloadProgress) => void,
): Promise<void> {
  const bbox = computeBboxFromTrack(routePolyline)
  const allTiles = enumerateTiles(bbox)

  let manifest = await loadManifest(hikeId)
  const isResume = manifest && manifest.status === 'paused' && manifest.tileCount === allTiles.length
  if (!isResume) {
    manifest = {
      hikeId, version: 1, status: 'queued', bbox, zoomLevels: Array.from({ length: MAX_ZOOM - MIN_ZOOM + 1 }, (_, i) => MIN_ZOOM + i),
      tileCount: allTiles.length, downloadedCount: 0, sizeBytes: 0, createdAt: Date.now(), updatedAt: Date.now(),
    }
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
    manifest!.downloadedCount = alreadyDone.size
    manifest!.sizeBytes = totalBytes
    onProgress?.({ status: 'downloading', downloadedCount: manifest!.downloadedCount, tileCount: manifest!.tileCount })
  })

  await lsSet(doneKey, Array.from(alreadyDone))

  const complete = alreadyDone.size === allTiles.length
  manifest.status = complete ? 'ready' : 'paused'
  manifest.checksum = complete ? computeChecksum(tileSizes) : manifest.checksum
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
}
