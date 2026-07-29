// Tag OSM di una relation escursionistica (accesso, superficie, network...) — usati da
// /api/trails/conditions per modulare il segnale meteo (es. superficie fangosa vs roccia). Cache
// permanente sulla colonna trails.osm_tags (vedi la migrazione add_trails_osm_tags_column.sql):
// questi tag non cambiano quasi mai, quindi stesso trattamento "per sempre, popolata al bisogno"
// già in uso per geometry_simplified nella stessa tabella (lib/trailConditions/geometry.ts) —
// prima di questa cache venivano rifatti da zero via Overpass ad ogni apertura di ogni guida con
// un sentiero riconosciuto, anche per lo stesso sentiero visto migliaia di volte.
import { supabase } from '@/lib/supabase'
import { fetchOverpass } from '@/lib/overpassTrails'

const TIMEOUT_MS = 5000

interface OverpassTagsResponse {
  elements: Array<{ tags?: Record<string, string> }>
}

export async function fetchOsmTags(osmRelationId: number): Promise<{ tags: Record<string, string> }> {
  const { data: cached } = await supabase
    .from('trails')
    .select('osm_tags')
    .eq('osm_relation_id', osmRelationId)
    .maybeSingle()
  // NULL ⇒ mai richiesti prima (da distinguere da {} già salvato, un risultato valido — una
  // relation senza tag interessanti è comunque una risposta nota, non va richiesta di nuovo).
  if (cached?.osm_tags != null) return { tags: cached.osm_tags as Record<string, string> }

  try {
    const query = `[out:json];relation(${osmRelationId});out tags;`
    const data = await fetchOverpass<OverpassTagsResponse>(query, TIMEOUT_MS)
    const tags = data.elements?.[0]?.tags ?? {}
    // Fire-and-forget: un mancato salvataggio (riga trails assente per questo id, raro — vedi
    // resolveTrailGeometry per lo stesso caso limite) significa solo un altro tentativo alla
    // prossima apertura, non un errore da bloccare la risposta per l'utente corrente.
    supabase.from('trails').update({ osm_tags: tags }).eq('osm_relation_id', osmRelationId)
      .then(({ error }) => { if (error) console.error('[trails.osm_tags] update error:', error.message) })
    return { tags }
  } catch {
    return { tags: {} }
  }
}
