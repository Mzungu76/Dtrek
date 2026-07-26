// Logica condivisa tra la ricerca "Esistenti" monolitica (app/api/route-build/search/route.ts,
// mantenuta come endpoint per compatibilità) e i due endpoint a step
// (app/api/route-build/step/search-find e step/search-resolve) — stessa identica logica in
// entrambi i casi, solo richiamabile sia in un'unica richiesta sia spezzata in due chiamate HTTP
// brevi (trovare candidati vs risolvere le tracce reali, la parte più pesante e variabile), ciascuna
// col proprio tetto di 60s — stesso principio già applicato a "Su misura" (vedi buildSteps.ts).
//
// SERVER-ONLY: resolveApiKeyAndSettings/resolvePlaceName toccano Supabase — non importare da un
// componente client.
import { resolvePlaceName, interpretSearchRequest, type ResolvedPlace, type InterpretedPreferences } from '@/lib/routeBuilder/resolvePlace'
import {
  searchHikingRoutesByName, queryHikingRelationsInBbox, resolveAreaBbox, padBbox, looksLikePlaceName,
  sortByDistanceFrom, type HikingRouteCandidate,
} from '@/lib/overpassTrails'
import { resolveTrackForCandidate } from '@/lib/routeBuilder/resolveTrack'
import { resolveApiKeyAndSettings } from '@/app/lib/guide/resolveApiKeyAndSettings'
import { fetchPoisNearPolyline } from '@/lib/routeBuilder/nearbyPois'
import { computeProvisionalScore } from '@/lib/routeBuilder/provisionalScore'
import { findProbabilityRoutes } from '@/lib/routeBuilder/probabilityRoutes'
import type { Bbox } from '@/lib/routeBuilder/hikingProbability'
import type { TrackPoint } from '@/lib/tcxParser'
import { DEFAULT_RADIUS_KM, ALLOWED_RADIUS_KM, DESTINATION_PROXIMITY_KM } from '@/lib/routeBuilder/buildConstants'
import { haversineM, minDistToTrack } from '@/lib/geoUtils'

export interface DestinationPoint {
  lat: number
  lon: number
}

// Quanti candidati "trovati" risolvere subito con una traccia reale — i candidati arrivano già
// ordinati dal più vicino al più lontano (vedi findTier0), quindi il cap si traduce in risultati
// realmente vicini, non casuali.
export const MAX_EAGER_RESOLVE = 8
// Quanti luoghi suggeriti dal Livello 1 (interpretazione AI) vengono ripassati al Livello 0 — una
// richiesta vaga può ammettere più interpretazioni valide, ma senza un tetto il costo Overpass per
// una singola ricerca crescerebbe senza controllo.
const MAX_INTERPRETED_PLACES = 3
// Tetto morbido sul ripiego "probabilità" (vedi findExistingRoutesForQuery) — più stretto dei 45s
// di search-resolve/route.ts perché qui arriva DOPO tier0/tier1, già in corso da un po' quando si
// raggiunge questo punto, entro lo stesso tetto duro di 60s dell'intero step.
const PROBABILITY_SOFT_DEADLINE_MS = 35_000
// Il raggio scelto dall'utente per "Esistenti" (fino a 10 km, vedi ALLOWED_RADIUS_KM) è pensato per
// una ricerca di relation già curate — leggera, un solo elenco di nomi. Il ripiego "probabilità"
// interroga invece TUTTA la rete camminabile con tag completi: alla stessa scala di raggio la
// query Overpass diventa un ordine di grandezza più pesante, causa osservata in produzione di
// timeout riproducibili a 45s. "Su misura" ha lo stesso problema e lo limita così (vedi
// BUILD_DINTORNI_MAX_KM in buildSteps.ts): stesso tetto qui, indipendente dal raggio scelto
// dall'utente per la ricerca vera e propria.
const PROBABILITY_MAX_RADIUS_KM = 3

