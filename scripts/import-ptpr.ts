/**
 * One-time import: PTPR Regione Lazio (Tavola B) shapefiles → Supabase ptpr_pois
 *
 * Usage:
 *   npx tsx scripts/import-ptpr.ts [--dry-run]
 *
 * Files expected in data/ptpr/ (exact names verified from filesystem):
 *   puntiarcheologici.shp / .dbf
 *   aree_archeologiche.shp / .dbf
 *   linee_archeologiche.shp / .dbf
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

// ── EPSG:23033 definition ──────────────────────────────────────────────────────
// ED50 / UTM zone 33N — standard projection for Italian cadastral data
proj4.defs(
  'EPSG:23033',
  '+proj=utm +zone=33 +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs',
)

const DRY_RUN = process.argv.includes('--dry-run')

// ── Supabase client (service key — bypasses RLS) ──────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    'Set SUPABASE_URL and SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY) env vars.\n' +
    'Example: SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_KEY=eyJ... npx tsx scripts/import-ptpr.ts',
  )
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── Coordinate conversion ─────────────────────────────────────────────────────

function toWgs84(coords: number[]): [number, number] {
  const [lon, lat] = proj4('EPSG:23033', 'EPSG:4326', [coords[0], coords[1]])
  return [lon, lat]
}

// ── Centroid extraction (after coordinate conversion) ─────────────────────────

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
      const converted = ring.map(c => toWgs84(c))
      return {
        lat: converted.reduce((s, c) => s + c[1], 0) / converted.length,
        lon: converted.reduce((s, c) => s + c[0], 0) / converted.length,
      }
    }

    if (geometry.type === 'LineString') {
      const coords: number[][] = geometry.coordinates
      const mid = Math.floor(coords.length / 2)
      const [lon, lat] = toWgs84(coords[mid])
      return { lat, lon }
    }

    if (geometry.type === 'MultiPolygon') {
      return extractCentroid({ type: 'Polygon', coordinates: geometry.coordinates[0] })
    }

    if (geometry.type === 'MultiLineString') {
      return extractCentroid({ type: 'LineString', coordinates: geometry.coordinates[0] })
    }
  } catch {}
  return null
}

// ── Field name resolution (shapefile column names vary between PTPR versions) ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pickField(props: any, ...candidates: string[]): string | null {
  for (const key of candidates) {
    if (props[key] != null && props[key] !== '') return String(props[key])
    // Try lowercase variant
    const lower = key.toLowerCase()
    if (props[lower] != null && props[lower] !== '') return String(props[lower])
  }
  return null
}

// ── Layer import ──────────────────────────────────────────────────────────────

interface PtprRow {
  source_id: string | null
  name: string | null
  poi_type: string
  layer: string
  lat: number
  lon: number
  region: string
  raw_props: Record<string, unknown>
}

async function importLayer(
  shpPath: string,
  layer: string,
  region = 'lazio',
): Promise<void> {
  if (!fs.existsSync(shpPath)) {
    console.warn(`  [SKIP] File not found: ${shpPath}`)
    return
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
      console.warn(`  Suspicious coords after reprojection: ${centroid.lat}, ${centroid.lon} — skipping`)
      skipped++
      continue
    }

    const sourceId = pickField(props, 'OBJECTID', 'objectid', 'FID', 'fid', 'ID', 'id')
    const name = pickField(
      props,
      'DENOMINAZI', 'DENOMINAZIONE', 'denominazi', 'denominazione',
      'NOME', 'nome', 'NAME', 'name',
      'DESCRIZIONE', 'descrizione',
    )

    rows.push({
      source_id: sourceId,
      name,
      poi_type:  'archaeological',
      layer,
      lat:       centroid.lat,
      lon:       centroid.lon,
      region,
      raw_props: props,
    })
  }

  console.log(`  ${rows.length} valid features, ${skipped} skipped`)

  if (DRY_RUN) {
    console.log('  [DRY RUN] Sample row:', JSON.stringify(rows[0], null, 2))
    return
  }

  const CHUNK = 500
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const { error } = await supabase.from('ptpr_pois').insert(chunk)
    if (error) {
      console.error(`  Chunk ${i}–${i + CHUNK}: ${error.message}`)
    } else {
      console.log(`  Inserted rows ${i}–${Math.min(i + CHUNK, rows.length)}`)
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const dir = path.join(process.cwd(), 'data', 'ptpr')

  // Verify actual filenames in the directory
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

  // Map known layer names; fall back to filename-based detection
  const LAYER_MAP: Record<string, string> = {
    puntiarcheologici:  'punti',
    puntiarcha:         'punti',
    punti_arch:         'punti',
    aree_archeologiche: 'aree',
    areearch:           'aree',
    aree_arch:          'aree',
    linee_archeologiche:'linee',
    lineearch:          'linee',
    linee_arch:         'linee',
  }

  for (const file of files) {
    const base = path.basename(file, '.shp').toLowerCase()
    const layer = LAYER_MAP[base] ?? (
      base.includes('punt') ? 'punti' :
      base.includes('area') || base.includes('aree') ? 'aree' :
      base.includes('line') ? 'linee' : 'unknown'
    )
    await importLayer(path.join(dir, file), layer)
  }

  if (!DRY_RUN) {
    const { count } = await supabase
      .from('ptpr_pois')
      .select('*', { count: 'exact', head: true })
      .eq('region', 'lazio')
    console.log(`\nTotal rows in ptpr_pois (lazio): ${count}`)
  }

  console.log('\nDone.')
}

main().catch(err => { console.error(err); process.exit(1) })
