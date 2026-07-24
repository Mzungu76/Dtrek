'use client'
// Costruisce un PlannedHike salvabile a partire da un candidato "costruito" o "trovato" — estratto
// da components/upload/RouteBuilder.tsx (era usato solo da handleSave lì) perché anche
// app/percorsi-per-te/page.tsx deve salvare un percorso scelto senza passare dal wizard completo
// (nessuno step titolo/data intermedio — vedi il bottone "Apri" di quella pagina).
import type { ScoredCandidate as BuiltCandidate } from '@/lib/routeBuilder/scoreCandidates'
import type { FoundRouteItem } from '@/lib/routeBuilder/foundRoute'
import type { PlannedHike } from '@/lib/plannedStore'
import { downsamplePolyline } from '@/lib/downsamplePolyline'
import { fetchPoisNearTrack } from '@/lib/poisProxy'
import { fetchWikiForNamedPois } from '@/lib/wikipedia'

export function buildHikeFromBuilt(data: BuiltCandidate, title: string, date: string, pendingExpiresAt: string): PlannedHike {
  return {
    id: 'routebuild_' + Date.now().toString(36),
    title: title.trim() || 'Percorso costruito',
    plannedDate: date || undefined,
    createdAt: new Date().toISOString(),
    distanceMeters: data.distanceMeters,
    elevationGain: data.elevationGain,
    elevationLoss: data.elevationLoss,
    altitudeMax: data.altitudeMax,
    altitudeMin: data.altitudeMin,
    estimatedTimeSeconds: data.estimatedTimeSeconds,
    trackPoints: data.trackPoints,
    routePolyline: downsamplePolyline(data.trackPoints),
    pendingExpiresAt,
  }
}

export function buildHikeFromFound(data: FoundRouteItem, title: string, date: string, pendingExpiresAt: string): PlannedHike {
  const track = data.track
  return {
    id: 'aisearch_' + Date.now().toString(36),
    title: title.trim() || data.name,
    plannedDate: date || undefined,
    userNotes: data.description,
    createdAt: new Date().toISOString(),
    distanceMeters: track.distanceMeters,
    elevationGain: track.elevationGain,
    elevationLoss: track.elevationLoss,
    altitudeMax: track.altitudeMax,
    altitudeMin: track.altitudeMin,
    estimatedTimeSeconds: track.estimatedTimeSeconds,
    osmId: data.osmId,
    trackPoints: track.trackPoints.length ? track.trackPoints : undefined,
    routePolyline: track.routePolyline,
    pendingExpiresAt,
    // Metadati che sopravvivono solo per un percorso "trovato" — vedi lib/plannedStore.ts.
    sourceUrl: data.sourceUrl,
    comfortVerdict: data.comfortVerdict,
    comfortNote: data.comfortNote,
    zone: data.zone,
    difficulty: data.difficulty,
  }
}

/**
 * Sostituisce la quota STIMATA di un candidato "Su misura" (vedi lib/routeBuilder/scoreCandidates.ts,
 * che in ricerca non chiama mai il DTM reale) con la quota vera — una sola chiamata, un solo
 * candidato, solo quando l'utente sceglie/importa questo percorso specifico (mai per l'intera lista
 * di risultati). Tollerante: se la chiamata fallisce o va oltre il tetto morbido del server, ritorna
 * il candidato invariato (resta con la quota stimata, `hasElevation: false`) — un errore qui non
 * deve mai impedire di salvare il percorso.
 */
export async function enrichBuiltCandidateForImport(candidate: BuiltCandidate): Promise<BuiltCandidate> {
  try {
    const res = await fetch('/api/route-build/enrich-elevation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidate }),
    })
    if (!res.ok) return candidate
    const data = await res.json()
    return data?.candidate ?? candidate
  } catch {
    return candidate
  }
}

/** Arricchisce in place con POI/Wikipedia lungo la traccia — condiviso tra i rami di salvataggio
 *  (percorso costruito o trovato, dal wizard o da "Percorsi per te"), stesso blocco che prima era
 *  duplicato in RouteBuilder.tsx e AiRouteSearch.tsx. */
export async function enrichWithPois(hike: PlannedHike): Promise<void> {
  const gps = hike.trackPoints?.filter(p => p.lat && p.lon).map(p => [p.lat!, p.lon!] as [number, number]) ?? []
  if (gps.length < 2) return
  try {
    const deadline = new Promise<null>(r => setTimeout(() => r(null), 7000))
    const pois = await Promise.race([fetchPoisNearTrack(gps, 300), deadline])
    if (pois?.length) {
      hike.cachedPois = pois
      const poiWiki = await Promise.race([fetchWikiForNamedPois(pois), deadline])
      if (poiWiki?.length) hike.cachedPoiWiki = poiWiki
    }
  } catch {}
}