/** Bbox per il ripiego "probabilità" — raggio sempre limitato a PROBABILITY_MAX_RADIUS_KM, a
 * prescindere dal raggio scelto dall'utente per la ricerca relation (vedi commento sopra). */
export function probabilityBboxFor(lat: number, lon: number, radiusKm: number): Bbox {
  return padBbox([lat, lon, lat, lon], Math.min(radiusKm, PROBABILITY_MAX_RADIUS_KM)) as Bbox
}

export function sanitizeSearchRadiusKm(raw: unknown): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return DEFAULT_RADIUS_KM
  return ALLOWED_RADIUS_KM.reduce((best, v) => Math.abs(v - n) < Math.abs(best - n) ? v : best)
}

export interface FoundRouteResult {
  id: number
  name: string
  hasName: boolean
  ref: string | undefined
  network: string | undefined
  routePolyline: [number, number][]
  trackPoints: TrackPoint[]
  distanceMeters: number
  elevationGain: number
  elevationLoss: number
  altitudeMax: number
  altitudeMin: number
  estimatedTimeSeconds: number
  hasElevation: boolean
  pois: import('@/lib/overpass').PoiItem[]
  provisionalScore: import('@/lib/routeBuilder/provisionalScore').ProvisionalScore
}

// Stessa convenzione "nome, area" di lib/routeBuilder/resolvePlace.ts's resolvePlaceName — vedi
// commento esteso nella versione precedente (git log di app/api/route-build/search/route.ts) per il
// perché del taglio a ESATTAMENTE 2 parti (un indirizzo completo alla Nominatim ne ha 5).
function splitQuery(query: string): { nameQuery: string; areaHint: string | null } {
  const parts = query.split(',').map(p => p.trim()).filter(Boolean)
  const areaHint = parts.length === 2 ? parts[1] : null
  const nameQuery = parts.length === 2 ? parts[0] : query.trim()
  return { nameQuery, areaHint }
}

async function findExistingRoutesNonAi(nameQuery: string, areaHint: string | null, radiusKm: number): Promise<HikingRouteCandidate[]> {
  const areaBbox = areaHint ? await resolveAreaBbox(areaHint) : null
  if (!areaBbox && !looksLikePlaceName(nameQuery)) return []

  let candidates = await searchHikingRoutesByName(nameQuery, areaBbox, 12)
  if (candidates.length === 0) {
    const nearbyBbox = areaBbox ?? await resolveAreaBbox(nameQuery)
    if (nearbyBbox) {
      const [minLat, minLon, maxLat, maxLon] = padBbox(nearbyBbox, radiusKm)
      candidates = await queryHikingRelationsInBbox(minLat, minLon, maxLat, maxLon, 20)
    }
  }
  return candidates
}

