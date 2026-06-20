// Community signal collector — nearby OSM Notes (hazard/condition reports
// from any OSM contributor) plus DTrek's own trail reviews. `trail_reviews`
// does not exist yet in this schema (no excursions/trail_reviews table) —
// the query is kept here for forward compatibility and is wrapped so a
// missing-table error (Postgres 42P01) degrades to a neutral 0, never throws.
import { supabase } from '@/lib/supabase'
import { haversineM } from '@/lib/geoUtils'
import type { CommunitySignal, SignalContext } from '@/lib/si/types'

const TIMEOUT_MS = 5000
const NOTES_RADIUS_M = 200
const NOTES_PENALTY_CAP = -40
const REVIEWS_RECENT_MONTHS = 3

interface OsmNoteFeature {
  geometry: { coordinates: [number, number] } // [lon, lat]
  properties: { date_created: string; comments?: Array<{ text?: string }> }
}

export async function collectCommunitySignal(_osmRelationId: number, ctx: SignalContext): Promise<CommunitySignal> {
  const [notes, dtrekReviewsScore] = await Promise.all([
    fetchNearbyOsmNotes(ctx),
    fetchDtrekReviewsScore(_osmRelationId),
  ])

  let osmNotesPenalty = 0
  for (const note of notes) {
    osmNotesPenalty += notePenaltyFor(note.date)
  }
  osmNotesPenalty = Math.max(osmNotesPenalty, NOTES_PENALTY_CAP)

  return { osmNotesPenalty, osmNotesDetails: notes, dtrekReviewsScore }
}

async function fetchNearbyOsmNotes(ctx: SignalContext): Promise<Array<{ text: string; date: string; distanceM: number }>> {
  try {
    const { minLat, maxLat, minLon, maxLon } = ctx.bbox
    const bbox = [minLon, minLat, maxLon, maxLat].join(',')
    const url = `https://api.openstreetmap.org/api/0.6/notes.json?bbox=${bbox}&limit=50&closed=0`
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!res.ok) throw new Error(`OSM Notes error ${res.status}`)
    const d = await res.json()
    const features: OsmNoteFeature[] = d.features ?? []

    return features
      .map(f => {
        const [lon, lat] = f.geometry.coordinates
        return {
          text: f.properties.comments?.[0]?.text ?? '',
          date: f.properties.date_created,
          distanceM: Math.round(haversineM(ctx.centroid.lat, ctx.centroid.lon, lat, lon)),
        }
      })
      .filter(n => n.distanceM <= NOTES_RADIUS_M)
  } catch {
    return []
  }
}

function notePenaltyFor(dateStr: string): number {
  const months = (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24 * 30)
  if (months < 3) return -20
  if (months < 12) return -10
  return -5
}

async function fetchDtrekReviewsScore(osmRelationId: number): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('trail_reviews')
      .select('ne_e_valsa_la_pena, created_at')
      .eq('osm_relation_id', osmRelationId)
    if (error) return 0
    if (!data) return 0

    let score = 0
    for (const row of data) {
      const months = (Date.now() - new Date(row.created_at).getTime()) / (1000 * 60 * 60 * 24 * 30)
      if (months >= REVIEWS_RECENT_MONTHS) continue
      score += row.ne_e_valsa_la_pena ? 10 : -20
    }
    return score
  } catch {
    return 0
  }
}
