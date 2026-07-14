// Arricchisce una geometria OSM grezza (solo lat/lon, senza quota — vedi
// lib/trailConditions/geometry.ts's resolveGeometryFallback) con l'elevazione dal DTM, per costruire dei
// TrackPoint[] utilizzabili come una traccia GPX vera dalla ricerca percorsi con l'AI
// (app/api/route-search/route.ts). DtmUnavailableError si propaga (dataset non configurato —
// stesso confine già stabilito da trailDtmProfile.ts), un tile senza copertura per quel bbox
// restituisce `points: []` invece di lanciare (fatto normale, non un errore).
import type { TrackPoint } from '@/lib/tcxParser'
import { bboxBufferMeters } from '@/lib/geo/bufferUtils'
import { fetchDtmTileCached } from '@/lib/dtm/dtmCache'
import { elevationAtPoint } from '@/lib/dtm/slopeAspect'
import { totalDistanceKm, estimateTimeMinutes } from '@/lib/trailStats'

export interface EnrichedTrack {
  trackPoints: TrackPoint[]
  distanceMeters: number
  elevationGain: number
  elevationLoss: number
  altitudeMax: number
  altitudeMin: number
  estimatedTimeSeconds: number
}

const TILE_BUFFER_M = 50

/**
 * Prende una geometria [lat,lon][] (nessuna quota) e restituisce un set di statistiche/TrackPoint
 * completo di altitudeMeters, pronto per savePlanned — la stessa forma che produce un import GPX.
 * Ritorna null se il DTM non ha copertura per questo bbox (percorso comunque importabile senza
 * profilo altimetrico, come un import manuale, non un errore bloccante per il chiamante).
 */
export async function enrichGeometryWithElevation(geometry: [number, number][]): Promise<EnrichedTrack | null> {
  if (geometry.length < 2) return null

  const bbox = bboxBufferMeters(geometry, TILE_BUFFER_M)
  const tile = await fetchDtmTileCached(bbox)
  if (!tile) return null

  const trackPoints: TrackPoint[] = []
  let elevationGain = 0
  let elevationLoss = 0
  let altitudeMax = -Infinity
  let altitudeMin = Infinity
  let prevAlt: number | null = null
  const now = new Date()

  for (const [lat, lon] of geometry) {
    const alt = elevationAtPoint(tile, lat, lon)
    if (alt == null) continue
    trackPoints.push({ time: now.toISOString(), lat, lon, altitudeMeters: alt })
    if (alt > altitudeMax) altitudeMax = alt
    if (alt < altitudeMin) altitudeMin = alt
    if (prevAlt != null) {
      const delta = alt - prevAlt
      if (delta > 0) elevationGain += delta
      else elevationLoss += -delta
    }
    prevAlt = alt
  }

  if (trackPoints.length < 2) return null

  const distanceKm = totalDistanceKm(geometry)
  const estimatedTimeSeconds = estimateTimeMinutes(distanceKm, elevationGain) * 60

  return {
    trackPoints,
    distanceMeters: Math.round(distanceKm * 1000),
    elevationGain: Math.round(elevationGain),
    elevationLoss: Math.round(elevationLoss),
    altitudeMax: Math.round(altitudeMax),
    altitudeMin: Math.round(altitudeMin),
    estimatedTimeSeconds,
  }
}
