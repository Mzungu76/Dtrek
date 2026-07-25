// POI vicini a un tracciato, lato server — riusato da lib/routeBuilder/scoreCandidates.ts ("Su
// misura") e ora anche dalla risoluzione dei percorsi "trovati" (app/api/route-build/search/route.ts,
// lib/routeBuilder/generateRecommendations.ts), così anche "Esistenti"/"Percorsi per te" mostrano i
// POI lungo il percorso invece di lasciarli assenti come prima.
//
// Solo Overpass, non le 4 fonti di app/api/pois/route.ts (usato lato client da lib/poisProxy.ts) —
// GNA/PTPR/Wikidata sono API pubbliche più lente/meno affidabili, e qui vengono interrogate una
// volta PER CANDIDATO/PERCORSO: con 4 fonti invece di una, un'unica fonte lenta su un solo
// candidato basta a rallentare l'intera richiesta, un fattore concreto nei timeout di produzione
// osservati su aree con rete rada. L'anteprima qui è solo per la scheda risultato (matchNote, bonus
// di punteggio, stima provvisoria) — l'arricchimento completo a 4 fonti avviene comunque di nuovo
// al momento del salvataggio (enrichWithPois in RouteBuilder.tsx), quindi il percorso salvato non
// perde nulla.
import { computeBbox, minDistToTrack } from '@/lib/geoUtils'
import { fetchOverpassPois } from '@/lib/pois/overpassSource'
import { deduplicateByProximity } from '@/lib/pois/dedupe'
import type { PoiItem } from '@/lib/overpass'

export async function fetchPoisNearPolyline(polyline: [number, number][], radiusM = 300): Promise<PoiItem[]> {
  if (polyline.length < 2) return []
  const bbox = computeBbox(polyline)
  const pois = await fetchOverpassPois(bbox).catch(() => [] as PoiItem[])
  // distFromTrack è calcolato dalla fonte solo per bbox, non per tracciato — va ricalcolato qui
  // rispetto alla polilinea reale, stesso pattern di lib/poisProxy.ts's fetchPoisNearTrack.
  return deduplicateByProximity(pois, 50)
    .map(poi => ({ ...poi, distFromTrack: Math.round(minDistToTrack(poi.lat, poi.lon, polyline)) }))
    .filter(poi => poi.distFromTrack <= radiusM)
}
