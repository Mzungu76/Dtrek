/**
 * Offline Readiness Check (roadmap Fase 6) — the real answer to "can this hike actually be
 * navigated with no signal", not just `tileCount === downloadedCount` (isManifestValid in
 * packageManifest.ts, still the check for "is the map itself downloaded").
 *
 * Tiles are the one hard requirement: `NavigationMap.tsx`'s offline mode has nothing to render
 * without them. Everything else recorded in the manifest (trail graph, elevation profile, POIs,
 * nav instructions/moments) degrades the experience if missing but doesn't strand the hiker —
 * so it's surfaced as a distinct "degraded" list, not folded into the same pass/fail as tiles.
 * This mirrors the existing, deliberate choice in packageManifest.ts to keep hasTrailGraph out of
 * isManifestValid() — extended here to the rest of the package instead of only that one field.
 */
import type { OfflinePackageManifest } from './packageManifest'
import { isManifestValid } from './packageManifest'

export interface OfflineReadiness {
  tilesReady: boolean
  tileCount: number
  downloadedCount: number
  hasTrailGraph: boolean
  trailGraphNodeCount: number
  hasElevationGraph: boolean
  hasElevationProfile: boolean
  hasPois: boolean
  hasNavInstructions: boolean
  /** Hard requirement: without tiles, offline mode has no map to show at all. */
  ready: boolean
  /** Missing pieces that only reduce the experience (no escape suggestions, no elevation chart, no POI callouts...) — never block navigation, but worth a heads-up before losing signal. */
  degradedMissing: string[]
}

/**
 * `manifest` may be null (no package downloaded at all) or predate the Fase 6 fields (all
 * `undefined` on an older manifest) — both read as "missing", the same conservative default:
 * better to warn about a feature that's actually fine than to silently promise one that isn't.
 */
export function checkOfflineReadiness(manifest: OfflinePackageManifest | null): OfflineReadiness {
  const tilesReady = isManifestValid(manifest)
  const hasTrailGraph = !!manifest?.hasTrailGraph
  const hasElevationGraph = !!manifest?.hasElevationGraph
  const hasElevationProfile = !!manifest?.hasElevationProfile
  const hasPois = !!manifest?.hasPois
  const hasNavInstructions = !!manifest?.hasNavInstructions

  const degradedMissing: string[] = []
  if (!hasTrailGraph) degradedMissing.push('Rete sentieri (vie di fuga e alternative)')
  // Segnalato solo se il grafo stesso c'è ma la quota no — senza il grafo il punto sopra copre
  // già il problema più grande, ripeterlo qui sarebbe ridondante.
  if (hasTrailGraph && !hasElevationGraph) degradedMissing.push('Dislivello nelle vie di fuga')
  if (!hasElevationProfile) degradedMissing.push('Profilo altimetrico')
  if (!hasPois) degradedMissing.push('Punti di interesse')
  if (!hasNavInstructions) degradedMissing.push('Istruzioni di navigazione')

  return {
    tilesReady,
    tileCount: manifest?.tileCount ?? 0,
    downloadedCount: manifest?.downloadedCount ?? 0,
    hasTrailGraph,
    trailGraphNodeCount: manifest?.trailGraphNodeCount ?? 0,
    hasElevationGraph,
    hasElevationProfile,
    hasPois,
    hasNavInstructions,
    ready: tilesReady,
    degradedMissing,
  }
}
