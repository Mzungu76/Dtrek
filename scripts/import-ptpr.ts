/**
 * One-time import: PTPR Regione Lazio (Tavola B) shapefiles → Supabase ptpr_pois
 *
 * Usage:
 *   npx tsx scripts/import-ptpr.ts [--dry-run]
 *
 * Files expected in data/ptpr/:
 *   puntiarcheologici.shp / .dbf  (2,963 records)
 *   aree_archeologiche.shp / .dbf  (2,090 records)
 *   linee_archeologiche.shp / .dbf (1,626 records)
 *
 * Verified DBF field names:
 *   punti:  ID_RL, NOME, TIPO_OGG, NOTE_, allegati
 *   aree:   ID_RL, NOME, COMUNE, VINCOLO, Shape_Area, allegati
 *   linee:  ID_RL, NOME, TIPO, NOTE_, FONTE, VINCOLO, Shape_Leng, allegati
 *
 * Original projection: ED50 fuso 33N (EPSG:23033)
 * Output projection: WGS84 (EPSG:4326)
 *
 * Dependencies: shapefile, proj4 (both in devDependencies)
 * No system binaries required.
 */

import * as shapefile from 'shapefile'
import proj4 from 'proj4'
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

// ED50 / UTM zone 33N — standard projection for Italian cadastral data
proj4.defs(
  'EPSG:23033',
  '+proj=utm +zone=33 +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs',
)

const DRY_RUN    = process.argv.includes('--dry-run')
const TO_JSON_IDX = process.argv.indexOf('--to-json')
const TO_JSON_FILE = TO_JSON_IDX !== -1 ? process.argv[TO_JSON_IDX + 1] : null

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY

if (!TO_JSON_FILE && !DRY_RUN && (!SUPABASE_URL || !SUPABASE_KEY)) {
  console.error(
    'Set SUPABASE_URL and SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY) env vars.\n' +
    'Example: SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_KEY=eyJ... npx tsx scripts/import-ptpr.ts\n' +
    'Or use --to-json <file> to dump rows as JSON without a live Supabase connection.',
  )
  process.exit(1)
}

// Defer client creation — not needed for --dry-run or --to-json
let supabase: ReturnType<typeof createClient> | null = null
function getSupabase() {
  if (!supabase) supabase = createClient(SUPABASE_URL!, SUPABASE_KEY!)
  return supabase
}

const ATTRIBUTION = 'PTPR Regione Lazio — Tavola B (CC BY 4.0)'

