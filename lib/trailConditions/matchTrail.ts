// Matching spaziale best-effort tra la geometria di un percorso e le trail cache di DTrek — non
// c'è una vera foreign key, quindi si approssima campionando la polyline e verificando che frazione
// dei punti campionati ricade entro una soglia di distanza da una traccia candidata.
import { supabase } from '@/lib/supabase'
import { minDistToTrack, computeBbox } from '@/lib/geoUtils'
import type { SignalContext } from './types'

type Bbox = SignalContext['bbox']

const MATCH_THRESHOLD_M = 90
const MATCH_FRACTION_MIN = 0.8
const BBOX_PREFILTER_PAD = 0.02 // ~2km — cheap reject before the per-point haversine scan

function matchFraction(trailSample: [number, number][], candidateTrack: [number, number][]): number {
  if (candidateTrack.length < 2 || trailSample.length === 0) return 0
  let within = 0
  for (const [lat, lon] of trailSample) {
    if (minDistToTrack(lat, lon, candidateTrack) <= MATCH_THRESHOLD_M) within++
  }
  return within / trailSample.length
}

function bboxesOverlap(a: Bbox, b: Bbox, pad: number): boolean {
  return a.minLat - pad <= b.maxLat && a.maxLat + pad >= b.minLat &&
         a.minLon - pad <= b.maxLon && a.maxLon + pad >= b.minLon
}

const TRAILS_SCAN_PAGE = 1000
const TRAILS_SCAN_MAX_PAGES = 20 // ~20k rows — generous ceiling against a runaway loop, not a real expected size

/**
 * Dato la polyline di un percorso pianificato (nessun collegamento OSM), trova la trail cache
 * più simile e ne ritorna l'osm_relation_id. Due passate contro `trails`: prima uno scan
 * economico (id, bbox) sull'intera tabella, paginato oltre il cap di default di PostgREST, poi
 * solo i sopravvissuti al bbox pagano il fetch più pesante della geometria.
 */
export async function findTrailForPolyline(polyline: [number, number][]): Promise<number | null> {
  if (polyline.length < 2) return null

  const [minLatS, minLonS, maxLatS, maxLonS] = computeBbox(polyline, BBOX_PREFILTER_PAD).split(',')
  const queryBbox: Bbox = { minLat: Number(minLatS), minLon: Number(minLonS), maxLat: Number(maxLatS), maxLon: Number(maxLonS) }
  const sample = polyline

  const candidateIds: number[] = []
  for (let page = 0; page < TRAILS_SCAN_MAX_PAGES; page++) {
    const offset = page * TRAILS_SCAN_PAGE
    const { data, error } = await supabase
      .from('trails')
      .select('osm_relation_id, bbox')
      .range(offset, offset + TRAILS_SCAN_PAGE - 1)
    if (error) { console.error('[matchTrail] trails bbox scan page', page, 'failed', error); break }
    if (!data || data.length === 0) break

    for (const row of data) {
      const rowBbox = row.bbox as Bbox | null
      if (!rowBbox || bboxesOverlap(rowBbox, queryBbox, BBOX_PREFILTER_PAD)) {
        candidateIds.push(row.osm_relation_id)
      }
    }
    if (data.length < TRAILS_SCAN_PAGE) break
  }
  if (candidateIds.length === 0) return null

  const { data: geomRows } = await supabase
    .from('trails')
    .select('osm_relation_id, geometry_simplified')
    .in('osm_relation_id', candidateIds)

  if (!geomRows) return null

  let best: { id: number; fraction: number } | null = null
  for (const row of geomRows) {
    const track = (row.geometry_simplified ?? []) as [number, number][]
    if (track.length < 2) continue

    const fraction = matchFraction(sample, track)
    if (fraction >= MATCH_FRACTION_MIN && (!best || fraction > best.fraction)) {
      best = { id: row.osm_relation_id, fraction }
    }
  }
  return best?.id ?? null
}
