'use client'
import { useEffect, useState } from 'react'
import { computeBbox } from '@/lib/geoUtils'
import type { Natura2000Feature } from '@/lib/natura2000/natura2000Client'

// Same "fetch once for the route's bbox" pattern as lib/natura2000/checkProtectedArea.ts,
// minus the point-in-polygon step — the raw polygons are drawn as a map overlay here, not
// reduced to a boolean. Best-effort: an empty/failed fetch just means the toggle shows nothing.
export function useNatura2000Overlay(hikeId: string, routePolyline: [number, number][]): Natura2000Feature[] {
  const [natura2000Features, setNatura2000Features] = useState<Natura2000Feature[]>([])

  useEffect(() => {
    if (routePolyline.length < 2) return
    const bbox = computeBbox(routePolyline)
    fetch(`/api/natura2000?bbox=${bbox}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((features) => setNatura2000Features(Array.isArray(features) ? features : []))
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hikeId])

  return natura2000Features
}
