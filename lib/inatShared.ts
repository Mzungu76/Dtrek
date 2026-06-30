// iNaturalist counterpart to lib/gbifShared.ts — second occurrence/photo source for the
// flora/fauna galleries' cascade fallback (see lib/galleryCascade.ts), used to top up
// results when GBIF alone doesn't clear the minimum-species threshold for a bbox.
export const INAT_BASE = 'https://api.inaturalist.org/v1'
export const INAT_USER_AGENT = 'DTrek/1.0 (mzulpt@gmail.com)'

// Conservative license set — excludes cc-by-nc and cc-by-sa, same reasoning as GBIF's
// CC0_1_0/CC_BY_4.0 filter in app/api/flora/route.ts.
const ALLOWED_PHOTO_LICENSES = ['cc0', 'cc-by']

export interface InatPhoto {
  url: string
  license_code?: string | null
  attribution?: string | null
}

export interface InatTaxon {
  name?: string
  preferred_common_name?: string
  iconic_taxon_name?: string
}

export interface InatObservation {
  id: number
  taxon?: InatTaxon
  photos?: InatPhoto[]
  observed_on?: string | null
  geojson?: { coordinates?: [number, number] }
}

export interface InatSearchResponse {
  total_results: number
  results: InatObservation[]
}

export async function fetchInatWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      headers: { 'User-Agent': INAT_USER_AGENT },
      signal: controller.signal,
      next: { revalidate: 86400 },
    })
  } finally {
    clearTimeout(timer)
  }
}

interface InatSearchParams {
  minLat: number
  maxLat: number
  minLon: number
  maxLon: number
  month: number
  iconicTaxa: string[]
}

export async function fetchInatObservations(p: InatSearchParams): Promise<InatObservation[]> {
  const params = new URLSearchParams()
  params.set('swlat', String(p.minLat))
  params.set('swlng', String(p.minLon))
  params.set('nelat', String(p.maxLat))
  params.set('nelng', String(p.maxLon))
  params.set('month', String(p.month))
  params.set('quality_grade', 'research')
  params.set('photo_license', ALLOWED_PHOTO_LICENSES.join(','))
  params.set('per_page', '40')
  for (const t of p.iconicTaxa) params.append('iconic_taxa', t)

  try {
    const res = await fetchInatWithTimeout(`${INAT_BASE}/observations?${params.toString()}`, 8000)
    if (!res.ok) return []
    const data = await res.json() as InatSearchResponse
    return data.results ?? []
  } catch {
    return []
  }
}

export function inatPhotoUrl(photo: InatPhoto, size: 'square' | 'medium'): string {
  return photo.url.replace('square', size)
}

export function inatLicenseOk(code: string | null | undefined): boolean {
  return !!code && ALLOWED_PHOTO_LICENSES.includes(code.toLowerCase())
}

export function inatLicenseLabel(code: string | null | undefined): string {
  if (!code) return 'Licenza non specificata'
  const c = code.toLowerCase()
  if (c === 'cc0') return 'CC0'
  if (c === 'cc-by') return 'CC BY'
  return code
}
