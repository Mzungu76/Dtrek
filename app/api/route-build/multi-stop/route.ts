import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { fetchWalkNetworkCached } from '@/lib/routeBuilder/walkNetworkCache'
import { buildMultiStopRoute, type MultiStopMode } from '@/lib/routeBuilder/multiStopRoute'
import { scoreAndEnrichCandidates } from '@/lib/routeBuilder/scoreCandidates'
import { padBbox } from '@/lib/overpassTrails'
import { haversineM } from '@/lib/geoUtils'
import { originBbox } from '@/lib/metaSearch/placeQuery'
import { mergeStopCandidates, nearestStops, orderStopsNearestNeighbor, type ItineraryStopCandidate } from '@/lib/metaSearch/borgoItinerary'
import { fetchNearbyWiki } from '@/lib/wikipedia'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Un margine fisso (0.4km, il valore precedente — mutuato da app/api/borgo-itinerary/route.ts,
// pensato per tappe auto-scoperte entro 2.5km dal Borgo) tagliava fuori dalla rete scaricata
// esattamente le vie che un cammino reale fra tappe più distanti (scelte liberamente dall'utente,
// spesso paesi diversi separati da una valle) deve percorrere per aggirare il terreno — il
// collegamento non falliva perché irraggiungibile, ma perché la parte di rete che lo conteneva non
// era mai stata scaricata. Il margine ora scala con quanto sono effettivamente distanti le tappe
// scelte (la diagonale del loro rettangolo), con un pavimento e un tetto di sicurezza per il costo
// della query Overpass.
const NETWORK_PADDING_MIN_KM = 1.5
const NETWORK_PADDING_MAX_KM = 5
const NETWORK_PADDING_FACTOR = 0.6
// Più alto del default (18s, lib/routeBuilder/osmGraph.ts) — stessa ragione già documentata per
// app/api/borgo-itinerary/route.ts: un bbox più ampio (tappe distanti + il margine proporzionale
// sopra) rende un fetch a freddo più lento, e senza margine il fallimento più comune non è "nessuna
// via trovata" ma "Overpass non ha risposto in tempo" — un problema diverso, mascherato dallo
// stesso identico messaggio se non si allarga anche il tetto del fetch.
const WALK_NETWORK_TIMEOUT_MS = 25_000

// Punti di interesse di un Borgo/Città usato come tappa, inclusi solo su richiesta esplicita
// dell'utente (toggle "includi i punti di interesse", PersonalizeItineraryPanel.tsx) — stessa
// scoperta di app/api/borgo-itinerary/route.ts (archivio + geosearch Wikipedia, unite senza
// doppioni), ma un raggio più stretto e un tetto più basso: qui il Borgo è UNA tappa fra tante
// scelte dall'utente, non l'intero soggetto dell'itinerario — un raggio ampio quanto quello
// dell'itinerario automatico porterebbe dentro punti a metà strada verso la prossima tappa scelta.
const POI_SEARCH_RADIUS_KM = 1.2
const POI_MAX_STOPS = 4
const POI_WIKI_LIMIT = 8

interface StopInput {
  id: string
  name: string
  lat: number
  lon: number
  /** dtrek_places.id del Borgo/Città, presente solo per una tappa che lo è davvero — abilita
   *  `includePoi`, non serve per le altre tappe (non hanno punti di interesse "propri" da offrire). */
  placeId?: string
  /** Opt-in esplicito dell'utente per questa tappa: inserisce i punti di interesse del Borgo
   *  (vedi sopra) subito dopo di essa nella sequenza, in ordine vicino-più-vicino a partire dal
   *  Borgo stesso — mai automatico, un itinerario fra Borghi lontani non deve improvvisamente
   *  allungarsi di punti che l'utente non ha chiesto di visitare. */
  includePoi?: boolean
}

/** Una tappa della sequenza effettivamente percorsa — coincide con una tappa scelta dall'utente,
 *  o con un punto di interesse inserito da `includePoi` (vedi sopra): non distinguibili qui, la
 *  sequenza intera è quella che `legs[].fromStopIdx/toStopIdx` indicizza. */
interface FullStop { id: string; name: string; lat: number; lon: number }

/** Punti di interesse di un Borgo (archivio dtrek_places 'sito' + geosearch Wikipedia intorno al
 *  suo centro, uniti senza doppioni), ordinati a vicino-più-vicino a partire dal Borgo stesso —
 *  stessa pipeline di app/api/borgo-itinerary/route.ts, un raggio/tetto più stretti (vedi sopra). */
async function findBorgoPoi(center: { lat: number; lon: number }): Promise<ItineraryStopCandidate[]> {
  const bbox = originBbox(center, POI_SEARCH_RADIUS_KM)
  const [archiveResult, wikiPages] = await Promise.all([
    supabase
      .from('dtrek_places')
      .select('id, name, latitude, longitude, description, image_url, official_url, website, subtype')
      .eq('meta_type', 'sito')
      .gte('latitude', bbox.minLat).lte('latitude', bbox.maxLat)
      .gte('longitude', bbox.minLon).lte('longitude', bbox.maxLon)
      .limit(60),
    fetchNearbyWiki(center.lat, center.lon, POI_SEARCH_RADIUS_KM * 1000, POI_WIKI_LIMIT).catch(e => {
      console.error('[route-build/multi-stop] geosearch Wikipedia per i punti di interesse fallita', e)
      return []
    }),
  ])
  if (archiveResult.error) {
    console.error('[route-build/multi-stop] ricerca punti di interesse archivio fallita', archiveResult.error)
    return []
  }
  const archiveStops: ItineraryStopCandidate[] = (archiveResult.data ?? []).map(r => ({
    id: r.id, name: r.name, lat: r.latitude, lon: r.longitude,
    description: r.description ?? undefined, thumbnail: r.image_url ?? undefined,
    url: r.official_url ?? r.website ?? undefined, source: 'archivio',
    siteType: (r.subtype ?? undefined) as ItineraryStopCandidate['siteType'],
  }))
  const wikiStops: ItineraryStopCandidate[] = wikiPages
    .filter(w => w.lat != null && w.lon != null)
    .map(w => ({ id: `wiki:${w.pageid}`, name: w.title, lat: w.lat as number, lon: w.lon as number, description: w.extract, thumbnail: w.thumbnail, url: w.url, source: 'wikipedia' as const }))
  const merged = mergeStopCandidates(archiveStops, wikiStops)
  const capped = nearestStops(center, merged, POI_MAX_STOPS)
  return orderStopsNearestNeighbor(center, capped)
}

/**
 * POST /api/route-build/multi-stop — itinerario a piedi che deve toccare TUTTE le tappe scelte a
 * mano dall'utente (personalizzazione di un Borgo/Città, components/upload/CreaGuidaMapSearch.tsx),
 * nell'ordine di selezione. Restituisce sempre un percorso — mai un fallimento totale: un tratto
 * irraggiungibile ripiega su una linea d'aria SOLO per quella tratta (`legs[].real === false`,
 * vedi lib/routeBuilder/multiStopRoute.ts), segnalata esplicitamente al client, non nascosta.
 * Richiesta singola (non a step come app/api/route-build/route.ts): il bbox è quello di poche
 * tappe scelte a mano intorno a un solo Borgo/Città, stessa scala di costo di
 * /api/borgo-itinerary, mai quella di un'intera zona esplorata da un punto di partenza libero.
 * Una tappa Borgo/Città con `includePoi` si espande nei suoi stessi punti di interesse (vedi
 * findBorgoPoi sopra) prima di generare il percorso — la risposta include la sequenza completa
 * risultante (`stops`), che `legs[].fromStopIdx/toStopIdx` indicizza, non le sole tappe inviate.
 */
export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  let stops: StopInput[]
  let mode: MultiStopMode
  let targetDistanceKm: number | null
  try {
    const body = await req.json()
    if (!Array.isArray(body.stops) || body.stops.length < 2) throw new Error('stops mancanti')
    stops = body.stops.map((s: unknown, i: number) => {
      const p = s as Record<string, unknown>
      const lat = Number(p.lat)
      const lon = Number(p.lon)
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('tappa non valida')
      return {
        id: typeof p.id === 'string' ? p.id : String(i),
        name: typeof p.name === 'string' ? p.name : '',
        lat, lon,
        placeId: typeof p.placeId === 'string' ? p.placeId : undefined,
        includePoi: p.includePoi === true,
      }
    })
    mode = body.mode === 'urbano' || body.mode === 'naturalistico' ? body.mode : 'misto'
    const distRaw = Number(body.targetDistanceKm)
    targetDistanceKm = body.targetDistanceKm != null && Number.isFinite(distRaw) ? distRaw : null
  } catch {
    return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  }

  // Espande le tappe con `includePoi` nei loro stessi punti di interesse, subito dopo di esse
  // nella sequenza — solo per le tappe che lo richiedono esplicitamente (vedi StopInput sopra).
  // Nessuna deduplica contro le altre tappe scelte a mano dall'utente: un punto di interesse che
  // coincidesse con una tappa già scelta altrove resterebbe duplicato nella sequenza — un caso
  // limite accettato, non la norma, non vale la complessità di un controllo incrociato qui.
  const fullStops: FullStop[] = []
  for (const s of stops) {
    fullStops.push({ id: s.id, name: s.name, lat: s.lat, lon: s.lon })
    if (s.includePoi && s.placeId) {
      const poi = await findBorgoPoi({ lat: s.lat, lon: s.lon })
      for (const p of poi) fullStops.push({ id: p.id, name: p.name, lat: p.lat, lon: p.lon })
    }
  }

  // Bbox di tutte le tappe della sequenza (scelte a mano + punti di interesse inseriti), con un
  // margine proporzionale a quanto sono effettivamente distanti (vedi commento sulle costanti
  // sopra) — le vie che collegano due tappe spesso escono dal rettangolo stretto che le contiene
  // entrambe, tanto più quanto più le tappe sono lontane.
  const rawBbox: [number, number, number, number] = [
    Math.min(...fullStops.map(s => s.lat)),
    Math.min(...fullStops.map(s => s.lon)),
    Math.max(...fullStops.map(s => s.lat)),
    Math.max(...fullStops.map(s => s.lon)),
  ]
  const diagonalKm = haversineM(rawBbox[0], rawBbox[1], rawBbox[2], rawBbox[3]) / 1000
  const paddingKm = Math.min(NETWORK_PADDING_MAX_KM, Math.max(NETWORK_PADDING_MIN_KM, diagonalKm * NETWORK_PADDING_FACTOR))
  const networkBbox = padBbox(rawBbox, paddingKm)

  let network
  try {
    network = await fetchWalkNetworkCached(networkBbox, false, WALK_NETWORK_TIMEOUT_MS)
  } catch (e) {
    console.error('[route-build/multi-stop] rete pedonale non disponibile:', e)
    return NextResponse.json({ error: 'network_unavailable', message: 'Rete pedonale non disponibile in questo momento, riprova.' }, { status: 502 })
  }

  // targetDistanceKm*1000: cerca il cammino più vicino a questa distanza tratta per tratta (non
  // semplicemente il più breve) quando è più lungo della somma dei cammini minimi — vedi
  // lib/routeBuilder/multiStopRoute.ts. Sempre un risultato: un tratto irraggiungibile ripiega su
  // una linea d'aria SOLO per quella tratta (leg.real === false), mai un fallimento totale.
  const outcome = buildMultiStopRoute(network, fullStops, mode, targetDistanceKm != null ? targetDistanceKm * 1000 : null)

  // Logging diagnostico per ogni tratta in ripiego a linea d'aria — mai mostrato all'utente (vedi
  // MultiStopLeg.diagnostic in multiStopRoute.ts), serve solo a distinguere in produzione, quando
  // il sintomo si ripresenta, quale delle cause plausibili elencate nel §3/§4 del doc di stato è
  // quella reale: budget di nodi esaurito (una connessione potrebbe comunque esistere, la ricerca
  // non l'ha raggiunta) vs rete esplorata per intero senza trovare il bersaglio (nessun cammino
  // esiste nel bbox scaricato — dati insufficienti, non un limite di ricerca).
  for (const leg of outcome.legs) {
    if (leg.real) continue
    const from = fullStops[leg.fromStopIdx]
    const to = fullStops[leg.toStopIdx]
    console.warn(
      `[route-build/multi-stop] ripiego a linea d'aria: "${from?.name}" -> "${to?.name}"`,
      `reason=${leg.fallbackReason} airlineM=${Math.round(leg.distanceM)} mode=${mode} networkNodes=${network.nodes.size}`,
      leg.diagnostic
        ? `preferred(visited=${leg.diagnostic.preferred.nodesVisited},budgetExhausted=${leg.diagnostic.preferred.budgetExhausted})` +
          (leg.diagnostic.fallback ? ` fallback(visited=${leg.diagnostic.fallback.nodesVisited},budgetExhausted=${leg.diagnostic.fallback.budgetExhausted})` : ' fallback=not_attempted')
        : 'diagnostic=n/a (snap alla rete fallito, too_far_from_network)',
    )
  }

  // Concatena i tratti in un'unica polyline — scarta il primo punto di ogni tratto dopo il primo,
  // che reconstructPath ripete identico all'ultimo punto del tratto precedente (entrambi partono
  // esattamente dal nodo di aggancio condiviso). Una linea d'aria di ripiego ha comunque solo 2
  // punti (i due estremi), lo stesso schema si applica senza distinzioni.
  const routePolyline: [number, number][] = []
  let totalDistanceM = 0
  outcome.legs.forEach((leg, i) => {
    routePolyline.push(...(i === 0 ? leg.polyline : leg.polyline.slice(1)))
    totalDistanceM += leg.distanceM
  })

  // Un'unica candidata sintetica attraverso lo scorer esistente — solo per la stima di
  // quota/tempo/POI dell'anteprima (nessun ranking: non esiste un'alternativa da confrontare).
  const [scored] = await scoreAndEnrichCandidates(
    [{ type: 'solo_andata', polyline: routePolyline, distanceM: totalDistanceM, bearingDeg: 0, hasSteps: false, hazardMarkers: [] }],
    {
      targetDistanceM: (targetDistanceKm ?? totalDistanceM / 1000) * 1000,
      // Nessun input dislivello qui (vedi PersonalizeItineraryPanel.tsx) — l'algoritmo non ha
      // alcuna leva per orientare il cammino verso un dislivello target con tappe fisse, un campo
      // che non può mai influenzare il risultato sarebbe stato solo un'opzione fittizia.
      // targetElevationM assente ⇒ nessun effetto sul punteggio (ScoreOptions, scoreCandidates.ts)
      // — irrilevante comunque con un solo candidato, nessun ranking da fare.
      targetElevationM: null,
      environmentPrefs: [],
      concerns: [],
      desiredPoiTypes: [],
      bbox: networkBbox,
    },
    1,
  )

  // scoreAndEnrichCandidates scarta solo un candidato con polyline < 2 punti (due tappe scelte
  // così vicine da agganciarsi allo stesso nodo della rete) — un caso raro ma non impossibile, da
  // non far crashare: si risponde comunque con i dati grezzi già calcolati (nessuna stima
  // quota/POI, coerente con "mai inventare un dato" — meglio assente che falso).
  if (!scored) {
    return NextResponse.json({
      ok: true,
      stops: fullStops,
      legs: outcome.legs,
      routePolyline,
      trackPoints: [],
      distanceMeters: totalDistanceM,
      elevationGain: 0,
      elevationLoss: 0,
      altitudeMax: 0,
      altitudeMin: 0,
      estimatedTimeSeconds: Math.round(totalDistanceM / 1.2),
      hasElevation: false,
      pois: [],
    })
  }

  return NextResponse.json({
    ok: true,
    stops: fullStops,
    legs: outcome.legs,
    routePolyline: scored.routePolyline,
    trackPoints: scored.trackPoints,
    distanceMeters: scored.distanceMeters,
    elevationGain: scored.elevationGain,
    elevationLoss: scored.elevationLoss,
    altitudeMax: scored.altitudeMax,
    altitudeMin: scored.altitudeMin,
    estimatedTimeSeconds: scored.estimatedTimeSeconds,
    hasElevation: scored.hasElevation,
    pois: scored.pois,
  })
}