// Livello 0: sempre, gratuito — risoluzione del luogo (non-AI, solo Nominatim/Overpass) in
// parallelo con la ricerca di percorsi esistenti (non-AI, Overpass) — SENZA risolvere le tracce
// (quello è il passo successivo, resolveFoundRoutesWithPoi, deliberatamente separato).
async function findTier0(
  query: string, radiusKm: number, destination: DestinationPoint | null, fallbackPoint: DestinationPoint | null,
): Promise<{ place: ResolvedPlace | null; candidates: HikingRouteCandidate[] }> {
  const { nameQuery, areaHint } = splitQuery(query)
  const [placeResolved, rawCandidatesInitial] = await Promise.all([
    resolvePlaceName(query),
    findExistingRoutesNonAi(nameQuery, areaHint, radiusKm),
  ])
  // Se il testo non si risolve lato server (resolvePlaceName tocca Nominatim con l'IP del server —
  // spesso limitato/bloccato dalla loro policy anti-abuso per IP cloud, vedi il commento in
  // lib/routeBuilder/resolvePlaceClient.ts — o è comunque un testo troppo "sporco" per una ricerca
  // per nome, es. più luoghi incollati insieme con la virgola) MA il client ha già un punto valido
  // in mano (lat/lon già mostrati sulla mappa, da una risoluzione client-side riuscita in un passo
  // precedente, o da un tocco diretto sulla mappa), usarlo qui invece di arrendersi — evita di far
  // fallire l'intera ricerca "Esistenti" per un problema di risoluzione testuale server-side quando
  // le coordinate giuste sono già note. displayName resta il testo digitato: è già quello mostrato
  // in barra, non c'è un nome più "vero" da sostituirci.
  const place: ResolvedPlace | null = placeResolved
    ?? (fallbackPoint ? { lat: fallbackPoint.lat, lon: fallbackPoint.lon, displayName: query.trim(), source: 'nominatim' } : null)
  let rawCandidates = rawCandidatesInitial
  // Il testo digitato può risolversi in un luogo valido (place, via Nominatim in forma libera —
  // vedi resolvePlaceName) pur non "sembrando" un nome di luogo cercabile per esteso (es. più nomi
  // concatenati con virgola, come "Le mole, Il Molino, Nera Montoro, Narni": 7 parole, oltre la
  // soglia di looksLikePlaceName) — in quel caso findExistingRoutesNonAi si è già arresa (torna [])
  // senza nemmeno provare una ricerca per bbox, PUR AVENDO un punto valido in mano risolto in
  // parallelo. Con un place disponibile non serve indovinare di nuovo l'area dal testo: si cerca
  // direttamente nei dintorni di quelle coordinate, con lo stesso raggio scelto dall'utente — lo
  // stesso identico fallback bbox già usato sopra, solo centrato sul punto anziché su un'area
  // risolta dal nome.
  if (rawCandidates.length === 0 && place) {
    const [minLat, minLon, maxLat, maxLon] = padBbox([place.lat, place.lon, place.lat, place.lon], radiusKm)
    rawCandidates = await queryHikingRelationsInBbox(minLat, minLon, maxLat, maxLon, 20)
  }
  let candidates = place ? sortByDistanceFrom(rawCandidates, place.lat, place.lon) : rawCandidates
  // Percorso "tra 2 punti" (vedi FoundRouteResult più sotto): senza la geometria completa (solo il
  // centroide della relazione è noto a questo livello) non si può ancora sapere se un candidato
  // passa davvero vicino alla destinazione — ma un candidato il cui centroide è già lontano da
  // ENTRAMBI i punti è comunque improbabile che ci arrivi, quindi qui si riordina solo per portare
  // in cima ai MAX_EAGER_RESOLVE risolti davvero (il passo successivo, più costoso) i candidati più
  // plausibili, invece di sprecarli su relazioni che poi il filtro finale scarterà comunque.
  if (destination) {
    const worstCaseScore = (c: HikingRouteCandidate): number => {
      if (c.lat == null || c.lon == null) return Infinity
      const dOrigin = place ? haversineM(c.lat, c.lon, place.lat, place.lon) : 0
      const dDest = haversineM(c.lat, c.lon, destination.lat, destination.lon)
      return Math.max(dOrigin, dDest)
    }
    candidates = [...candidates].sort((a, b) => worstCaseScore(a) - worstCaseScore(b))
  }
  return { place, candidates }
}

export interface FindResult {
  place: ResolvedPlace | null
  candidates: HikingRouteCandidate[]
  // Percorsi già completamente risolti (traccia+POI+stima), non altri "candidati" da risolvere —
  // vedi il commento sopra il loro popolamento in findExistingRoutesForQuery.
  probabilityRoutes: FoundRouteResult[]
  prefill: InterpretedPreferences | null
  tierReached: 'tier0' | 'tier1'
  escalateToAi: boolean
  interpretedPlacesCount: number
}

