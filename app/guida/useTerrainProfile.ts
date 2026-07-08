'use client'
import { useEffect, useState } from 'react'
import type { PlannedHike } from '@/lib/plannedStore'
import type { TrailTerrainProfile } from '@/lib/terrain/trailTerrainProfile'

export function useTerrainProfile(hike: PlannedHike | null): TrailTerrainProfile | undefined {
  const [terrainProfile, setTerrainProfile] = useState<TrailTerrainProfile | undefined>(undefined)

  useEffect(() => {
    if (!hike) return
    const gps = (hike.trackPoints ?? []).filter(p => p.lat && p.lon).map(p => [p.lat!, p.lon!] as [number, number])
    if (gps.length < 2) return
    fetch(`/api/tei-terrain?track=${encodeURIComponent(JSON.stringify(gps))}`)
      .then(r => r.json()).then((p: TrailTerrainProfile) => setTerrainProfile(p)).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hike?.id])

  return terrainProfile
}
