'use client'
import { useEffect, useState } from 'react'
import type { PlannedHike } from '@/lib/plannedStore'
import { updatePlannedMeta } from '@/lib/plannedStore'
import type { TrailTerrainProfile } from '@/lib/terrain/trailTerrainProfile'
import { hashTrack } from '@/lib/geoUtils'

export function useTerrainProfile(hike: PlannedHike | null): TrailTerrainProfile | undefined {
  const [terrainProfile, setTerrainProfile] = useState<TrailTerrainProfile | undefined>(undefined)

  useEffect(() => {
    if (!hike) return
    const gps = (hike.trackPoints ?? []).filter(p => p.lat && p.lon).map(p => [p.lat!, p.lon!] as [number, number])
    if (gps.length < 2) return

    // Same policy as useDtmProfile: the terrain profile depends only on the GPS track, which
    // never changes once a hike is imported, so a cached result is good forever — invalidated
    // only by a track-hash mismatch (lib/geoUtils.ts hashTrack), not a temporal TTL.
    const hash = hashTrack(gps)
    if (hike.terrainProfile && hike.terrainTrackHash === hash) {
      setTerrainProfile(hike.terrainProfile)
      return
    }

    let cancelled = false
    fetch(`/api/tei-terrain?track=${encodeURIComponent(JSON.stringify(gps))}`)
      .then(r => r.json())
      .then((p: TrailTerrainProfile) => {
        if (cancelled) return
        setTerrainProfile(p)
        // Only a genuine computation is worth persisting forever — 'unavailable' can mean a
        // transient upstream failure, which should be retried on the next open, not cached.
        if (p.source === 'geoportale') {
          updatePlannedMeta(hike.id, { terrainProfile: p, terrainTrackHash: hash, terrainComputedAt: new Date().toISOString() }).catch(() => {})
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hike?.id])

  return terrainProfile
}
