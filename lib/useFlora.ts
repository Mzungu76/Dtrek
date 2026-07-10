'use client'
import { useEffect, useState } from 'react'
import { computeBbox, hashTrack } from '@/lib/geoUtils'
import { updatePlannedMeta } from '@/lib/plannedStore'
import type { FloraResult } from '@/lib/floraTypes'

interface PlannedCache {
  plannedId: string
  data?: FloraResult
  trackHash?: string
}

/**
 * `plannedCache` is optional and only meaningful for a `planned_hikes`-backed caller
 * (app/guida/GuidaHub.tsx) — when present, the flora result is persisted there (via
 * updatePlannedMeta) keyed by a hash of the track (lib/geoUtils.ts hashTrack, same
 * no-temporal-TTL policy as DTM/terrain/protected-area: the flora around a fixed track doesn't
 * meaningfully change over the short term), and read back before hitting the live route on
 * subsequent opens. Callers that don't pass it (app/resoconto/ResocontoHub.tsx, which has no
 * equivalent per-hike persistence layer) keep the original always-live behavior unchanged.
 */
export function useFlora(polyline?: [number, number][] | null, altitudeMax?: number, plannedCache?: PlannedCache): { data: FloraResult | null; loading: boolean } {
  const [data, setData] = useState<FloraResult | null>(null)
  const [loading, setLoading] = useState(false)
  const polylineKey = polyline ? JSON.stringify(polyline) : null

  useEffect(() => {
    if (!polyline || polyline.length < 2) { setData(null); return }

    if (plannedCache) {
      const hash = hashTrack(polyline)
      if (plannedCache.data && plannedCache.trackHash === hash) {
        setData(plannedCache.data)
        return
      }
    }

    let cancelled = false
    setLoading(true)
    const bbox = computeBbox(polyline, 0.005)
    const altParam = altitudeMax ? `&altitude=${altitudeMax}` : ''

    fetch(`/api/trails/flora?bbox=${encodeURIComponent(bbox)}${altParam}`)
      .then(res => res.json())
      .then((d: FloraResult) => {
        if (cancelled) return
        setData(d)
        if (plannedCache && d.available) {
          updatePlannedMeta(plannedCache.plannedId, { floraResult: d, floraTrackHash: hashTrack(polyline), floraComputedAt: new Date().toISOString() }).catch(() => {})
        }
      })
      .catch(() => { if (!cancelled) setData(null) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polylineKey, altitudeMax, plannedCache?.plannedId, plannedCache?.trackHash])

  return { data, loading }
}
