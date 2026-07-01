/**
 * Manifest describing an offline navigation package for one planned hike:
 * tile bounding box/zoom range, expected vs. downloaded tile counts, size,
 * and a checksum. Persisted alongside the package so it can be validated
 * before trusting it mid-hike (corrupted/incomplete/stale packages are a
 * safety problem, not just an inconvenience — better to find out at the
 * trailhead with signal than deep in the woods without it).
 */
import { lsGet, lsSet, lsDel } from '@/lib/localStore'

export type OfflinePackageStatus = 'none' | 'queued' | 'downloading' | 'paused' | 'ready' | 'stale' | 'error'

export interface OfflinePackageManifest {
  hikeId: string
  version: number
  status: OfflinePackageStatus
  bbox: { minLat: number; minLon: number; maxLat: number; maxLon: number }
  zoomLevels: number[]
  tileCount: number
  downloadedCount: number
  sizeBytes: number
  createdAt: number
  updatedAt: number
  checksum?: string
}

const MANIFEST_KEY = (hikeId: string) => `offline-manifest:${hikeId}`

export async function loadManifest(hikeId: string): Promise<OfflinePackageManifest | null> {
  return lsGet<OfflinePackageManifest>(MANIFEST_KEY(hikeId))
}

export async function saveManifest(manifest: OfflinePackageManifest): Promise<void> {
  await lsSet(MANIFEST_KEY(manifest.hikeId), { ...manifest, updatedAt: Date.now() })
}

export async function deleteManifest(hikeId: string): Promise<void> {
  await lsDel(MANIFEST_KEY(hikeId))
}

/** Simple non-cryptographic checksum (sum of tile byte lengths mod a large prime) — enough to detect truncation/corruption, not tamper-proofing. */
export function computeChecksum(tileSizes: number[]): string {
  const PRIME = 4294967291
  let acc = 0
  for (const size of tileSizes) acc = (acc * 31 + size) % PRIME
  return acc.toString(16)
}

/**
 * A manifest is trustworthy for offline use only if it's fully downloaded
 * and internally consistent. Deliberately a plain boolean, not a `manifest
 * is OfflinePackageManifest` type predicate: TS collapses the negative
 * branch of such a predicate on a `T | null` parameter to `never` instead of
 * `null`, breaking later `manifest?.status` narrowing at call sites.
 */
export function isManifestValid(manifest: OfflinePackageManifest | null): boolean {
  if (!manifest) return false
  return manifest.status === 'ready' && manifest.downloadedCount === manifest.tileCount && manifest.tileCount > 0
}
