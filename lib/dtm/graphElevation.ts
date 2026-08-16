// Fase 7 di docs/navigator-orizzonti-roadmap.md — arricchisce i nodi del trail graph
// persistito (lib/navigation/trailGraphStore.ts) con la quota reale, UNA VOLTA al momento del
// download del pacchetto offline, mai in tempo reale durante la navigazione (il servizio DTM
// esterno è rate-limited a 50 chiamate/24h — vedi lib/dtm/dtmClient.ts). Stesso principio già
// stabilito in lib/dtm/elevationEnrich.ts: un'unica bbox per l'intera area del grafo, una sola
// chiamata DTM (fetchDtmTileCached, cache-ata 180 giorni per bbox), non una richiesta per nodo
// — il grafo di un'escursione (bbox ~1.1km padded, vedi trailGraphStore.ts) è comunque piccolo
// abbastanza da stare in un solo tile DTM.
import { bboxBufferMeters } from '@/lib/geo/bufferUtils'
import { fetchDtmTileCached } from '@/lib/dtm/dtmCache'
import { elevationAtPoint } from '@/lib/dtm/slopeAspect'

export interface GraphNodeCoord {
  id: number
  lat: number
  lon: number
}

const TILE_BUFFER_M = 50 // stesso margine di elevationEnrich.ts

/**
 * Best-effort: nessuna eccezione propagata per un fallimento del DTM (nessuna copertura per
 * quel bbox, servizio non configurato, rate limit) — il chiamante (packageManager.ts) tratta
 * una Map vuota o parziale come "grafo senza quota", non come un errore del pacchetto offline
 * altrimenti completo.
 */
export async function enrichGraphNodesWithElevation(nodes: GraphNodeCoord[]): Promise<Map<number, number>> {
  const result = new Map<number, number>()
  if (nodes.length === 0) return result

  try {
    const geometry: [number, number][] = nodes.map((n) => [n.lat, n.lon])
    const bbox = bboxBufferMeters(geometry, TILE_BUFFER_M)
    const tile = await fetchDtmTileCached(bbox)
    if (!tile) return result

    for (const node of nodes) {
      const alt = elevationAtPoint(tile, node.lat, node.lon)
      if (alt != null) result.set(node.id, alt)
    }
  } catch {
    // Vedi commento sopra — mai bloccante per il chiamante.
  }
  return result
}
