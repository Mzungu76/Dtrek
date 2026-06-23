// Community signal collector — nearby OSM Notes (hazard/condition reports
// from any OSM contributor) plus difficulty markers extracted from imported
// GPX files (Komoot/AllTrails waypoint & track comments, see
// lib/difficultyMarkers.ts). No internal DTrek review system: the source is
// always either OSM's own community data or the hiker's own GPX track.
import { supabase } from '@/lib/supabase'
import { haversineM } from '@/lib/geoUtils'
import type { CommunitySignal, SignalContext } from '@/lib/si/types'

const TIMEOUT_MS = 5000
const NOTES_RADIUS_M = 200
const NOTES_PENALTY_CAP = -40
const MARKERS_RADIUS_M = 200
const MARKERS_PENALTY_CAP = -40

interface OsmNoteFeature {
  geometry: { coordinates: [number, number] } // [lon, lat]
  properties: { date_created: string; comments?: Array<{ text?: string }> }
}

export async function collectCommunitySignal(_osmRelationId: number, ctx: SignalContext): Promise<CommunitySignal> {
  const [notes, difficultyMarkers] = await Promise.all([
    fetchNearbyOsmNotes(ctx),
    fetchNearbyDifficultyMarkers(ctx),
  ])

  let osmNotesPenalty = 0
  for (const note of notes) {
    osmNotesPenalty += notePenaltyFor(note.date)
  }
  osmNotesPenalty = Math.max(osmNotesPenalty, NOTES_PENALTY_CAP)

  let difficultyMarkersPenalty = 0
  for (const m of difficultyMarkers) {
    difficultyMarkersPenalty += markerPenaltyFor(m.severity)
  }
  difficultyMarkersPenalty = Math.max(difficultyMarkersPenalty, MARKERS_PENALTY_CAP)

  return { osmNotesPenalty, osmNotesDetails: notes, difficultyMarkersPenalty, difficultyMarkersDetails: difficultyMarkers }
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

async function fetchNearbyDifficultyMarkers(
  ctx: SignalContext,
): Promise<Array<{ text: string; severity: 'info' | 'warning' | 'danger'; distanceM: number }>> {
  try {
    const { minLat, maxLat, minLon, maxLon } = ctx.bbox
    const { data, error } = await supabase
      .from('trail_difficulty_markers')
      .select('lat, lon, source_text, severity')
      .gte('lat', minLat).lte('lat', maxLat)
      .gte('lon', minLon).lte('lon', maxLon)
    if (error || !data) return []

    return data
      .map(m => ({
        text: m.source_text as string,
        severity: m.severity as 'info' | 'warning' | 'danger',
        distanceM: Math.round(haversineM(ctx.centroid.lat, ctx.centroid.lon, m.lat as number, m.lon as number)),
      }))
      .filter(m => m.distanceM <= MARKERS_RADIUS_M)
  } catch {
    return []
  }
}

function markerPenaltyFor(severity: 'info' | 'warning' | 'danger'): number {
  if (severity === 'danger') return -20
  if (severity === 'warning') return -10
  return 0
}
