import type { SupabaseClient } from '@supabase/supabase-js'
import { camminoToPlaceCandidate, type BuiltCammino } from './build'
import type { GpxVariant } from '../../../lib/cammini/gpxTappe'

// Scrittura di un Cammino in dtrek_places + dtrek_cammino_tappe + dtrek_place_relations.
// Non passa da scripts/places/import.ts: la deduplicazione per prossimità/nome pensata per punti
// non ha senso per una linea di cento chilometri, e un cammino è identificato in modo univoco da
// (source, source_id) = ('osm', 'cammino/<id>'), quindi qui basta un upsert idempotente.

export interface CamminoImportStats {
  placeId: string
  tappeWritten: number
  tappeRemoved: number
  relationsWritten: number
}

export async function importCammino(supabase: SupabaseClient, built: BuiltCammino): Promise<CamminoImportStats> {
  const candidate = camminoToPlaceCandidate(built)

  const { data: place, error: placeError } = await supabase.from('dtrek_places').upsert({
    name:         candidate.name,
    meta_type:    'cammino',
    subtype:      null,
    description:  candidate.description ?? null,
    latitude:     candidate.latitude,
    longitude:    candidate.longitude,
    region:       candidate.region ?? null,
    official_url: candidate.officialUrl ?? null,
    source:       candidate.source,
    source_id:    candidate.sourceId,
    confidence:   candidate.confidence,
    metadata:     candidate.metadata ?? {},
  }, { onConflict: 'source,source_id' }).select('id').single()
  if (placeError) throw placeError
  const placeId = place.id as string

  const { error: sourceError } = await supabase.from('dtrek_place_sources').upsert({
    place_id: placeId, source: candidate.source, source_id: candidate.sourceId,
    raw_type: candidate.rawType ?? null, confidence: candidate.confidence,
    last_synced_at: new Date().toISOString(),
  }, { onConflict: 'source,source_id' })
  if (sourceError) throw sourceError

  // Solo le colonne dell'ETL: elevation_* (calcolate dopo) sopravvivono a un re-import.
  const rows = built.tappe.map(t => ({
    cammino_id:      placeId,
    ordinal:         t.ordinal,
    name:            t.name,
    from_name:       t.fromName ?? null,
    to_name:         t.toName ?? null,
    from_place_id:   t.fromAnchorId ?? null,
    to_place_id:     t.toAnchorId ?? null,
    length_m:        Math.round(t.lengthM),
    polyline:        t.polyline,
    source:          t.source,
    ends_at_anchor:  t.endsAtAnchor ?? null,
    osm_relation_id: t.officialRelationId ?? null,
  }))
  const { error: tappeError } = await supabase.from('dtrek_cammino_tappe').upsert(rows, { onConflict: 'cammino_id,ordinal' })
  if (tappeError) throw tappeError

  // Un re-import con meno tappe non deve lasciare quelle vecchie in coda.
  const { data: removed, error: removeError } = await supabase
    .from('dtrek_cammino_tappe').delete().eq('cammino_id', placeId).gt('ordinal', built.tappe.length).select('id')
  if (removeError) throw removeError

  // Borghi di partenza/arrivo → relazione 'near' (cammino → borgo) con le tappe che vi toccano.
  const touches = new Map<string, number[]>()
  for (const t of built.tappe) {
    for (const id of [t.fromAnchorId, t.toAnchorId]) {
      if (!id) continue
      const list = touches.get(id) ?? []
      if (!list.includes(t.ordinal)) list.push(t.ordinal)
      touches.set(id, list)
    }
  }
  const relations = [...touches.entries()].map(([toId, ordinals]) => ({
    from_place_id: placeId, to_place_id: toId, relation_type: 'near', metadata: { tappe: ordinals },
  }))
  if (relations.length > 0) {
    const { error: relError } = await supabase.from('dtrek_place_relations')
      .upsert(relations, { onConflict: 'from_place_id,to_place_id,relation_type' })
    if (relError) throw relError
  }

  return { placeId, tappeWritten: rows.length, tappeRemoved: removed?.length ?? 0, relationsWritten: relations.length }
}

/** Scrittura dei tracciati GPX "variante" (dtrek_cammino_tappe_varianti) accanto a un cammino già
 *  importato con importCammino — solo per i cammini da GPX (buildFromGpxFiles), non da Overpass.
 *  `source_filename` identifica la variante tra un import e l'altro: niente coda da pulire come per
 *  le tappe, un re-import con meno varianti lascia solo righe di file non più presenti nella fonte. */
export async function importCamminoVarianti(supabase: SupabaseClient, placeId: string, variants: GpxVariant[]): Promise<number> {
  if (variants.length === 0) return 0
  const rows = variants.map(v => ({
    cammino_id:      placeId,
    tappa_ordinal:   v.tappaOrdinal,
    name:            v.name,
    source_filename: v.filename,
    length_m:        Math.round(v.lengthM),
    polyline:        v.polyline,
  }))
  const { error } = await supabase.from('dtrek_cammino_tappe_varianti').upsert(rows, { onConflict: 'cammino_id,source_filename' })
  if (error) throw error
  return rows.length
}
