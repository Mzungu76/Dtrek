'use client'
import { useEffect, useState } from 'react'
import { fetchNearbyTrailPaths } from '@/lib/overpass'

// Best-effort, non-blocking: gives the offline basemap some sense of
// "what other paths pass near here" instead of just a bare tile layer
// with one highlighted line — an explicit complaint ("la mappa offline
// mi sembra troppo generica"). Silently does nothing if offline or if
// Overpass is unreachable; the route/POIs already on the map still work.
export function useNearbyTrails(hikeId: string, routePolyline: [number, number][]): [number, number][][] {
  const [nearbyTrails, setNearbyTrails] = useState<[number, number][][]>([])

  useEffect(() => {
    if (routePolyline.length < 2) return
    fetchNearbyTrailPaths(routePolyline).then(setNearbyTrails).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hikeId])

  return nearbyTrails
}
