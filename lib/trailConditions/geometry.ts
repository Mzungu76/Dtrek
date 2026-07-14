// Risolve la geometria/bbox di una relation OSM escursionistica — dalla cache `trails` se già
// presente (import via Esplora), altrimenti direttamente da Overpass. Condiviso da
// /api/trails/conditions e /api/route-search/resolve, gli unici due consumer rimasti.
import { supabase } from '@/lib/supabase'
import { computeBbox } from '@/lib/geoUtils'
import { fetchOverpass, stitchWays, type OsmRelation, type OsmWay } from '@/lib/overpassTrails'
import type { SignalContext } from './types'

interface OverpassGeometryResponse {
  elements: Array<OsmRelation | OsmWay>
}

export async function resolveGeometryFallback(osmRelationId: number): Promise<{ bbox: SignalContext['bbox']; geometry: [number, number][] } | null> {
  try {
    const query = `[out:json][timeout:20];relation(${osmRelationId})->.rel;.rel out body;way(r.rel);out geom;`
    const data = await fetchOverpass<OverpassGeometryResponse>(query, 15_000)
    const relation = data.elements.find((e): e is OsmRelation => e.type === 'relation')
    if (!relation?.members) return null

    const wayMap = new Map<number, OsmWay>()
    for (const el of data.elements) if (el.type === 'way') wayMap.set(el.id, el)

    const geometry = stitchWays(relation.members, wayMap)
    if (geometry.length < 2) return null

    const [minLat, minLon, maxLat, maxLon] = computeBbox(geometry, 0.005).split(',').map(Number)
    return { geometry, bbox: { minLat, minLon, maxLat, maxLon } }
  } catch {
    return null
  }
}

export async function resolveTrailGeometry(osmRelationId: number): Promise<[number, number][] | null> {
  const { data } = await supabase
    .from('trails')
    .select('geometry_simplified')
    .eq('osm_relation_id', osmRelationId)
    .maybeSingle()
  const cached = data?.geometry_simplified as [number, number][] | null | undefined
  if (cached && cached.length >= 2) return cached

  const fallback = await resolveGeometryFallback(osmRelationId)
  return fallback?.geometry ?? null
}
