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
  /**
   * Whether the walkable trail graph around the route (lib/navigation/
   * trailGraphStore.ts — prerequisite for Map Matching against real
   * alternatives and for the Escape Engine, both still to be built) was
   * fetched successfully alongside the tiles. Deliberately NOT part of
   * isManifestValid() below: fetching it is best-effort against a shared
   * public service (Overpass) that can be slow/unavailable, and today's
   * "ready to navigate offline" contract is about map tiles — whether the
   * graph should become a hard requirement is an Offline Readiness Check
   * decision for a later phase (see docs/navigation-engine-roadmap.md
   * Fase 6), not something to silently fold in here.
   */
  hasTrailGraph?: boolean
  trailGraphNodeCount?: number
  /**
   * Fase 7 di docs/navigator-orizzonti-roadmap.md — se ai nodi del trail graph è stata
   * applicata una quota reale (lib/dtm/graphElevation.ts), usata dall'Escape Engine per
   * raffinare la sicurezza di una via di fuga oltre al proxy di lunghezza+tipo OSM. Stesso
   * status best-effort di hasTrailGraph: dipende da un servizio DTM esterno rate-limited, mai
   * un requisito per considerare il pacchetto pronto (vedi isManifestValid() sotto e
   * offlineReadiness.ts). Non tentata affatto se il grafo stesso manca (hasTrailGraph falsy).
   */
  hasElevationGraph?: boolean
  /**
   * Readiness signals for the rest of the "Offline Navigation Package" (roadmap Fase 6): elevation
   * profile, POIs and turn-by-turn/moments data are all pure functions of data already present on
   * the cached PlannedHike record (lib/plannedStore.ts) — nothing new to fetch over the network —
   * but that doesn't guarantee the *source* data (trackPoints altitude, cachedPois, the route
   * geometry itself) is actually there. These are recorded at download time so a hiker can be
   * warned *before* losing signal if, say, the guide was generated without POI enrichment, instead
   * of just discovering a blank "punti di interesse" list mid-hike. All optional/undefined on a
   * manifest saved before this field existed — treated as "unknown", not "missing", by
   * lib/offline/offlineReadiness.ts.
   */
  hasElevationProfile?: boolean
  elevationProfilePointCount?: number
  hasPois?: boolean
  poiCount?: number
  hasNavInstructions?: boolean
  navInstructionCount?: number
  navMomentCount?: number
  /**
   * Whether the per-POI AI narrative cache (lib/offline/poiNotesStore.ts, Guida IA) was fetched
   * and bundled alongside the tiles. Same best-effort status as hasTrailGraph above and for the
   * same reason: a live Supabase read, not something to let block an otherwise-complete tile
   * package. poiNotesCount can legitimately be 0 (no POI on this route has a cached note yet) —
   * that's not a failure, only hasPoiNotes being false/undefined means the fetch itself didn't run.
   */
  hasPoiNotes?: boolean
  poiNotesCount?: number
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
