import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import {
  mergeStopCandidates, nearestStops, excludeIsolatedOutliers, orderStopsNearestNeighbor,
  culturalTappaBudgetMinutes, WALK_SPEED_MPS, MAX_STOPS_PER_TAPPA,
  type ItineraryStopCandidate, type ItineraryTappa, type BorgoItineraryOverrides,
} from '@/lib/metaSearch/borgoItinerary'
import { fetchBorgoArchiveStops, fetchBorgoWikiStops, enrichStopDescriptions } from '@/lib/guideBorgoDetailStops'
import { fetchWalkNetworkForPoints, buildLegsForWaypoints } from '@/lib/routeBuilder/borgoWalkLegs'
import { computePersonalizedTappe } from '@/lib/routeBuilder/borgoTappePersonalization'
import type { SiteType } from '@/lib/metaTypes'

export const dynamic = 'force-dynamic'
// Alzato da 60s — verifica utente: il raggio di ricerca ora si allarga fino a 20km per una città
// grande, con fino a 4 giri di geosearch archivio/Wikipedia invece di uno solo. Pagato una sola
// volta ogni 30 giorni per borgo grazie alla cache sotto, mai ad ogni apertura della guida — ben
// entro il tetto reale della piattaforma (300s, piano Vercel di questo progetto).
export const maxDuration = 120

// Verifica utente — "la dimensione geografica della città/borgo": invece di un raggio fisso, si
// parte stretto (comportamento invariato per un borgo compatto) e si allarga finché si continuano
// a trovare punti nuovi in quantità significativa, fino al tetto di MAX_TOTAL_STOPS o al raggio
// massimo — una città vera "riempie" ogni passo, un borgo piccolo esaurisce i punti trovabili
// presto e il raggio si ferma corto da solo. Ogni passo riparte da zero con un raggio più ampio
// (non incrementale, mai bisogno di deduplicare "anelli" di raggio) — il costo extra dei passi
// successivi è pagato una sola volta ogni 30 giorni per borgo, grazie alla cache sotto.
const RADIUS_STEPS: { radiusKm: number; wikiLimit: number; archiveLimit: number }[] = [
  { radiusKm: 2.5, wikiLimit: 10, archiveLimit: 60 },
  { radiusKm: 5,   wikiLimit: 20, archiveLimit: 120 },
  { radiusKm: 10,  wikiLimit: 35, archiveLimit: 200 },
  { radiusKm: 20,  wikiLimit: 50, archiveLimit: 300 },
]
// Un passo che aggiunge meno di questa soglia di candidati NUOVI rispetto al passo precedente
// segnala rendimento decrescente (il borgo è già "esaurito"): allargare ulteriormente il raggio
// non aggiungerebbe granché, si preferisce fermarsi lì piuttosto che pagare altri due giri di
// rete per pochi punti in più.
const MIN_NEW_CANDIDATES_TO_KEEP_EXPANDING = 3
// Tetto complessivo sull'intera città (non per singola tappa — quello è MAX_STOPS_PER_TAPPA
// sotto, applicato dopo il raggruppamento in tappe): anche la città più grande non deve produrre
// un itinerario open-ended, che appesantirebbe Dijkstra/l'arricchimento descrizioni oltre ogni
// beneficio reale per l'utente.
const MAX_TOTAL_STOPS = 30
// Verifica utente: l'itinerario si ricalcolava da zero ad ogni apertura della guida, anche per lo
// stesso borgo appena visto — 30 giorni perché le fonti (voci Wikipedia, rete pedonale OSM) cambiano
// di rado, un mese di cache non produce quasi mai un dato percepibilmente vecchio. Cache SUL BORGO
// (dtrek_places), non sulla guida: condivisa tra tutti gli utenti/guide che aprono lo stesso borgo.
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000
// Verifica utente ("gli itinerari sono tornati in linea d'aria") — confermato sui dati reali: per
// Trento (7 tappe, area compatta ~3km) solo 1 leg su 7 risultava reale, le altre tutte in linea
// d'aria. Causa (vedi il commento su `remark` in lib/routeBuilder/osmGraph.ts's fetchWalkNetwork):
// Overpass può interrompere la query al proprio [timeout:...] interno e rispondere comunque con
// HTTP 200 e una rete PARZIALE — un fallimento silenzioso, mai visto come errore da fetchOverpass,
// quindi mai ritentato. Il centro di una vera città (rete stradale molto più densa per km² di un
// borgo — decine di vie/vicoli invece di poche strade tra campi) rischia di riempire il budget
// [timeout:] molto prima di un'area della stessa estensione intorno a un piccolo borgo: alzato da
// 22s per dare a Overpass margine sufficiente a completare la query anche per un centro storico
// denso, ben entro il tetto della piattaforma (maxDuration=120s sopra, worst case col retry
// dell'ALTRA modalità di fallimento — un errore di rete vero e proprio, quella sì ritentata da
// fetchOverpass — resta comunque ~2×questo valore + 1.2s).
const WALK_NETWORK_TIMEOUT_MS = 45_000

