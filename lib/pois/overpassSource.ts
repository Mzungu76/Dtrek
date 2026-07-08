import type { PoiItem, PoiType } from '@/lib/overpass'
import { USER_AGENT } from './shared'

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]

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
  manor:               'castle',
  milestone:           'monument',
  battlefield:         'ruins',
  aqueduct:            'ruins',
  well:                'spring',
  aircraft:            'ruins',
  wreck:               'ruins',
}

// Default names for unnamed features that are still interesting to hikers
const OVERPASS_DEFAULT_NAMES: Partial<Record<PoiType, string>> = {
  waterfall: 'Cascata',
  cave:      'Grotta',
  viewpoint: 'Belvedere',
  hut:       'Rifugio',
  shelter:   'Riparo',
  spring:    'Acqua potabile',
  fountain:  'Fontana',
  picnic:    'Area picnic',
  cross:     'Croce',
  ruins:     'Ruderi',
  bivouac:   'Bivacco',
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
    const historic: string | undefined = tags.historic
    const manMade: string | undefined = tags['man_made']
    const towerType: string | undefined = tags['tower:type']

    let type: PoiType | undefined

    // ── Historic ───────────────────────────────────────────────────────────────
    if (historic && HISTORIC_TYPE_MAP[historic]) {
      type = HISTORIC_TYPE_MAP[historic]
    } else if (historic) {
      type = 'ruins'
    }
    // ── Natural ────────────────────────────────────────────────────────────────
    else if (tags.natural === 'peak' || tags.natural === 'volcano') {
      type = 'peak'
    } else if (tags.natural === 'saddle') {
      type = 'pass'
    } else if (tags.natural === 'waterfall' || tags.waterway === 'waterfall') {
      type = 'waterfall'
    } else if (tags.natural === 'cave_entrance') {
      type = 'cave'
    } else if (tags.natural === 'spring') {
      type = 'spring'
    } else if (tags.natural === 'tree') {
      type = 'monument'
    }
    // ── Tourism ────────────────────────────────────────────────────────────────
    else if (tags.tourism === 'viewpoint') {
      type = 'viewpoint'
    } else if (tags.tourism === 'alpine_hut' || tags.tourism === 'wilderness_hut') {
      type = 'hut'
    } else if (tags.tourism === 'picnic_site') {
      type = 'picnic'
    }
    // ── Amenity ────────────────────────────────────────────────────────────────
    else if (tags.amenity === 'drinking_water') {
      type = 'spring'
    } else if (tags.amenity === 'shelter') {
      type = 'shelter'
    } else if (tags.amenity === 'fountain') {
      type = 'fountain'
    }
    // ── Man-made ───────────────────────────────────────────────────────────────
    else if (manMade === 'cross') {
      type = 'cross'
    } else if (manMade === 'lighthouse') {
      type = 'monument'
    } else if (manMade === 'windmill') {
      type = 'monument'
    } else if (manMade === 'obelisk') {
      type = 'monument'
    } else if (manMade === 'tower') {
      if (towerType === 'observation' || towerType === 'watchtower') type = 'viewpoint'
      else if (towerType === 'defensive')  type = 'tower'
      else if (towerType === 'bell_tower') type = 'chapel'
    }
    // ── Military ───────────────────────────────────────────────────────────────
    else if (tags.military === 'bunker') {
      type = 'ruins'
    }

    if (!type) continue

    const explicitName: string | undefined = tags.name || tags['name:it']
    const name = explicitName ?? OVERPASS_DEFAULT_NAMES[type]
    if (!name) continue

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
        ...(tags.description            ? { description:                tags.description }            : {}),
        ...(tags['description:it']      ? { 'description:it':           tags['description:it'] }      : {}),
        ...(tags.inscription            ? { inscription:                tags.inscription }            : {}),
        ...(tags['historic:civilization'] ? { 'historic:civilization':  tags['historic:civilization'] } : {}),
        ...(tags.note                   ? { note:                       tags.note }                   : {}),
        source: 'overpass',
      },
    })
  }

  return pois
}

export async function fetchOverpassPois(bbox: string): Promise<PoiItem[]> {
  const [s, w, n, e] = bbox.split(',')

  const query = `
[out:json][timeout:25];
(
  node["historic"](${s},${w},${n},${e});
  way["historic"](${s},${w},${n},${e});
  node["natural"~"^(peak|saddle|volcano|waterfall|spring|cave_entrance)$"](${s},${w},${n},${e});
  node["waterway"="waterfall"](${s},${w},${n},${e});
  node["natural"="tree"]["denotation"="natural_monument"](${s},${w},${n},${e});
  node["tourism"~"^(viewpoint|alpine_hut|wilderness_hut|picnic_site)$"](${s},${w},${n},${e});
  way["tourism"~"^(alpine_hut|wilderness_hut)$"](${s},${w},${n},${e});
  node["amenity"~"^(drinking_water|shelter|fountain)$"](${s},${w},${n},${e});
  node["man_made"="cross"](${s},${w},${n},${e});
  node["man_made"="lighthouse"](${s},${w},${n},${e});
  node["man_made"="windmill"](${s},${w},${n},${e});
  node["man_made"="obelisk"](${s},${w},${n},${e});
  node["man_made"="tower"]["tower:type"~"^(observation|watchtower|defensive|bell_tower)$"](${s},${w},${n},${e});
  node["military"="bunker"](${s},${w},${n},${e});
  way["military"="bunker"](${s},${w},${n},${e});
);
out body center; out skel qt;`

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
