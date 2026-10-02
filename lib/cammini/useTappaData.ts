'use client'
import { useEffect, useState } from 'react'
import type { CamminoPlan } from './plan'
import type { TappaElevation } from '@/app/api/cammini/[id]/elevation/route'
import { computeTappaCts, type TappaCts } from './tappaCts'

// Dati di una tappa per la guida (docs/piano-cammini.md, Fase 5): profilo, luoghi e CTS. Il profilo e i
// luoghi vengono dal server (e dalla cache del catalogo); il CTS si calcola nel browser con le preferenze e
// lo storico dell'utente e poi si salva nel piano, così l'elenco delle tappe lo mostra anche per quelle che
// non ha ancora aperto.

export type TappaState =
  | { status: 'loading' }
  | { status: 'na' }
  | { status: 'ready'; data: TappaElevation; cts: TappaCts | 'loading' | 'na' }

const dataCache = new Map<string, TappaElevation>()
const ctsCache = new Map<string, TappaCts>()
const inflight = new Map<string, Promise<TappaElevation | null>>()

export function loadTappaElevation(camminoId: string, ordinal: number): Promise<TappaElevation | null> {
  const key = `${camminoId}:${ordinal}`
  const hit = dataCache.get(key)
  if (hit) return Promise.resolve(hit)
  let p = inflight.get(key)
  if (!p) {
    p = fetch(`/api/cammini/${encodeURIComponent(camminoId)}/elevation?ordinal=${ordinal}&profile=1`)
      .then(r => (r.ok ? (r.json() as Promise<TappaElevation>) : null))
      .then(d => { if (d) dataCache.set(key, d); return d })
      .catch(() => null)
      .finally(() => { inflight.delete(key) })
    inflight.set(key, p)
  }
  return p
}

export function useTappaData(plan: CamminoPlan, hikeId: string, ordinal: number | null, onCts?: (ordinal: number, cts: TappaCts) => void): TappaState {
  const [state, setState] = useState<TappaState>({ status: 'loading' })

  useEffect(() => {
    if (ordinal == null) return
    let cancelled = false
    setState({ status: 'loading' })
    const tappa = plan.tappe.find(t => t.ordinal === ordinal)
    const ckey = `${plan.camminoId}:${ordinal}`
    const stored = tappa?.cts
    const initialCts: TappaCts | 'loading' =
      ctsCache.get(ckey) ?? (stored?.safety ? { ts: stored.ts, label: stored.label, color: stored.color, confidence: 'high', poisCount: 0, safety: stored.safety, total: stored.total } : 'loading')
    loadTappaElevation(plan.camminoId, ordinal).then(data => {
      if (cancelled) return
      if (!data) { setState({ status: 'na' }); return }
      setState({ status: 'ready', data, cts: initialCts })
      if (initialCts !== 'loading' || !tappa || !data.points) return
      computeTappaCts({ points: data.points, distanceMeters: tappa.lengthM, gainM: data.gainM, lossM: data.lossM, maxM: data.maxM ?? 0, minM: data.minM, pois: data.pois ?? [], polyline: data.points.map(([la, lo]) => [la, lo] as [number, number]), plannedDate: plan.days.find(d => d.tappe.includes(ordinal))?.date })
        .then(cts => {
          if (cancelled) return
          if (!cts) { setState({ status: 'ready', data, cts: 'na' }); return }
          ctsCache.set(ckey, cts)
          setState({ status: 'ready', data, cts })
          onCts?.(ordinal, cts)
          fetch('/api/cammini/tappa-cts', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hikeId, ordinal, ts: cts.ts, label: cts.label, color: cts.color, safety: cts.safety, total: cts.total }),
          }).catch(() => {})
        })
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.camminoId, hikeId, ordinal])

  return state
}
