/**
 * One-time script: import PTPR Regione Lazio (Tavola B) GeoJSON files into Supabase ptpr_pois.
 *
 * Prerequisites:
 *   1. Download the 3 PTPR layers from dati.lazio.it / geoportale.regione.lazio.it
 *   2. Reproject from ED50 fuso 33N (EPSG:23033) to WGS84 using ogr2ogr:
 *        ogr2ogr -f GeoJSON -t_srs EPSG:4326 scripts/punti_arch_wgs84.geojson puntiarcheologici.shp
 *        ogr2ogr -f GeoJSON -t_srs EPSG:4326 scripts/aree_arch_wgs84.geojson  aree_archeologiche.shp
 *        ogr2ogr -f GeoJSON -t_srs EPSG:4326 scripts/linee_arch_wgs84.geojson linee_archeologiche.shp
 *   3. Run: SUPABASE_URL=... SUPABASE_SERVICE_KEY=... npx tsx scripts/import-ptpr.ts
 *
 * To add more regions later: convert their shapefiles to WGS84 GeoJSON and call
 * importLayer() with the appropriate region name. No code changes needed.
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

interface GeoJsonGeometry {
  type: string
  coordinates: unknown
}

function extractCentroid(geometry: GeoJsonGeometry): { lat: number; lon: number } | null {
  try {
    if (geometry.type === 'Point') {
      const c = geometry.coordinates as [number, number]
      return { lat: c[1], lon: c[0] }
    }
    if (geometry.type === 'Polygon') {
      const ring = (geometry.coordinates as [number, number][][])[0]
      return {
        lat: ring.reduce((s, c) => s + c[1], 0) / ring.length,
        lon: ring.reduce((s, c) => s + c[0], 0) / ring.length,
      }
    }
    if (geometry.type === 'LineString') {
      const coords = geometry.coordinates as [number, number][]
      const mid = Math.floor(coords.length / 2)
      return { lat: coords[mid][1], lon: coords[mid][0] }
    }
    if (geometry.type === 'MultiPolygon') {
      return extractCentroid({ type: 'Polygon', coordinates: (geometry.coordinates as unknown[][][][])[0] })
    }
    if (geometry.type === 'MultiLineString') {
      return extractCentroid({ type: 'LineString', coordinates: (geometry.coordinates as unknown[][][])[0] })
    }
  } catch {}
  return null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function importLayer(geojsonPath: string, layer: string, region = 'lazio') {
  if (!fs.existsSync(geojsonPath)) {
    console.warn(`File not found, skipping: ${geojsonPath}`)
    return
  }

  console.log(`Importing ${layer} from ${path.basename(geojsonPath)}…`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fc = JSON.parse(fs.readFileSync(geojsonPath, 'utf8')) as { features: any[] }

  const rows = fc.features
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((f: any) => {
      const coords = extractCentroid(f.geometry)
      if (!coords) return null
      return {
        source_id: f.properties?.OBJECTID?.toString() ?? f.properties?.objectid?.toString() ?? null,
        name:      f.properties?.DENOMINAZI ?? f.properties?.denominazi ?? f.properties?.NOME ?? f.properties?.nome ?? null,
        poi_type:  'archaeological',
        layer,
        lat:       coords.lat,
        lon:       coords.lon,
        region,
        raw_props: f.properties ?? null,
      }
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((r: any) => r !== null && r.lat && r.lon && !isNaN(r.lat) && !isNaN(r.lon))

  console.log(`  ${rows.length} valid features`)

  const CHUNK = 500
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase.from('ptpr_pois').insert(rows.slice(i, i + CHUNK))
    if (error) {
      console.error(`  Chunk ${i}–${i + CHUNK}: ${error.message}`)
    } else {
      console.log(`  Inserted rows ${i}–${Math.min(i + CHUNK, rows.length)}`)
    }
  }
}

async function main() {
  const dir = path.join(process.cwd(), 'scripts')

  await importLayer(path.join(dir, 'punti_arch_wgs84.geojson'), 'punti', 'lazio')
  await importLayer(path.join(dir, 'aree_arch_wgs84.geojson'),  'aree',  'lazio')
  await importLayer(path.join(dir, 'linee_arch_wgs84.geojson'), 'linee', 'lazio')

  console.log('Done.')
}

main().catch(err => { console.error(err); process.exit(1) })
