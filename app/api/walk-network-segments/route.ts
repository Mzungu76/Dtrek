// Rete percorribile OSM grezza (layer "Sentieri" dell'editor manuale dei percorsi,
// components/upload/ManualRouteEditor.tsx), già contratta in tratti intersezione-intersezione
// (buildNetworkSegments, lib/routeBuilder/osmGraph.ts) — un click deve selezionare tutta la strada
// fino al prossimo incrocio, non un singolo arco fra due nodi consecutivi della stessa way.
// Riusa la stessa cache Supabase del fetch Overpass già condivisa da Modalità A/B
// (fetchWalkNetworkCached, lib/routeBuilder/walkNetworkCache.ts) — nessuna query Overpass nuova.
import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { fetchWalkNetworkCached } from '@/lib/routeBuilder/walkNetworkCache'
import { buildNetworkSegments, type NetworkSegment } from '@/lib/routeBuilder/osmGraph'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// La rete grezza è molto più densa dei Percorsi censiti (ogni strada/sentiero, non solo quelli con
// nome) — un bbox troppo grande scaricherebbe una rete enorme e lenta da contrarre/trasferire (la
// causa dei fallimenti Overpass osservati in produzione con il tetto precedente di 400 km², quando
// il client mandava l'intero rettangolo visibile invece di un raggio fisso). L'editor ora richiede
// sempre un'area centrata sul centro mappa di raggio NETWORK_FETCH_RADIUS_M (vedi
// ManualRouteEditor.tsx, ~900m → poco più di 3 km²) — questo tetto resta un secondo cancello lato
// server con un margine di sicurezza, non il limite operativo vero e proprio.
const MAX_AREA_KM2 = 20

function areaKm2(bbox: [number, number, number, number]): number {
  const [minLat, minLon, maxLat, maxLon] = bbox
  const latKm = (maxLat - minLat) * 111
  const lonKm = (maxLon - minLon) * 111 * Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180)
  return Math.abs(latKm * lonKm)
}

function parseBbox(raw: unknown): [number, number, number, number] {
  if (!Array.isArray(raw) || raw.length !== 4 || raw.some(v => typeof v !== 'number' || !Number.isFinite(v))) {
    throw new Error('bbox non valido')
  }
  const bbox = raw as [number, number, number, number]
  if (bbox[0] >= bbox[2] || bbox[1] >= bbox[3]) throw new Error('bbox non valido')
  if (areaKm2(bbox) > MAX_AREA_KM2) throw new Error('Area troppo grande, effettua zoom in sulla mappa')
  return bbox
}

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  let bbox: [number, number, number, number]
  try {
    const body = await req.json()
    bbox = parseBbox(body.bbox)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Richiesta non valida' }, { status: 400 })
  }

  try {
    const network = await fetchWalkNetworkCached(bbox)
    const segments: NetworkSegment[] = buildNetworkSegments(network)
    return NextResponse.json({ segments })
  } catch (e) {
    console.error('[walk-network-segments]', e)
    return NextResponse.json({ error: 'Errore interno' }, { status: 500 })
  }
}
