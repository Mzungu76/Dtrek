'use client'
import { useEffect, useState } from 'react'
import type { PlannedHike } from '@/lib/plannedStore'
import { updatePlannedMeta } from '@/lib/plannedStore'
import { fetchDrivingInfo, getUserStartingPoint, getTrailStartPoint, originMatches } from '@/lib/drivingInfo'

export function useDrivingDistance(hike: PlannedHike | null): { distanceMeters: number; durationSeconds: number } | null {
  const [driving, setDriving] = useState<{ distanceMeters: number; durationSeconds: number } | null>(null)

  useEffect(() => {
    if (!hike) return
    const trailStart = getTrailStartPoint(hike)
    if (!trailStart) return
    const cachedLat  = hike.cachedDrivingOriginLat
    const cachedLon  = hike.cachedDrivingOriginLon
    const cachedDist = hike.cachedDrivingDistanceMeters
    const cachedDur  = hike.cachedDrivingDurationSeconds
    let cancelled = false
    getUserStartingPoint().then(pt => {
      if (cancelled || !pt) return
      if (originMatches(cachedLat, cachedLon, pt.lat, pt.lon) && cachedDist != null && cachedDur != null) {
        setDriving({ distanceMeters: cachedDist, durationSeconds: cachedDur })
        return
      }
      fetchDrivingInfo(pt.lat, pt.lon, trailStart[0], trailStart[1]).then(info => {
        if (cancelled) return
        setDriving(info)
        if (info) {
          updatePlannedMeta(hike.id, {
            cachedDrivingDistanceMeters: info.distanceMeters,
            cachedDrivingDurationSeconds: info.durationSeconds,
            cachedDrivingOriginLat: pt.lat,
            cachedDrivingOriginLon: pt.lon,
          }).catch(() => {})
        }
      })
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hike?.id])

  return driving
}
