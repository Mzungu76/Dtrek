'use client'
import { useEffect } from 'react'
import type { PoiItem } from './overpass'
import type { TrailDtmProfile } from './dtm/trailDtmProfile'
import type { TrailTerrainProfile } from './terrain/trailTerrainProfile'

interface CtsPrefs {
  prefSforzo?: number
  prefDurata?: number
  hrRest?: number
  hrMax?: number
}

interface CtsPrefetched {
  pois?: PoiItem[]
  dtmProfile?: TrailDtmProfile
  terrainProfile?: TrailTerrainProfile
  inProtectedArea?: boolean
  prefs?: CtsPrefs
}

interface UseCtsRecomputeArgs<T> {
  /** The hike/activity to (re)compute CTS for, or null while it's still loading. */
  entity: T | null
  /** Primitive identity to gate the effect on — matches the two original effects this hook
   *  replaces: an unrelated patch to the entity (e.g. editing notes) must not re-trigger a
   *  recompute, only actually switching to a different hike/activity should. */
  entityId: string | undefined
  /** True once `entity` already carries a cached, non-stale CTS — skips the recompute entirely. */
  isFresh: (entity: T) => boolean
  /** True once `entity` has at least 2 usable GPS points — recompute is pointless without a track. */
  hasEnoughGps: (entity: T) => boolean
  poisReady: boolean
  dtmProfile: TrailDtmProfile | undefined
  terrainProfile: TrailTerrainProfile | undefined
  inProtectedArea: boolean | undefined
  prefsLoaded: boolean
  pois: PoiItem[]
  prefs: CtsPrefs
  compute: (entity: T, prefetched: CtsPrefetched) => Promise<Partial<T> | null>
  onResult: (patch: Partial<T>) => void
  /** Shares its in-flight flag with the caller's own "Calcola CTS" manual-trigger state, so the
   *  button reflects an automatic background recompute exactly like it already reflects a manual
   *  one — the two were never independent booleans in the original code. */
  setComputing: (computing: boolean) => void
  /** Called on every exit path (fresh/no-gps/finished) — lets a caller track "has this settled
   *  at least once" independently of `computing` (see GuidaHub's enrichmentReady/ctsSettled). */
  onSettled?: () => void
}

/**
 * Shared "auto-recompute CTS if missing/stale" gating logic, used by both ResocontoHub
 * (StoredActivity, via computeCtsForActivity) and GuidaHub (PlannedHike, via computeCtsForHike):
 * waits for the POI/DTM/terrain/protected-area/prefs sources the hub already fetched for its own
 * map/UI state, then hands them to the entity-specific compute function as `prefetched` instead
 * of having it repeat those same /api/pois, /api/tei-dtm, /api/tei-terrain and /api/natura2000
 * calls.
 */
export function useCtsRecompute<T>({
  entity, entityId, isFresh, hasEnoughGps, poisReady, dtmProfile, terrainProfile, inProtectedArea,
  prefsLoaded, pois, prefs, compute, onResult, setComputing, onSettled,
}: UseCtsRecomputeArgs<T>): void {
  useEffect(() => {
    if (!entity) return
    if (isFresh(entity)) { onSettled?.(); return }
    if (!hasEnoughGps(entity)) { onSettled?.(); return }
    if (!poisReady || dtmProfile === undefined || terrainProfile === undefined || inProtectedArea === undefined || !prefsLoaded) return
    let cancelled = false
    setComputing(true)
    compute(entity, { pois, dtmProfile, terrainProfile, inProtectedArea, prefs })
      .then(result => { if (!cancelled && result) onResult(result) })
      .catch(() => {})
      .finally(() => { if (!cancelled) { setComputing(false); onSettled?.() } })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId, poisReady, dtmProfile, terrainProfile, inProtectedArea, prefsLoaded])
}
