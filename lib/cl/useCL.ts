'use client'
// Shared fetch+state hooks for GET /api/trails/cl and GET /api/trails/sentinel2
// (lib/cl/types.ts' CLApiResponse/Sentinel2ApiResponse) — used by app/guida/[id]/page.tsx
// so it doesn't duplicate the same fetch+useEffect plumbing or the { matched: false } branching.
import { useEffect, useState } from 'react'
import type { CLResult, Sentinel2Data } from '@/lib/cl/types'

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

export function useCL({ osmId, polyline, plannedId }: Params): {
  result: CLResult | null
  loading: boolean
  notMatched: boolean
  refreshing: boolean
  refreshError: string | null
  refresh: () => void
} {
  const [result, setResult] = useState<CLResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [notMatched, setNotMatched] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const polylineKey = polyline ? JSON.stringify(polyline) : null

  useEffect(() => {
    const qs = queryFor({ osmId, polyline, plannedId })
    if (!qs) { setResult(null); setNotMatched(false); return }

    let cancelled = false
    setLoading(true)
    setNotMatched(false)

    fetch(`/api/trails/cl?${qs}`)
      .then(res => res.json())
      .then((data: CLResult | { matched: false } | { error: string }) => {
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

  const refresh = () => {
    const qs = queryFor({ osmId, polyline, plannedId })
    if (!qs) return
    setRefreshing(true)
    setRefreshError(null)
    fetch(`/api/trails/cl?${qs}&force=1`)
      .then(async res => {
        if (res.status === 429) {
          const body = await res.json().catch(() => ({}))
          setRefreshError(body.error ?? 'Aggiornamento non ancora disponibile — riprova più tardi.')
          return
        }
        const data: CLResult | { matched: false } | { error: string } = await res.json()
        if ('si' in data) setResult(data)
      })
      .catch(() => { setRefreshError('Impossibile aggiornare il punteggio in questo momento.') })
      .finally(() => setRefreshing(false))
  }

  return { result, loading, notMatched, refreshing, refreshError, refresh }
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
