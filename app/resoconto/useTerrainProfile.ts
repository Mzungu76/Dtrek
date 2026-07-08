'use client'
import { useEffect, useState } from 'react'
import type { StoredActivity } from '@/lib/blobStore'
import type { TrailTerrainProfile } from '@/lib/terrain/trailTerrainProfile'

export function useTerrainProfile(activity: StoredActivity | null): TrailTerrainProfile | undefined {
  const [terrainProfile, setTerrainProfile] = useState<TrailTerrainProfile | undefined>(undefined)

  useEffect(() => {
    if (!activity) return
    const gps = activity.trackPoints.filter(p => p.lat && p.lon).map(p => [p.lat!, p.lon!] as [number, number])
    if (gps.length < 2) return
    fetch(`/api/tei-terrain?track=${encodeURIComponent(JSON.stringify(gps))}`).then(r => r.json()).then((p: TrailTerrainProfile) => setTerrainProfile(p)).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity?.id])

  return terrainProfile
}
