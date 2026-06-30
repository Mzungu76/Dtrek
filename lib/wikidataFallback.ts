// Wikidata/Commons (always CC0) fallback image for species GBIF/iNaturalist returned without
// a usable photo. Checked-then-fetched against species_image_fallback, same caching shape as
// lib/natura2000/natura2000Cache.ts (read cache, fall through to live fetch, write cache),
// except no TTL — a species' Commons photo doesn't change week to week.
import { supabase } from '@/lib/supabase'

const WD_SPARQL = 'https://query.wikidata.org/sparql'
const WD_USER_AGENT = 'DTrek/1.0 (mzulpt@gmail.com)'

interface WikidataFallbackRow {
  scientific_name: string
  wikidata_qid: string | null
  image_url: string | null
}

async function fetchFromWikidata(scientificName: string): Promise<{ qid: string; imageUrl: string } | null> {
  const query = `SELECT ?item ?pic WHERE { ?item wdt:P225 "${scientificName.replace(/"/g, '')}"; wdt:P18 ?pic. } LIMIT 1`
  try {
    const res = await fetch(`${WD_SPARQL}?query=${encodeURIComponent(query)}`, {
      headers: { Accept: 'application/sparql-results+json', 'User-Agent': WD_USER_AGENT },
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) return null
    const data = await res.json() as { results?: { bindings?: Array<{ item: { value: string }; pic: { value: string } }> } }
    const binding = data.results?.bindings?.[0]
    if (!binding) return null
    return { qid: binding.item.value.split('/').pop() ?? '', imageUrl: binding.pic.value }
  } catch {
    return null
  }
}

// Returns a CC0 image URL for `scientificName`, or null if none is known. Reads
// species_image_fallback first; on a cache miss queries Wikidata live and persists the
// result (including negative results, stored as a row with image_url = null, so a species
// with no Commons photo isn't re-queried on every gallery load).
export async function fetchWikidataImage(scientificName: string): Promise<string | null> {
  const { data: cached } = await supabase
    .from('species_image_fallback')
    .select('scientific_name, wikidata_qid, image_url')
    .eq('scientific_name', scientificName)
    .maybeSingle()

  if (cached) return (cached as WikidataFallbackRow).image_url

  const found = await fetchFromWikidata(scientificName)

  supabase
    .from('species_image_fallback')
    .upsert(
      { scientific_name: scientificName, wikidata_qid: found?.qid ?? null, image_url: found?.imageUrl ?? null },
      { onConflict: 'scientific_name' },
    )
    .then(({ error }) => { if (error) console.error('[species_image_fallback] upsert error:', error.message) })

  return found?.imageUrl ?? null
}
