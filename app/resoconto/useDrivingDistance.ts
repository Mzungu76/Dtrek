'use client'
import { useEffect, useState } from 'react'
import type { StoredActivity } from '@/lib/blobStore'
import { fetchDrivingInfo, getUserStartingPoint, getTrailStartPoint } from '@/lib/drivingInfo'

// Distance from the user's home address (if set) to the trailhead — no caching column exists
// for completed activities (unlike planned hikes), so this is just refetched live each time.
export function useDrivingDistance(activity: StoredActivity | null): { distanceMeters: number; durationSeconds: number } | null {
  const [driving, setDriving] = useState<{ distanceMeters: number; durationSeconds: number } | null>(null)

  useEffect(() => {
    if (!activity) return
    const trailStart = getTrailStartPoint({ routePolyline: activity.trackPoints.filter(p => p.lat && p.lon).map(p => [p.lat!, p.lon!] as [number, number]) })
    if (!trailStart) return
    let cancelled = false
    getUserStartingPoint().then(pt => {
      if (cancelled || !pt) return
      fetchDrivingInfo(pt.lat, pt.lon, trailStart[0], trailStart[1]).then(info => {
        if (!cancelled) setDriving(info)
      })
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity?.id])

  return driving
}
