import {
  GBIF_BASE, canonicalSpeciesName, imageApiUrl, licenseLabel, fetchWithTimeout,
  fetchVernacularIta, fetchSpeciesDescription,
  type GbifOccurrence, type GbifSearchResponse,
} from '@/lib/gbifShared'
import { classifyDanger, type DangerLevel } from '@/lib/dangerousTaxa'

export const revalidate = 86400 // cache edge Next.js 24h — zero Supabase

export interface AnimalItem {
  gbifKey: number
  speciesKey: number
  scientificName: string
  family: string | null
  vernacularIta: string | null
  vernacularEn: string | null
  thumbUrl: string
  imageUrl: string
  attribution: string
  license: string
  gbifUrl: string
  lat: number
  lon: number
  description: string | null
  dangerLevel: DangerLevel | null
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

  const params = new URLSearchParams()
  params.set('decimalLatitude', `${minLat},${maxLat}`)
  params.set('decimalLongitude', `${minLon},${maxLon}`)
  params.set('kingdomKey', '1') // Animalia
  params.set('phylumKey', '44') // Chordata — excludes insects/invertebrates noise
  params.set('month', String(month))
  params.set('mediaType', 'StillImage')
  params.set('hasCoordinate', 'true')
  params.append('license', 'CC0_1_0')
  params.append('license', 'CC_BY_4_0')
  params.set('limit', '40')

  let data: GbifSearchResponse
  try {
    const res = await fetchWithTimeout(`${GBIF_BASE}/occurrence/search?${params.toString()}`, 8000)
    if (!res.ok) {
      return Response.json({ items: [], total: 0, error: 'gbif_unavailable' })
    }
    data = await res.json() as GbifSearchResponse
  } catch {
    return Response.json({ items: [], total: 0, error: 'gbif_unavailable' })
  }

  const withMedia = (data.results ?? []).filter(r =>
    r.media && r.media.length > 0 && r.decimalLatitude !== undefined && r.decimalLongitude !== undefined,
  )

  // dedupe by speciesKey, keeping the record with the most media
  const bySpecies = new Map<number, GbifOccurrence>()
  for (const occ of withMedia) {
    if (occ.speciesKey === undefined) continue
    const existing = bySpecies.get(occ.speciesKey)
    if (!existing || (occ.media?.length ?? 0) > (existing.media?.length ?? 0)) {
      bySpecies.set(occ.speciesKey, occ)
    }
  }

  const deduped = Array.from(bySpecies.values()).slice(0, 20)

  const [vernacularResults, descriptionResults] = await Promise.all([
    Promise.allSettled(
      deduped.map(occ => occ.usageKey ? fetchVernacularIta(occ.usageKey) : Promise.resolve(null)),
    ),
    Promise.allSettled(
      deduped.map(occ => {
        const name = canonicalSpeciesName(occ)
        return name ? fetchSpeciesDescription(name) : Promise.resolve(null)
      }),
    ),
  ])

  const items: AnimalItem[] = deduped.map((occ, i) => {
    const media = occ.media![0]
    const identifier = media.identifier ?? ''
    const attributionName = media.rightsHolder ?? media.creator ?? null
    const vernacular = vernacularResults[i]
    const description = descriptionResults[i]
    return {
      gbifKey: occ.key,
      speciesKey: occ.speciesKey!,
      scientificName: occ.scientificName ?? 'Specie non identificata',
      family: occ.family ?? null,
      vernacularIta: vernacular.status === 'fulfilled' ? vernacular.value : null,
      vernacularEn: null,
      thumbUrl: imageApiUrl(occ.key, identifier, '400x'),
      imageUrl: imageApiUrl(occ.key, identifier, '400x'),
      attribution: attributionName ? `© ${attributionName}` : 'Autore sconosciuto',
      license: licenseLabel(media.license ?? occ.license),
      gbifUrl: `https://www.gbif.org/occurrence/${occ.key}`,
      lat: occ.decimalLatitude!,
      lon: occ.decimalLongitude!,
      description: description.status === 'fulfilled' ? description.value : null,
      dangerLevel: classifyDanger({
        scientificName: occ.scientificName,
        family: occ.family,
        order: occ.order,
        class: occ.class,
      }),
    }
  })

  return Response.json({ items, total: data.count ?? 0 })
}
