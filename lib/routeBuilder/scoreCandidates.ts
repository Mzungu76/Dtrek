// Arricchisce i candidati grezzi generati da lib/routeBuilder/loopBuilder.ts (solo geometria, senza
// quota) con dati reali — quota dal DTM, POI lungo il tracciato — e li ordina in base a quanto si
// avvicinano ai vincoli richiesti e al profilo dell'escursionista. Stessi segnali di
// personalizzazione già usati da app/api/route-search/route.ts (vedi lib/hikerContext.ts), qui
// applicati a percorsi generati invece che a percorsi trovati per nome.
import type { TrackPoint } from '@/lib/tcxParser'
import { enrichGeometryWithElevation, estimateElevationForGeometry } from '@/lib/dtm/elevationEnrich'
import { computeBbox, haversineM, minDistToTrack } from '@/lib/geoUtils'
import { fetchOverpass } from '@/lib/overpassTrails'
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
  // false in ogni risultato di ricerca (vedi scoreAndEnrichCandidates): elevationGain/Loss/
  // altitudeMax/Min sono una stima geometrica, non la quota reale dal DTM — diventa true solo dopo
  // enrichBuiltCandidateWithRealElevation, chiamata una sola volta quando l'utente sceglie/importa
  // il candidato (mai per l'intera lista di risultati). Stesso concetto già usato da ResolvedTrack
  // per i percorsi "trovati", qui sempre false finché non arriva l'arricchimento reale.
  hasElevation: boolean
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

