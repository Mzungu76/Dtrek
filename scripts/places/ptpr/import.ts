/**
 * PTPR Regione Lazio (Tavola B, archeologia) → dtrek_places
 *
 * Adapter concreto (piano §41) sopra dati GIÀ importati da scripts/import-ptpr.ts in `ptpr_pois`
 * (piano §5: "Riutilizzare, quando possibile, gli strumenti già presenti nel repository per
 * l'importazione dei dati PTPR") — non riparsa gli shapefile, legge la tabella cache esistente e
 * la traduce nel modello comune di scripts/places/types.ts.
 *
 * Copre SOLO i tre layer di Tavola B già presenti in ptpr_pois (punti/aree/linee archeologiche —
 * classificati 'sito_archeologico', piano §20: "Siti archeologici → MiC + OSM + PTPR"). Il piano
 * (§5) chiede anche "Borghi identitari, Centri storici, Città di fondazione, altri layer
 * pertinenti" — quei layer PTPR (Tavola diversa da B) NON sono ancora importati da nessuno script
 * in questo repository: servirebbero nuovi shapefile (non presenti in data/ptpr/, vedi il relativo
 * README) prima di poter scrivere il fetcher corrispondente. Non implementato qui.
 *
 * Usage:
 *   npx tsx scripts/places/ptpr/import.ts [--dry-run]
 *
 * Richiede SUPABASE_URL/SUPABASE_SERVICE_KEY (o *_ROLE_KEY) come scripts/import-ptpr.ts, e che
 * quello script sia già stato eseguito almeno una volta (ptpr_pois non vuota).
 */
import { createClient } from '@supabase/supabase-js'
import { importPlaceCandidates } from '../import'
import type { PlaceCandidate } from '../types'

interface PtprPoiRow {
  id: number
  source_id: string | null
  name: string | null
  description: string | null
  poi_type: string
  layer: string
  lat: number
  lon: number
  region: string
  raw_props: Record<string, unknown> | null
}

const ATTRIBUTION_URL = 'https://geoportale.regione.lazio.it'

// Pura, testabile senza rete — la parte che vale la pena verificare in questo adapter è la
// mappatura, non la chiamata Supabase.
export function ptprRowToPlaceCandidate(row: PtprPoiRow): PlaceCandidate {
  return {
    name:        row.name ?? 'Sito archeologico tutelato',
    metaType:    'sito',
    subtype:     'sito_archeologico',
    description: row.description ?? undefined,
    latitude:    row.lat,
    longitude:   row.lon,
    region:      row.region === 'lazio' ? 'Lazio' : row.region,
    source:      'ptpr_lazio',
    // layer+source_id replica lo stesso UNIQUE(source_id, layer) di ptpr_pois — se source_id
    // manca (raro, feature senza ID_RL) si ricade sull'id bigint della cache, comunque stabile.
    sourceId:    `${row.layer}:${row.source_id ?? row.id}`,
    sourceUrl:   ATTRIBUTION_URL,
    rawType:     `${row.layer}/${row.poi_type}`,
    confidence:  1,
    metadata: {
      ptprPoiId: row.id,
      layer:     row.layer,
      poiType:   row.poi_type,
      rawProps:  row.raw_props ?? undefined,
    },
  }
}

async function main() {
  const DRY_RUN = process.argv.includes('--dry-run')

  const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY) env vars.')
    process.exit(1)
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

  const { data, error } = await supabase
    .from('ptpr_pois')
    .select('id, source_id, name, description, poi_type, layer, lat, lon, region, raw_props')
  if (error) { console.error(error.message); process.exit(1) }

  const rows = (data ?? []) as PtprPoiRow[]
  console.log(`${rows.length} righe lette da ptpr_pois`)
  if (rows.length === 0) {
    console.log('Nessuna riga — esegui prima npx tsx scripts/import-ptpr.ts')
    return
  }

  const candidates = rows.map(ptprRowToPlaceCandidate)

  if (DRY_RUN) {
    console.log('[DRY RUN] Esempio candidato:', JSON.stringify(candidates[0], null, 2))
    console.log(`[DRY RUN] ${candidates.length} candidati pronti, nessuna scrittura.`)
    return
  }

  const stats = await importPlaceCandidates(supabase, candidates)
  console.log(JSON.stringify(stats, null, 2))
}

main().catch(err => { console.error(err); process.exit(1) })
