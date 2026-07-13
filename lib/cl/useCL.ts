'use client'
// Shared fetch+state hooks for GET /api/trails/cl and GET /api/trails/sentinel2
// (lib/cl/types.ts' CLApiResponse/Sentinel2ApiResponse) — used by app/guida/[id]/page.tsx
// so it doesn't duplicate the same fetch+useEffect plumbing or the { matched: false } branching.
import { useEffect, useState } from 'react'
import type { CLResult, Sentinel2Data } from '@/lib/cl/types'
import { SI_STATIC_TTL_MS, SI_DYNAMIC_TTL_MS, SI_SATELLITE_TTL_MS, labelForSiScore } from '@/lib/cl/label'
import type { PlannedHike } from '@/lib/plannedStore'
import { refreshTsForHike } from '@/lib/computeTsForHike'

interface Params {
  osmId?: number
  polyline?: [number, number][]
  plannedId?: string
  // Planned-hike-only fallback cache (lib/cl/computeCL.ts's computeCLForPlannedHike writes
  // these columns directly, not via updatePlannedMeta) — lets this hook reconstruct a CLResult
  // without a network round trip when every TTL bucket is still fresh. Meaningless (and
  // ignored) when osmId is set: an OSM-matched trail scores against the shared `trails` cache
  // instead, which isn't exposed to the client at all — that path always fetches live.
  siCache?: Pick<PlannedHike, 'siScore' | 'siScoreRaw' | 'siDensityFactor' | 'siSignals' | 'siStaticComputedAt' | 'siDynamicComputedAt' | 'siSatelliteComputedAt' | 'isGhostTrail' | 'dominantWarning'>
}

// Un percorso appena importato può non essere ancora arrivato su Supabase quando queste chiamate
// partono (race con l'outbox di lib/plannedStore.ts's savePlanned — mitigata ma non azzerata da
// un retry più ravvicinato lì) — l'ownership check di /api/trails/cl e /api/trails/sentinel2
// risponde 404 "Not found" in quel caso, indistinguibile da un vero "non trovato" lato client.
// Qualche retry ravvicinato copre la finestra tipica prima di arrendersi come prima.
const NOT_FOUND_RETRY_DELAYS_MS = [0, 3000, 6000]

async function fetchWithNotFoundRetry(url: string, isCancelled: () => boolean): Promise<Response> {
  let res: Response | null = null
  for (const delay of NOT_FOUND_RETRY_DELAYS_MS) {
    if (delay > 0) await new Promise(r => setTimeout(r, delay))
    if (isCancelled()) throw new Error('cancelled')
    res = await fetch(url)
    if (res.status !== 404) return res
  }
  return res!
}

function queryFor({ osmId, polyline, plannedId }: Params): string | null {
  const plannedSuffix = plannedId ? `&planned_id=${encodeURIComponent(plannedId)}` : ''
  if (osmId != null) return `osm_relation_id=${osmId}${plannedSuffix}`
  if (polyline && polyline.length >= 2) return `polyline=${encodeURIComponent(JSON.stringify(polyline))}${plannedSuffix}`
  return null
}

function freshSiCacheResult(plannedId: string, cache: Params['siCache']): CLResult | null {
  if (!cache || cache.siScore == null || !cache.siSignals) return null
  const now = Date.now()
  // Same "expired if timestamp missing/too old" check computeCL.ts's runClPipeline does
  // server-side (per-bucket), just phrased as "still fresh" here — all three must hold for the
  // cached row to stand in for a live call.
  const staticFresh    = !!cache.siStaticComputedAt    && now - new Date(cache.siStaticComputedAt).getTime()    < SI_STATIC_TTL_MS
  const dynamicFresh   = !!cache.siDynamicComputedAt   && now - new Date(cache.siDynamicComputedAt).getTime()   < SI_DYNAMIC_TTL_MS
  const satelliteFresh = !!cache.siSatelliteComputedAt && now - new Date(cache.siSatelliteComputedAt).getTime() < SI_SATELLITE_TTL_MS
  if (!staticFresh || !dynamicFresh || !satelliteFresh) return null
  return {
    plannedHikeId: plannedId,
    si: cache.siScore,
    // Puo mancare su una riga scritta prima che queste due colonne esistessero — cade indietro a
    // "nessuna correzione visibile" invece di rompere la ricostruzione client-side.
    siRaw: cache.siScoreRaw ?? cache.siScore,
    dataDensityFactor: cache.siDensityFactor ?? 1,
    label: labelForSiScore(cache.siScore),
    isGhostTrail: cache.isGhostTrail ?? false,
    dominantWarning: cache.dominantWarning ?? null,
    signals: cache.siSignals,
    partial: false,
    cachedAt: cache.siDynamicComputedAt ?? new Date().toISOString(),
  }
}

export function useCL({ osmId, polyline, plannedId, siCache }: Params): {
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
  const siCacheKey = siCache ? `${siCache.siScore}|${siCache.siStaticComputedAt}|${siCache.siDynamicComputedAt}|${siCache.siSatelliteComputedAt}` : null

  useEffect(() => {
    const qs = queryFor({ osmId, polyline, plannedId })
    if (!qs) { setResult(null); setNotMatched(false); return }

    // osmId set ⇒ this scores against the shared `trails` cache, which isn't exposed to the
    // client — always fetch live for that path (still fast: computeCL only recomputes whatever
    // TTL bucket is actually expired, server-side).
    if (osmId == null && plannedId) {
      const cached = freshSiCacheResult(plannedId, siCache)
      if (cached) { setResult(cached); setNotMatched(false); setLoading(false); return }
    }

    let cancelled = false
    setLoading(true)
    setNotMatched(false)

    fetchWithNotFoundRetry(`/api/trails/cl?${qs}`, () => cancelled)
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
  }, [osmId, polylineKey, plannedId, siCacheKey])

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

export function useSentinel2({ osmId, polyline, plannedId }: Params): {
  data: Sentinel2Data | null
  loading: boolean
  notMatched: boolean
  refreshing: boolean
  refreshError: string | null
  refresh: () => void
} {
  const [data, setData] = useState<Sentinel2Data | null>(null)
  const [loading, setLoading] = useState(false)
  const [notMatched, setNotMatched] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const polylineKey = polyline ? JSON.stringify(polyline) : null

  useEffect(() => {
    const qs = queryFor({ osmId, polyline, plannedId })
    if (!qs) { setData(null); setNotMatched(false); return }

    let cancelled = false
    setLoading(true)
    setNotMatched(false)

    fetchWithNotFoundRetry(`/api/trails/sentinel2?${qs}`, () => cancelled)
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

  const refresh = () => {
    const qs = queryFor({ osmId, polyline, plannedId })
    if (!qs) return
    setRefreshing(true)
    setRefreshError(null)
    fetch(`/api/trails/sentinel2?${qs}&force=1`)
      .then(async res => {
        if (res.status === 429) {
          const body = await res.json().catch(() => ({}))
          setRefreshError(body.error ?? 'Aggiornamento non ancora disponibile — riprova più tardi.')
          return
        }
        const d: Sentinel2Data | { matched: false } | { error: string } = await res.json()
        if ('available' in d) {
          setData(d)
          if (d.available && plannedId) refreshTsForHike(plannedId).catch(() => {})
        } else if ('error' in d) setRefreshError('Impossibile aggiornare i dati in questo momento.')
      })
      .catch(() => { setRefreshError('Impossibile aggiornare i dati in questo momento.') })
      .finally(() => setRefreshing(false))
  }

  return { data, loading, notMatched, refreshing, refreshError, refresh }
}
