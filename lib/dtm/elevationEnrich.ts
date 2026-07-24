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

// Guadagno stimato per km, per una stima SENZA DTM (nessuna chiamata a OpenTopography) — usata in
// ricerca al posto della quota reale, per non consumare la quota rate-limited del servizio su
// candidati che l'utente potrebbe scartare (vedi scoreAndEnrichCandidates). ~50m/km è una media
// plausibile per un sentiero escursionistico italiano — non personalizzata sullo storico
// dell'utente, solo sulla distanza geometrica del candidato. La quota reale arriva comunque, una
// sola volta, quando l'utente sceglie/importa il percorso (vedi enrichBuiltCandidateWithRealElevation
// in lib/routeBuilder/scoreCandidates.ts).
const ESTIMATED_GAIN_PER_KM = 50
// Nessun riferimento di quota assoluta è disponibile senza DTM — una base a media quota evita di
// applicare per errore la fascia "alta quota" di trailScore.ts's altitudeTerrainMultiplier a un
// sentiero qualunque a bassa quota; corretta dalla quota reale all'importazione.
const ESTIMATED_BASE_ALTITUDE_M = 800

/**
 * Stima elevationGain/Loss/altitudeMax/Min/estimatedTimeSeconds da sola distanza geometrica,
 * SENZA alcuna chiamata DTM — usata in ricerca (vedi scoreAndEnrichCandidates) per non spendere
 * quota OpenTopography su candidati non ancora scelti dall'utente. `trackPoints` non porta
 * `altitudeMeters` (nessun dato reale disponibile): i consumatori che dipendono da un profilo
 * altimetrico per-punto (es. la rilevazione tratti ripidi in scoreCandidates.ts's maxGradePct)
 * degradano già con garbo in sua assenza, esattamente come per un percorso "trovato" senza
 * copertura DTM.
 */
export function estimateElevationForGeometry(geometry: [number, number][]): EnrichedTrack {
  const now = new Date()
  const trackPoints: TrackPoint[] = geometry.map(([lat, lon]) => ({ time: now.toISOString(), lat, lon }))
  const distanceKm = totalDistanceKm(geometry)
  const elevationGain = Math.round(distanceKm * ESTIMATED_GAIN_PER_KM)
  // Un anello torna al punto di partenza, un andata/ritorno ripercorre lo stesso tratto al
  // contrario: in entrambi i casi la perdita di quota stimata è simmetrica al guadagno.
  const elevationLoss = elevationGain

  return {
    trackPoints,
    distanceMeters: Math.round(distanceKm * 1000),
    elevationGain,
    elevationLoss,
    altitudeMax: ESTIMATED_BASE_ALTITUDE_M + elevationGain,
    altitudeMin: ESTIMATED_BASE_ALTITUDE_M,
    estimatedTimeSeconds: estimateTimeMinutes(distanceKm, elevationGain) * 60,
  }
}

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
