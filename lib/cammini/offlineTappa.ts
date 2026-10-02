import { lsGet, lsSet } from '@/lib/localStore'
import type { PoiItem } from '@/lib/overpass'
import type { CamminoDetail } from '@/app/api/cammini/[id]/route'
import { orderForDirection } from './plan'

// Copia locale di una tappa per navigare senza rete (docs/piano-cammini.md, offline): il piano salvato porta le
// tappe senza polilinee, che stanno nel catalogo. Si conservano qui, già nel verso di marcia, insieme ai luoghi.

export interface OfflineTappa {
  camminoId: string
  ordinal: number
  direction: 'forward' | 'reverse'
  name: string
  polyline: [number, number][]
  lengthM: number
  pois: PoiItem[]
  savedAt: number
}

// Il verso fa parte della chiave: la stessa tappa percorsa al contrario ha polilinea e capi girati.
const key = (camminoId: string, ordinal: number, direction: 'forward' | 'reverse') => `cammino-tappa:${camminoId}:${ordinal}:${direction}`

export function loadOfflineTappa(camminoId: string, ordinal: number, direction: 'forward' | 'reverse'): Promise<OfflineTappa | null> {
  return lsGet<OfflineTappa>(key(camminoId, ordinal, direction)).catch(() => null)
}

export async function saveOfflineTappa(t: OfflineTappa): Promise<void> {
  await lsSet(key(t.camminoId, t.ordinal, t.direction), t).catch(() => {})
}

/** La tappa del catalogo nel verso scelto dal piano (polilinea girata e capi scambiati se inverso). Null se non esiste. */
export function orientedTappa(detail: CamminoDetail, ordinal: number, direction: 'forward' | 'reverse', pois: PoiItem[] = [], now = Date.now()): OfflineTappa | null {
  const found = detail.tappe.find(t => t.ordinal === ordinal)
  if (!found) return null
  const t = orderForDirection([found], direction)[0]
  return {
    camminoId: detail.id, ordinal, direction, polyline: t.polyline, lengthM: t.lengthM, pois, savedAt: now,
    name: `${t.fromName ?? 'Partenza'} → ${t.toName ?? 'Arrivo'}`,
  }
}