// Verifica utente (Agrigento) — vedi il commento sopra la scrittura della cache più sotto: ora
// attesa invece di fire-and-forget, ma un tetto di tempo evita che una Supabase lenta/irraggiungibile
// blocchi la risposta fino a maxDuration — un fallimento del solo salvataggio in cache non deve mai
// costare quanto un fallimento della generazione stessa, l'utente ottiene comunque il suo itinerario.
const CACHE_WRITE_TIMEOUT_MS = 5000

function withTimeout<T>(p: PromiseLike<T>, ms: number, onTimeout: () => T): Promise<T> {
  return Promise.race([
    Promise.resolve(p),
    new Promise<T>(resolve => setTimeout(() => resolve(onTimeout()), ms)),
  ])
}

export interface ItineraryStop {
  id: string
  name: string
  lat: number
  lon: number
  description?: string
  thumbnail?: string
  url?: string
  source: 'archivio' | 'wikipedia'
  siteType?: SiteType
}

export interface ItineraryLeg {
  /** -1 per il primo tratto (dal Borgo alla prima tappa) — altrimenti l'indice della tappa di
   *  partenza in `stops`. */
  fromIdx: number
  toIdx: number
  distanceM: number
  polyline: [number, number][]
  /** false quando non è stato trovato un cammino nella rete pedonale (tappa isolata, rete non
   *  disponibile) — il tratto è allora una linea d'aria di ripiego, mai spacciata per reale. */
  real: boolean
}

export interface BorgoItinerary {
  borgoName: string
  stops: ItineraryStop[]
  legs: ItineraryLeg[]
  totalDistanceM: number
  estimatedTimeSeconds: number
  /** Suddivisione in tappe percorribili (lib/metaSearch/borgoItinerary.ts's groupStopsIntoTappe,
   *  budget da culturalTappaBudgetMinutes — verifica utente: il tempo di un Borgo/Città è una
   *  giornata di visita culturale, non la fatica fisica di un'escursione) — personalizzata sulle
   *  eventuali personalizzazioni salvate per QUESTA Meta (planned_hikes.borgo_itinerary_overrides)
   *  e su un'eventuale traccia GPS reale collegata (trekking misto), quindi calcolata SEMPRE fresca
   *  ad ogni risposta, mai dentro itinerary_cache: la cache su dtrek_places è condivisa tra tutti
   *  gli utenti, questo campo non può esserlo. */
  tappe: ItineraryTappa[]
  /** Budget con cui `tappe` è stata calcolata (piano guide-eccellenza Fase 2) — il client lo riusa
   *  per un'anteprima ISTANTANEA locale dello slider del tempo di visita/dello spegnimento di un
   *  punto (stessa formula, lib/metaSearch/borgoItinerary.ts's groupStopsIntoTappe), senza un
   *  nuovo round-trip al server per ogni movimento dello slider. Mai usato per il ricalcolo di uno
   *  spostamento manuale tra tappe: quello resta sempre un ricalcolo reale lato server (verifica
   *  utente: "ricalcolo reale al server quando l'utente conferma"). Stessi vincoli di `tappe`: mai
   *  dentro itinerary_cache, personalizzato sull'utente di QUESTA richiesta. */
  maxStopsPerTappa: number
  maxMinutesPerTappa: number
}

