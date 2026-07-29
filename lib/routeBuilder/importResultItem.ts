// Salva un ResultItem (percorso "trovato" o "costruito" da una ricerca — vedi
// components/upload/RouteBuilder.tsx per il tipo) come PlannedHike/Guida — nucleo condiviso tra il
// wizard di ricerca (salvataggio singolo o import in blocco) e la creazione di una Guida a partire
// da una ricerca salvata (app/profilo/ricerche-salvate/[id]/page.tsx), così le due strade non
// duplicano lo stesso arricchimento (quota reale, POI, punteggi).
import { savePlanned, type PlannedHike } from '@/lib/plannedStore'
import { computeCtsForHike } from '@/lib/computeCtsForHike'
import { computeSafetyForHike } from '@/lib/computeSafetyForHike'
import {
  buildHikeFromBuilt, buildHikeFromFound, enrichWithPois,
  enrichBuiltCandidateForImport, enrichFoundCandidateForImport,
} from '@/lib/routeBuilder/buildHikeFromCandidate'
import { routeTypeLabel } from '@/lib/routeBuilder/loopBuilder'
import type { TrackPoint } from '@/lib/tcxParser'
import type { ResultItem } from '@/components/upload/RouteBuilder'

/** Titolo di default per un ResultItem senza nome scelto dall'utente — un candidato "trovato" ha
 *  già un nome proprio (documentato altrove), un candidato "costruito" no, quindi si numera. */
export function defaultTitleForResultItem(item: ResultItem, i: number): string {
  return item.kind === 'built' ? `${routeTypeLabel(item.data.type)} costruito ${i + 1}` : item.data.name
}

export async function saveResultItemToGuide(
  item: ResultItem, title: string, date: string, pendingExpiresAt: string,
): Promise<PlannedHike> {
  // Entrambi i tipi di candidato arrivano dalla ricerca con quota stimata (nessuna chiamata DTM in
  // quella fase, vedi searchSteps.ts's resolveOneCandidate) — qui, una sola volta per il solo
  // percorso scelto, si arricchisce con la quota reale prima di costruire l'hike. Tollerante: se
  // fallisce, si salva comunque con la stima (vedi enrichBuiltCandidateForImport/
  // enrichFoundCandidateForImport).
  const hike: PlannedHike = item.kind === 'built'
    ? buildHikeFromBuilt(await enrichBuiltCandidateForImport(item.data), title, date, pendingExpiresAt)
    : buildHikeFromFound(await enrichFoundCandidateForImport(item.data), title, date, pendingExpiresAt)

  await enrichWithPois(hike)
  await savePlanned(hike)
  computeCtsForHike(hike).catch(() => {})
  computeSafetyForHike(hike).catch(() => {})
  return hike
}

// RouteMap3D costruisce la propria traccia GPS SOLO da `trackPoints` (components/RouteMap3D.tsx,
// il ref `gps`, calcolato una sola volta al mount) — mai da `routePolyline`. Un candidato "trovato"
// (mode 'esistenti') però ha quasi sempre `track.trackPoints` vuoto: la ricerca risolve una
// `routePolyline` reale per l'anteprima 2D/il punteggio provvisorio, ma non arricchisce ogni
// risultato con l'intera traccia altimetrica finché non viene scelto/importato (vedi
// searchSteps.ts's resolveOneCandidate). Senza questo fallback la vista 3D non inizializza mai la
// mappa — resta bloccata su "Caricamento mappa 3D…" — anche se il percorso ha benissimo una
// geometria reale da disegnare. Il drappeggio 3D usa comunque il DEM del terreno per la quota
// (RouteMap3D ignora la Z incorporata di proposito, vedi il commento su setupLayers), quindi
// bastano lat/lon: altitudeMeters resta assente, i pannelli quota mostreranno una stima reale solo
// dopo l'import.
function trackPointsWithFallback(trackPoints: TrackPoint[], routePolyline: [number, number][]): TrackPoint[] {
  if (trackPoints.length >= 2) return trackPoints
  return routePolyline.map(([lat, lon], i) => ({ time: new Date(i * 1000).toISOString(), lat, lon }))
}

// Estrae dal ResultItem i soli campi richiesti da RouteMap3D — stessa forma sia per un candidato
// "costruito" (trackPoints/pois in cima) sia per uno "trovato" (annidati in `track`), senza dover
// salvare nulla prima: RouteMap3D lavora già con la sola traccia GPS (activityId/dtmProfile
// restano assenti, opzionali, va bene per un'anteprima non ancora salvata). Condiviso tra il
// wizard di ricerca (components/upload/RouteBuilder.tsx) e il dettaglio di una ricerca salvata
// (app/profilo/ricerche-salvate/[id]/page.tsx), che offre la stessa vista 3D sugli stessi risultati
// riletti dall'archivio.
export function resultItemToMap3DProps(item: ResultItem) {
  return item.kind === 'built'
    ? { trackPoints: trackPointsWithFallback(item.data.trackPoints, item.data.routePolyline), title: routeTypeLabel(item.data.type), distanceMeters: item.data.distanceMeters, elevationGain: item.data.elevationGain, pois: item.data.pois }
    : { trackPoints: trackPointsWithFallback(item.data.track.trackPoints, item.data.track.routePolyline), title: item.data.name, distanceMeters: item.data.track.distanceMeters, elevationGain: item.data.track.elevationGain, pois: item.data.pois }
}
