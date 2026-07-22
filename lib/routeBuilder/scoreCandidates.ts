// Arricchisce i candidati grezzi generati da lib/routeBuilder/loopBuilder.ts (solo geometria, senza
// quota) con dati reali — quota dal DTM, POI lungo il tracciato — e li ordina in base a quanto si
// avvicinano ai vincoli richiesti e al profilo dell'escursionista. Stessi segnali di
// personalizzazione già usati da app/api/route-search/route.ts (vedi lib/hikerContext.ts), qui
// applicati a percorsi generati invece che a percorsi trovati per nome.
import type { TrackPoint } from '@/lib/tcxParser'
import { enrichGeometryWithElevation } from '@/lib/dtm/elevationEnrich'
import { computeBbox, haversineM, minDistToTrack } from '@/lib/geoUtils'
import { fetchOverpass } from '@/lib/overpassTrails'
import { fetchGnaPois } from '@/lib/pois/gnaSource'
import { fetchPtprPois } from '@/lib/pois/ptprSource'
import { fetchWikidataPois } from '@/lib/pois/wikidataSource'
import { fetchOverpassPois } from '@/lib/pois/overpassSource'
import { deduplicateByProximity } from '@/lib/pois/dedupe'
import type { PoiItem, PoiType } from '@/lib/overpass'
import type { HikerConcernKey, HikerEnvironmentPrefKey } from '@/lib/hikerProfile'
import { DtmUnavailableError } from '@/lib/dtm/dtmClient'
import type { RouteCandidate } from './loopBuilder'

// Quanti POI (i più vicini al tracciato) portare con sé nel risultato — per l'anteprima grafica
// nella scheda risultato (componenti/upload/RouteBuilder.tsx), non serve l'elenco completo.
const MAX_POIS_IN_RESULT = 6

export interface ScoredCandidate {
  type: RouteCandidate['type']
  routePolyline: [number, number][]
  trackPoints: TrackPoint[]
  distanceMeters: number
  elevationGain: number
  elevationLoss: number
  altitudeMax: number
  altitudeMin: number
  estimatedTimeSeconds: number
  matchNote: string
  hasSteepSections: boolean
  pois: PoiItem[]
}

// NOTA su 'ombra' (HIKER_ENVIRONMENT_PREFS): deliberatamente non punteggiata in questo giro.
// lib/usosuolo/usoSuoloClient.ts esporrebbe la copertura del suolo (bosco/non bosco) per
// campionarla lungo il tracciato, ma quel client non è mai stato verificato contro una risposta
// reale del suo endpoint WFS (stesso avvertimento scritto nel suo stesso file: i nomi dei campi
// classe sono "provvisori... in attesa di una vera risposta DescribeFeatureType") — stessa classe
// di rischio già vissuta con l'integrazione DTM in questa stessa funzionalità. Costruirci sopra un
// punteggio silenzioso rischierebbe di ripetere lo stesso ciclo di debug per una preferenza
// secondaria: meglio ometterlo esplicitamente (nessun effetto su score/matchNote per 'ombra') che
// inventare un proxy non verificato. 'poca_folla' resta anch'esso senza effetto, per lo stesso
// principio: nessun segnale dati affidabile disponibile oggi per stimarlo.
export interface ScoreOptions {
  targetDistanceM: number
  targetElevationM?: number | null
  environmentPrefs: HikerEnvironmentPrefKey[]
  concerns: HikerConcernKey[]
  // Tipi di POI che l'utente vorrebbe incontrare lungo il percorso (es. una cascata, un belvedere)
  // — non un luogo specifico già nominato (per quello vedi lib/routeBuilder/resolvePlace.ts e la
  // destinazione in app/api/route-build/route.ts), solo una preferenza di categoria che l'algoritmo
  // usa per scegliere/premiare tra i candidati già generati.
  desiredPoiTypes: PoiType[]
  // Bbox dell'intera ricerca (stesso passato a fetchWalkNetwork in route-build/route.ts) — usato
  // per un'unica query aggiuntiva e mirata (scalini/gradini), non per candidato.
  bbox: [number, number, number, number]
}

