// Thin client for the Overpass API, used by the Esplora map's data routes
// (app/api/waymarked-trails/{list,details,geometry}). The Waymarked Trails
// REST API (hiking.waymarkedtrails.org/api/v1) blocks datacenter-origin
// requests with 403, so only its tile overlay is used directly client-side —
// these routes fetch the underlying OSM hiking-route data from Overpass instead.

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]

// Races all mirrors and returns the first successful response — avoids waiting out
// a slow/down primary's full timeout before trying the others (sequential fallback
// made trail lookups feel very slow when overpass-api.de was congested).
export async function fetchOverpass<T = unknown>(query: string, timeoutMs = 20_000): Promise<T> {
  const attempts = OVERPASS_ENDPOINTS.map(async endpoint => {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) throw new Error(`status ${res.status}`)
    return res.json() as Promise<T>
  })

  try {
    return await Promise.any(attempts)
  } catch {
    throw new Error('Overpass non disponibile')
  }
}

export interface HikingRouteCandidate {
  id: number
  name: string
  // false when `name` was synthesized from ref/from-to/id — lets callers
  // rank real named routes above these without dropping them entirely.
  hasName: boolean
  ref?: string
  network?: string
}

const NETWORK_RANK: Record<string, number> = { iwn: 4, nwn: 3, rwn: 2, lwn: 1 }

function displayName(tags: Record<string, string> | undefined, id: number): { name: string; hasName: boolean } {
  if (tags?.name) return { name: tags.name, hasName: true }
  if (tags?.ref) return { name: `Sentiero ${tags.ref}`, hasName: false }
  if (tags?.from && tags?.to) return { name: `${tags.from} → ${tags.to}`, hasName: false }
  return { name: `Percorso ${id}`, hasName: false }
}

// Shared by /api/waymarked-trails/list (click + area search) and
// /api/waymarked-trails/search (area search with filters) so both routes
// build the exact same Overpass query and naming/sorting rules.
//
// Deliberately does NOT require a `name` tag — many real, maintained CAI/
// regional hiking relations carry only a `ref` (e.g. "CAI 302"), and
// excluding them was the main cause of too-few-results in an area.
function mapAndSortCandidates(elements: (OsmRelation | OsmWay)[]): HikingRouteCandidate[] {
  const candidates: HikingRouteCandidate[] = elements
    .filter((e): e is OsmRelation => e.type === 'relation')
    .map(e => {
      const { name, hasName } = displayName(e.tags, e.id)
      return { id: e.id, name, hasName, ref: e.tags?.ref, network: e.tags?.network }
    })

  // Named trails first (more likely to be well-known, recognizable routes),
  // then by network rank — cheap in-memory sort, no extra Overpass calls.
  candidates.sort((a, b) => {
    if (a.hasName !== b.hasName) return a.hasName ? -1 : 1
    return (NETWORK_RANK[b.network ?? ''] ?? 0) - (NETWORK_RANK[a.network ?? ''] ?? 0)
  })

  return candidates
}

export async function queryHikingRelationsInBbox(
  minLat: number, minLon: number, maxLat: number, maxLon: number, limit: number,
): Promise<HikingRouteCandidate[]> {
  const query = `[out:json][timeout:25][maxsize:8388608];
relation["type"="route"]["route"="hiking"](${minLat},${minLon},${maxLat},${maxLon});
out tags ${limit};`

  const json = await fetchOverpass<{ elements: OsmRelation[] }>(query)
  return mapAndSortCandidates(json.elements ?? [])
}

const NOMINATIM_USER_AGENT = 'DTrek/1.0 (personal hiking diary; mzulpt@gmail.com)'

/**
 * Risolve un testo libero (regione/provincia/comune/parco) in un bbox via Nominatim — usato
 * dalla ricerca percorsi con l'AI (app/api/route-search/route.ts) per restringere la successiva
 * ricerca Overpass per nome a una zona plausibile, invece di cercare su tutta Italia.
 * Nessuna chiave richiesta (endpoint pubblico OSM), ma un solo risultato per non fare scelte
 * ambigue al posto dell'utente — se il testo è troppo vago, ritorna null e il chiamante procede
 * senza filtro geografico (ricerca per nome su scala nazionale, più lenta ma non bloccante).
 */
