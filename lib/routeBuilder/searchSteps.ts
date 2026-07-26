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
import { haversineM, minDistToTrack, classifyTrackShape } from '@/lib/geoUtils'
import { getCachedTrailsInBbox, upsertTrailCache, findCachedTrailsNearPoint, type TrailCacheRow } from '@/lib/trailsCache'

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

// Riordina per rilevanza rispetto a un percorso "tra 2 punti" (vedi FoundRouteResult più sotto):
// senza la geometria completa (solo il centroide della relazione è noto a questo livello) non si
// può ancora sapere se un candidato passa davvero vicino alla destinazione richiesta — ma un
// candidato il cui centroide è già lontano da ENTRAMBI i punti è comunque improbabile che ci
// arrivi, quindi qui si riordina solo per portare in cima ai MAX_EAGER_RESOLVE risolti davvero (il
// passo successivo, più costoso) i candidati più plausibili, invece di sprecarli su relazioni che
// poi il filtro finale scarterà comunque. Condiviso dal percorso rapido e da quello per nome sotto.
function sortForDestination(
  candidates: HikingRouteCandidate[], place: ResolvedPlace, destination: DestinationPoint | null,
): HikingRouteCandidate[] {
  if (!destination) return candidates
  const worstCaseScore = (c: HikingRouteCandidate): number => {
    if (c.lat == null || c.lon == null) return Infinity
    return Math.max(haversineM(c.lat, c.lon, place.lat, place.lon), haversineM(c.lat, c.lon, destination.lat, destination.lon))
  }
  return [...candidates].sort((a, b) => worstCaseScore(a) - worstCaseScore(b))
}

// Livello 0: sempre, gratuito — risoluzione del luogo (non-AI, solo Nominatim/Overpass) in
// parallelo con la ricerca di percorsi esistenti (non-AI, Overpass) — SENZA risolvere le tracce
// (quello è il passo successivo, resolveFoundRoutesWithPoi, deliberatamente separato).
//
// `skipNameResolution`: il punto è GIÀ noto e affidabile — un tocco diretto sulla mappa (nessun
// testo digitato), o un testo già risolto e confermato in un passo precedente lato client (vedi
// RouteBuilder.tsx's confirmQueryOnMap/queryMapConfirmed) — non c'è nulla da indovinare da un nome.
// Salta l'intera cascata di risoluzione testuale (resolvePlaceName: Nominatim → Overpass per nome →
// Wikipedia, fino a 4 chiamate HTTP in sequenza, ciascuna con un proprio timeout di diversi
// secondi) invece di ripeterla inutilmente su un punto già confermato — causa concreta osservata
// della lentezza complessiva della ricerca (fino a 60-90s solo per questa fase, PRIMA di arrivare
// alla risoluzione delle tracce), specialmente quando Nominatim rallenta/blocca l'IP server (vedi
// il commento esteso più sotto, per il caso in cui la risoluzione testuale invece serve davvero).
// Cache-first, non Overpass-first-con-ripiego: la scoperta candidati interrogava SEMPRE Overpass
// live, e solo se quello falliva del tutto (osservato in produzione, "Overpass non disponibile" su
// tutti e 3 i mirror) tentava la cache locale — quindi un'area già pre-riscaldata pochi minuti
// prima pagava comunque il costo/rischio di una chiamata Overpass evitabile, invece di rispondere
// subito con dati già noti. La cache si autoalimenta a ogni risoluzione live riuscita (vedi
// cacheResolvedTrail sotto) e viene pre-riscaldata in blocco da app/api/admin/prewarm-trails, quindi
// un esito vuoto qui vuol dire davvero "quest'area non è mai stata vista", non "dato mancante per
// pigrizia" — solo in quel caso vale la pena aspettare Overpass.
async function queryCandidatesNearPointCacheFirst(lat: number, lon: number, radiusKm: number): Promise<HikingRouteCandidate[]> {
  const cached = await findCachedTrailsNearPoint(lat, lon, radiusKm, 20).catch(() => [])
  if (cached.length > 0) {
    return cached.map(row => ({
      id: row.osmRelationId, name: row.name, hasName: true,
      ref: row.ref ?? undefined, network: row.network ?? undefined,
      lat: (row.bbox.minLat + row.bbox.maxLat) / 2, lon: (row.bbox.minLon + row.bbox.maxLon) / 2,
    }))
  }
  const [minLat, minLon, maxLat, maxLon] = padBbox([lat, lon, lat, lon], radiusKm)
  return queryHikingRelationsInBbox(minLat, minLon, maxLat, maxLon, 20).catch(e => {
    console.error('[searchSteps] Cache vuota e Overpass non disponibile per la scoperta candidati:', e)
    return [] as HikingRouteCandidate[]
  })
}

