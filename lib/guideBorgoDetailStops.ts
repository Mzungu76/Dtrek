import type { SupabaseClient } from '@supabase/supabase-js'
import { originBbox } from './metaSearch/placeQuery'
import { fetchNearbyWiki, fetchExtendedExtract, searchAndFetch } from './wikipedia'
import { mergeStopCandidates, nearestStops, orderStopsNearestNeighbor, type ItineraryStopCandidate } from './metaSearch/borgoItinerary'
import { haversineM } from './geoUtils'
import type { SiteType } from './metaTypes'

// Punti di dettaglio di un Borgo/Città per la Guida (app/api/guide/route.ts) — stessa scoperta
// (archivio dtrek_places + geosearch Wikipedia, unite senza doppioni e ordinate a vicino-più-
// vicino) già usata per l'itinerario a piedi (app/api/borgo-itinerary/route.ts), che la richiama
// per non duplicare la logica. Qui manca deliberatamente tutto ciò che serve SOLO al tragitto a
// piedi (rete pedonale OSM, Dijkstra, legs): la Guida ha bisogno solo dell'elenco ordinato delle
// tappe, non del percorso reale fra loro — recuperarlo qui sarebbe uno scaricamento pesante
// (fetchWalkNetworkCached) per un dato che il prompt non usa mai.

const STOP_SEARCH_RADIUS_KM = 2.5
const WIKI_LIMIT = 10
// Un po' più degli MAX_STOPS=6 dell'itinerario a piedi (app/api/borgo-itinerary/route.ts): lì il
// tetto basso serve a non proporre un "giro" con troppe tappe da percorrere davvero a piedi in
// sequenza; qui la Guida può permettersi di raccontare qualche tappa in più, coerente con
// MAX_WIKI_POIS_IN_PROMPT (stesso tetto usato per "I luoghi da non perdere" di un sentiero).
const MAX_DETAIL_STOPS = 8

interface ArchiveSiteRow {
  id: string
  name: string
  latitude: number
  longitude: number
  description: string | null
  image_url: string | null
  official_url: string | null
  website: string | null
  subtype: string | null
}

export async function fetchBorgoArchiveStops(
  supabase: SupabaseClient,
  center: { lat: number; lon: number },
  radiusKm = STOP_SEARCH_RADIUS_KM,
  limit = 60,
): Promise<ItineraryStopCandidate[]> {
  const bbox = originBbox(center, radiusKm)
  const { data, error } = await supabase
    .from('dtrek_places')
    .select('id, name, latitude, longitude, description, image_url, official_url, website, subtype')
    .eq('meta_type', 'sito')
    .gte('latitude', bbox.minLat).lte('latitude', bbox.maxLat)
    .gte('longitude', bbox.minLon).lte('longitude', bbox.maxLon)
    .limit(limit)
  if (error) throw error

  return ((data ?? []) as ArchiveSiteRow[]).map(r => ({
    id: r.id,
    name: r.name,
    lat: r.latitude,
    lon: r.longitude,
    description: r.description ?? undefined,
    thumbnail: r.image_url ?? undefined,
    url: r.official_url ?? r.website ?? undefined,
    source: 'archivio' as const,
    siteType: (r.subtype ?? undefined) as SiteType | undefined,
  }))
}

export async function fetchBorgoWikiStops(
  center: { lat: number; lon: number },
  radiusKm = STOP_SEARCH_RADIUS_KM,
  limit = WIKI_LIMIT,
): Promise<ItineraryStopCandidate[]> {
  const wikiPages = await fetchNearbyWiki(center.lat, center.lon, radiusKm * 1000, limit)
  return wikiPages
    .filter(w => w.lat != null && w.lon != null)
    .map(w => ({
      id: `wiki:${w.pageid}`,
      name: w.title,
      lat: w.lat as number,
      lon: w.lon as number,
      description: w.extract,
      thumbnail: w.thumbnail,
      url: w.url,
      source: 'wikipedia' as const,
    }))
}

