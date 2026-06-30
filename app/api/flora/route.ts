import {
  GBIF_BASE, canonicalSpeciesName, imageApiUrl, licenseLabel, fetchWithTimeout,
  fetchVernacularIta, fetchSpeciesDescription,
  type GbifOccurrence, type GbifSearchResponse,
} from '@/lib/gbifShared'
import { fetchInatObservations, inatPhotoUrl, inatLicenseLabel } from '@/lib/inatShared'
import { runGalleryCascade, type CascadeItem, type BboxBounds } from '@/lib/galleryCascade'

export const revalidate = 86400 // cache edge Next.js 24h — zero Supabase per il livello 1

export interface FloraItem {
  scientificName: string
  family: string | null
  vernacularIta: string | null
  vernacularEn: string | null
  thumbUrl: string | null
  imageUrl: string | null
  attribution: string
  license: string
  gbifUrl: string | null
  lat: number | null
  lon: number | null
  description: string | null
  /** 1 = osservazione diretta, 2 = buffer esteso, 3 = specie tipiche dell'area protetta (Natura 2000) */
  fallbackLevel: 1 | 2 | 3
}

async function fetchGbifFlora(b: BboxBounds, month: number): Promise<GbifOccurrence[]> {
  const params = new URLSearchParams()
  params.set('decimalLatitude', `${b.minLat},${b.maxLat}`)
  params.set('decimalLongitude', `${b.minLon},${b.maxLon}`)
  params.set('kingdomKey', '6') // Plantae
  params.set('month', String(month))
  params.set('mediaType', 'StillImage')
  params.set('hasCoordinate', 'true')
  params.append('license', 'CC0_1_0')
  params.append('license', 'CC_BY_4_0')
  params.set('limit', '40')

  try {
    const res = await fetchWithTimeout(`${GBIF_BASE}/occurrence/search?${params.toString()}`, 8000)
    if (!res.ok) return []
    const data = await res.json() as GbifSearchResponse
    return (data.results ?? []).filter(r =>
      r.media && r.media.length > 0 && r.decimalLatitude !== undefined && r.decimalLongitude !== undefined,
    )
  } catch {
    return []
  }
}

function gbifToCascadeItem(occ: GbifOccurrence): CascadeItem {
  const media = occ.media![0]
  const identifier = media.identifier ?? ''
  const attributionName = media.rightsHolder ?? media.creator ?? null
  return {
    scientificName: canonicalSpeciesName(occ) ?? occ.scientificName ?? 'Specie non identificata',
    vernacularNameIt: null,
    imageUrl: imageApiUrl(occ.key, identifier, '400x'),
    thumbUrl: imageApiUrl(occ.key, identifier, '400x'),
    attribution: attributionName ? `© ${attributionName}` : 'Autore sconosciuto',
    license: licenseLabel(media.license ?? occ.license),
    lat: occ.decimalLatitude!,
    lon: occ.decimalLongitude!,
    sourceUrl: `https://www.gbif.org/occurrence/${occ.key}`,
    description: null,
    family: occ.family ?? null,
    source: 'gbif',
    gbifUsageKey: occ.usageKey ?? null,
    taxonClass: occ.class ?? null,
    taxonOrder: occ.order ?? null,
  }
}

function makeFetchDirect(month: number) {
  return async function fetchDirect(b: BboxBounds): Promise<CascadeItem[]> {
    const [gbifResults, inatResults] = await Promise.all([
      fetchGbifFlora(b, month),
      fetchInatObservations({ ...b, month, iconicTaxa: ['Plantae'] }),
    ])
    return buildCascadeItems(gbifResults, inatResults)
  }
}

function buildCascadeItems(
  gbifResults: GbifOccurrence[],
  inatResults: Awaited<ReturnType<typeof fetchInatObservations>>,
): CascadeItem[] {

  const gbifItems = gbifResults.map(gbifToCascadeItem)
  const inatItems: CascadeItem[] = inatResults
    .filter(o => o.photos && o.photos.length > 0 && o.taxon?.name && o.geojson?.coordinates)
    .map(o => {
      const photo = o.photos![0]
      return {
        scientificName: o.taxon!.name!,
        vernacularNameIt: o.taxon!.preferred_common_name ?? null,
        imageUrl: inatPhotoUrl(photo, 'medium'),
        thumbUrl: inatPhotoUrl(photo, 'square'),
        attribution: photo.attribution ?? 'Osservatore iNaturalist',
        license: inatLicenseLabel(photo.license_code),
        lat: o.geojson!.coordinates![1],
        lon: o.geojson!.coordinates![0],
        sourceUrl: `https://www.inaturalist.org/observations/${o.id}`,
        description: null,
        family: null,
        source: 'inaturalist' as const,
        gbifUsageKey: null,
        taxonClass: null,
        taxonOrder: null,
      }
    })

  return [...gbifItems, ...inatItems]
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const bboxRaw = searchParams.get('bbox')
  const monthRaw = searchParams.get('month')

  if (!bboxRaw || !monthRaw) {
    return new Response(JSON.stringify({ error: 'missing bbox or month' }), { status: 400 })
  }

  const bboxParts = bboxRaw.split(',').map(Number)
  if (bboxParts.length !== 4 || bboxParts.some(n => Number.isNaN(n))) {
    return new Response(JSON.stringify({ error: 'invalid bbox' }), { status: 400 })
  }
  const [minLat, maxLat, minLon, maxLon] = bboxParts

  const month = parseInt(monthRaw, 10)
  if (Number.isNaN(month) || month < 1 || month > 12) {
    return new Response(JSON.stringify({ error: 'invalid month' }), { status: 400 })
  }

  let cascade
  try {
    cascade = await runGalleryCascade({
      galleryType: 'flora',
      bounds: { minLat, maxLat, minLon, maxLon },
      month,
      fetchDirect: makeFetchDirect(month),
      n2000TaxonGroups: ['Plants'],
    })
  } catch {
    return Response.json({ items: [], total: 0, error: 'gallery_unavailable' })
  }

  const deduped = cascade.items.slice(0, 20)

  const [vernacularResults, descriptionResults] = await Promise.all([
    Promise.allSettled(deduped.map(item =>
      item.vernacularNameIt
        ? Promise.resolve(item.vernacularNameIt)
        : item.gbifUsageKey ? fetchVernacularIta(item.gbifUsageKey) : Promise.resolve(null),
    )),
    Promise.allSettled(deduped.map(item => item.description ? Promise.resolve(item.description) : fetchSpeciesDescription(item.scientificName))),
  ])

  const items: FloraItem[] = deduped.map((item, i) => {
    const vernacular = vernacularResults[i]
    const description = descriptionResults[i]
    return {
      scientificName: item.scientificName,
      family: item.family,
      vernacularIta: vernacular.status === 'fulfilled' ? vernacular.value : null,
      vernacularEn: null,
      thumbUrl: item.thumbUrl,
      imageUrl: item.imageUrl,
      attribution: item.attribution,
      license: item.license,
      gbifUrl: item.sourceUrl,
      lat: item.lat,
      lon: item.lon,
      description: description.status === 'fulfilled' ? description.value : null,
      fallbackLevel: cascade.fallbackLevel,
    }
  })

  return Response.json({ items, total: items.length, fallbackLevel: cascade.fallbackLevel })
}
