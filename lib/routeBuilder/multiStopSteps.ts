// Logica condivisa fra i tre endpoint a step della personalizzazione multi-tappa
// (app/api/route-build/multi-stop/step/*) — stesso motivo della suddivisione a step già esistente
// per la Modalità A "Su misura" (vedi lib/routeBuilder/buildSteps.ts): isolare il fetch Overpass
// (rete pedonale, e ora anche i percorsi escursionistici noti — entrambi possono avvicinarsi al
// proprio timeout, vedi le costanti sotto) in una richiesta a parte con un proprio tetto di 60s,
// invece di sommarsi al pathfinding e all'arricchimento dentro la stessa invocazione. A differenza
// di buildSteps.ts, qui non esiste una pipeline monolitica gemella da mantenere: la personalizzazione
// multi-tappa è recente, nessun altro chiamante oltre a PersonalizeItineraryPanel.tsx la usava —
// niente da mantenere invariato "per compatibilità", questi step SONO l'unica pipeline.
//
// SERVER-ONLY: importa supabase (service_role), fetchWalkNetworkCached e fetchKnownTrailWayIds
// (entrambi Overpass) — non deve mai essere importato da un componente client.
import { supabase } from '@/lib/supabase'
import { fetchWalkNetworkCached } from '@/lib/routeBuilder/walkNetworkCache'
import { fetchKnownTrailWayIds } from '@/lib/routeBuilder/hikingProbability'
import { padBbox } from '@/lib/overpassTrails'
import { haversineM } from '@/lib/geoUtils'
import { originBbox } from '@/lib/metaSearch/placeQuery'
import { mergeStopCandidates, nearestStops, orderStopsNearestNeighbor, type ItineraryStopCandidate } from '@/lib/metaSearch/borgoItinerary'
import { fetchNearbyWiki } from '@/lib/wikipedia'

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

export interface MultiStopInput {
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
export interface MultiStopFullStop { id: string; name: string; lat: number; lon: number }

/** Punti di interesse di un Borgo (archivio dtrek_places 'sito' + geosearch Wikipedia intorno al
 *  suo centro, uniti senza doppioni), ordinati a vicino-più-vicino a partire dal Borgo stesso —
 *  stessa pipeline di app/api/borgo-itinerary/route.ts, un raggio/tetto più stretti (vedi sopra). */
export async function findBorgoPoi(center: { lat: number; lon: number }): Promise<ItineraryStopCandidate[]> {
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
      console.error('[multiStopSteps] geosearch Wikipedia per i punti di interesse fallita', e)
      return []
    }),
  ])
  if (archiveResult.error) {
    console.error('[multiStopSteps] ricerca punti di interesse archivio fallita', archiveResult.error)
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

export interface MultiStopNetworkPrep {
  bbox: [number, number, number, number]
  fullStops: MultiStopFullStop[]
  // Id delle way OSM di un percorso escursionistico già riconosciuto (route=hiking/foot) nel bbox
  // — array invece di Set solo perché deve attraversare JSON verso il client e tornare indietro
  // allo step/build; ricostruito in Set lì (vedi lib/routeBuilder/multiStopRoute.ts). Sempre vuoto
  // quando `considerExistingTrails` è false, o quando il fetch fallisce (vedi sotto: un
  // fallimento qui non deve mai bloccare l'intera generazione, solo lasciarla senza quella
  // preferenza per questo giro).
  knownTrailWayIds: number[]
}

export type MultiStopNetworkOutcome =
  | { ok: true; prep: MultiStopNetworkPrep }
  | { ok: false; status: number; error: string; message: string }

/**
 * Step 1/3 della pipeline multi-tappa: espande le tappe con `includePoi` nei loro punti di
 * interesse, calcola il bbox, fetch/cache della rete percorribile — l'unico passo che tocca
 * Overpass "a freddo" (fino a WALK_NETWORK_TIMEOUT_MS, più il fetch dei percorsi noti se richiesto,
 * IN PARALLELO — vedi sotto), isolato per non sommarsi al pathfinding (step/build) e
 * all'arricchimento (step/enrich) dentro lo stesso tetto di 60s.
 */
export async function prepareMultiStopNetworkStep(
  stops: MultiStopInput[], considerExistingTrails: boolean,
): Promise<MultiStopNetworkOutcome> {
  // Nessuna deduplica contro le altre tappe scelte a mano dall'utente: un punto di interesse che
  // coincidesse con una tappa già scelta altrove resterebbe duplicato nella sequenza — un caso
  // limite accettato, non la norma, non vale la complessità di un controllo incrociato qui.
  const fullStops: MultiStopFullStop[] = []
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
  const bbox = padBbox(rawBbox, paddingKm)

  // Le due fetch Overpass (rete pedonale + percorsi noti) sono indipendenti fra loro — in
  // parallelo invece che in sequenza, altrimenti la somma dei due timeout rischierebbe da sola il
  // tetto di 60s dello step. `allSettled`, non `all`: un fallimento del fetch dei percorsi noti
  // (query più leggera, ma pur sempre Overpass) non deve mai far fallire l'intera generazione,
  // solo lasciarla senza quella preferenza per questo giro — un fallimento del fetch della rete
  // pedonale invece è fatale, non c'è generazione possibile senza la rete stessa.
  const [networkResult, trailResult] = await Promise.allSettled([
    fetchWalkNetworkCached(bbox, true, WALK_NETWORK_TIMEOUT_MS),
    considerExistingTrails ? fetchKnownTrailWayIds(bbox) : Promise.resolve(new Set<number>()),
  ])

  if (networkResult.status === 'rejected') {
    console.error('[multiStopSteps] rete pedonale non disponibile:', networkResult.reason)
    return { ok: false, status: 502, error: 'network_unavailable', message: 'Rete pedonale non disponibile in questo momento, riprova.' }
  }

  let knownTrailWayIds: number[] = []
  if (trailResult.status === 'fulfilled') {
    knownTrailWayIds = Array.from(trailResult.value)
  } else if (considerExistingTrails) {
    console.error('[multiStopSteps] fetch dei percorsi noti fallito, proseguo senza quella preferenza:', trailResult.reason)
  }

  return { ok: true, prep: { bbox, fullStops, knownTrailWayIds } }
}
