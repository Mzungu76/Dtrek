// Density signal collector — Trail Score v2 spec §5. Non alimenta la somma di computeScore()
// come gli altri segnali: corregge moltiplicativamente l'Affidabilità già calcolata, perché
// misura un asse diverso ("quanti dati indipendenti esistono", non "cosa dicono i dati").
//
// Due componenti indipendenti (media geometrica, non aritmetica — un solo asse vicino a zero deve
// pesare, non essere compensato dall'altro):
//  a) contributor OSM distinti nel buffer attorno al tracciato — proxy dagli editor CORRENTI
//     visibili in una singola query Overpass "out meta", non la storia completa per via (che
//     richiederebbe l'API storica di OSM, una chiamata per way, troppo lenta/rischiosa di
//     rate-limit entro il timeout di 5s condiviso dagli altri collector del CL). Sottostima la
//     vera diversità storica di editor (un elemento riscritto da più persone nel tempo mostra solo
//     l'ultimo), ma resta un segnale onesto di "quante persone diverse hanno lasciato un segno
//     visibile in quest'area", coerente con lo spirito della spec.
//  b) osservazioni GBIF+iNaturalist in un raggio attorno al percorso, come proxy generale di
//     "quanto quest'area riceve attenzione" — non specifico al sentiero. Conteggio puro (limit/
//     per_page=0, si legge solo count/total_results), nessun filtro di licenza o stagione: qui
//     serve solo il volume di dati indipendenti, non la loro qualità o rilevanza per la Galleria.
import type { DensitySignal, SignalContext } from '@/lib/cl/types'
import { fetchOverpass } from '@/lib/overpassTrails'
import { GBIF_BASE, fetchWithTimeout as fetchGbifWithTimeout } from '@/lib/gbifShared'
import { INAT_BASE, fetchInatWithTimeout } from '@/lib/inatShared'

const TIMEOUT_MS = 5000
const OSM_CONTRIBUTOR_THRESHOLD = 5   // oltre 5 editor distinti, d_osm satura a 1
const AREA_OBSERVATION_THRESHOLD = 200 // oltre 200 osservazioni nel raggio, d_area satura a 1
const AREA_RADIUS_KM = 5
const DENSITY_FLOOR = 0.3

export const NEUTRAL_DENSITY: DensitySignal = {
  osmContributors: 0, dOsm: 1, areaObservations: 0, dArea: 1, factor: 1,
}

interface OverpassMetaResponse {
  elements: Array<{ user?: string }>
}

// null = la query è fallita (rete/timeout) — da distinguere da "0 contributor trovati" (query
// riuscita, davvero nessun editor nel buffer): solo il secondo caso è un segnale di sparsità
// reale, il primo è un problema tecnico transitorio che non deve penalizzare l'Affidabilità.
async function countDistinctOsmContributors(ctx: SignalContext): Promise<number | null> {
  try {
    const { minLat, minLon, maxLat, maxLon } = ctx.bbox
    const bboxStr = `${minLat},${minLon},${maxLat},${maxLon}`
    const query = `[out:json][timeout:15];(way[highway](${bboxStr});way[highway=path](${bboxStr}););out meta tags;`
    const data = await fetchOverpass<OverpassMetaResponse>(query, TIMEOUT_MS)
    const users = new Set((data.elements ?? []).map(el => el.user).filter((u): u is string => !!u))
    return users.size
  } catch {
    return null
  }
}

function radiusBbox(lat: number, lon: number, radiusKm: number): { minLat: number; maxLat: number; minLon: number; maxLon: number } {
  const latDelta = radiusKm / 111
  const lonDelta = radiusKm / (111 * Math.cos(lat * Math.PI / 180))
  return { minLat: lat - latDelta, maxLat: lat + latDelta, minLon: lon - lonDelta, maxLon: lon + lonDelta }
}

// null = fallita (vedi nota sopra), 0 = interrogata con successo, nessun risultato.
async function countGbifObservations(b: { minLat: number; maxLat: number; minLon: number; maxLon: number }): Promise<number | null> {
  try {
    const params = new URLSearchParams()
    params.set('decimalLatitude', `${b.minLat},${b.maxLat}`)
    params.set('decimalLongitude', `${b.minLon},${b.maxLon}`)
    params.set('hasCoordinate', 'true')
    params.set('limit', '0')
    const res = await fetchGbifWithTimeout(`${GBIF_BASE}/occurrence/search?${params.toString()}`, TIMEOUT_MS)
    if (!res.ok) return null
    const data = await res.json() as { count?: number }
    return data.count ?? 0
  } catch {
    return null
  }
}

// null = fallita, 0 = interrogata con successo, nessun risultato.
async function countInatObservations(b: { minLat: number; maxLat: number; minLon: number; maxLon: number }): Promise<number | null> {
  try {
    const params = new URLSearchParams()
    params.set('swlat', String(b.minLat))
    params.set('swlng', String(b.minLon))
    params.set('nelat', String(b.maxLat))
    params.set('nelng', String(b.maxLon))
    params.set('per_page', '0')
    const res = await fetchInatWithTimeout(`${INAT_BASE}/observations?${params.toString()}`, TIMEOUT_MS)
    if (!res.ok) return null
    const data = await res.json() as { total_results?: number }
    return data.total_results ?? 0
  } catch {
    return null
  }
}

export async function collectDensitySignal(_osmRelationId: number, ctx: SignalContext): Promise<DensitySignal> {
  const areaBbox = radiusBbox(ctx.centroid.lat, ctx.centroid.lon, AREA_RADIUS_KM)

  const [osmContributors, gbifCount, inatCount] = await Promise.all([
    countDistinctOsmContributors(ctx),
    countGbifObservations(areaBbox),
    countInatObservations(areaBbox),
  ])

  // Fallimento totale su un asse ⇒ neutro (1, nessuna correzione) su quell'asse: un servizio
  // esterno irraggiungibile non è evidenza di scarsità di dati, è solo un problema transitorio.
  // Un fallimento parziale (una sola delle due fonti naturalistiche) usa comunque quella riuscita.
  const dOsm = osmContributors == null ? 1 : Math.min(1, osmContributors / OSM_CONTRIBUTOR_THRESHOLD)
  const areaObservations = (gbifCount ?? 0) + (inatCount ?? 0)
  const dArea = (gbifCount == null && inatCount == null) ? 1 : Math.min(1, areaObservations / AREA_OBSERVATION_THRESHOLD)

  const factor = Math.max(DENSITY_FLOOR, Math.sqrt(dOsm * dArea))

  return { osmContributors: osmContributors ?? 0, dOsm, areaObservations, dArea, factor }
}
