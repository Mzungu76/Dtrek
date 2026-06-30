// Shared fallback cascade for the Galleria Verde / Galleria Selvatica galleries
// (app/api/flora/route.ts, app/api/animals/route.ts). Implements the 3-level fallback from
// the product spec: 1) direct bbox GBIF+iNaturalist, 2) buffer esteso (bbox *2), 3) specie
// tipiche dei siti Natura 2000 intersecanti (fonte EEA — n2000_site_species — non MASE, per
// la licenza commerciale CC BY 4.0 garantita). Result cached per (bbox_key, gallery_type,
// month) in gallery_cascade_cache, same bbox-keyed shape as lib/natura2000/natura2000Cache.ts.
import { supabase } from '@/lib/supabase'
import { normalizeBboxKey } from '@/lib/geoUtils'
import { fetchWikidataImage } from '@/lib/wikidataFallback'
import { fetchNatura2000PolygonsCached } from '@/lib/natura2000/natura2000Cache'
import { Natura2000UnavailableError } from '@/lib/natura2000/natura2000Client'

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7gg — le osservazioni variano per stagione
const MIN_SPECIES_THRESHOLD = 3

export interface CascadeItem {
  scientificName: string
  vernacularNameIt: string | null
  imageUrl: string | null
  thumbUrl: string | null
  attribution: string
  license: string
  lat: number | null
  lon: number | null
  sourceUrl: string | null
  description: string | null
  family: string | null
  source: 'gbif' | 'inaturalist' | 'n2000'
  /** GBIF usageKey, when source === 'gbif' — needed for the vernacular-name lookup. */
  gbifUsageKey: number | null
  /** Taxonomic class/order, when known — used by app/api/animals/route.ts's danger classification. */
  taxonClass: string | null
  taxonOrder: string | null
}

export interface BboxBounds { minLat: number; maxLat: number; minLon: number; maxLon: number }

export interface CascadeResult {
  items: CascadeItem[]
  fallbackLevel: 1 | 2 | 3
}

function expandBbox(b: BboxBounds, factor: number): BboxBounds {
  const latPad = (b.maxLat - b.minLat) * (factor - 1) / 2
  const lonPad = (b.maxLon - b.minLon) * (factor - 1) / 2
  return {
    minLat: b.minLat - latPad, maxLat: b.maxLat + latPad,
    minLon: b.minLon - lonPad, maxLon: b.maxLon + lonPad,
  }
}

function dedupeByScientificName(items: CascadeItem[]): CascadeItem[] {
  const bySpecies = new Map<string, CascadeItem>()
  for (const item of items) {
    if (!item.scientificName) continue
    const existing = bySpecies.get(item.scientificName)
    if (!existing || (item.imageUrl && !existing.imageUrl)) bySpecies.set(item.scientificName, item)
  }
  return Array.from(bySpecies.values())
}

async function fetchN2000SiteCodesInBbox(b: BboxBounds): Promise<string[]> {
  // Reuses the existing MASE/ISPRA polygon cache purely for geometry/intersection — only
  // siteCode is taken from it; the species list itself always comes from n2000_site_species
  // (EEA, CC BY 4.0), never from MASE's payload. Same failure contract as app/api/natura2000's
  // route: Natura2000UnavailableError (dataset not configured) is treated as "no sites found".
  try {
    const bbox = `${b.minLat},${b.minLon},${b.maxLat},${b.maxLon}`
    const features = await fetchNatura2000PolygonsCached(bbox)
    return features.map(f => f.siteCode).filter((c): c is string => !!c)
  } catch (e) {
    if (e instanceof Natura2000UnavailableError) return []
    console.error('[galleryCascade] natura2000 lookup failed:', e)
    return []
  }
}

