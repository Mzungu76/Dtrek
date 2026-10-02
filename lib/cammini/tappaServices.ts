import type { TappaServices } from '@/app/api/cammini/[id]/services/route'
import type { ServiceItem } from './services'

// Servizi di una tappa dal catalogo (una fetch per tappa, poi in memoria). Null se non disponibili: chi chiama
// non deve scambiare "non l'ho potuto leggere" per "non ce ne sono".
const cache = new Map<string, ServiceItem[]>()
const inflight = new Map<string, Promise<ServiceItem[] | null>>()

export function loadTappaServices(camminoId: string, ordinal: number): Promise<ServiceItem[] | null> {
  const key = `${camminoId}:${ordinal}`
  const hit = cache.get(key)
  if (hit) return Promise.resolve(hit)
  let p = inflight.get(key)
  if (!p) {
    p = fetch(`/api/cammini/${encodeURIComponent(camminoId)}/services?ordinal=${ordinal}`)
      .then(r => (r.ok ? (r.json() as Promise<TappaServices>) : null))
      .then(d => { if (d) cache.set(key, d.services); return d ? d.services : null })
      .catch(() => null)
      .finally(() => { inflight.delete(key) })
    inflight.set(key, p)
  }
  return p
}
