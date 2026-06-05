import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import type { PoiItem, PoiType } from '@/lib/overpass'
import { haversineM } from '@/lib/geoUtils'

export const dynamic = 'force-dynamic'

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]

const USER_AGENT = 'DTrek/1.0 (personal hiking diary; mzulpt@gmail.com)'

// ── Wikidata class QID → PoiType ─────────────────────────────────────────────

const WD_TYPE: Record<string, PoiType> = {
  Q8502:    'peak',
  Q116:     'peak',
  Q16468:   'peak',
  Q207326:  'peak',
  Q1055:    'peak',
  Q1377:    'hut',
  Q179049:  'hut',
  Q928830:  'bivouac',
  Q133056:  'pass',
  Q82117:   'pass',
  Q34038:   'waterfall',
  Q35509:   'cave',
  Q23413:   'castle',
  Q839954:  'archaeological',
  Q39614:   'archaeological',   // necropoli
  Q1254933: 'viewpoint',
  Q2065736: 'viewpoint',
  Q11952:   'cross',
  Q21167:   'spring',
  Q16970:   'chapel',
  Q16917:   'chapel',           // chiesa cattolica
  Q1734:    'chapel',           // church building
  Q44613:   'chapel',           // monastero
  Q83405:   'chapel',           // eremo
  Q12518:   'tower',
  Q79007:   'ruins',
  Q180817:  'ruins',
  Q12323:   'monument',
  Q4989906: 'monument',
  Q12280:   'bridge',
  Q4886:    'ruins',            // borgo (treat as ruins/interest point)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeBboxKey(bbox: string): string {
  return bbox.split(',').map(v => (Math.round(parseFloat(v) * 100) / 100).toFixed(2)).join('_')
}

function wikiUrlToTag(url: string): string | undefined {
  const m = url.match(/https?:\/\/([a-z]+)\.wikipedia\.org\/wiki\/(.+)/)
  if (!m) return undefined
  return `${m[1]}:${decodeURIComponent(m[2]).replace(/_/g, ' ')}`
}

// ── Wikidata SPARQL (server-side) ─────────────────────────────────────────────

