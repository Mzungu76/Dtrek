'use client'
import { useEffect, useState } from 'react'

// Safety-net so the guide never waits forever for enrichment that failed silently somewhere
// (Overpass/satellite APIs down, etc.) — after 90s it's generated anyway with whatever landed.
export function useEnrichmentTimeout(hikeId: string | undefined): boolean {
  const [enrichmentTimedOut, setEnrichmentTimedOut] = useState(false)

  useEffect(() => {
    setEnrichmentTimedOut(false)
    if (!hikeId) return
    const t = setTimeout(() => setEnrichmentTimedOut(true), 90_000)
    return () => clearTimeout(t)
  }, [hikeId])

  return enrichmentTimedOut
}