// Verifica utente: "alcuni [testi delle tappe] sono ben ampliati e altri no" — solo le tappe da
// Wikipedia (source 'wikipedia') venivano ampliate col testo esteso, quelle dall'archivio
// (dtrek_places.description, spesso assente o un breve accenno — quel campo non è mai stato
// pensato per una narrazione) restavano invariate: da qui l'incoerenza. Sotto una soglia di
// lunghezza, si cerca ORA una voce Wikipedia corrispondente per nome anche per una tappa
// dall'archivio, validata per prossimità (raggio stretto: un'omonimia in un'altra città non deve
// mai sostituire una descrizione corta ma corretta con un testo lungo ma sbagliato) — mai
// un'eccezione, un fallimento lascia semplicemente la description originale (anche se breve).
const MIN_DESCRIPTION_CHARS = 300
const ARCHIVE_WIKI_MATCH_RADIUS_M = 400

async function ensureExhaustiveDescription(stop: ItineraryStopCandidate): Promise<ItineraryStopCandidate> {
  try {
    if (stop.source === 'wikipedia') {
      const extended = await fetchExtendedExtract(stop.name, 'it')
      return extended && extended.length > (stop.description?.length ?? 0) ? { ...stop, description: extended } : stop
    }
    if ((stop.description?.length ?? 0) >= MIN_DESCRIPTION_CHARS) return stop
    const wiki = await searchAndFetch(stop.name, 'it', 'wikipedia')
    if (!wiki || wiki.lat == null || wiki.lon == null) return stop
    if (haversineM(stop.lat, stop.lon, wiki.lat, wiki.lon) > ARCHIVE_WIKI_MATCH_RADIUS_M) return stop
    const extended = await fetchExtendedExtract(wiki.title, 'it')
    return extended && extended.length > (stop.description?.length ?? 0) ? { ...stop, description: extended } : stop
  } catch {
    return stop
  }
}

/**
 * Descrizioni delle tappe selezionate portate al testo esteso Wikipedia (fetchExtendedExtract,
 * Action API con exchars, fino a ~1200 caratteri) invece del breve estratto della geosearch REST o
 * della description dell'archivio quando troppo corta — SOLO per le tappe che sopravvivono alla
 * selezione finale (nearestStops/orderStopsNearestNeighbor già a valle), mai per tutti i candidati
 * scartati, che sprecherebbe chiamate per testo che nessuno vedrà mai.
 */
export async function enrichStopDescriptions(stops: ItineraryStopCandidate[]): Promise<ItineraryStopCandidate[]> {
  return Promise.all(stops.map(ensureExhaustiveDescription))
}

/**
 * Punti di dettaglio di un Borgo/Città, uniti e ordinati per la narrazione tappa-per-tappa della
 * Guida — mai un'eccezione: un fallimento della geosearch Wikipedia (rete irraggiungibile in
 * alcuni ambienti) o dell'archivio non deve mai far fallire l'intera generazione della guida,
 * solo lasciare questa lista vuota (la sezione "luoghi" torna alla narrazione generica, vedi
 * lib/guideProfiles.ts).
 */
export async function fetchBorgoDetailStops(
  supabase: SupabaseClient,
  center: { lat: number; lon: number },
): Promise<ItineraryStopCandidate[]> {
  try {
    const [archiveStops, wikiStops] = await Promise.all([
      fetchBorgoArchiveStops(supabase, center),
      fetchBorgoWikiStops(center).catch(e => {
        console.error('[guide] geosearch Wikipedia per punti di dettaglio fallita', e)
        return []
      }),
    ])
    const merged = mergeStopCandidates(archiveStops, wikiStops)
    const selected = orderStopsNearestNeighbor(center, nearestStops(center, merged, MAX_DETAIL_STOPS))
    return await enrichStopDescriptions(selected)
  } catch (e) {
    console.error('[guide] fetch punti di dettaglio del borgo fallito', e)
    return []
  }
}