async function findTier0(
  query: string, radiusKm: number, destination: DestinationPoint | null, fallbackPoint: DestinationPoint | null,
  skipNameResolution: boolean,
): Promise<{ place: ResolvedPlace | null; candidates: HikingRouteCandidate[] }> {
  if (skipNameResolution && fallbackPoint) {
    const place: ResolvedPlace = {
      lat: fallbackPoint.lat, lon: fallbackPoint.lon,
      displayName: query.trim() || 'Punto selezionato sulla mappa', source: 'nominatim',
    }
    const rawCandidates = await queryCandidatesNearPointCacheFirst(fallbackPoint.lat, fallbackPoint.lon, radiusKm)
    const candidates = sortForDestination(sortByDistanceFrom(rawCandidates, place.lat, place.lon), place, destination)
    return { place, candidates }
  }

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
    rawCandidates = await queryCandidatesNearPointCacheFirst(place.lat, place.lon, radiusKm)
  }
  const candidates = place
    ? sortForDestination(sortByDistanceFrom(rawCandidates, place.lat, place.lon), place, destination)
    : rawCandidates
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
  // true quando il chiamante ha già un punto affidabile in mano (tap sulla mappa, o testo già
  // risolto/confermato in un passo precedente lato client) — vedi findTier0 per il perché salta
  // l'intera cascata di risoluzione testuale invece di ripeterla.
  skipNameResolution = false,
): Promise<FindResult> {
  let place: ResolvedPlace | null = null
  let candidates: HikingRouteCandidate[] = []
  let prefill: InterpretedPreferences | null = null
  let tierReached: 'tier0' | 'tier1' = 'tier0'
  let interpretedPlacesCount = 0

  try {
    const level0 = await findTier0(query, radiusKm, destination, fallbackPoint, skipNameResolution)
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
            const rerun = await findTier0(p.query, radiusKm, destination, null, false)
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

  // Non un Promise.all: se le relation producono già qualcosa, quello resta comunque l'unico
  // risultato usato (riga sotto) — aspettare anche probabilityWithDeadline (fino a 35s) solo per
  // scartarne il risultato è il motivo concreto per cui una ricerca risolta da cache in pochi
  // secondi restava comunque bloccata fino a ~46s in produzione. Il ripiego resta comunque avviato
  // in parallelo fin da subito (sopra), pronto a essere atteso SOLO se davvero serve.
  const relationRoutes = await relationResolved
  if (relationRoutes.length > 0) return relationRoutes
  return probabilityWithDeadline
}

// Tetto per candidato, non solo sul gruppo intero (vedi SOFT_DEADLINE_MS in
// step/search-resolve/route.ts): senza questo, un Promise.all su `cap` candidati aspetta il più
// lento di tutti prima di restituire QUALSIASI risultato — se anche un solo candidato si blocca
// (mirror Overpass congestionato), il tetto morbido del chiamante scade sull'intero gruppo e
// TUTTI i candidati già risolti con successo vengono scartati insieme a quello lento, non solo
// lui. Con un tetto per-candidato, un singolo blocco costa solo se stesso: gli altri, già
// risolti, restano nel risultato finale.
const CANDIDATE_RESOLVE_TIMEOUT_MS = 25_000

function bboxFromPolyline(polyline: [number, number][]): { minLat: number; maxLat: number; minLon: number; maxLon: number } {
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity
  for (const [lat, lon] of polyline) {
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
    if (lon < minLon) minLon = lon
    if (lon > maxLon) maxLon = lon
  }
  return { minLat, maxLat, minLon, maxLon }
}

// Scrive nella cache `trails` un candidato appena risolto dal vivo — best-effort (un fallimento
// qui non deve mai far fallire il risultato già pronto per l'utente corrente), stesso identico
// pattern già collaudato da generateRecommendations.ts's cacheResolvedTrail per "Percorsi per te".
// Esportata anche per app/api/admin/prewarm-trails/route.ts, che riusa la stessa identica scrittura
// invece di duplicarla.
export async function cacheResolvedTrail(c: HikingRouteCandidate, track: Awaited<ReturnType<typeof resolveTrackForCandidate>> & { ok: true }): Promise<void> {
  try {
    const shape = classifyTrackShape(track.routePolyline)
    await upsertTrailCache({
      osmRelationId: c.id, name: c.name,
      distanceKm: track.distanceMeters / 1000, elevationGain: track.elevationGain, elevationLoss: track.elevationLoss,
      estimatedTimeMin: Math.round(track.estimatedTimeSeconds / 60),
      routeType: shape === 'linear' ? 'point_to_point' : shape,
      network: c.network ?? null, bbox: bboxFromPolyline(track.routePolyline), geometrySimplified: track.routePolyline,
      dataQuality: track.hasElevation ? 'calculated' : 'estimated', ref: c.ref ?? null,
    })
  } catch (e) {
    console.error('[searchSteps] scrittura cache trails fallita (non bloccante):', e)
  }
}

// Ricostruisce un FoundRouteResult da una riga già cachata (`trails`) — zero chiamate di rete per
// la traccia, solo il fetch POI resta (il costo leggero, non quello che ha causato i timeout in
// produzione: la geometria/quota da Overpass+DTM). Stesso principio di gatherFoundCandidates in
// generateRecommendations.ts, che ha già dimostrato in produzione quanto questa cache renda la
// ricerca "Esistenti" istantanea e affidabile per un'area già vista — qui applicato allo stesso
// identico endpoint interattivo invece che solo alla generazione automatica in background.
async function resolveFromCache(c: HikingRouteCandidate, row: TrailCacheRow, destination: DestinationPoint | null): Promise<FoundRouteResult | null> {
  const routePolyline = row.geometrySimplified
  if (destination && minDistToTrack(destination.lat, destination.lon, routePolyline) > DESTINATION_PROXIMITY_KM * 1000) {
    return null
  }
  const distanceMeters = Math.round((row.distanceKm ?? 0) * 1000)
  const elevationGain = row.elevationGain ?? 0
  const elevationLoss = row.elevationLoss ?? 0
  const estimatedTimeSeconds = (row.estimatedTimeMin ?? Math.round((distanceMeters / 1000 / 4) * 60)) * 60
  // Niente fetchPoisNearPolyline qui: era una chiamata Overpass live PER CANDIDATO anche quando il
  // tracciato veniva già dalla cache, lo stesso identico collo di bottiglia già risolto per il DTM
  // (vedi resolveOneCandidate sopra) — con Overpass sotto carico bastava che alcune di queste
  // chiamate superassero i 25s per perdere metà dei risultati di una ricerca già "istantanea" per
  // il resto. L'arricchimento POI completo avviene comunque di nuovo al salvataggio
  // (enrichWithPois in RouteBuilder.tsx), quindi il percorso salvato non perde nulla.
  const pois: import('@/lib/overpass').PoiItem[] = []
  const provisionalScore = computeProvisionalScore({
    routePolyline, trackPoints: [], distanceMeters, elevationGain, elevationLoss,
    altitudeMax: 0, altitudeMin: 0, estimatedTimeSeconds, pois,
  })
  return {
    id: c.id, name: row.name, hasName: c.hasName, ref: c.ref, network: c.network,
    routePolyline, trackPoints: [], distanceMeters, elevationGain, elevationLoss,
    altitudeMax: 0, altitudeMin: 0, estimatedTimeSeconds, hasElevation: row.dataQuality === 'calculated',
    pois, provisionalScore,
  }
}

async function resolveOneCandidate(
  c: HikingRouteCandidate, destination: DestinationPoint | null, cached: TrailCacheRow | undefined,
): Promise<FoundRouteResult | null> {
  if (cached && cached.distanceKm != null) {
    console.log(`[searchSteps] Candidato ${c.id} risolto da cache`)
    return resolveFromCache(c, cached, destination)
  }
  console.log(`[searchSteps] Candidato ${c.id} NON in cache (cached=${cached ? 'row senza distanceKm' : 'assente'}), risoluzione live`)

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
  cacheResolvedTrail(c, track).catch(() => {})
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
  const slice = candidates.slice(0, cap)
  // Una sola query batch per tutti i candidati di questo giro, invece di una per candidato — sono
  // già al più `cap` (8) id noti in anticipo, un `IN (...)` sull'indice unico di osm_relation_id
  // costa una frazione di una singola risoluzione Overpass.
  const cachedById = await getCachedTrailsInBbox(slice.map(c => c.id)).catch(() => new Map<number, TrailCacheRow>())

  const resolved = await Promise.all(slice.map(async c => {
    const outcome = await Promise.race([
      resolveOneCandidate(c, destination, cachedById.get(c.id)).then(r => ({ kind: 'done' as const, value: r })),
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