// Pendenza (m di dislivello ogni 100m percorsi) oltre la quale un tratto è considerato ripido —
// solo per segmenti abbastanza lunghi da non essere rumore di risoluzione del DTM.
const STEEP_GRADE_PCT = 15
const STEEP_MIN_SEGMENT_M = 15

const WATER_POI_TYPES = new Set(['spring', 'waterfall'])

// Un candidato che passa entro questa distanza da un tratto con gradini (highway=steps) è
// considerato "attraversa scalini" — generoso abbastanza da assorbire l'imprecisione del grafo
// (i nodi del percorso non cadono mai esattamente sui nodi della way originale).
const STEPS_PROXIMITY_M = 20

// Stesse 4 fonti e stessa deduplica di app/api/pois/route.ts (usato lato client da
// lib/poisProxy.ts), chiamate qui direttamente lato server per evitare un giro HTTP verso se
// stessi — niente cache poi_cache: i bbox di una ricerca "Costruisci" sono tipicamente unici per
// utente, il beneficio della cache condivisa è marginale rispetto al costo di replicarla qui.
async function fetchPoisNearPolyline(polyline: [number, number][], radiusM = 300): Promise<PoiItem[]> {
  const bbox = computeBbox(polyline)
  const [gna, ptpr, wikidata, overpass] = await Promise.allSettled([
    fetchGnaPois(bbox),
    fetchPtprPois(bbox),
    fetchWikidataPois(bbox),
    fetchOverpassPois(bbox),
  ])
  const all = [
    ...(gna.status      === 'fulfilled' ? gna.value      : []),
    ...(ptpr.status     === 'fulfilled' ? ptpr.value     : []),
    ...(wikidata.status === 'fulfilled' ? wikidata.value : []),
    ...(overpass.status === 'fulfilled' ? overpass.value : []),
  ]
  // Le fonti impostano distFromTrack a 0 al momento del fetch (calcolato solo per bbox, non per
  // tracciato) — va ricalcolato qui rispetto alla polilinea reale, stesso pattern di
  // lib/poisProxy.ts's fetchPoisNearTrack (uso lato client, non riusabile qui: fa una fetch a URL
  // relativo pensata per il browser, non per una route API server-side).
  return deduplicateByProximity(all, 50)
    .map(poi => ({ ...poi, distFromTrack: Math.round(minDistToTrack(poi.lat, poi.lon, polyline)) }))
    .filter(poi => poi.distFromTrack <= radiusM)
}

// Query separata e minima (solo id/geometria di way "steps", niente altri tag) invece di
// richiedere i tag su OGNI way della rete percorribile in lib/routeBuilder/osmGraph.ts — quella
// query è già stata alleggerita apposta per evitare il 504 osservato in produzione (vedi git log),
// quindi l'informazione aggiuntiva serve qui come query a parte, non riaprendo quella.
async function fetchStepsGeometries(bbox: [number, number, number, number]): Promise<[number, number][][]> {
  const [minLat, minLon, maxLat, maxLon] = bbox
  const query = `[out:json][timeout:15];way["highway"="steps"](${minLat},${minLon},${maxLat},${maxLon});out geom;`
  try {
    const json = await fetchOverpass<{ elements: Array<{ type: string; geometry?: { lat: number; lon: number }[] }> }>(query, 15_000)
    return (json.elements ?? [])
      .filter(el => el.type === 'way' && (el.geometry?.length ?? 0) >= 2)
      .map(el => el.geometry!.map(p => [p.lat, p.lon] as [number, number]))
  } catch {
    return []
  }
}

function crossesSteps(polyline: [number, number][], stepsWays: [number, number][][]): boolean {
  for (const way of stepsWays) {
    for (const [lat, lon] of way) {
      if (minDistToTrack(lat, lon, polyline) <= STEPS_PROXIMITY_M) return true
    }
  }
  return false
}

