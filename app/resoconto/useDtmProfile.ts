'use client'
import { useEffect, useState } from 'react'
import type { StoredActivity } from '@/lib/blobStore'
import type { TrailDtmProfile } from '@/lib/dtm/trailDtmProfile'

export function useDtmProfile(activity: StoredActivity | null): TrailDtmProfile | undefined {
  const [dtmProfile, setDtmProfile] = useState<TrailDtmProfile | undefined>(undefined)

  useEffect(() => {
    if (!activity) return
    const gps = activity.trackPoints.filter(p => p.lat && p.lon).map(p => [p.lat!, p.lon!] as [number, number])
    if (gps.length < 2) return
    fetch(`/api/tei-dtm?track=${encodeURIComponent(JSON.stringify(gps))}`).then(r => r.json()).then((p: TrailDtmProfile) => setDtmProfile(p)).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity?.id])

  return dtmProfile
}
