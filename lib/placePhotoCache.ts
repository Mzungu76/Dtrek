// Foto di copertina per una Meta Borgo/Città o Sito — nessuna fonte della pipeline (MiC/ArCo, OSM,
// Wikidata-enrich) popola dtrek_places.image_url oggi (MiC/ArCo lo esclude esplicitamente, vedi
// scripts/places/mic/fetch.ts). Qui la si cerca dal vivo, in ordine di PRECISIONE (una foto
// dell'esatto soggetto, non solo "nei dintorni"), e si persiste il risultato — stesso principio di
// cache-poi-fetch-poi-salva (anche l'esito negativo) già rodato per le foto delle specie in
// lib/wikidataFallback.ts.
//
// 1. Wikidata P18 (quando la Meta ha già un wikidata_id da scripts/places/wikidata/enrich.ts) — la
//    più precisa: l'immagine è dichiarata sulla voce Wikidata di QUESTA entità specifica, non
//    trovata per prossimità.
// 2. Miniatura dell'articolo Wikipedia il cui titolo combacia col nome della Meta, tra quelli
//    trovati da una geosearch stretta (lib/wikipedia.ts's fetchNearbyWiki) — quasi altrettanto
//    precisa, copre i casi senza wikidata_id.
// 3. Geosearch Wikimedia Commons (app/lib/guide/fetchRoutePhotos.ts, già in uso per il mosaico foto
//    di un Sentiero) — ultima risorsa: una foto "nei pressi", non garantita del soggetto esatto.
//
// Mai una foto stock generica: fuori da queste tre fonti, l'assenza resta assenza (fallback a
// icona/gradiente lato UI, non un'immagine qualunque spacciata per il luogo).
import { supabase } from './supabase'
import { fetchNearbyWiki } from './wikipedia'
import { namesOverlap } from './metaSearch/borgoItinerary'
import { fetchRoutePhotos } from '@/app/lib/guide/fetchRoutePhotos'

const WD_SPARQL = 'https://query.wikidata.org/sparql'
const WD_USER_AGENT = 'DTrek/1.0 (places cover photo; mzulpt@gmail.com)'

export interface PlaceCoverPhoto {
  url: string
  /** Testo da mostrare accanto alla foto — richiesto dalla licenza CC BY-SA di Wikimedia Commons
   *  (fonte di tutt'e tre i livelli sopra). Vedi app/fonti-e-crediti/page.tsx. */
  credit: string | null
}

interface PlaceForPhoto {
  id: string
  name: string
  lat: number
  lon: number
  wikidataId?: string | null
}

async function fetchFromWikidataP18(wikidataId: string): Promise<PlaceCoverPhoto | null> {
  const query = `SELECT ?pic WHERE { wd:${wikidataId} wdt:P18 ?pic. } LIMIT 1`
  try {
    const res = await fetch(`${WD_SPARQL}?query=${encodeURIComponent(query)}`, {
      headers: { Accept: 'application/sparql-results+json', 'User-Agent': WD_USER_AGENT },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const data = await res.json() as { results?: { bindings?: Array<{ pic: { value: string } }> } }
    const url = data.results?.bindings?.[0]?.pic?.value
    return url ? { url, credit: 'Wikimedia Commons' } : null
  } catch {
    return null
  }
}

// Raggio stretto apposta: qui cerchiamo la VOCE su questa Meta specifica, non un arricchimento
// generico dell'area (quello è il livello 3, fetchRoutePhotos, con un raggio molto più ampio).
const WIKIPEDIA_MATCH_RADIUS_M = 800

async function fetchFromWikipediaThumbnail(name: string, lat: number, lon: number): Promise<PlaceCoverPhoto | null> {
  const pages = await fetchNearbyWiki(lat, lon, WIKIPEDIA_MATCH_RADIUS_M, 5)
  const match = pages.find(p => p.thumbnail && namesOverlap(name, p.title))
  return match?.thumbnail ? { url: match.thumbnail, credit: 'Wikipedia' } : null
}

// Più ampio dei precedenti apposta — qui si accetta una foto "nei pressi", non del soggetto esatto,
// quindi vale la pena guardare un'area più larga prima di rinunciare del tutto.
const COMMONS_FALLBACK_RADIUS_M = 1500

async function fetchFromCommonsGeosearch(lat: number, lon: number): Promise<PlaceCoverPhoto | null> {
  const [photo] = await fetchRoutePhotos(lat, lon, COMMONS_FALLBACK_RADIUS_M, 1)
  return photo ? { url: photo.url, credit: photo.credit } : null
}

/**
 * Foto di copertina per `place`, con cache su dtrek_places (image_url/image_credit/
 * image_checked_at — supabase/migrations/add_place_photo_cache_columns.sql). Mai un'eccezione: un
 * fallimento di rete qui non deve mai far fallire la generazione della Guida, solo restituire null
 * (fallback a icona/gradiente lato UI) e lasciare image_checked_at NULL per un prossimo tentativo.
 */
export async function fetchPlaceCoverPhoto(place: PlaceForPhoto): Promise<PlaceCoverPhoto | null> {
  const { data: cached } = await supabase
    .from('dtrek_places')
    .select('image_url, image_credit, image_checked_at')
    .eq('id', place.id)
    .maybeSingle()

  if (cached?.image_checked_at) {
    return cached.image_url ? { url: cached.image_url as string, credit: cached.image_credit as string | null } : null
  }

  let found: PlaceCoverPhoto | null = null
  try {
    if (place.wikidataId) found = await fetchFromWikidataP18(place.wikidataId)
    if (!found) found = await fetchFromWikipediaThumbnail(place.name, place.lat, place.lon)
    if (!found) found = await fetchFromCommonsGeosearch(place.lat, place.lon)
  } catch (e) {
    console.error('[placePhotoCache] ricerca foto fallita:', e)
  }

  // Fire-and-forget, come lib/wikidataFallback.ts: la Guida non deve aspettare la scrittura della
  // cache per mostrare la foto appena trovata.
  supabase
    .from('dtrek_places')
    .update({
      image_url: found?.url ?? null,
      image_credit: found?.credit ?? null,
      image_checked_at: new Date().toISOString(),
    })
    .eq('id', place.id)
    .then(({ error }) => { if (error) console.error('[placePhotoCache] cache update fallito:', error.message) })

  return found
}