function maxGradePct(trackPoints: TrackPoint[]): number {
  let max = 0
  for (let i = 0; i < trackPoints.length - 1; i++) {
    const a = trackPoints[i]
    const b = trackPoints[i + 1]
    if (a.lat == null || a.lon == null || b.lat == null || b.lon == null) continue
    if (a.altitudeMeters == null || b.altitudeMeters == null) continue
    const distM = haversineM(a.lat, a.lon, b.lat, b.lon)
    if (distM < STEEP_MIN_SEGMENT_M) continue
    const grade = (Math.abs(b.altitudeMeters - a.altitudeMeters) / distM) * 100
    if (grade > max) max = grade
  }
  return max
}

function buildMatchNote(opts: {
  distanceMeters: number
  elevationGain: number
  targetDistanceM: number
  targetElevationM?: number | null
  waterPoiCount: number
  desiredPoiCount: number
  environmentPrefs: HikerEnvironmentPrefKey[]
  hasSteepSections: boolean
  hasSteps: boolean
}): string {
  const notes: string[] = []
  const distanceKm = opts.distanceMeters / 1000
  const targetKm = opts.targetDistanceM / 1000
  const distanceOffPct = Math.abs(opts.distanceMeters - opts.targetDistanceM) / opts.targetDistanceM
  notes.push(distanceOffPct <= 0.1
    ? `vicino al tuo obiettivo di ${targetKm.toFixed(1)} km`
    : `${distanceKm.toFixed(1)} km, contro un obiettivo di ${targetKm.toFixed(1)} km`)

  if (opts.targetElevationM != null) {
    const gainOffPct = Math.abs(opts.elevationGain - opts.targetElevationM) / Math.max(opts.targetElevationM, 1)
    if (gainOffPct <= 0.15) notes.push(`dislivello in linea con la tua richiesta`)
  }

  if (opts.environmentPrefs.includes('acqua') && opts.waterPoiCount > 0) {
    notes.push(`${opts.waterPoiCount} punt${opts.waterPoiCount === 1 ? 'o' : 'i'} d'acqua lungo il percorso`)
  }

  if (opts.desiredPoiCount > 0) notes.push('passa vicino al tipo di luogo che cercavi')
  if (opts.hasSteepSections) notes.push('presenta tratti ripidi')
  if (opts.hasSteps) notes.push('presenta tratti con gradini')

  return notes.join(', ')
}

/**
 * Arricchisce ogni candidato con quota reale (DTM) e POI lungo il tracciato, poi ordina per
 * vicinanza al target di lunghezza/dislivello — i candidati senza copertura DTM vengono scartati
 * (nessun profilo altimetrico affidabile da proporre). Ritorna al più `maxResults` percorsi.
 */