/**
 * Livello 0 (sempre, gratuito) → Livello 1 (solo se il Livello 0 non trova nulla, e solo con AI
 * attiva + chiave personale) — NON risolve tracce reali (quello è resolveFoundRoutesWithPoi,
 * chiamata a parte). Usata sia dalla pipeline monolitica (app/api/route-build/search/route.ts)
 * sia da app/api/route-build/step/search-find/route.ts.
 */
export async function findExistingRoutesForQuery(
  user: { id: string } | null, query: string, radiusKm: number, useAi: boolean,
  destination: DestinationPoint | null = null, fallbackPoint: DestinationPoint | null = null,
): Promise<FindResult> {
  let place: ResolvedPlace | null = null
  let candidates: HikingRouteCandidate[] = []
  let prefill: InterpretedPreferences | null = null
  let tierReached: 'tier0' | 'tier1' = 'tier0'
  let interpretedPlacesCount = 0

  try {
    const level0 = await findTier0(query, radiusKm, destination, fallbackPoint)
    place = level0.place
    candidates = level0.candidates
  } catch (e) {
    console.error('[searchSteps] Livello 0 fallito:', e)
  }

  if (!place && candidates.length === 0 && useAi && user) {
    tierReached = 'tier1'
    try {
      const { apiKey, claudeModel } = await resolveApiKeyAndSettings(user.id, 'routeBuildInterpretRequest')
      if (apiKey) {
        const interpreted = await interpretSearchRequest(query, apiKey, claudeModel)
        if (interpreted) {
          prefill = interpreted.prefs
          interpretedPlacesCount = interpreted.places.length
          for (const p of interpreted.places.slice(0, MAX_INTERPRETED_PLACES)) {
            // Nessun fallbackPoint qui: ciascun `p.query` è un luogo/zona candidato DIVERSO
            // suggerito dall'interpretazione AI, non lo stesso testo originale — il punto già noto
            // lato client non ha alcun rapporto con QUESTO candidato specifico.
            const rerun = await findTier0(p.query, radiusKm, destination, null)
            if (!place && rerun.place) place = rerun.place
            if (rerun.candidates.length > 0) candidates = [...candidates, ...rerun.candidates]
          }
        }
      }
    } catch (e) {
      console.error('[searchSteps] Livello 1 (interpretazione AI) fallito:', e)
    }
  }

  // Ripiego gratuito (nessuna chiave AI, nessun costo per-utente): se il luogo si è risolto ma
  // nessuna relation route= curata è stata trovata, prova a costruire percorsi concreti dai
  // frammenti OSM grezzi (lib/routeBuilder/hikingProbability.ts) — il caso motivante originale di
  // questo intero classificatore: zone poco mappate risultavano "senza percorsi documentati" anche
  // quando la rete camminabile esiste davvero, solo mai assemblata in una relation. Già risolti
  // (traccia+POI+stima), non passano da resolveFoundRoutesWithPoi come i candidati normali — quel
  // passo serve a recuperare la traccia di una relation OSM, questi non ne hanno una da recuperare.
  let probabilityRoutes: FoundRouteResult[] = []
  if (place && candidates.length === 0) {
    try {
      const bbox = probabilityBboxFor(place.lat, place.lon, radiusKm)
      // Tetto morbido, non solo un try/catch sugli errori: findProbabilityRoutes fa 3 chiamate
      // Overpass che possono singolarmente arrivare vicino al proprio timeout interno (osservato
      // in produzione anche su resolveFoundRoutesWithPoi, che per lo stesso motivo ha già questo
      // stesso tetto in search-resolve/route.ts) — senza una scadenza propria qui, un rallentamento
      // farebbe scadere l'intero step contro il tetto duro di 60s (ricerca interrotta con errore)
      // invece di rispondere comunque con zero risultati da questo ripiego, lasciando comunque
      // margine per il resto della funzione (già in corso da tier0/tier1 quando si arriva qui).
      const outcome = await Promise.race([
        findProbabilityRoutes(bbox).then(routes => ({ kind: 'done' as const, routes })),
        new Promise<{ kind: 'timeout' }>(resolve => setTimeout(() => resolve({ kind: 'timeout' }), PROBABILITY_SOFT_DEADLINE_MS)),
      ])
      if (outcome.kind === 'timeout') {
        console.error(`[searchSteps] Ripiego probabilità: tetto morbido di ${PROBABILITY_SOFT_DEADLINE_MS}ms superato`)
      } else {
        probabilityRoutes = outcome.routes
      }
    } catch (e) {
      console.error('[searchSteps] Ripiego probabilità fallito:', e)
    }
  }

  const escalateToAi = useAi && !place && candidates.length === 0

  return { place, candidates, probabilityRoutes, prefill, tierReached, escalateToAi, interpretedPlacesCount }
}

