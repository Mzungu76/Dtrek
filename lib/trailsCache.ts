// Thin Supabase wrapper for the `trails` cache table (see supabase-schema.sql).
// Always goes through the service-role client (lib/supabase.ts) — this table
// has no per-user data and no RLS, it's a shared reference cache.
import { supabase } from '@/lib/supabase'
import { padBbox } from '@/lib/overpassTrails'

export type DataQuality = 'osm_tags' | 'calculated' | 'estimated'
export type RouteType = 'loop' | 'out_and_back' | 'point_to_point'

export interface TrailCacheRow {
  osmRelationId: number
  name: string
  distanceKm: number | null
  elevationGain: number | null
  elevationLoss: number | null
  estimatedTimeMin: number | null
  difficulty?: string | null
  routeType: RouteType
  operator?: string | null
  network?: string | null
  bbox: { minLat: number; maxLat: number; minLon: number; maxLon: number }
  geometrySimplified: [number, number][]
  dataQuality: DataQuality
  description?: string | null
  fromLabel?: string | null
  toLabel?: string | null
  ref?: string | null
  caiScale?: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCacheRow(data: any): TrailCacheRow {
  return {
    osmRelationId: data.osm_relation_id,
    name: data.name,
    distanceKm: data.distance_km,
    elevationGain: data.elevation_gain,
    elevationLoss: data.elevation_loss,
    estimatedTimeMin: data.estimated_time_min,
    difficulty: data.difficulty,
    routeType: data.route_type,
    operator: data.operator,
    network: data.network,
    bbox: data.bbox,
    geometrySimplified: data.geometry_simplified ?? [],
    dataQuality: data.data_quality,
    description: data.description,
    fromLabel: data.from_label,
    toLabel: data.to_label,
    ref: data.ref,
    caiScale: data.cai_scale,
  }
}

// Tetto di sicurezza per il pre-riscaldamento in blocco (vedi app/api/admin/prewarm-trails/route.ts)
// — non un limite tecnico del piano gratuito Supabase, ma un margine scelto a mano: ogni riga pesa
// al più ~2-3 KB (geometria semplificata a 60 punti, vedi lib/downsamplePolyline.ts, più qualche
// campo scalare), quindi 40.000 righe restano sotto ai ~120 MB — abbondantemente entro i 500 MB del
// piano Hobby anche sommati agli ~141 MB già in uso da altre tabelle, con margine per la crescita
// futura di dtm_cache/walk_network_cache/attività reali. Il job di pre-riscaldamento controlla
// questo conteggio PRIMA di scrivere altre righe e si ferma da solo se già raggiunto, invece di
// fidarsi di una stima fatta a monte sul numero di relazioni OSM da coprire (mai verificato).
export const MAX_TRAILS_CACHE_ROWS = 40_000

/** Conteggio economico (COUNT senza scaricare righe) — usato solo dal tetto di sicurezza sopra. */
export async function getTrailsCacheRowCount(): Promise<number> {
  const { count } = await supabase.from('trails').select('*', { count: 'exact', head: true })
  return count ?? 0
}

export async function getCachedTrail(osmRelationId: number): Promise<TrailCacheRow | null> {
  const { data } = await supabase
    .from('trails')
    .select('*')
    .eq('osm_relation_id', osmRelationId)
    .maybeSingle()

  return data ? mapCacheRow(data) : null
}

// Read-through lookup for area search: fetches every already-cached row among a
// candidate id list (already bbox-filtered upstream by Overpass) in a single
// query. Filtering by exact id list — rather than a bbox comparison — sidesteps
// needing PostGIS or a geospatial index: the existing unique index on
// osm_relation_id already makes an `IN (...)` lookup on ~150 ids fast.
export async function getCachedTrailsInBbox(osmRelationIds: number[]): Promise<Map<number, TrailCacheRow>> {
  if (osmRelationIds.length === 0) return new Map()
  const { data } = await supabase
    .from('trails')
    .select('*')
    .in('osm_relation_id', osmRelationIds)

  return new Map((data ?? []).map(row => [row.osm_relation_id, mapCacheRow(row)]))
}

// Percorsi cachati la cui estensione (bbox) ricade almeno in parte entro radiusKm da (lat, lon) —
// usata da lib/routeBuilder/generateRecommendations.ts per le card "Esistenti" senza dover
// richiamare Overpass ad ogni generazione. Test di overlap tra due rettangoli (il bbox della query,
// centrato sul punto e allargato di radiusKm, e il bbox salvato di ciascun sentiero) sulle colonne
// generate bbox_min_lat/bbox_max_lat/bbox_min_lon/bbox_max_lon (vedi
// supabase/migrations/add_trails_bbox_indexed_columns.sql) — non un test "punto dentro un solo
// bbox", che mancherebbe sentieri vicini la cui estensione non include esattamente il centroide.
export async function findCachedTrailsNearPoint(lat: number, lon: number, radiusKm: number, limit = 20): Promise<TrailCacheRow[]> {
  const [minLat, minLon, maxLat, maxLon] = padBbox([lat, lon, lat, lon], radiusKm)
  const { data } = await supabase
    .from('trails')
    .select('*')
    .lte('bbox_min_lat', maxLat)
    .gte('bbox_max_lat', minLat)
    .lte('bbox_min_lon', maxLon)
    .gte('bbox_max_lon', minLon)
    .limit(limit)

  return (data ?? []).map(mapCacheRow)
}

export async function upsertTrailCache(row: TrailCacheRow): Promise<void> {
  await supabase.from('trails').upsert({
    osm_relation_id: row.osmRelationId,
    name: row.name,
    distance_km: row.distanceKm,
    elevation_gain: row.elevationGain,
    elevation_loss: row.elevationLoss,
    estimated_time_min: row.estimatedTimeMin,
    difficulty: row.difficulty ?? null,
    route_type: row.routeType,
    operator: row.operator ?? null,
    network: row.network ?? null,
    bbox: row.bbox,
    geometry_simplified: row.geometrySimplified,
    data_quality: row.dataQuality,
    description: row.description ?? null,
    from_label: row.fromLabel ?? null,
    to_label: row.toLabel ?? null,
    ref: row.ref ?? null,
    cai_scale: row.caiScale ?? null,
    source: 'osm',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'osm_relation_id' })
}
