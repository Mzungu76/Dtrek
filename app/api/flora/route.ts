import crypto from 'crypto'

export const revalidate = 86400 // cache edge Next.js 24h — zero Supabase

const GBIF_BASE = 'https://api.gbif.org/v1'
const USER_AGENT = 'DTrek/1.0 (mzulpt@gmail.com)'

export interface FloraItem {
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
}

interface GbifMedia {
  identifier?: string
  rightsHolder?: string
  creator?: string
  license?: string
}

interface GbifOccurrence {
  key: number
  speciesKey?: number
  scientificName?: string
  family?: string
  usageKey?: number
  license?: string
  media?: GbifMedia[]
}

interface GbifSearchResponse {
  count: number
  results: GbifOccurrence[]
}

interface GbifVernacularName {
  vernacularName: string
  language: string
}

function imageApiUrl(gbifKey: number, identifier: string, size: '120x' | '400x'): string {
  const md5 = crypto.createHash('md5').update(identifier).digest('hex')
  return `${GBIF_BASE.replace('/v1', '')}/v1/image/cache/${size}/occurrence/${gbifKey}/media/${md5}`
}

function licenseLabel(license: string | undefined): string {
  if (!license) return 'Licenza non specificata'
  if (license.includes('CC0')) return 'CC0'
  if (license.includes('CC_BY') || license.includes('CC-BY')) return 'CC BY 4.0'
  return license
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
      next: { revalidate: 86400 },
    })
  } finally {
    clearTimeout(timer)
  }
}

async function fetchVernacularIta(usageKey: number): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(`${GBIF_BASE}/species/${usageKey}/vernacularNames?limit=20`, 2000)
    if (!res.ok) return null
    const data = await res.json() as { results?: GbifVernacularName[] }
    const match = data.results?.find(v => v.language === 'ita')
    return match?.vernacularName ?? null
  } catch {
    return null
  }
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
  params.set('kingdom', 'Plantae')
  params.set('month', String(month))
  params.set('mediaType', 'StillImage')
  params.set('hasCoordinate', 'true')
  params.append('license', 'CC_BY')
  params.append('license', 'CC0')
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

  const withMedia = (data.results ?? []).filter(r => r.media && r.media.length > 0)

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

  const vernacularResults = await Promise.allSettled(
    deduped.map(occ => occ.usageKey ? fetchVernacularIta(occ.usageKey) : Promise.resolve(null)),
  )

  const items: FloraItem[] = deduped.map((occ, i) => {
    const media = occ.media![0]
    const identifier = media.identifier ?? ''
    const attributionName = media.rightsHolder ?? media.creator ?? null
    const vernacular = vernacularResults[i]
    return {
      gbifKey: occ.key,
      speciesKey: occ.speciesKey!,
      scientificName: occ.scientificName ?? 'Specie non identificata',
      family: occ.family ?? null,
      vernacularIta: vernacular.status === 'fulfilled' ? vernacular.value : null,
      vernacularEn: null,
      thumbUrl: imageApiUrl(occ.key, identifier, '120x'),
      imageUrl: imageApiUrl(occ.key, identifier, '400x'),
      attribution: attributionName ? `© ${attributionName}` : 'Autore sconosciuto',
      license: licenseLabel(media.license ?? occ.license),
      gbifUrl: `https://www.gbif.org/occurrence/${occ.key}`,
    }
  })

  return Response.json({ items, total: data.count ?? 0 })
}