async function fetchN2000FallbackItems(siteCodes: string[], taxonGroups: string[]): Promise<CascadeItem[]> {
  if (siteCodes.length === 0) return []
  const { data, error } = await supabase
    .from('n2000_site_species')
    .select('scientific_name, vernacular_name_it, taxon_group')
    .in('site_code', siteCodes)
    .in('taxon_group', taxonGroups)
    .limit(40)
  if (error || !data) return []

  return data.map(row => ({
    scientificName: row.scientific_name,
    vernacularNameIt: row.vernacular_name_it,
    imageUrl: null,
    thumbUrl: null,
    attribution: 'European Environment Agency (EEA), Natura 2000',
    license: 'CC BY 4.0',
    lat: null,
    lon: null,
    sourceUrl: null,
    description: null,
    family: null,
    source: 'n2000' as const,
    gbifUsageKey: null,
    taxonClass: null,
    taxonOrder: null,
  }))
}

async function readCache(bboxKey: string, galleryType: 'flora' | 'fauna', month: number): Promise<CascadeResult | null> {
  const { data } = await supabase
    .from('gallery_cascade_cache')
    .select('items, fallback_level')
    .eq('bbox_key', bboxKey)
    .eq('gallery_type', galleryType)
    .eq('month', month)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  if (!data) return null
  return { items: data.items as CascadeItem[], fallbackLevel: data.fallback_level as 1 | 2 | 3 }
}

function writeCache(bboxKey: string, galleryType: 'flora' | 'fauna', month: number, result: CascadeResult): void {
  const expiresAt = new Date(Date.now() + CACHE_TTL_MS).toISOString()
  supabase
    .from('gallery_cascade_cache')
    .upsert(
      { bbox_key: bboxKey, gallery_type: galleryType, month, fallback_level: result.fallbackLevel, items: result.items, expires_at: expiresAt },
      { onConflict: 'bbox_key,gallery_type,month' },
    )
    .then(({ error }) => { if (error) console.error('[gallery_cascade_cache] upsert error:', error.message) })
}

interface RunCascadeOptions {
  galleryType: 'flora' | 'fauna'
  bounds: BboxBounds
  month: number
  /** Fetches GBIF+iNaturalist (or just GBIF) items for the given bbox bounds. */
  fetchDirect: (bounds: BboxBounds) => Promise<CascadeItem[]>
  /** taxon_group values in n2000_site_species relevant to this gallery (level-3 fallback). */
  n2000TaxonGroups: string[]
}

// Runs the 3-level cascade and fills in Wikidata fallback images for items still missing
// one. Caches the final result keyed by the *original* (level-1) bbox so repeat opens of
// the same trail/activity skip the whole cascade, not just the GBIF call.
export async function runGalleryCascade(opts: RunCascadeOptions): Promise<CascadeResult> {
  const bboxKey = normalizeBboxKey(`${opts.bounds.minLat},${opts.bounds.minLon},${opts.bounds.maxLat},${opts.bounds.maxLon}`)

  const cached = await readCache(bboxKey, opts.galleryType, opts.month)
  if (cached) return cached

  let items = dedupeByScientificName(await opts.fetchDirect(opts.bounds))
  let fallbackLevel: 1 | 2 | 3 = 1

  if (items.length < MIN_SPECIES_THRESHOLD) {
    const extended = dedupeByScientificName(await opts.fetchDirect(expandBbox(opts.bounds, 2)))
    if (extended.length > items.length) {
      items = extended
      fallbackLevel = 2
    }
  }

  if (items.length < MIN_SPECIES_THRESHOLD) {
    const siteCodes = await fetchN2000SiteCodesInBbox(expandBbox(opts.bounds, 2.5))
    const n2000Items = await fetchN2000FallbackItems(siteCodes, opts.n2000TaxonGroups)
    if (n2000Items.length > 0) {
      items = dedupeByScientificName([...items, ...n2000Items])
      fallbackLevel = 3
    }
  }

  await Promise.all(items.filter(i => !i.imageUrl).map(async item => {
    item.imageUrl = await fetchWikidataImage(item.scientificName)
    item.thumbUrl = item.thumbUrl ?? item.imageUrl
  }))

  const result: CascadeResult = { items, fallbackLevel }
  writeCache(bboxKey, opts.galleryType, opts.month, result)
  return result
}
