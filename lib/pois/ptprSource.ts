import { supabase } from '@/lib/supabase'
import type { PoiItem, PoiType } from '@/lib/overpass'

// ── PTPR Lazio (Supabase static import) ──────────────────────────────────────

function ptprNomeToPoiType(nome: string): PoiType {
  const n = nome.toLowerCase()
  if (n.includes('necropoli') || n.includes('tomba') || n.includes('sepolcro')) return 'archaeological'
  if (n.includes('villa') || n.includes('abitato') || n.includes('insediamento')) return 'archaeological'
  if (n.includes('grotta') || n.includes('grotte')) return 'cave'
  if (n.includes('ponte') || n.includes('acquedotto') || n.includes('cisterna') || n.includes('basoli') || n.includes('muratura')) return 'ruins'
  if (n.includes('preistorico')) return 'archaeological'
  return 'archaeological'
}

function ptprTipoLineaToPoiType(tipo: string): PoiType {
  const t = tipo.toLowerCase()
  if (t.includes('strada') || t.includes('strade')) return 'ruins'
  if (t.includes('acquedotto')) return 'ruins'
  return 'ruins'
}

export async function fetchPtprPois(bbox: string): Promise<PoiItem[]> {
  const [s, w, n, e] = bbox.split(',').map(Number)

  const { data, error } = await supabase
    .from('ptpr_pois')
    .select('id, name, layer, lat, lon, description, raw_props')
    .gte('lat', s).lte('lat', n)
    .gte('lon', w).lte('lon', e)

  if (error || !data) return []

  return data.map(row => {
    const rawProps = row.raw_props as Record<string, unknown> | null
    const name = (row.name ?? 'Sito archeologico tutelato') as string

    let type: PoiType
    if (row.layer === 'linee') {
      const tipo = rawProps?.TIPO ? String(rawProps.TIPO) : ''
      type = tipo ? ptprTipoLineaToPoiType(tipo) : ptprNomeToPoiType(name)
    } else {
      type = ptprNomeToPoiType(name)
    }

    return {
      id:            0,
      type,
      name,
      lat:           row.lat,
      lon:           row.lon,
      distFromTrack: 0,
      tags: {
        description: (row.description as string | null) ?? `PTPR Regione Lazio — Tavola B (CC BY 4.0)`,
        source:      'ptpr_lazio',
        sourceId:    row.id,
      },
    }
  })
}