export async function resolveAreaBbox(areaText: string): Promise<[number, number, number, number] | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({
      q: areaText, format: 'json', limit: '1', countrycodes: 'it',
    })}`
    const res = await fetch(url, {
      headers: { 'User-Agent': NOMINATIM_USER_AGENT },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return null
    const results = (await res.json()) as Array<{ boundingbox: [string, string, string, string] }>
    const hit = results[0]
    if (!hit) return null
    const [minLatS, maxLatS, minLonS, maxLonS] = hit.boundingbox
    return [parseFloat(minLatS), parseFloat(minLonS), parseFloat(maxLatS), parseFloat(maxLonS)]
  } catch {
    return null
  }
}

// Bbox approssimativo dell'Italia — usato come limite quando resolveAreaBbox non ha risolto
// nulla, per tenere la query Overpass comunque limitata invece che davvero globale.
const ITALY_BBOX: [number, number, number, number] = [35.2, 6.6, 47.1, 18.6]

/**
 * Cerca relazioni escursionistiche OSM il cui nome contiene (case-insensitive) `nameQuery`,
 * entro un bbox (di solito quello di resolveAreaBbox). Usata dalla ricerca AI per verificare se
 * un percorso proposto dal modello ha davvero una traccia GPS reale su OpenStreetMap.
 */
export async function searchHikingRoutesByName(
  nameQuery: string,
  bbox?: [number, number, number, number] | null,
  limit = 8,
): Promise<HikingRouteCandidate[]> {
  const [minLat, minLon, maxLat, maxLon] = bbox ?? ITALY_BBOX
  // Overpass regex value — solo lettere/cifre/spazi arrivano da nameQuery in pratica (nomi di
  // percorsi), ma i caratteri regex-speciali vengono comunque neutralizzati per sicurezza.
  const escaped = nameQuery.replace(/[[\]{}()*+?.,\\^$|#\s]/g, s => s === ' ' ? '.*' : `\\${s}`)
  const query = `[out:json][timeout:25][maxsize:8388608];
relation["type"="route"]["route"="hiking"]["name"~"${escaped}",i](${minLat},${minLon},${maxLat},${maxLon});
out tags ${limit};`

  const json = await fetchOverpass<{ elements: OsmRelation[] }>(query)
  return mapAndSortCandidates(json.elements ?? [])
}

export function parseOsmDistance(s?: string): number | null {
  if (!s) return null
  const n = parseFloat(s)
  if (isNaN(n)) return null
  if (s.match(/\d\s*m$/) && !s.includes('km')) return n / 1000
  return n > 500 ? n / 1000 : n
}

export interface OsmRelation {
  type: 'relation'
  id: number
  members?: Array<{ type: string; ref: number; role: string }>
  tags?: Record<string, string>
}

export interface OsmWay {
  type: 'way'
  id: number
  geometry?: Array<{ lat: number; lon: number }>
}

// Stitch ways in relation-member order, reversing each way if needed
// so consecutive ways connect end-to-end.
export function stitchWays(
  members: Array<{ type: string; ref: number }>,
  wayMap: Map<number, OsmWay>,
): [number, number][] {
  const ordered = members
    .filter(m => m.type === 'way')
    .map(m => wayMap.get(m.ref))
    .filter((w): w is OsmWay => !!(w?.geometry?.length))

  if (ordered.length === 0) return []

  const result: [number, number][] = []
  let lastPt: { lat: number; lon: number } | null = null

  for (const way of ordered) {
    const geom = way.geometry!
    let pts = geom
    if (lastPt !== null) {
      const dFirst = (geom[0].lat - lastPt.lat) ** 2 + (geom[0].lon - lastPt.lon) ** 2
      const dLast  = (geom[geom.length - 1].lat - lastPt.lat) ** 2 + (geom[geom.length - 1].lon - lastPt.lon) ** 2
      if (dLast < dFirst) pts = [...geom].reverse()
    }
    for (const pt of pts) result.push([pt.lat, pt.lon])
    lastPt = pts[pts.length - 1]
  }

  return result
}