function toWgs84(coords: number[]): [number, number] {
  const [lon, lat] = proj4('EPSG:23033', 'EPSG:4326', [coords[0], coords[1]])
  return [lon, lat]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractCentroid(geometry: any): { lat: number; lon: number } | null {
  try {
    if (!geometry) return null

    if (geometry.type === 'Point') {
      const [lon, lat] = toWgs84(geometry.coordinates)
      return { lat, lon }
    }

    if (geometry.type === 'Polygon') {
      const ring: number[][] = geometry.coordinates[0]
      if (!ring || ring.length === 0) return null
      const converted = ring.map(c => toWgs84(c))
      return {
        lat: converted.reduce((s, c) => s + c[1], 0) / converted.length,
        lon: converted.reduce((s, c) => s + c[0], 0) / converted.length,
      }
    }

    if (geometry.type === 'LineString') {
      const coords: number[][] = geometry.coordinates
      if (!coords || coords.length === 0) return null
      const mid = Math.floor(coords.length / 2)
      const [lon, lat] = toWgs84(coords[mid])
      return { lat, lon }
    }

    if (geometry.type === 'MultiPolygon') {
      if (!geometry.coordinates || geometry.coordinates.length === 0) return null
      return extractCentroid({ type: 'Polygon', coordinates: geometry.coordinates[0] })
    }

    if (geometry.type === 'MultiLineString') {
      if (!geometry.coordinates || geometry.coordinates.length === 0) return null
      return extractCentroid({ type: 'LineString', coordinates: geometry.coordinates[0] })
    }
  } catch {}
  return null
}

function str(v: unknown): string {
  return v != null ? String(v).trim() : ''
}

interface PtprRow {
  source_id: string | null
  name: string | null
  description: string | null
  poi_type: string
  layer: string
  lat: number
  lon: number
  region: string
  raw_props: Record<string, unknown>
}

async function importLayer(shpPath: string, layer: string, region = 'lazio'): Promise<PtprRow[]> {
  if (!fs.existsSync(shpPath)) {
    console.warn(`  [SKIP] File not found: ${shpPath}`)
    return []
  }

  const dbfPath = shpPath.replace(/\.shp$/i, '.dbf')
  console.log(`\nImporting ${layer} from ${path.basename(shpPath)}…`)

  const rows: PtprRow[] = []
  let skipped = 0

  const source = await shapefile.open(shpPath, dbfPath, { encoding: 'latin1' })

  while (true) {
    const { value: feature, done } = await source.read()
    if (done) break
    if (!feature?.geometry) { skipped++; continue }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const props: any = feature.properties ?? {}

    const centroid = extractCentroid(feature.geometry)
    if (!centroid || isNaN(centroid.lat) || isNaN(centroid.lon)) { skipped++; continue }

    // Sanity check: result should be roughly in Italy (WGS84)
    if (centroid.lat < 35 || centroid.lat > 48 || centroid.lon < 6 || centroid.lon > 19) {
      console.warn(`  Suspicious coords: ${centroid.lat}, ${centroid.lon} — skipping`)
      skipped++
      continue
    }

    // source_id — same for all layers
    const sourceId = props['ID_RL'] != null ? String(props['ID_RL']) : null

    // name — NOME if non-empty, else layer-specific fallback
    const nome = str(props['NOME'])
    const name = nome
      || (layer === 'linee' ? str(props['TIPO']) : '')
      || 'Sito archeologico tutelato'

    // description — compose from layer-specific fields, append attribution
    const parts: string[] = []
    if (layer === 'punti') {
      const tipo = str(props['TIPO_OGG'])
      const note = str(props['NOTE_'])
      if (tipo) parts.push(tipo)
      if (note) parts.push(note)
    } else if (layer === 'aree') {
      const note = str(props['NOTE_'])
      const comune = str(props['COMUNE'])
      const vincolo = str(props['VINCOLO'])
      if (note) parts.push(note)
      if (comune) parts.push(`Comune: ${comune}`)
      if (vincolo) parts.push(vincolo)
    } else if (layer === 'linee') {
      const tipo = str(props['TIPO'])
      const note = str(props['NOTE_'])
      const fonte = str(props['FONTE'])
      if (tipo) parts.push(tipo)
      if (note) parts.push(note)
      if (fonte) parts.push(`Fonte: ${fonte}`)
    }
    const description = parts.length > 0
      ? parts.join(' · ') + ' · ' + ATTRIBUTION
      : ATTRIBUTION

    rows.push({
      source_id: sourceId,
      name,
      description,
      poi_type: 'archaeological',
      layer,
      lat: centroid.lat,
      lon: centroid.lon,
      region,
      raw_props: props,
    })
  }

  console.log(`  ${rows.length} valid features, ${skipped} skipped`)

  if (DRY_RUN) {
    console.log('  [DRY RUN] Sample row:', JSON.stringify(rows[0], null, 2))
    return rows
  }

  if (TO_JSON_FILE) return rows   // caller collects all rows and writes the file

  const CHUNK = 500
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const { error } = await getSupabase()
      .from('ptpr_pois')
      .upsert(chunk, { onConflict: 'source_id,layer' })
    if (error) {
      console.error(`  Chunk ${i}–${i + CHUNK}: ${error.message}`)
    } else {
      console.log(`  Upserted rows ${i}–${Math.min(i + CHUNK, rows.length)}`)
    }
  }
  return rows
}

async function main() {
  const dir = path.join(process.cwd(), 'data', 'ptpr')

  let files: string[] = []
  try {
    files = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.shp'))
  } catch {
    console.error(`Cannot read directory: ${dir}`)
    process.exit(1)
  }

  if (files.length === 0) {
    console.error(`No .shp files found in ${dir}`)
    process.exit(1)
  }

  console.log(`Found shapefiles: ${files.join(', ')}`)
  if (DRY_RUN) console.log('[DRY RUN mode — no data will be written to Supabase]')

  const LAYER_MAP: Record<string, string> = {
    puntiarcheologici:  'punti',
    puntiarcha:         'punti',
    punti_arch:         'punti',
    aree_archeologiche: 'aree',
    areearch:           'aree',
    aree_arch:          'aree',
    linee_archeologiche: 'linee',
    lineearch:          'linee',
    linee_arch:         'linee',
  }

  const allRows: PtprRow[] = []

  for (const file of files) {
    const base = path.basename(file, '.shp').toLowerCase()
    const layer = LAYER_MAP[base] ?? (
      base.includes('punt') ? 'punti' :
      base.includes('area') || base.includes('aree') ? 'aree' :
      base.includes('line') ? 'linee' : 'unknown'
    )
    const rows = await importLayer(path.join(dir, file), layer)
    allRows.push(...rows)
  }

  if (TO_JSON_FILE) {
    fs.writeFileSync(TO_JSON_FILE, JSON.stringify(allRows, null, 0))
    console.log(`\nWrote ${allRows.length} rows to ${TO_JSON_FILE}`)
  } else if (!DRY_RUN) {
    const { count } = await getSupabase()
      .from('ptpr_pois')
      .select('*', { count: 'exact', head: true })
      .eq('region', 'lazio')
    console.log(`\nTotal rows in ptpr_pois (lazio): ${count}`)
  }

  console.log('\nDone.')
}

main().catch(err => { console.error(err); process.exit(1) })