/**
 * POST /api/borgo-itinerary — itinerario a piedi fra le tappe principali di un Borgo/Città:
 * tappe dall'archivio (dtrek_places, meta_type='sito' nel raggio) + una geosearch Wikipedia dal
 * vivo intorno al centro (lib/wikipedia.ts's fetchNearbyWiki, arricchimento — mai l'unica fonte
 * di verità: piano §48.8), unite senza doppioni (lib/metaSearch/borgoItinerary.ts) e ordinate a
 * vicino-più-vicino. Il tragitto fra le tappe è un cammino reale sulla rete pedonale OSM (lib/
 * routeBuilder/osmGraph.ts + walkNetworkCache.ts, la stessa già usata per generare i Sentieri) via
 * Dijkstra (lib/routeBuilder/walkRouting.ts, condiviso con lib/navigation/escapeEngine.ts) — non
 * una linea d'aria, salvo quando una tappa risulta isolata dalla rete: quel singolo tratto resta
 * allora una linea d'aria, segnalata (`real: false`), il resto dell'itinerario non salta.
 */
export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  let placeId: string
  // Meta pianificata da cui leggere le personalizzazioni dell'utente (piano guide-eccellenza
  // Fase 2) — opzionale: assente per un'apertura della guida ancora prima di salvare la Meta, o
  // per qualunque chiamante che non ha bisogno di override (ricade sempre sul raggruppamento
  // automatico puro, mai un errore).
  let hikeId: string | undefined
  try {
    const body = await req.json()
    placeId = body.placeId
    if (!placeId || typeof placeId !== 'string') throw new Error()
    if (body.hikeId != null && typeof body.hikeId !== 'string') throw new Error()
    hikeId = body.hikeId
  } catch {
    return NextResponse.json({ error: 'placeId mancante' }, { status: 400 })
  }

  const { data: borgo, error: borgoError } = await supabase
    .from('dtrek_places')
    .select('id, name, latitude, longitude, itinerary_cache, itinerary_cached_at')
    .eq('id', placeId)
    .eq('meta_type', 'borgo_citta')
    .maybeSingle()

  if (borgoError) {
    console.error('[borgo-itinerary]', borgoError)
    return NextResponse.json({ error: 'Errore interno' }, { status: 500 })
  }
  if (!borgo) return NextResponse.json({ error: 'Borgo/Città non trovato' }, { status: 404 })

  const center = { lat: borgo.latitude as number, lon: borgo.longitude as number }

  // Cache ancora valida — skip completo di geosearch/rete pedonale/Dijkstra, mai un dato scaduto
  // silenziosamente servito oltre il TTL dichiarato. Le tappe (personalizzate sull'utente) restano
  // FUORI dalla cache condivisa: calcolate fresche anche su un hit di cache, mai congelate per
  // l'utente che le ha calcolate per primo.
  const { overrides, trackDurationMinutes, dayBudgetOverrideMinutes } = hikeId
    ? await fetchHikePersonalizationContext(hikeId, user.id)
    : { overrides: undefined, trackDurationMinutes: undefined, dayBudgetOverrideMinutes: undefined }
  const maxMinutesPerTappa = culturalTappaBudgetMinutes(trackDurationMinutes, dayBudgetOverrideMinutes)

  const cachedAt = borgo.itinerary_cached_at ? new Date(borgo.itinerary_cached_at as string).getTime() : 0
  if (borgo.itinerary_cache && Date.now() - cachedAt < CACHE_TTL_MS) {
    const cached = borgo.itinerary_cache as BorgoItinerary
    const tappe = await computePersonalizedTappe(center, cached.stops, cached.legs, overrides, MAX_STOPS_PER_TAPPA, maxMinutesPerTappa, WALK_NETWORK_TIMEOUT_MS)
    return NextResponse.json({ ...cached, tappe, maxStopsPerTappa: MAX_STOPS_PER_TAPPA, maxMinutesPerTappa })
  }

  let merged: ItineraryStopCandidate[] = []
  for (const step of RADIUS_STEPS) {
    let archiveStops: ItineraryStopCandidate[]
    try {
      archiveStops = await fetchBorgoArchiveStops(supabase, center, step.radiusKm, step.archiveLimit)
    } catch (e) {
      console.error('[borgo-itinerary]', e)
      return NextResponse.json({ error: 'Errore interno' }, { status: 500 })
    }
    const wikiStops = await fetchBorgoWikiStops(center, step.radiusKm, step.wikiLimit).catch(e => {
      console.error('[borgo-itinerary] geosearch Wikipedia fallita', e)
      return []
    })
    const previousCount = merged.length
    merged = mergeStopCandidates(archiveStops, wikiStops)
    if (merged.length >= MAX_TOTAL_STOPS) break
    if (step !== RADIUS_STEPS[0] && merged.length - previousCount < MIN_NEW_CANDIDATES_TO_KEEP_EXPANDING) break
  }

  const capped = nearestStops(center, merged, MAX_TOTAL_STOPS)
  // Verifica utente: "Casa natale di S. Camillo de Lellis" (Bucchianico, un paese diverso) inclusa
  // fra le tappe di Chieti pur essendo isolata dal resto del cluster — vedi il commento su
  // excludeIsolatedOutliers in lib/metaSearch/borgoItinerary.ts. Gli outlier sono scartati, mai
  // messi nell'itinerario a piedi principale: RADIUS_STEPS può allargarsi fino a 20km proprio per
  // raggiungere i bordi di una città grande, ma un candidato senza nessuna catena di tappe vicine
  // che lo colleghi al centro è quasi sempre un luogo diverso emerso dalla stessa geosearch.
  const { kept: clustered, outliers } = excludeIsolatedOutliers(center, capped)
  if (outliers.length > 0) {
    console.warn('[borgo-itinerary] tappe scartate perché isolate dal resto del cluster:', outliers.map(s => s.name))
  }
  // Verifica utente: descrizioni delle tappe "più esaustive" (e coerenti tra loro, non solo per
  // quelle da Wikipedia) — lib/guideBorgoDetailStops.ts's enrichStopDescriptions, stessa funzione
  // riusata da app/api/guide/route.ts per il prompt, applicata SOLO alle tappe che sopravvivono
  // alla selezione finale, mai all'intero elenco di candidati scartati.
  const ordered = await enrichStopDescriptions(orderStopsNearestNeighbor(center, clustered))

  if (ordered.length === 0) {
    // Mai messo in cache: un elenco vuoto qui può derivare da un genuino "nessuna tappa nei
    // dintorni" ma anche da un fallimento silenzioso della geosearch Wikipedia (wikiStops ricade
    // su [] sopra) — cachare un falso negativo per 30 giorni sarebbe peggio di ricalcolare ogni
    // volta. Il prossimo tentativo riparte sempre da zero, come prima di questa cache.
    const empty: BorgoItinerary = {
      borgoName: borgo.name, stops: [], legs: [], totalDistanceM: 0, estimatedTimeSeconds: 0, tappe: [],
      maxStopsPerTappa: MAX_STOPS_PER_TAPPA, maxMinutesPerTappa,
    }
    return NextResponse.json(empty)
  }

  // Rete pedonale per bbox — tutte le tappe + il Borgo (lib/routeBuilder/borgoWalkLegs.ts, condivisa
  // con app/api/borgo-itinerary/apply-overrides/route.ts).
  const network = await fetchWalkNetworkForPoints([center, ...ordered], WALK_NETWORK_TIMEOUT_MS)

  const waypoints = [center, ...ordered.map(s => ({ lat: s.lat, lon: s.lon }))]
  const { legs, totalDistanceM } = buildLegsForWaypoints(network, waypoints)

  const stopsForResponse: ItineraryStop[] = ordered.map(({ id, name, lat, lon, description, thumbnail, url, source, siteType }) =>
    ({ id, name, lat, lon, description, thumbnail, url, source, siteType }))

  const cacheableItinerary: Omit<BorgoItinerary, 'tappe' | 'maxStopsPerTappa' | 'maxMinutesPerTappa'> = {
    borgoName: borgo.name,
    stops: stopsForResponse,
    legs,
    totalDistanceM,
    estimatedTimeSeconds: Math.round(totalDistanceM / WALK_SPEED_MPS),
  }

  // Verifica utente (Agrigento — "ancora lento" a ogni tentativo, mai una tappa in cache): la
  // scrittura era fire-and-forget (come lib/wikidataFallback.ts/lib/placePhotoCache.ts, per non far
  // aspettare la risposta), ma su un runtime serverless (Vercel, questa route non è edge) una
  // promise non attesa può restare tagliata a metà se la funzione viene rilasciata subito dopo
  // l'invio della risposta — senza garanzia di completamento (il progetto non ha @vercel/functions'
  // waitUntil né Next.js `after`, non disponibile in questa versione). Un payload piccolo (Chieti,
  // poche tappe) vince quasi sempre questa corsa per puro caso; un bbox più esteso (più tappe, rete
  // pedonale più grande da processare PRIMA di arrivare qui) la perde quasi sempre — mai una cache
  // scritta, quindi ogni apertura della guida ripete l'intera pipeline costosa da zero. Attesa qui
  // (poche centinaia di ms per un upsert, trascurabile sul totale della richiesta) garantisce che la
  // scrittura sia completa prima di rispondere, invece di sperare che il runtime resti vivo
  // abbastanza a lungo. Solo quando la rete pedonale è stata trovata davvero (mai quando `network`
  // è null e ogni leg è quindi una linea d'aria di ripiego) — altrimenti un esito degradato per un
  // problema temporaneo di Overpass resterebbe "congelato" in cache per 30 giorni invece di lasciare
  // che il prossimo tentativo riprovi con la rete vera. Mai `tappe` dentro questo oggetto: è
  // personalizzato sull'utente corrente, la cache è condivisa tra tutti.
  if (network) {
    const { error } = await withTimeout<{ error: { message: string } | null }>(
      supabase
        .from('dtrek_places')
        .update({ itinerary_cache: cacheableItinerary, itinerary_cached_at: new Date().toISOString() })
        .eq('id', placeId),
      CACHE_WRITE_TIMEOUT_MS,
      () => ({ error: { message: 'timeout' } }),
    )
    if (error) console.error('[borgo-itinerary] cache update fallito:', error.message)
  }

  const tappe = await computePersonalizedTappe(center, ordered, legs, overrides, MAX_STOPS_PER_TAPPA, maxMinutesPerTappa, WALK_NETWORK_TIMEOUT_MS)
  return NextResponse.json({ ...cacheableItinerary, tappe, maxStopsPerTappa: MAX_STOPS_PER_TAPPA, maxMinutesPerTappa })
}

