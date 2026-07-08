'use client'
import { useEffect, useState } from 'react'
import type { PlannedHike } from '@/lib/plannedStore'
import type { TrailDtmProfile } from '@/lib/dtm/trailDtmProfile'

export function useDtmProfile(hike: PlannedHike | null): TrailDtmProfile | undefined {
  const [dtmProfile, setDtmProfile] = useState<TrailDtmProfile | undefined>(undefined)

  useEffect(() => {
    if (!hike) return
    const gps = (hike.trackPoints ?? []).filter(p => p.lat && p.lon).map(p => [p.lat!, p.lon!] as [number, number])
    if (gps.length < 2) return
    fetch(`/api/tei-dtm?track=${encodeURIComponent(JSON.stringify(gps))}`)
      .then(r => r.json()).then((p: TrailDtmProfile) => setDtmProfile(p)).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hike?.id])

  return dtmProfile
}
