import type { SupabaseClient } from '@supabase/supabase-js'
import type { ItineraryStop } from '../itinerary'

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