/** Personalizzazioni salvate per QUESTA Meta pianificata (piano guide-eccellenza Fase 2) — mai
 *  bloccante: un fallimento di lettura ricade sul raggruppamento automatico puro/sull'intera
 *  giornata libera (culturalTappaBudgetMinutes(undefined)), mai un errore che fa fallire l'intero
 *  itinerario per un problema di personalizzazione. estimated_time_seconds è la durata REALE di
 *  un'eventuale traccia GPS collegata (trekking misto, verifica utente: "budget residuo della
 *  giornata") — nasce a 0 per una Meta creata dalla ricerca, vedi il commento su
 *  culturalTappaBudgetMinutes in lib/metaSearch/borgoItinerary.ts. */
async function fetchHikePersonalizationContext(hikeId: string, userId: string): Promise<{
  overrides: BorgoItineraryOverrides | undefined
  trackDurationMinutes: number | undefined
  dayBudgetOverrideMinutes: number | undefined
}> {
  try {
    const { data } = await supabase
      .from('planned_hikes')
      .select('borgo_itinerary_overrides, estimated_time_seconds, borgo_day_budget_minutes')
      .eq('id', hikeId)
      .eq('user_id', userId)
      .maybeSingle()
    const estimatedTimeSeconds = data?.estimated_time_seconds as number | undefined
    return {
      overrides: (data?.borgo_itinerary_overrides as BorgoItineraryOverrides | undefined) ?? undefined,
      trackDurationMinutes: estimatedTimeSeconds ? estimatedTimeSeconds / 60 : undefined,
      dayBudgetOverrideMinutes: (data?.borgo_day_budget_minutes as number | undefined) ?? undefined,
    }
  } catch (e) {
    console.error('[borgo-itinerary] lettura contesto personalizzazione fallita', e)
    return { overrides: undefined, trackDurationMinutes: undefined, dayBudgetOverrideMinutes: undefined }
  }
}
