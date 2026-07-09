'use client'
import { useEffect, useState } from 'react'
import type { PlannedHike } from '@/lib/plannedStore'
import { updatePlannedMeta } from '@/lib/plannedStore'
import { checkProtectedArea } from '@/lib/natura2000/checkProtectedArea'
import { hashTrack } from '@/lib/geoUtils'

export function useProtectedAreaCheck(hike: PlannedHike | null): boolean | undefined {
  const [inProtectedArea, setInProtectedArea] = useState<boolean | undefined>(undefined)

  useEffect(() => {
    if (!hike) return
    const gps = (hike.trackPoints ?? []).filter(p => p.lat && p.lon).map(p => [p.lat!, p.lon!] as [number, number])
    if (gps.length < 2) return

    // Same policy as useDtmProfile/useTerrainProfile: whether this track crosses a protected
    // area depends only on the GPS track (plus the site polygons, already cached server-side
    // for 270 days in natura2000_cache) — a cached result is good forever, invalidated only by
    // a track-hash mismatch (lib/geoUtils.ts hashTrack), not a temporal TTL.
    const hash = hashTrack(gps)
    if (hike.cachedInProtectedArea != null && hike.cachedProtectedAreaTrackHash === hash) {
      setInProtectedArea(hike.cachedInProtectedArea)
      return
    }

    let cancelled = false
    checkProtectedArea(gps)
      .then(r => {
        if (cancelled) return
        setInProtectedArea(r.inProtectedArea)
        updatePlannedMeta(hike.id, {
          cachedInProtectedArea: r.inProtectedArea,
          cachedProtectedAreaTrackHash: hash,
          cachedProtectedAreaComputedAt: new Date().toISOString(),
        }).catch(() => {})
      })
      .catch(() => {})
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hike?.id])

  return inProtectedArea
}