/**
 * Risolve fino a `cap` candidati con una traccia reale, POI vicini (lib/routeBuilder/nearbyPois.ts)
 * e una stima provvisoria di Sicurezza/Trail Score (lib/routeBuilder/provisionalScore.ts) — la
 * parte più pesante e variabile della ricerca "Esistenti" (fino a `cap` risoluzioni Overpass in
 * parallelo), isolata in un passo a parte per lo stesso motivo del pathfinding di "Su misura".
 *
 * `probabilityBbox`, se passato, avvia IN PARALLELO (non dopo) il ripiego "probabilità" — trovare
 * qualche candidato relation non garantisce che la sua traccia si risolva davvero (osservato in
 * produzione: relation lontane/incomplete possono far scadere questa stessa risoluzione contro il
 * proprio tetto morbido), quindi il caso "candidati trovati ma nessuno risolto" resta comunque
 * scoperto se il ripiego parte solo DOPO aver scoperto il fallimento — a quel punto non resterebbe
 * budget di tempo per tentarlo entro lo stesso tetto. Se la risoluzione delle relation produce
 * comunque qualcosa, quella resta la fonte preferita (dati reali, curati) e il ripiego viene
 * scartato.
 */
export async function resolveFoundRoutesWithPoi(
  candidates: HikingRouteCandidate[], cap: number, destination: DestinationPoint | null = null,
  probabilityBbox: Bbox | null = null,
): Promise<FoundRouteResult[]> {
  const relationResolved = resolveRelationCandidates(candidates, cap, destination)
  if (!probabilityBbox) return relationResolved

  // Stesso tetto morbido usato per il ripiego in findExistingRoutesForQuery (vedi
  // PROBABILITY_SOFT_DEADLINE_MS sopra) — senza un proprio limite qui, un ripiego lento
  // diventerebbe il nuovo collo di bottiglia del gruppo ora che resolveRelationCandidates è
  // limitato a CANDIDATE_RESOLVE_TIMEOUT_MS per candidato, rischiando comunque di far scadere il
  // tetto morbido di 45s del chiamante (search-resolve/route.ts) e scartare anche i risultati
  // delle relation, già pronti.
  const probabilityWithDeadline = Promise.race([
    findProbabilityRoutes(probabilityBbox).catch(e => {
      console.error('[searchSteps] Ripiego probabilità (in parallelo alla risoluzione relation) fallito:', e)
      return [] as FoundRouteResult[]
    }),
    new Promise<FoundRouteResult[]>(resolve => setTimeout(() => resolve([]), PROBABILITY_SOFT_DEADLINE_MS)),
  ])

  const [relationRoutes, probabilityRoutes] = await Promise.all([relationResolved, probabilityWithDeadline])

  return relationRoutes.length > 0 ? relationRoutes : probabilityRoutes
}

