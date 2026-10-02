'use client'
import { useEffect, useState } from 'react'
import type { CamminoDetail } from '@/app/api/cammini/[id]/route'

// Scheda del cammino (tappe con polilinee) per le mappe della guida: una fetch per cammino, poi
// in memoria per le aperture successive.
const cache = new Map<string, CamminoDetail>()
const inflight = new Map<string, Promise<CamminoDetail | null>>()

function load(id: string): Promise<CamminoDetail | null> {
  const hit = cache.get(id)
  if (hit) return Promise.resolve(hit)
  let p = inflight.get(id)
  if (!p) {
    p = fetch(`/api/cammini/${encodeURIComponent(id)}`)
      .then(r => (r.ok ? (r.json() as Promise<CamminoDetail>) : null))
      .then(d => { if (d) cache.set(id, d); return d })
      .catch(() => null)
      .finally(() => { inflight.delete(id) })
    inflight.set(id, p)
  }
  return p
}

export function useCamminoDetail(camminoId: string): CamminoDetail | null {
  const [detail, setDetail] = useState<CamminoDetail | null>(() => cache.get(camminoId) ?? null)
  useEffect(() => {
    let cancelled = false
    load(camminoId).then(d => { if (!cancelled && d) setDetail(d) })
    return () => { cancelled = true }
  }, [camminoId])
  return detail
}

/** Colore per giornata: alterna una piccola palette perché giornate vicine si distinguano in mappa. */
const DAY_COLORS = ['#9A7B3F', '#2f6f4f', '#b4532a', '#3b6ea5', '#7a4e8c', '#8a8f2b']
export function dayColor(dayIndex: number): string {
  return DAY_COLORS[dayIndex % DAY_COLORS.length]
}
