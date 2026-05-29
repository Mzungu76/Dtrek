/**
 * Wikidata SPARQL — replaces Overpass for hiking POI fetching.
 *
 * Wikidata does not block cloud datacenter IPs (unlike Overpass) and responds
 * in 1-4s vs Overpass 10-30s. Wikidata items carry direct Wikipedia links,
 * which fetchWikiForNamedPois uses to skip the article search step.
 */
import type { PoiItem, PoiType } from './overpass'

// Wikidata class QID → PoiType
const WD_TYPE: Record<string, PoiType> = {
  Q8502:    'peak',         // mountain
  Q116:     'peak',         // generic mountain
  Q16468:   'peak',         // mountain peak
  Q207326:  'peak',         // volcano
  Q1055:    'peak',         // summit
  Q1377:    'hut',          // mountain hut
  Q179049:  'hut',          // alpine hut
  Q928830:  'bivouac',      // bivouac shelter
  Q133056:  'pass',         // mountain pass / col
  Q34038:   'waterfall',    // waterfall
  Q35509:   'cave',         // cave
  Q23413:   'castle',       // castle
  Q839954:  'archaeological',
  Q1254933: 'viewpoint',    // panoramic viewpoint
  Q2065736: 'viewpoint',    // observation point
  Q11952:   'cross',        // cross
  Q21167:   'spring',       // natural spring
  Q16970:   'chapel',       // chapel
  Q12518:   'tower',        // tower
  Q79007:   'ruins',        // ruins
  Q180817:  'ruins',        // archaeological ruins
  Q12323:   'monument',     // monument
  Q4989906: 'monument',
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const f1 = lat1 * Math.PI / 180, f2 = lat2 * Math.PI / 180
  const df = (lat2 - lat1) * Math.PI / 180
  const dl = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(df / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function minDistToTrack(lat: number, lon: number, track: [number, number][]): number {
  let min = Infinity
  for (const [tlat, tlon] of track) {
    const d = haversineM(lat, lon, tlat, tlon)
    if (d < min) min = d
  }
  return min
}

/** Convert a Wikipedia article URL to the OSM tag format "lang:Title" */
function wikiUrlToTag(url: string): string | undefined {
  const m = url.match(/https?:\/\/([a-z]+)\.wikipedia\.org\/wiki\/(.+)/)
  if (!m) return undefined
  return `${m[1]}:${decodeURIComponent(m[2]).replace(/_/g, ' ')}`
}

/**
 * Fetch hiking POIs near a GPS track from Wikidata SPARQL.
 * Returns PoiItem[] in the same format as fetchPoisNearTrack (drop-in replacement).
 */
export async function fetchHikingPoisFromWikidata(
  track: [number, number][],
  radiusM = 300,
  signal?: AbortSignal,
): Promise<PoiItem[]> {
  if (track.length < 2) return []

  const lats = track.map(p => p[0])
  const lons = track.map(p => p[1])
  const pad = 0.01
  const latMin = (Math.min(...lats) - pad).toFixed(5)
  const latMax = (Math.max(...lats) + pad).toFixed(5)
  const lonMin = (Math.min(...lons) - pad).toFixed(5)
  const lonMax = (Math.max(...lons) + pad).toFixed(5)

  const classes = Object.keys(WD_TYPE).map(c => `wd:${c}`).join(' ')

  const sparql = `
SELECT DISTINCT ?item ?itemLabel ?cls ?coord ?elev ?itWiki ?enWiki WHERE {
  SERVICE wikibase:box {
    ?item wdt:P625 ?coord .
    bd:serviceParam wikibase:cornerWest "Point(${lonMin} ${latMin})"^^geo:wktLiteral .
    bd:serviceParam wikibase:cornerEast "Point(${lonMax} ${latMax})"^^geo:wktLiteral .
  }
  ?item wdt:P31 ?cls .
  VALUES ?cls { ${classes} }
  OPTIONAL { ?item wdt:P2044 ?elev }
  OPTIONAL { ?itWiki schema:about ?item ; schema:inLanguage "it" ; schema:isPartOf <https://it.wikipedia.org/> }
  OPTIONAL { ?enWiki schema:about ?item ; schema:inLanguage "en" ; schema:isPartOf <https://en.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "it,en" }
}
LIMIT 200`

  const res = await fetch('https://query.wikidata.org/sparql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/sparql-results+json',
      'User-Agent': 'DTrek/1.0 hiking-app',
    },
    body: `query=${encodeURIComponent(sparql)}`,
    signal: signal ?? AbortSignal.timeout(20000),
  })

  if (!res.ok) throw new Error(`Wikidata SPARQL ${res.status}`)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: { results: { bindings: any[] } } = await res.json()
  const seen = new Set<string>()
  const pois: PoiItem[] = []

  for (const row of data.results.bindings) {
    const qid: string = row.item.value.split('/').pop()!
    if (seen.has(qid)) continue

    // Parse WKT "Point(lon lat)"
    const m = (row.coord.value as string).match(/Point\(([^\s]+)\s+([^)]+)\)/)
    if (!m) continue
    const lon = parseFloat(m[1])
    const lat = parseFloat(m[2])
    if (isNaN(lat) || isNaN(lon)) continue

    const dist = minDistToTrack(lat, lon, track)
    if (dist > radiusM) continue

    const name: string | undefined = row.itemLabel?.value
    if (!name || name === qid) continue  // skip unnamed items (Wikidata QID label fallback)

    seen.add(qid)
    const clsId: string = row.cls.value.split('/').pop()!
    const type: PoiType = WD_TYPE[clsId] ?? 'ruins'

    // Prefer Italian Wikipedia, fall back to English
    const wikiUrl: string | undefined = row.itWiki?.value ?? row.enWiki?.value
    const wikiTag = wikiUrl ? wikiUrlToTag(wikiUrl) : undefined

    pois.push({
      id: parseInt(qid.replace('Q', ''), 10) || 0,
      type,
      name,
      lat,
      lon,
      ele: row.elev ? Math.round(parseFloat(row.elev.value)) : undefined,
      distFromTrack: Math.round(dist),
      tags: wikiTag ? { wikipedia: wikiTag } : undefined,
    })
  }

  // Sort by distance from track
  pois.sort((a, b) => a.distFromTrack - b.distFromTrack)
  return pois
}