export async function scoreAndEnrichCandidates(
  raw: RouteCandidate[],
  opts: ScoreOptions,
  maxResults = 8,
): Promise<ScoredCandidate[]> {
  // Una sola query per l'intera richiesta (non per candidato) — condivisa da tutti i candidati
  // valutati qui sotto.
  const stepsWaysPromise = fetchStepsGeometries(opts.bbox)

  const enriched = await Promise.all(raw.map(async candidate => {
    // enrichGeometryWithElevation lancia (non ritorna null) solo per il caso statico "DTM non
    // configurato" (DtmUnavailableError, vedi lib/dtm/dtmClient.ts) — senza questo catch, un
    // singolo candidato senza chiave configurata farebbe fallire l'intera Promise.all e quindi
    // l'intera richiesta, invece di limitarsi a scartare quel candidato come "nessun profilo
    // altimetrico disponibile" (stesso esito pratico di un ritorno null per mancata copertura).
    // Il log distingue i due casi silenziosi altrimenti indistinguibili dall'esterno: chiave
    // mancante (fix di configurazione) contro nessuna tile DTM per questo bbox specifico (limite
    // di copertura dati, non un bug).
    const [enrichedTrack, pois, stepsWays] = await Promise.all([
      enrichGeometryWithElevation(candidate.polyline).catch(e => {
        if (e instanceof DtmUnavailableError) console.error('[route-build] DTM non configurato (OPENTOPOGRAPHY_API_KEY mancante):', e.message)
        else console.error('[route-build] enrichGeometryWithElevation errore inatteso:', e)
        return null
      }),
      fetchPoisNearPolyline(candidate.polyline).catch(() => [] as PoiItem[]),
      stepsWaysPromise,
    ])
    if (!enrichedTrack) {
      console.log('[route-build] candidato scartato: nessuna quota disponibile per questo bbox')
      return null
    }

    const hasSteepSections = maxGradePct(enrichedTrack.trackPoints) >= STEEP_GRADE_PCT
    const hasSteps = crossesSteps(candidate.polyline, stepsWays)
    const waterPoiCount = pois.filter(p => WATER_POI_TYPES.has(p.type)).length
    const desiredPoiCount = opts.desiredPoiTypes.length > 0 ? pois.filter(p => opts.desiredPoiTypes.includes(p.type)).length : 0

    const distanceScore = 1 - Math.min(1, Math.abs(enrichedTrack.distanceMeters - opts.targetDistanceM) / opts.targetDistanceM)
    const elevationScore = opts.targetElevationM != null
      ? 1 - Math.min(1, Math.abs(enrichedTrack.elevationGain - opts.targetElevationM) / Math.max(opts.targetElevationM, 1))
      : 0.5
    const environmentScore = opts.environmentPrefs.includes('acqua') ? Math.min(1, waterPoiCount / 3) : 0
    const poiMatchScore = opts.desiredPoiTypes.length > 0 ? Math.min(1, desiredPoiCount / 2) : 0
    const concernsPenalty = hasSteepSections && (
      opts.concerns.includes('vertigini') || opts.concerns.includes('salite_ripide') || opts.concerns.includes('terreno_instabile')
    ) ? 0.4 : 0
    // Stessi concerns già usati per i tratti ripidi, più 'orientamento' (chi fatica a orientarsi
    // spesso preferisce anche evitare tratti attrezzati/scalinate poco intuitive) — non un
    // concern dedicato a parte, non ne esiste uno più specifico in lib/hikerProfile.ts oggi.
    const stepsPenalty = hasSteps && (
      opts.concerns.includes('vertigini') || opts.concerns.includes('terreno_instabile') || opts.concerns.includes('orientamento')
    ) ? 0.3 : 0

    const score = distanceScore * 0.4 + elevationScore * 0.25 + environmentScore * 0.15 + poiMatchScore * 0.2 - concernsPenalty - stepsPenalty

    const matchNote = buildMatchNote({
      distanceMeters: enrichedTrack.distanceMeters,
      elevationGain: enrichedTrack.elevationGain,
      targetDistanceM: opts.targetDistanceM,
      targetElevationM: opts.targetElevationM,
      waterPoiCount,
      desiredPoiCount,
      environmentPrefs: opts.environmentPrefs,
      hasSteepSections,
      hasSteps,
    })

    const scored: ScoredCandidate = {
      type: candidate.type,
      routePolyline: candidate.polyline,
      trackPoints: enrichedTrack.trackPoints,
      distanceMeters: enrichedTrack.distanceMeters,
      elevationGain: enrichedTrack.elevationGain,
      elevationLoss: enrichedTrack.elevationLoss,
      altitudeMax: enrichedTrack.altitudeMax,
      altitudeMin: enrichedTrack.altitudeMin,
      estimatedTimeSeconds: enrichedTrack.estimatedTimeSeconds,
      matchNote,
      hasSteepSections,
      pois: pois.slice().sort((a, b) => a.distFromTrack - b.distFromTrack).slice(0, MAX_POIS_IN_RESULT),
    }
    return { scored, score }
  }))

  return enriched
    .filter((e): e is { scored: ScoredCandidate; score: number } => !!e)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map(e => e.scored)
}
