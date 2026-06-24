'use client'
import { useEffect, useState } from 'react'
import { computeBbox } from '@/lib/geoUtils'
import type { FloraResult } from '@/lib/floraTypes'

export function useFlora(polyline?: [number, number][] | null): { data: FloraResult | null; loading: boolean } {
  const [data, setData] = useState<FloraResult | null>(null)
  const [loading, setLoading] = useState(false)
  const polylineKey = polyline ? JSON.stringify(polyline) : null

  useEffect(() => {
    if (!polyline || polyline.length < 2) { setData(null); return }

    let cancelled = false
    setLoading(true)
    const bbox = computeBbox(polyline, 0.005)

    fetch(`/api/trails/flora?bbox=${encodeURIComponent(bbox)}`)
      .then(res => res.json())
      .then((d: FloraResult) => { if (!cancelled) setData(d) })
      .catch(() => { if (!cancelled) setData(null) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polylineKey])

  return { data, loading }
}
