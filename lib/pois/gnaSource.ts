import type { PoiItem, PoiType } from '@/lib/overpass'
import { gnaGeomToCentroid } from '@/lib/geoUtils'
import { USER_AGENT } from './shared'

// ── GNA tipologia → PoiType ───────────────────────────────────────────────────

const GNA_TYPE_MAP: Record<string, PoiType> = {
  necropoli:           'archaeological',
  sepoltura:           'archaeological',
  tomba:               'archaeological',
  insediamento:        'archaeological',
  villaggio:           'archaeological',
  oppidum:             'archaeological',
  castelliere:         'archaeological',
  villa:               'archaeological',
  terme:               'archaeological',
  anfiteatro:          'archaeological',
  teatro:              'archaeological',
  foro:                'archaeological',
  castello:            'castle',
  torre:               'tower',
  rocca:               'castle',
  fortezza:            'castle',
  chiesa:              'chapel',
  abbazia:             'chapel',
  convento:            'chapel',
  monastero:           'chapel',
  via:                 'ruins',
  strada:              'ruins',
  percorso:            'ruins',
  tratturo:            'ruins',
}

function gnaTypologyToPoiType(tipologia?: string): PoiType {
  if (!tipologia) return 'archaeological'
  const lower = tipologia.toLowerCase()
  for (const [key, type] of Object.entries(GNA_TYPE_MAP)) {
    if (lower.includes(key)) return type
  }
  return 'archaeological'
}

// ── GNA WFS (server-side) ─────────────────────────────────────────────────────

const GNA_BASE = 'https://gna.cultura.gov.it/ogc/wfs'
const GNA_LAYERS = ['gna:mosi_puntuali', 'gna:mosi_lineari', 'gna:mosi_poligonali']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseGnaFeatures(geojson: any, _layer: string): PoiItem[] {
  const features = geojson?.features ?? []
  const pois: PoiItem[] = []

  for (const f of features) {
    const props = f.properties ?? {}
    const name: string | undefined = props.denominazione || props.DENOMINAZIONE || props.nome || props.NOME
    if (!name) continue

    const centroid = gnaGeomToCentroid(f.geometry)
    if (!centroid) continue
    const { lat, lon } = centroid
    if (isNaN(lat) || isNaN(lon)) continue

    const type = gnaTypologyToPoiType(props.tipologia ?? props.TIPOLOGIA)

    const descParts: string[] = []
    if (props.cronologia || props.CRONOLOGIA)    descParts.push(props.cronologia ?? props.CRONOLOGIA)
    if (props.comune     || props.COMUNE)        descParts.push(props.comune ?? props.COMUNE)
    if (props.provincia  || props.PROVINCIA)     descParts.push(props.provincia ?? props.PROVINCIA)
    descParts.push('Fonte: GNA — Geoportale Nazionale Archeologia (MiC)')

    const sourceId = String(props.id_gna ?? props.ID_GNA ?? props.gid ?? props.GID ?? '')

    pois.push({
      id: 0,
      type,
      name,
      lat,
      lon,
      distFromTrack: 0,
      tags: {
        description: descParts.join(' · '),
        source:      'gna',
        sourceId,
      },
    })
  }

  return pois
}

export async function fetchGnaPois(bbox: string): Promise<PoiItem[]> {
  const [s, w, n, e] = bbox.split(',')

  const results = await Promise.allSettled(GNA_LAYERS.map(async layer => {
    const url = `${GNA_BASE}?service=WFS&version=2.0.0&request=GetFeature` +
      `&typeName=${layer}` +
      `&bbox=${w},${s},${e},${n},EPSG:4326` +
      `&outputFormat=application/json` +
      `&count=200`

    let res: Response
    try {
      res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(20000),
      })
    } catch (err) {
      console.warn(`[GNA] ${layer} fetch failed:`, String(err))
      throw err
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.warn(`[GNA] ${layer} HTTP ${res.status} — body: ${body.slice(0, 500)}`)
      throw new Error(`GNA ${layer} HTTP ${res.status}`)
    }

    const json = await res.json()
    const count = (json?.features ?? []).length
    console.log(`[GNA] ${layer} → ${count} features`)
    return parseGnaFeatures(json, layer)
  }))

  return results
    .filter((r): r is PromiseFulfilledResult<PoiItem[]> => r.status === 'fulfilled')
    .flatMap(r => r.value)
}