// Solo Overpass, non le 4 fonti di app/api/pois/route.ts (usato lato client da
// lib/poisProxy.ts) — GNA/PTPR/Wikidata sono API pubbliche più lente/meno affidabili, e qui
// vengono interrogate una volta PER CANDIDATO (fino a ENRICH_CAP in route-build/route.ts, in
// parallelo con l'arricchimento DTM): con 4 fonti invece di una, un'unica fonte lenta su un solo
// candidato basta a rallentare l'intera richiesta, un fattore concreto nei timeout di produzione
// osservati su aree con rete rada. L'anteprima qui è solo per la scheda risultato (matchNote,
// bonus di punteggio) — l'arricchimento completo a 4 fonti avviene comunque di nuovo al momento
// del salvataggio (enrichWithPois in RouteBuilder.tsx), quindi il percorso salvato non perde nulla.
async function fetchPoisNearPolyline(polyline: [number, number][], radiusM = 300): Promise<PoiItem[]> {
  const bbox = computeBbox(polyline)
  const pois = await fetchOverpassPois(bbox).catch(() => [] as PoiItem[])
  // distFromTrack è calcolato dalla fonte solo per bbox, non per tracciato — va ricalcolato qui
  // rispetto alla polilinea reale, stesso pattern di lib/poisProxy.ts's fetchPoisNearTrack.
  return deduplicateByProximity(pois, 50)
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
 * Arricchisce ogni candidato con una STIMA di quota (nessuna chiamata DTM — vedi
 * lib/dtm/elevationEnrich.ts's estimateElevationForGeometry) e POI lungo il tracciato, poi ordina
 * per vicinanza al target di lunghezza/dislivello. La quota reale arriva solo dopo, una sola volta,
 * quando l'utente sceglie/importa un candidato (enrichBuiltCandidateWithRealElevation sotto) — non
 * più qui, per non consumare la quota rate-limited di OpenTopography su candidati che potrebbero
 * non essere mai scelti. Ritorna al più `maxResults` percorsi — alzato da 8 a 14 insieme al
 * maxCandidates di lib/routeBuilder/loopBuilder.ts, per il minimo di 10 risultati per ricerca
 * (costruiti+trovati insieme) imposto dall'utente.
 */
export async function scoreAndEnrichCandidates(
  raw: RouteCandidate[],
  opts: ScoreOptions,
  maxResults = 14,
): Promise<ScoredCandidate[]> {
  // Una sola query per l'intera richiesta (non per candidato) — condivisa da tutti i candidati
  // valutati qui sotto.
  const stepsWaysPromise = fetchStepsGeometries(opts.bbox)

  const enriched = await Promise.all(raw.map(async candidate => {
    if (candidate.polyline.length < 2) return null
    const [enrichedTrack, pois, stepsWays] = await Promise.all([
      Promise.resolve(estimateElevationForGeometry(candidate.polyline)),
      fetchPoisNearPolyline(candidate.polyline).catch(() => [] as PoiItem[]),
      stepsWaysPromise,
    ])

    // maxGradePct salta le coppie senza altitudeMeters (vedi sopra) — sempre 0/false qui, dato che
    // la stima non porta quota per-punto: coerente con l'assenza di dati reali, si affina
    // all'importazione insieme al resto.
    const hasSteepSections = maxGradePct(enrichedTrack.trackPoints) >= STEEP_GRADE_PCT
    const hasSteps = crossesSteps(candidate.polyline, stepsWays)
    const waterPoiCount = pois.filter(p => WATER_POI_TYPES.has(p.type)).length
    const desiredPoiCount = opts.desiredPoiTypes.length > 0 ? pois.filter(p => opts.desiredPoiTypes.includes(p.type)).length : 0

    const distanceScore = 1 - Math.min(1, Math.abs(enrichedTrack.distanceMeters - opts.targetDistanceM) / opts.targetDistanceM)
    // Sempre neutro (0.5): enrichedTrack.elevationGain qui è una stima geometrica generica (vedi
    // estimateElevationForGeometry), non la quota reale — confrontarla contro targetElevationM
    // darebbe una falsa precisione nel ranking, dato che la stima non varia per il dislivello REALE
    // di candidati diversi con lunghezza simile. Si affina solo dopo l'importazione, quando la
    // quota è quella vera (ma il ranking di ricerca, per costruzione, è già passato).
    const elevationScore = 0.5
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
      // Non enrichedTrack.elevationGain è una stima, non la quota reale (vedi sopra) — confrontarla
      // col dislivello desiderato dell'utente e mostrare "dislivello in linea con la tua richiesta"
      // sarebbe una rassicurazione non veritiera. Il testo torna a comparire (con il dato vero)
      // solo se il chiamante ricalcola il matchNote dopo l'arricchimento reale.
      targetElevationM: undefined,
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
      hasElevation: false,
    }
    return { scored, score }
  }))

  return enriched
    .filter((e): e is { scored: ScoredCandidate; score: number } => !!e)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map(e => e.scored)
}

/**
 * Arricchisce UN SOLO candidato già scelto/importato dall'utente con la quota reale dal DTM —
 * chiamata da app/api/route-build/enrich-elevation/route.ts, mai durante la ricerca stessa (vedi
 * scoreAndEnrichCandidates sopra). Se il DTM non ha copertura per questo bbox (o non è configurato,
 * DtmUnavailableError), il candidato torna invariato — resta con la quota stimata,
 * `hasElevation: false` — stesso comportamento tollerante già usato da resolveTrack.ts per i
 * percorsi "trovati": un profilo altimetrico mancante non deve mai impedire di salvare il percorso.
 */
export async function enrichBuiltCandidateWithRealElevation(candidate: ScoredCandidate): Promise<ScoredCandidate> {
  const enrichedTrack = await enrichGeometryWithElevation(candidate.routePolyline).catch(e => {
    if (e instanceof DtmUnavailableError) console.error('[route-build] DTM non configurato (OPENTOPOGRAPHY_API_KEY mancante):', e.message)
    else console.error('[route-build] enrichBuiltCandidateWithRealElevation errore inatteso:', e)
    return null
  })
  if (!enrichedTrack) return candidate

  return {
    ...candidate,
    trackPoints: enrichedTrack.trackPoints,
    distanceMeters: enrichedTrack.distanceMeters,
    elevationGain: enrichedTrack.elevationGain,
    elevationLoss: enrichedTrack.elevationLoss,
    altitudeMax: enrichedTrack.altitudeMax,
    altitudeMin: enrichedTrack.altitudeMin,
    estimatedTimeSeconds: enrichedTrack.estimatedTimeSeconds,
    hasSteepSections: maxGradePct(enrichedTrack.trackPoints) >= STEEP_GRADE_PCT,
    hasElevation: true,
  }
}
