import type { PoiItem, PoiType } from '@/lib/overpass'
import { USER_AGENT } from './shared'

// ── Wikidata class QID → PoiType ─────────────────────────────────────────────

const WD_TYPE: Record<string, PoiType> = {
  // Peak / Pass
  Q8502:    'peak',
  Q116:     'peak',
  Q16468:   'peak',
  Q207326:  'peak',             // volcano
  Q1055:    'peak',             // summit
  Q133056:  'pass',
  Q82117:   'pass',             // col
  // Hut / Bivouac
  Q1377:    'hut',
  Q179049:  'hut',
  Q928830:  'bivouac',
  // Water
  Q34038:   'waterfall',
  Q21167:   'spring',
  Q130436:  'spring',           // sorgente termale / hot spring
  // Cave
  Q35509:   'cave',
  // Viewpoint
  Q1254933: 'viewpoint',
  Q2065736: 'viewpoint',
  // Cross
  Q11952:   'cross',
  // Religious
  Q16970:   'chapel',
  Q16917:   'chapel',           // chiesa cattolica
  Q1734:    'chapel',           // church building
  Q44613:   'chapel',           // monastero / convento
  Q83405:   'chapel',           // eremo
  Q1276:    'chapel',           // abbazia
  Q11173:   'chapel',           // santuario
  Q2977:    'chapel',           // cattedrale
  // Castle / Fort
  Q23413:   'castle',
  Q29398:   'castle',           // fortezza
  // Archaeological
  Q839954:  'archaeological',
  Q39614:   'archaeological',   // necropoli
  // Tower
  Q12518:   'tower',
  // Ruins / Historic
  Q79007:   'ruins',
  Q180817:  'ruins',
  Q22692:   'ruins',            // acquedotto romano
  Q4895796: 'ruins',            // campo di battaglia
  Q4440864: 'ruins',            // porta urbica
  Q4886:    'ruins',            // borgo abbandonato
  // Monument
  Q12323:   'monument',
  Q4989906: 'monument',
  Q13217555:'monument',         // pietra miliare
  Q2016147: 'monument',         // monumento naturale
  Q39715:   'monument',         // faro (lighthouse)
  Q38720:   'monument',         // mulino a vento
  Q11303:   'monument',         // mulino ad acqua
  // Bridge
  Q12280:   'bridge',
}

function wikiUrlToTag(url: string): string | undefined {
  const m = url.match(/https?:\/\/([a-z]+)\.wikipedia\.org\/wiki\/(.+)/)
  if (!m) return undefined
  return `${m[1]}:${decodeURIComponent(m[2]).replace(/_/g, ' ')}`
}

// ── Wikidata SPARQL (server-side) ─────────────────────────────────────────────

export async function fetchWikidataPois(bbox: string): Promise<PoiItem[]> {
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
      tags: {
        ...(wikiTag ? { wikipedia: wikiTag } : {}),
        source: 'wikidata',
      },
    })
  }

  return pois
}