// Tetto per candidato, non solo sul gruppo intero (vedi SOFT_DEADLINE_MS in
// step/search-resolve/route.ts): senza questo, un Promise.all su `cap` candidati aspetta il più
// lento di tutti prima di restituire QUALSIASI risultato — se anche un solo candidato si blocca
// (mirror Overpass congestionato), il tetto morbido del chiamante scade sull'intero gruppo e
// TUTTI i candidati già risolti con successo vengono scartati insieme a quello lento, non solo
// lui. Con un tetto per-candidato, un singolo blocco costa solo se stesso: gli altri, già
// risolti, restano nel risultato finale.
const CANDIDATE_RESOLVE_TIMEOUT_MS = 25_000

async function resolveOneCandidate(
  c: HikingRouteCandidate, destination: DestinationPoint | null,
): Promise<FoundRouteResult | null> {
  // estimateOnly: mai il DTM reale (rate-limited, fino a 20s per chiamata) durante la ricerca —
  // stesso principio già applicato a "Su misura" (scoreCandidates.ts) e "Percorsi per te"
  // (generateRecommendations.ts). La quota vera arriva una sola volta, per il solo percorso
  // scelto, al salvataggio (vedi enrichFoundCandidateForImport in RouteBuilder.tsx) — prima
  // d'ora "Esistenti" era l'unico dei tre a saltare questo passo, risolvendo il DTM reale per
  // fino a MAX_EAGER_RESOLVE candidati in parallelo ad ogni ricerca: la causa principale dei
  // timeout osservati in produzione su questo stesso step.
  const track = await resolveTrackForCandidate({ osmId: c.id, gpxUrl: null }, { estimateOnly: true })
  if (!track.ok) return null
  // Ora che si ha la geometria reale (non più solo il centroide usato per l'ordinamento in
  // findTier0), si può verificare con precisione se il percorso passa davvero vicino alla
  // destinazione richiesta — un centroide plausibile non garantisce che la traccia stessa ci
  // arrivi (una relazione può estendersi molto oltre il suo centro).
  if (destination && minDistToTrack(destination.lat, destination.lon, track.routePolyline) > DESTINATION_PROXIMITY_KM * 1000) {
    return null
  }
  const pois = await fetchPoisNearPolyline(track.routePolyline).catch(() => [])
  const provisionalScore = computeProvisionalScore({
    routePolyline: track.routePolyline, trackPoints: track.trackPoints, distanceMeters: track.distanceMeters,
    elevationGain: track.elevationGain, elevationLoss: track.elevationLoss, altitudeMax: track.altitudeMax,
    altitudeMin: track.altitudeMin, estimatedTimeSeconds: track.estimatedTimeSeconds, pois,
  })
  return {
    id: c.id, name: c.name, hasName: c.hasName, ref: c.ref, network: c.network,
    routePolyline: track.routePolyline, trackPoints: track.trackPoints,
    distanceMeters: track.distanceMeters, elevationGain: track.elevationGain,
    elevationLoss: track.elevationLoss, altitudeMax: track.altitudeMax, altitudeMin: track.altitudeMin,
    estimatedTimeSeconds: track.estimatedTimeSeconds, hasElevation: track.hasElevation,
    pois, provisionalScore,
  }
}

async function resolveRelationCandidates(
  candidates: HikingRouteCandidate[], cap: number, destination: DestinationPoint | null,
): Promise<FoundRouteResult[]> {
  const resolved = await Promise.all(candidates.slice(0, cap).map(async c => {
    const outcome = await Promise.race([
      resolveOneCandidate(c, destination).then(r => ({ kind: 'done' as const, value: r })),
      new Promise<{ kind: 'timeout' }>(resolve => setTimeout(() => resolve({ kind: 'timeout' }), CANDIDATE_RESOLVE_TIMEOUT_MS)),
    ]).catch(() => ({ kind: 'timeout' as const }))
    if (outcome.kind === 'timeout') {
      console.error(`[searchSteps] Candidato ${c.id} oltre il tetto di ${CANDIDATE_RESOLVE_TIMEOUT_MS}ms, scartato singolarmente`)
      return null
    }
    return outcome.value
  }))
  return resolved.filter((r): r is FoundRouteResult => r != null)
}
