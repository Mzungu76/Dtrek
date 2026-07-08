/**
 * One-time seed: popola n2000_site_species con le specie osservate nei principali
 * siti Natura 2000 del Lazio (IT6*) interrogando GBIF occurrence search.
 *
 * Protezione: richiede ?secret=<prime 32 char di SUPABASE_SERVICE_ROLE_KEY>
 * Chiama: GET /api/admin/seed-n2000?secret=<secret>&dry=true  (anteprima)
 * Chiama: GET /api/admin/seed-n2000?secret=<secret>           (import live)
 *
 * Eseguire UNA VOLTA dopo il deploy su Vercel. Sicuro da rieseguire (upsert
 * idempotente). Non espone dati — risponde solo con conteggio righe inserite.
 */
import { supabase } from '@/lib/supabase'
import { GBIF_BASE, fetchWithTimeout, type GbifOccurrence, type GbifSearchResponse, canonicalSpeciesName } from '@/lib/gbifShared'
import { timingSafeCompare } from '@/lib/timingSafeCompare'

export const maxDuration = 60 // Vercel Pro timeout

// ── Principali siti Natura 2000 Lazio (IT6) con bbox approssimativa ─────────
// Fonte: siteCode da MASE/Natura2000, coordinate da conoscenza geografica
// dei siti Tuscia Viterbese e area metropolitana di Roma.
const LAZIO_N2000_SITES = [
  { siteCode: 'IT6010001', name: 'Monti Cimini',           minLat: 42.30, maxLat: 42.45, minLon: 12.10, maxLon: 12.30 },
  { siteCode: 'IT6010002', name: 'Lago di Vico',           minLat: 42.31, maxLat: 42.37, minLon: 12.16, maxLon: 12.22 },
  { siteCode: 'IT6010007', name: 'Fiume Fiora',            minLat: 42.35, maxLat: 42.55, minLon: 11.55, maxLon: 11.80 },
  { siteCode: 'IT6010008', name: 'Selva del Lamone',       minLat: 42.49, maxLat: 42.57, minLon: 11.68, maxLon: 11.82 },
  { siteCode: 'IT6010012', name: 'Monte Rufeno',           minLat: 42.73, maxLat: 42.82, minLon: 11.88, maxLon: 11.98 },
  { siteCode: 'IT6010014', name: 'Lago di Bolsena',        minLat: 42.55, maxLat: 42.65, minLon: 11.93, maxLon: 12.05 },
  { siteCode: 'IT6010025', name: 'Valle del Tevere',       minLat: 42.45, maxLat: 42.65, minLon: 12.15, maxLon: 12.35 },
  { siteCode: 'IT6030014', name: 'Monti Simbruini',        minLat: 41.90, maxLat: 42.05, minLon: 13.10, maxLon: 13.40 },
  { siteCode: 'IT6030015', name: 'Monti Ernici',           minLat: 41.70, maxLat: 41.90, minLon: 13.25, maxLon: 13.55 },
  { siteCode: 'IT6050001', name: 'Monti Lepini',           minLat: 41.45, maxLat: 41.65, minLon: 13.00, maxLon: 13.30 },
]

interface SiteSpeciesRow {
  site_code: string
  scientific_name: string
  vernacular_name_it: string | null
  taxon_group: string | null
  annex_code: string | null
  source: string
  license: string
}

function gbifClassToTaxonGroup(cls: string | undefined, kingdom: string | undefined): string | null {
  const c = (cls ?? '').toLowerCase()
  const k = (kingdom ?? '').toLowerCase()
  if (k === 'plantae') return 'Plants'
  if (c === 'mammalia') return 'Mammals'
  if (c === 'aves') return 'Birds'
  if (c === 'reptilia') return 'Reptiles'
  if (c === 'amphibia') return 'Amphibians'
  if (c === 'insecta' || c === 'arachnida' || c === 'crustacea') return 'Invertebrates'
  return null
}

async function fetchSpeciesForSite(
  site: typeof LAZIO_N2000_SITES[number],
): Promise<SiteSpeciesRow[]> {
  const results: SiteSpeciesRow[] = []
  const seen = new Set<string>()

  for (const kingdom of ['Plantae', 'Animalia']) {
    const params = new URLSearchParams()
    params.set('decimalLatitude', `${site.minLat},${site.maxLat}`)
    params.set('decimalLongitude', `${site.minLon},${site.maxLon}`)
    params.set('kingdom', kingdom)
    params.append('license', 'CC0_1_0')
    params.append('license', 'CC_BY_4_0')
    params.set('hasCoordinate', 'true')
    params.set('limit', '100')

    try {
      const res = await fetchWithTimeout(`${GBIF_BASE}/occurrence/search?${params}`, 12000)
      if (!res.ok) continue
      const data = await res.json() as GbifSearchResponse
      for (const occ of (data.results ?? [])) {
        const name = canonicalSpeciesName(occ) ?? occ.species ?? occ.scientificName
        if (!name || seen.has(name)) continue
        seen.add(name)
        const taxonGroup = gbifClassToTaxonGroup(occ.class, kingdom)
        results.push({
          site_code: site.siteCode,
          scientific_name: name,
          vernacular_name_it: null,
          taxon_group: taxonGroup,
          annex_code: null,
          source: 'gbif',
          license: 'CC_BY_4_0',
        })
      }
    } catch {
      // skip site/kingdom on timeout
    }
  }

  return results
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)

  // Protezione: prime 32 lettere del service role key
  const serviceKey = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  const expected = serviceKey.slice(0, 32)
  if (!expected || !timingSafeCompare(searchParams.get('secret') ?? '', expected)) {
    return new Response('Unauthorized', { status: 401 })
  }

  const dryRun = searchParams.get('dry') === 'true'

  const allRows: SiteSpeciesRow[] = []

  for (const site of LAZIO_N2000_SITES) {
    const rows = await fetchSpeciesForSite(site)
    allRows.push(...rows)
  }

  if (dryRun) {
    return Response.json({
      dry_run: true,
      total: allRows.length,
      sample: allRows.slice(0, 5),
      sites: LAZIO_N2000_SITES.map(s => s.siteCode),
    })
  }

  const CHUNK = 200
  let inserted = 0
  for (let i = 0; i < allRows.length; i += CHUNK) {
    const chunk = allRows.slice(i, i + CHUNK)
    const { error } = await supabase
      .from('n2000_site_species')
      .upsert(chunk, { onConflict: 'site_code,scientific_name' })
    if (!error) inserted += chunk.length
  }

  return Response.json({ inserted, total: allRows.length, sites: LAZIO_N2000_SITES.length })
}
