/**
 * Reads a GeoJSON file of "Punti archeo tipizzati" (PTPR Tav. B)
 * and updates existing ptpr_pois records with the correct TIPO_OGG and poi_type.
 *
 * Usage:
 *   npx tsx scripts/update-ptpr-tipizzati.ts <path/to/file.geojson> [--dry-run]
 *
 * --dry-run: prints distinct TIPO_OGG values and a sample without touching the DB.
 */

import fs from 'fs'
import path from 'path'

// ── Types ─────────────────────────────────────────────────────────────────────

interface GeoJsonFeature {
  type: 'Feature'
  geometry: { type: string; coordinates: unknown }
  properties: Record<string, unknown>
}

interface GeoJsonCollection {
  type: 'FeatureCollection'
  features: GeoJsonFeature[]
}

type PoiType =
  | 'peak' | 'pass' | 'waterfall' | 'spring' | 'cave'
  | 'viewpoint' | 'ruins' | 'archaeological' | 'castle'
  | 'chapel' | 'bridge' | 'monument' | 'tower'

// ── TIPO_OGG → PoiType mapping ────────────────────────────────────────────────
// Fill in / adjust once the real TIPO_OGG values are known.

function tipoOggToPoiType(tipo: string): PoiType {
  const t = tipo.toLowerCase()
  if (t.includes('necropoli') || t.includes('sepolcr') || t.includes('tomba')) return 'archaeological'
  if (t.includes('villa'))                                                       return 'archaeological'
  if (t.includes('santuario') || t.includes('tempio') || t.includes('culto'))   return 'archaeological'
  if (t.includes('insediamento') || t.includes('abitato') || t.includes('oppidum')) return 'archaeological'
  if (t.includes('grotta'))                                                      return 'cave'
  if (t.includes('acquedotto') || t.includes('cisterna'))                        return 'ruins'
  if (t.includes('ponte'))                                                       return 'bridge'
  if (t.includes('castello') || t.includes('fortezza') || t.includes('rocca'))  return 'castle'
  if (t.includes('chiesa') || t.includes('capella') || t.includes('abbazia'))   return 'chapel'
  return 'archaeological'
}

// ── Main ──────────────────────────────────────────────────────────────────────

function str(v: unknown): string {
  return v != null && String(v).trim() !== '' ? String(v).trim() : ''
}

async function main() {
  const filePath = process.argv[2]
  const dryRun   = process.argv.includes('--dry-run')

  if (!filePath) {
    console.error('Usage: npx tsx scripts/update-ptpr-tipizzati.ts <file.geojson> [--dry-run]')
    process.exit(1)
  }

  const raw     = fs.readFileSync(path.resolve(filePath), 'utf8')
  const geojson = JSON.parse(raw) as GeoJsonCollection

  if (geojson.type !== 'FeatureCollection') {
    console.error('Expected a GeoJSON FeatureCollection')
    process.exit(1)
  }

  const rows = geojson.features
    .map(f => ({
      source_id: str(f.properties?.ID_RL),
      tipo_ogg:  str(f.properties?.TIPO_OGG),
      nome:      str(f.properties?.NOME),
    }))
    .filter(r => r.source_id !== '')

  // ── Dry-run: show stats only ─────────────────────────────────────────────
  if (dryRun) {
    const distinct = [...new Set(rows.map(r => r.tipo_ogg).filter(Boolean))].sort()
    console.log(`\nTotal features: ${geojson.features.length}`)
    console.log(`With source_id:  ${rows.length}`)
    console.log(`With TIPO_OGG:   ${rows.filter(r => r.tipo_ogg).length}`)
    console.log('\nDistinct TIPO_OGG values:')
    distinct.forEach(v => {
      const count = rows.filter(r => r.tipo_ogg === v).length
      console.log(`  ${count.toString().padStart(4)}  ${v}  →  ${tipoOggToPoiType(v)}`)
    })
    console.log('\nSample rows (first 5 with TIPO_OGG):')
    rows.filter(r => r.tipo_ogg).slice(0, 5).forEach(r =>
      console.log(`  ID_RL=${r.source_id}  TIPO_OGG="${r.tipo_ogg}"  →  ${tipoOggToPoiType(r.tipo_ogg)}`)
    )
    return
  }

  // ── Real run: print JSON for MCP execute_sql bulk update ─────────────────
  // Output a VALUES list suitable for the SQL UPDATE in the plan.
  const withType = rows
    .filter(r => r.tipo_ogg !== '')
    .map(r => ({ source_id: r.source_id, tipo_ogg: r.tipo_ogg, poi_type: tipoOggToPoiType(r.tipo_ogg) }))

  console.log(`Records to update: ${withType.length}`)
  console.log('\nPaste the following into execute_sql:\n')

  // Build VALUES clause in chunks of 500
  const CHUNK = 500
  for (let i = 0; i < withType.length; i += CHUNK) {
    const chunk = withType.slice(i, i + CHUNK)
    const values = chunk
      .map(r => `('${r.source_id.replace(/'/g, "''")}','${r.tipo_ogg.replace(/'/g, "''")}','${r.poi_type}')`)
      .join(',\n  ')
    console.log(`-- Chunk ${Math.floor(i / CHUNK) + 1}/${Math.ceil(withType.length / CHUNK)}`)
    console.log(`UPDATE ptpr_pois AS p
SET
  raw_props = raw_props || jsonb_build_object('TIPO_OGG', t.tipo_ogg),
  poi_type  = t.poi_type
FROM (VALUES
  ${values}
) AS t(source_id, tipo_ogg, poi_type)
WHERE p.source_id = t.source_id
  AND p.layer = 'punti';
`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
