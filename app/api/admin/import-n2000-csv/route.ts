/**
 * Import EEA Natura 2000 SPECIES.csv (caricato manualmente in Storage bucket
 * "imports") → tabella n2000_site_species, tutta Italia (site_code 'IT*').
 *
 * Sostituisce scripts/import-n2000-species.ts: invece di richiedere download +
 * esecuzione locale con Node/npx (impraticabile da mobile), legge il CSV già
 * caricato nello Storage Supabase tramite il client service-role esistente
 * (lib/supabase.ts) e gira come route Vercel, dove la rete verso Supabase
 * funziona sempre (a differenza del sandbox di sviluppo, dove eea.europa.eu
 * è bloccato dal proxy).
 *
 * Uso (da browser, sostituendo <SECRET> con le prime 32 lettere di
 * SUPABASE_SERVICE_ROLE_KEY):
 *   GET /api/admin/import-n2000-csv?secret=<SECRET>&peek=true   → mostra header + 3 righe campione, non scrive nulla
 *   GET /api/admin/import-n2000-csv?secret=<SECRET>&dry=true    → conta righe valide/scartate, non scrive nulla
 *   GET /api/admin/import-n2000-csv?secret=<SECRET>             → import live (upsert, idempotente)
 *
 * Lo schema EEA SPECIES.csv standard (dal 2018) usa colonne SITECODE,
 * SPECIESNAME, SPGROUP, ANNEXSPGROUP — ma i nomi sono case-insensitive e
 * possono variare leggermente tra release, quindi il parser cerca match
 * approssimati invece di nomi fissi.
 */
import { supabase } from '@/lib/supabase'

export const maxDuration = 300 // file da ~25MB, parsing CSV pesante

const STORAGE_BUCKET = 'imports'
const STORAGE_FILE = 'Natura2000_end2024_rev1_SPECIES.csv'

const TAXON_GROUP_MAP: Record<string, string> = {
  mammals: 'Mammals',
  birds: 'Birds',
  reptiles: 'Reptiles',
  amphibians: 'Amphibians',
  plants: 'Plants',
  invertebrates: 'Invertebrates',
  fish: 'Invertebrates',
}

function normalizeTaxonGroup(raw: string | undefined): string | null {
  if (!raw) return null
  return TAXON_GROUP_MAP[raw.trim().toLowerCase()] ?? null
}

// Parser CSV minimale ma con supporto per campi tra virgolette (il file EEA
// può contenere virgole nei nomi specie/vernacolari quotati).
function parseCsvLine(line: string): string[] {
  const cells: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (c === '"') { inQuotes = false }
      else { cur += c }
    } else {
      if (c === '"') inQuotes = true
      else if (c === ',') { cells.push(cur); cur = '' }
      else cur += c
    }
  }
  cells.push(cur)
  return cells
}

function findColumn(header: string[], candidates: string[]): number {
  const upper = header.map(h => h.trim().toUpperCase())
  for (const cand of candidates) {
    const idx = upper.indexOf(cand)
    if (idx !== -1) return idx
  }
  // fallback: substring match
  for (const cand of candidates) {
    const idx = upper.findIndex(h => h.includes(cand))
    if (idx !== -1) return idx
  }
  return -1
}

interface SiteSpeciesRow {
  site_code: string
  scientific_name: string
  vernacular_name_it: string | null
  taxon_group: string | null
  annex_code: string | null
  source: string
  license: string
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)

  const serviceKey = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  const provided = searchParams.get('secret') ?? ''
  const authorized = Boolean(serviceKey) && provided === serviceKey.slice(0, 32)
  if (!authorized) {
    return new Response('Unauthorized', { status: 401 })
  }

  const peek = searchParams.get('peek') === 'true'
  const dryRun = searchParams.get('dry') === 'true'

  const { data: fileBlob, error: downloadError } = await supabase
    .storage
    .from(STORAGE_BUCKET)
    .download(STORAGE_FILE)

  if (downloadError || !fileBlob) {
    return Response.json({ error: `download failed: ${downloadError?.message}` }, { status: 500 })
  }

  const text = await fileBlob.text()
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0)
  if (lines.length === 0) {
    return Response.json({ error: 'empty file' }, { status: 500 })
  }

  const header = parseCsvLine(lines[0])
  const siteCodeIdx = findColumn(header, ['SITECODE', 'SITE_CODE'])
  const speciesNameIdx = findColumn(header, ['SPECIESNAME', 'SPECIES_NAME', 'SPECNAME'])
  const spGroupIdx = findColumn(header, ['SPGROUP', 'SP_GROUP'])
  const annexIdx = findColumn(header, ['ANNEXSPGROUP', 'ANNEX_SP_GROUP', 'ANNEX'])

  if (peek) {
    return Response.json({
      header,
      detected: { siteCodeIdx, speciesNameIdx, spGroupIdx, annexIdx },
      sample: lines.slice(1, 4).map(parseCsvLine),
      total_lines: lines.length - 1,
    })
  }

  if (siteCodeIdx === -1 || speciesNameIdx === -1) {
    return Response.json({
      error: 'could not detect SITECODE / SPECIESNAME columns, use ?peek=true to inspect header',
      header,
    }, { status: 500 })
  }

  const rows: SiteSpeciesRow[] = []
  const seen = new Set<string>()
  let skipped = 0

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i])
    const siteCode = cells[siteCodeIdx]?.trim()
    const scientificName = cells[speciesNameIdx]?.trim()
    if (!siteCode || !siteCode.startsWith('IT') || !scientificName) { skipped++; continue }

    const key = `${siteCode}|${scientificName}`
    if (seen.has(key)) continue
    seen.add(key)

    rows.push({
      site_code: siteCode,
      scientific_name: scientificName,
      vernacular_name_it: null,
      taxon_group: normalizeTaxonGroup(spGroupIdx !== -1 ? cells[spGroupIdx] : undefined),
      annex_code: annexIdx !== -1 ? (cells[annexIdx]?.trim() || null) : null,
      source: 'eea',
      license: 'CC-BY-4.0',
    })
  }

  if (dryRun) {
    return Response.json({
      dry_run: true,
      total_parsed: rows.length,
      skipped,
      sites: new Set(rows.map(r => r.site_code)).size,
      sample: rows.slice(0, 5),
    })
  }

  const CHUNK = 500
  let inserted = 0
  const errors: string[] = []
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const { error } = await supabase
      .from('n2000_site_species')
      .upsert(chunk, { onConflict: 'site_code,scientific_name' })
    if (error) errors.push(`chunk ${i}: ${error.message}`)
    else inserted += chunk.length
  }

  return Response.json({
    inserted,
    total_parsed: rows.length,
    skipped,
    sites: new Set(rows.map(r => r.site_code)).size,
    errors: errors.slice(0, 5),
  })
}