async function fetchWikidataPois(bbox: string): Promise<PoiItem[]> {
  const [s, w, n, e] = bbox.split(',')
  const classes = Object.keys(WD_TYPE).map(c => `wd:${c}`).join(' ')

  const sparql = `
SELECT DISTINCT ?item ?itemLabel ?cls ?coord ?elev ?itWiki ?enWiki WHERE {
  SERVICE wikibase:box {
    ?item wdt:P625 ?coord .
    bd:serviceParam wikibase:cornerWest "Point(${w} ${s})"^^geo:wktLiteral .
    bd:serviceParam wikibase:cornerEast "Point(${e} ${n})"^^geo:wktLiteral .
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
      'User-Agent': USER_AGENT,
    },
    body: `query=${encodeURIComponent(sparql)}`,
    signal: AbortSignal.timeout(20000),
  })

  if (!res.ok) throw new Error(`Wikidata SPARQL ${res.status}`)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: { results: { bindings: any[] } } = await res.json()
  const seen = new Set<string>()
  const pois: PoiItem[] = []

  for (const row of data.results.bindings) {
    const qid: string = row.item.value.split('/').pop()!
    if (seen.has(qid)) continue

    const m = (row.coord.value as string).match(/Point\(([^\s]+)\s+([^)]+)\)/)
    if (!m) continue
    const lon = parseFloat(m[1])
    const lat = parseFloat(m[2])
    if (isNaN(lat) || isNaN(lon)) continue

    const name: string | undefined = row.itemLabel?.value
    if (!name || name === qid) continue

    seen.add(qid)
    const clsId: string = row.cls.value.split('/').pop()!
    const type: PoiType = WD_TYPE[clsId] ?? 'ruins'

    const wikiUrl: string | undefined = row.itWiki?.value ?? row.enWiki?.value
    const wikiTag = wikiUrl ? wikiUrlToTag(wikiUrl) : undefined

    pois.push({
      id: parseInt(qid.replace('Q', ''), 10) || 0,
      type,
      name,
      lat,
      lon,
      ele: row.elev ? Math.round(parseFloat(row.elev.value)) : undefined,
      distFromTrack: 0,
      tags: wikiTag ? { wikipedia: wikiTag } : undefined,
    })
  }

  return pois
}

// ── Overpass OSM (server-side) ────────────────────────────────────────────────

const HISTORIC_TYPE_MAP: Record<string, PoiType> = {
  castle:              'castle',
  fort:                'ruins',
  ruins:               'ruins',
  archaeological_site: 'archaeological',
  wayside_cross:       'cross',
  wayside_shrine:      'chapel',
  monastery:           'chapel',
  church:              'chapel',
  chapel:              'chapel',
  bridge:              'bridge',
  tower:               'tower',
  monument:            'monument',
  memorial:            'monument',
  city_gate:           'ruins',
  boundary_stone:      'monument',
}

function parseOverpassElements(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  elements: any[],
): PoiItem[] {
  const pois: PoiItem[] = []

  for (const el of elements) {
    let lat: number, lon: number
    if (el.type === 'node') {
      lat = el.lat; lon = el.lon
    } else if (el.center) {
      lat = el.center.lat; lon = el.center.lon
    } else {
      continue
    }
    if (isNaN(lat) || isNaN(lon)) continue

    const tags = el.tags ?? {}
    const name: string | undefined = tags.name || tags['name:it']
    if (!name) continue

    let type: PoiType | undefined
    const historic: string | undefined = tags.historic
    if (historic && HISTORIC_TYPE_MAP[historic]) {
      type = HISTORIC_TYPE_MAP[historic]
    } else if (tags.natural === 'waterfall') {
      type = 'waterfall'
    } else if (tags.natural === 'cave_entrance') {
      type = 'cave'
    } else if (tags.natural === 'spring') {
      type = 'spring'
    } else if (tags.tourism === 'viewpoint') {
      type = 'viewpoint'
    } else if (historic) {
      type = 'ruins'
    }
    if (!type) continue

    const wikiTag = tags.wikipedia ?? (tags.wikidata ? `d:${tags.wikidata}` : undefined)

    pois.push({
      id: el.id ?? 0,
      type,
      name,
      lat,
      lon,
      ele: tags.ele ? Math.round(parseFloat(tags.ele)) : undefined,
      distFromTrack: 0,
      tags: {
        ...(wikiTag ? { wikipedia: wikiTag } : {}),
        ...(tags.description    ? { description:           tags.description }    : {}),
        ...(tags['description:it'] ? { 'description:it':  tags['description:it'] } : {}),
        ...(tags.inscription    ? { inscription:           tags.inscription }    : {}),
        ...(tags['historic:civilization'] ? { 'historic:civilization': tags['historic:civilization'] } : {}),
        ...(tags.note           ? { note:                  tags.note }           : {}),
      },
    })
  }

  return pois
}

async function fetchOverpassPois(bbox: string): Promise<PoiItem[]> {
  const [s, w, n, e] = bbox.split(',')

  const query = `
[out:json][timeout:25];
(
  node["historic"](${s},${w},${n},${e});
  way["historic"](${s},${w},${n},${e});
  node["natural"~"^(waterfall|spring|cave_entrance)$"](${s},${w},${n},${e});
  node["tourism"="viewpoint"](${s},${w},${n},${e});
);
out body; >; out skel qt;`

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': USER_AGENT,
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(25000),
      })
      if (!res.ok) continue
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: { elements: any[] } = await res.json()
      return parseOverpassElements(data.elements ?? [])
    } catch {
      continue
    }
  }
  throw new Error('All Overpass endpoints unavailable')
}

// ── Merge + deduplicate ───────────────────────────────────────────────────────

function mergePois(wikidata: PoiItem[], overpass: PoiItem[]): PoiItem[] {
  const merged = [...wikidata]
  for (const op of overpass) {
    // Deduplicate: skip if a Wikidata POI is within 50m
    const tooClose = merged.some(
      wd => haversineM(wd.lat, wd.lon, op.lat, op.lon) < 50
    )
    if (!tooClose) {
      merged.push(op)
    }
  }
  return merged
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const bbox = req.nextUrl.searchParams.get('bbox')
    if (!bbox || bbox.split(',').length !== 4) {
      return NextResponse.json({ error: 'bbox required (s,w,n,e)' }, { status: 400 })
    }

    const bboxKey = normalizeBboxKey(bbox)

    // Lazy cleanup of expired entries (fire-and-forget)
    void supabase.from('poi_cache').delete().lt('expires_at', new Date().toISOString())

    // Check cache
    const { data: cached } = await supabase
      .from('poi_cache')
      .select('pois')
      .eq('bbox_key', bboxKey)
      .gt('expires_at', new Date().toISOString())
      .single()

    if (cached?.pois) {
      return NextResponse.json(cached.pois as PoiItem[])
    }

    // Fetch from both sources in parallel — tolerate individual failures
    const [wdResult, opResult] = await Promise.allSettled([
      fetchWikidataPois(bbox),
      fetchOverpassPois(bbox),
    ])

    const wdPois = wdResult.status === 'fulfilled' ? wdResult.value : []
    const opPois = opResult.status === 'fulfilled' ? opResult.value : []
    const pois   = mergePois(wdPois, opPois)

    // Cache result (fire-and-forget — don't block response)
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    supabase.from('poi_cache')
      .upsert({ bbox_key: bboxKey, pois, expires_at: expiresAt }, { onConflict: 'bbox_key' })
      .then(() => {}).catch(() => {})

    return NextResponse.json(pois)
  } catch (e) {
    console.error('GET /api/pois:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
