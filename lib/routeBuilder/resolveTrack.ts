// Risolve la traccia reale (geometria + quota) di un percorso "trovato" già individuato per osmId
// (relazione OSM) o gpxUrl (link diretto pubblicato dalla fonte) — estratto da
// app/api/route-search/resolve/route.ts (che ora è un thin wrapper su questa funzione) per essere
// richiamabile anche lato server dal nuovo endpoint di ricerca a livelli
// (app/api/route-build/search/route.ts), che deve risolvere la traccia di più candidati in
// parallelo senza un self-call HTTP.
import type { TrackPoint } from '@/lib/tcxParser'
import { resolveGeometryFallback } from '@/lib/trailConditions/geometry'
import { enrichGeometryWithElevation } from '@/lib/dtm/elevationEnrich'
import { downloadAndParseGpx } from '@/lib/gpxSourceFetch'
import { downsamplePolyline } from '@/lib/downsamplePolyline'
import { haversineM } from '@/lib/geoUtils'

function polylineDistanceM(points: [number, number][]): number {
  let total = 0
  for (let i = 0; i < points.length - 1; i++) {
    total += haversineM(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1])
  }
  return total
}

export interface ResolvedTrack {
  ok: true
  osmId: number | null
  source: 'gpx' | 'osm'
  routePolyline: [number, number][]
  trackPoints: TrackPoint[]
  distanceMeters: number
  elevationGain: number
  elevationLoss: number
  altitudeMax: number
  altitudeMin: number
  estimatedTimeSeconds: number
  hasElevation: boolean
}

export interface ResolveTrackFailure {
  ok: false
  reason: 'missing_input' | 'gpx_download_failed' | 'geometry_not_found'
}

export type ResolveTrackResult = ResolvedTrack | ResolveTrackFailure

/**
 * Chiamata solo per candidati che un chiamante ha già deciso di voler mostrare/salvare con una
 * traccia reale (scelta esplicita dall'utente, o tentativo eager con cap su un piccolo numero di
 * candidati) — mai per un'intera lista grezza senza limiti, per non sprecare chiamate Overpass/DTM/
 * GPX su percorsi che potrebbero non servire mai.
 */
export async function resolveTrackForCandidate(
  { osmId, gpxUrl }: { osmId: number | null; gpxUrl: string | null },
): Promise<ResolveTrackResult> {
  if (osmId == null && !gpxUrl) return { ok: false, reason: 'missing_input' }

  // La traccia scaricata dalla fonte ha priorità: è quella esatta pubblicata dalla pagina citata,
  // non un'approssimazione per nome — vedi lib/gpxSourceFetch.ts.
  if (gpxUrl) {
    const gpx = await downloadAndParseGpx(gpxUrl)
    if (gpx) {
      return {
        ok: true,
        osmId,
        source: 'gpx',
        routePolyline: downsamplePolyline(gpx.trackPoints),
        trackPoints: gpx.trackPoints,
        distanceMeters: gpx.distanceMeters,
        elevationGain: gpx.elevationGain,
        elevationLoss: gpx.elevationLoss,
        altitudeMax: gpx.altitudeMax,
        altitudeMin: gpx.altitudeMin,
        estimatedTimeSeconds: gpx.estimatedTimeSeconds,
        hasElevation: true,
      }
    }
    // Il download/parsing del GPX è fallito (link non più valido, formato inatteso...) — se c'è
    // comunque un match Overpass prosegue con quello sotto, altrimenti nessuna traccia disponibile.
    if (osmId == null) return { ok: false, reason: 'gpx_download_failed' }
  }

  const fallback = await resolveGeometryFallback(osmId!)
  if (!fallback) return { ok: false, reason: 'geometry_not_found' }

  const enriched = await enrichGeometryWithElevation(fallback.geometry)
  if (!enriched) {
    // Traccia trovata ma senza copertura DTM per la quota — il chiamante può comunque usarla con
    // la sola geometria (mappa disponibile, profilo altimetrico no), come un import manuale. La
    // distanza però è comunque calcolabile dalla geometria reale (bug precedente: veniva
    // restituita 0 qui, mascherato prima d'ora solo perché AiRouteSearch aveva una propria stima
    // di riserva su cui ripiegare — questo endpoint condiviso non ce l'ha, va calcolata qui).
    const distanceMeters = polylineDistanceM(fallback.geometry)
    return {
      ok: true,
      osmId,
      source: 'osm',
      routePolyline: downsamplePolyline(fallback.geometry.map(([lat, lon]) => ({ time: '', lat, lon }))),
      trackPoints: [],
      distanceMeters,
      elevationGain: 0,
      elevationLoss: 0,
      altitudeMax: 0,
      altitudeMin: 0,
      // Stima a passo costante (4 km/h) in assenza di dati altimetrici — stesso fattore già usato
      // altrove nell'app per una stima di riserva (vedi buildHikeFromFound in RouteBuilder.tsx).
      estimatedTimeSeconds: Math.round((distanceMeters / 1000 / 4) * 3600),
      hasElevation: false,
    }
  }

  return {
    ok: true,
    osmId,
    source: 'osm',
    routePolyline: downsamplePolyline(enriched.trackPoints),
    trackPoints: enriched.trackPoints,
    distanceMeters: enriched.distanceMeters,
    elevationGain: enriched.elevationGain,
    elevationLoss: enriched.elevationLoss,
    altitudeMax: enriched.altitudeMax,
    altitudeMin: enriched.altitudeMin,
    estimatedTimeSeconds: enriched.estimatedTimeSeconds,
    hasElevation: true,
  }
}
