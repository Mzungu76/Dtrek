import type { SupabaseClient } from '@supabase/supabase-js'
import type { ItineraryStop } from '../itinerary'
import type { MetaType, SiteType } from '../metaTypes'

// Tappe "contenute" in una Meta (piano §13/§26) — dtrek_place_relations è stata creata nel Blocco
// B ma mai popolata (nessuna fonte con POI-dentro-un-Comune è ancora importata, vedi
// docs/piano-mete-multitipologia.md e i README di scripts/places/{mic,osm}/): questa funzione è
// comunque reale e corretta, restituisce semplicemente un array vuoto finché quei dati non
// esistono — mai un itinerario fabbricato per riempire il vuoto (piano §21).
export async function fetchContainedStops(supabase: SupabaseClient, placeId: string): Promise<ItineraryStop[]> {
  const { data, error } = await supabase
    .from('dtrek_place_relations')
    .select('to_place_id, dtrek_places!dtrek_place_relations_to_place_id_fkey(id, name, latitude, longitude, description)')
    .eq('from_place_id', placeId)
    .eq('relation_type', 'contains')

  if (error) throw error

  const rows = (data ?? []) as unknown as { to_place_id: string; dtrek_places: { id: string; name: string; latitude: number; longitude: number; description: string | null } | null }[]
  return rows
    .filter((r): r is typeof r & { dtrek_places: NonNullable<typeof r.dtrek_places> } => r.dtrek_places != null)
    .map(r => ({
      id: r.dtrek_places.id,
      name: r.dtrek_places.name,
      latitude: r.dtrek_places.latitude,
      longitude: r.dtrek_places.longitude,
      description: r.dtrek_places.description ?? undefined,
    }))
}

export interface RelatedPlace {
  id: string
  name: string
  latitude: number
  longitude: number
  metaType: MetaType
  subtype: string | null
  imageUrl: string | null
}

const RELATED_RELATION_TYPES = ['part_of', 'located_in', 'near']

/**
 * "Fa parte di"/"Vicino a te" per la Guida di un Sito AUTONOMO (piano §51.6) — a differenza di
 * fetchContainedStops sopra (solo `contains`, solo `from_place_id`), qui la relazione può essere
 * stata registrata in un verso o nell'altro a seconda della fonte d'importazione: due query,
 * un'unione deduplicata, mai un'assunzione di direzionalità. Stessa nota di fetchContainedStops:
 * dtrek_place_relations non è ancora popolata da nessuna fonte — array vuoto finché non lo è,
 * mai un dato fabbricato per riempire il vuoto (piano §21).
 */
export async function fetchRelatedPlaces(supabase: SupabaseClient, placeId: string): Promise<RelatedPlace[]> {
  const cols = 'id, name, latitude, longitude, meta_type, subtype, image_url'
  const [{ data: outgoing, error: e1 }, { data: incoming, error: e2 }] = await Promise.all([
    supabase.from('dtrek_place_relations')
      .select(`to_place_id, dtrek_places!dtrek_place_relations_to_place_id_fkey(${cols})`)
      .eq('from_place_id', placeId)
      .in('relation_type', RELATED_RELATION_TYPES),
    supabase.from('dtrek_place_relations')
      .select(`from_place_id, dtrek_places!dtrek_place_relations_from_place_id_fkey(${cols})`)
      .eq('to_place_id', placeId)
      .in('relation_type', RELATED_RELATION_TYPES),
  ])
  if (e1) throw e1
  if (e2) throw e2

  type PlaceRow = { id: string; name: string; latitude: number; longitude: number; meta_type: MetaType; subtype: SiteType | null; image_url: string | null }
  const rows = [...(outgoing ?? []), ...(incoming ?? [])] as unknown as { dtrek_places: PlaceRow | null }[]

  const seen = new Set<string>([placeId])
  const related: RelatedPlace[] = []
  for (const r of rows) {
    const p = r.dtrek_places
    if (!p || seen.has(p.id)) continue
    seen.add(p.id)
    related.push({ id: p.id, name: p.name, latitude: p.latitude, longitude: p.longitude, metaType: p.meta_type, subtype: p.subtype, imageUrl: p.image_url })
  }
  return related
}
