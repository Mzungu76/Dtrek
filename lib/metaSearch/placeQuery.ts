import type { SupabaseClient } from '@supabase/supabase-js'
import type { MetaSearchOrigin } from './types'

// Condiviso da searchBorghi.ts/searchSiti.ts — entrambi interrogano dtrek_places con lo stesso
// pattern (filtro geografico grossolano in SQL, conteggio fonti, poi ranking in JS); questo file
// evita di duplicare quella parte identica (piano §48.3, "non creare tre copie dei componenti").

// Pre-filtro geografico in SQL (bbox), non il taglio finale per distanza reale — approssimazione
// costante gradi/km sufficiente per restringere la query, non per il punteggio (vedi ranking.ts).
// Non genericizzato sul query builder di supabase-js (i tipi di ritorno concatenati di
// PostgrestFilterBuilder sono troppo specifici per un vincolo generico pulito) — restituisce solo
// il riquadro, ogni chiamante applica .gte()/.lte() sulla propria query.
export function originBbox(origin: MetaSearchOrigin, maxDistanceKm: number) {
  const degreesPerKm = 1 / 111
  const pad = maxDistanceKm * degreesPerKm
  return {
    minLat: origin.lat - pad, maxLat: origin.lat + pad,
    minLon: origin.lon - pad, maxLon: origin.lon + pad,
  }
}

// Un `.in()` con centinaia/migliaia di UUID genera una query string di decine di KB — oltre la
// soglia che Kong (il gateway davanti a PostgREST su Supabase) accetta, risposta 400 Bad Request
// con corpo vuoto (bug reale in produzione 2026-09-21, dopo che searchSiti.ts/searchBorghi.ts
// hanno alzato il tetto di query.limit() a 3000: ogni ricerca andava in "Errore interno"). A
// bocconi paralleli invece di un solo `.in()` gigante — ogni richiesta resta sotto quella soglia
// indipendentemente da quante righe restituisce la query principale.
const SOURCE_COUNT_CHUNK_SIZE = 150

export async function fetchSourceCounts(supabase: SupabaseClient, placeIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (placeIds.length === 0) return counts

  const chunks: string[][] = []
  for (let i = 0; i < placeIds.length; i += SOURCE_COUNT_CHUNK_SIZE) {
    chunks.push(placeIds.slice(i, i + SOURCE_COUNT_CHUNK_SIZE))
  }

  const results = await Promise.all(chunks.map(chunk =>
    supabase.from('dtrek_place_sources').select('place_id').in('place_id', chunk)
  ))

  for (const { data, error } of results) {
    if (error) throw error
    for (const row of (data ?? []) as { place_id: string }[]) {
      counts.set(row.place_id, (counts.get(row.place_id) ?? 0) + 1)
    }
  }
  return counts
}

export function countPopulatedFields(row: Record<string, unknown>, fields: readonly string[]): number {
  return fields.filter(f => row[f] != null).length
}
