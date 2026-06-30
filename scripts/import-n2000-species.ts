/**
 * One-time import: EEA Natura 2000 "species per site" CSV → Supabase n2000_site_species
 *
 * Usage:
 *   npx tsx scripts/import-n2000-species.ts [--dry-run]
 *
 * Source: https://www.eea.europa.eu/data-and-maps/data/natura-14 (CC BY 4.0) — download the
 * latest "Natura 2000 end year" package and extract the species CSV (typically named
 * SPECIES.csv inside the release zip) into data/n2000/SPECIES.csv. Filtering to Lazio/Tuscia
 * happens here via SITECODE prefix ('IT6' = Lazio), not at download time — the EEA package
 * ships all of Italy in one file.
 *
 * Expected CSV columns (EEA standard data form export — verify against the actual download,
 * column names have shifted across EEA release years):
 *   SITECODE, SPECIESNAME, SPGROUP, ANNEXSPGROUP (annex code, e.g. "Annex II")
 *
 * Dependencies: none beyond Node's built-in CSV-free parsing (no quoted-comma fields expected
 * in this dataset; if a future release adds them, switch to a proper CSV parser).
 */
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

const DRY_RUN = process.argv.includes('--dry-run')

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY

if (!DRY_RUN && (!SUPABASE_URL || !SUPABASE_KEY)) {
  console.error(
    'Set SUPABASE_URL and SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY) env vars.\n' +
    'Example: SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_KEY=eyJ... npx tsx scripts/import-n2000-species.ts\n' +
    'Or use --dry-run to preview parsed rows without a live Supabase connection.',
  )
  process.exit(1)
}

let supabase: ReturnType<typeof createClient> | null = null
function getSupabase() {
  if (!supabase) supabase = createClient(SUPABASE_URL!, SUPABASE_KEY!)
  return supabase
}

// Lazio site codes start with IT6 — broad enough to cover the Tuscia Viterbese trails plus
// any future expansion within the region, same reasoning as PTPR's region='lazio' default.
const SITE_CODE_PREFIX = 'IT6'

const TAXON_GROUP_MAP: Record<string, string> = {
  mammals: 'Mammals',
  birds: 'Birds',
  reptiles: 'Reptiles',
  amphibians: 'Amphibians',
  plants: 'Plants',
  invertebrates: 'Invertebrates',
  fish: 'Invertebrates', // grouped with the conservative fauna fallback bucket — not a flora/fauna gallery source today
}

function normalizeTaxonGroup(raw: string): string | null {
  const key = raw.trim().toLowerCase()
  return TAXON_GROUP_MAP[key] ?? null
}

interface SiteSpeciesRow {
  site_code: string
  scientific_name: string
  vernacular_name_it: string | null
  taxon_group: string | null
  annex_code: string | null
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0)
  if (lines.length === 0) return []
  const header = lines[0].split(',').map(h => h.trim().toUpperCase())
  return lines.slice(1).map(line => {
    const cells = line.split(',')
    const row: Record<string, string> = {}
    header.forEach((h, i) => { row[h] = (cells[i] ?? '').trim() })
    return row
  })
}

async function main() {
  const csvPath = path.join(process.cwd(), 'data', 'n2000', 'SPECIES.csv')
  if (!fs.existsSync(csvPath)) {
    console.error(`File not found: ${csvPath}\nScarica il pacchetto EEA Natura 2000 ed estrai SPECIES.csv in data/n2000/.`)
    process.exit(1)
  }

  const raw = fs.readFileSync(csvPath, 'utf-8')
  const records = parseCsv(raw)
  console.log(`${records.length} righe lette da SPECIES.csv`)

  const rows: SiteSpeciesRow[] = []
  let skipped = 0

  for (const rec of records) {
    const siteCode = rec['SITECODE']
    const scientificName = rec['SPECIESNAME']
    if (!siteCode || !siteCode.startsWith(SITE_CODE_PREFIX) || !scientificName) { skipped++; continue }

    rows.push({
      site_code: siteCode,
      scientific_name: scientificName,
      vernacular_name_it: null, // EEA non fornisce nomi italiani — restano da Wikidata/GBIF a runtime
      taxon_group: normalizeTaxonGroup(rec['SPGROUP'] ?? ''),
      annex_code: rec['ANNEXSPGROUP'] || null,
    })
  }

  console.log(`${rows.length} righe Lazio (${SITE_CODE_PREFIX}*) valide, ${skipped} scartate`)

  if (DRY_RUN) {
    console.log('[DRY RUN] Sample row:', JSON.stringify(rows[0], null, 2))
    return
  }

  const CHUNK = 500
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const { error } = await getSupabase()
      .from('n2000_site_species')
      .upsert(chunk, { onConflict: 'site_code,scientific_name' })
    if (error) {
      console.error(`  Chunk ${i}–${i + CHUNK}: ${error.message}`)
    } else {
      console.log(`  Upserted rows ${i}–${Math.min(i + CHUNK, rows.length)}`)
    }
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
