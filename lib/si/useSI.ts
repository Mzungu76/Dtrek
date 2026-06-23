'use client'
// Shared fetch+state hooks for GET /api/trails/si and GET /api/trails/sentinel2
// (lib/si/types.ts' SIApiResponse/Sentinel2ApiResponse) — used by both
// app/esplora/page.tsx and app/programma/[id]/page.tsx so neither duplicates
// the same fetch+useEffect plumbing or the { matched: false } branching.
import { useEffect, useState } from 'react'
import type { SIResult, Sentinel2Data } from '@/lib/si/types'

interface Params {
  osmId?: number
  polyline?: [number, number][]
  plannedId?: string
}

function queryFor({ osmId, polyline, plannedId }: Params): string | null {
  const plannedSuffix = plannedId ? `&planned_id=${encodeURIComponent(plannedId)}` : ''
  if (osmId != null) return `osm_relation_id=${osmId}${plannedSuffix}`
  if (polyline && polyline.length >= 2) return `polyline=${encodeURIComponent(JSON.stringify(polyline))}${plannedSuffix}`
  return null
}

export function useSI({ osmId, polyline, plannedId }: Params): { result: SIResult | null; loading: boolean; notMatched: boolean } {
  const [result, setResult] = useState<SIResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [notMatched, setNotMatched] = useState(false)
  const polylineKey = polyline ? JSON.stringify(polyline) : null

  useEffect(() => {
    const qs = queryFor({ osmId, polyline, plannedId })
    if (!qs) { setResult(null); setNotMatched(false); return }

    let cancelled = false
    setLoading(true)
    setNotMatched(false)

    fetch(`/api/trails/si?${qs}`)
      .then(res => res.json())
      .then((data: SIResult | { matched: false } | { error: string }) => {
        if (cancelled) return
        if ('matched' in data) { setNotMatched(true); setResult(null) }
        else if ('si' in data) setResult(data)
        else setResult(null)
      })
      .catch(() => { if (!cancelled) setResult(null) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [osmId, polylineKey, plannedId])

  return { result, loading, notMatched }
}

export function useSentinel2({ osmId, polyline, plannedId }: Params): { data: Sentinel2Data | null; loading: boolean; notMatched: boolean } {
  const [data, setData] = useState<Sentinel2Data | null>(null)
  const [loading, setLoading] = useState(false)
  const [notMatched, setNotMatched] = useState(false)
  const polylineKey = polyline ? JSON.stringify(polyline) : null

  useEffect(() => {
    const qs = queryFor({ osmId, polyline, plannedId })
    if (!qs) { setData(null); setNotMatched(false); return }

    let cancelled = false
    setLoading(true)
    setNotMatched(false)

    fetch(`/api/trails/sentinel2?${qs}`)
      .then(res => res.json())
      .then((d: Sentinel2Data | { matched: false } | { error: string }) => {
        if (cancelled) return
        if ('matched' in d) { setNotMatched(true); setData(null) }
        else if ('available' in d) setData(d)
        else setData(null)
      })
      .catch(() => { if (!cancelled) setData(null) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [osmId, polylineKey, plannedId])

  return { data, loading, notMatched }
}
