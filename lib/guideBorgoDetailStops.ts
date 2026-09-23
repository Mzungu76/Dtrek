import type { SupabaseClient } from '@supabase/supabase-js'
import { originBbox } from './metaSearch/placeQuery'
import { fetchNearbyWiki, fetchExtendedExtract } from './wikipedia'
import { mergeStopCandidates, nearestStops, orderStopsNearestNeighbor, type ItineraryStopCandidate } from './metaSearch/borgoItinerary'
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
): Promise<ItineraryStopCandidate[]> {
  const bbox = originBbox(center, STOP_SEARCH_RADIUS_KM)
  const { data, error } = await supabase
    .from('dtrek_places')
    .select('id, name, latitude, longitude, description, image_url, official_url, website, subtype')
    .eq('meta_type', 'sito')
    .gte('latitude', bbox.minLat).lte('latitude', bbox.maxLat)
    .gte('longitude', bbox.minLon).lte('longitude', bbox.maxLon)
    .limit(60)
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

export async function fetchBorgoWikiStops(center: { lat: number; lon: number }): Promise<ItineraryStopCandidate[]> {
  const wikiPages = await fetchNearbyWiki(center.lat, center.lon, STOP_SEARCH_RADIUS_KM * 1000, WIKI_LIMIT)
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

// Verifica utente: le tappe con descrizione da Wikipedia arrivavano con l'estratto corto della
// REST /page/summary/ (fetchNearbyWiki sopra — spesso una sola frase, pensato per un elenco di
// risultati, non per raccontare la tappa). Qui si richiede il testo esteso (fetchExtendedExtract,
// Action API con exchars, fino a ~1200 caratteri) SOLO per le tappe che sopravvivono alla
// selezione finale (nearestStops/orderStopsNearestNeighbor già a valle) — mai per tutti i
// candidati scartati, che sprecherebbe chiamate per testo che nessuno vedrà mai. Le tappe
// dall'archivio (source 'archivio') restano invariate: la loro description viene da dtrek_places,
// non da questa API.
export async function enrichWikiStopDescriptions(stops: ItineraryStopCandidate[]): Promise<ItineraryStopCandidate[]> {
  return Promise.all(stops.map(async stop => {
    if (stop.source !== 'wikipedia') return stop
    try {
      const extended = await fetchExtendedExtract(stop.name, 'it')
      return extended ? { ...stop, description: extended } : stop
    } catch {
      return stop
    }
  }))
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
    return await enrichWikiStopDescriptions(selected)
  } catch (e) {
    console.error('[guide] fetch punti di dettaglio del borgo fallito', e)
    return []
  }
}
