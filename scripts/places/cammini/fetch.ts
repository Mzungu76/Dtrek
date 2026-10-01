import fs from 'fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { TappaAnchor } from '../../../lib/cammini/tappe'
import { buildCammino, camminoToPlaceCandidate, type OverpassElement, type StagesMode } from './build'
import { CAMMINI, type CamminoConfig } from './config'
import { importCammino } from './import'
import { runOverpass } from './overpass'

// Importa un Cammino da OpenStreetMap (docs/piano-cammini.md, Fase 2). Una query Overpass per
// cammino, eseguita offline da workflow — mai live per-ricerca-utente (piano §9/§21/§48.7). Solo
// route=hiking|foot: i cammini ciclabili sono esclusi per decisione di prodotto.
//
// Uso:
//   npx tsx scripts/places/cammini/fetch.ts --id via-francigena-lazio --dry-run
//   npx tsx scripts/places/cammini/fetch.ts --id via-francigena-lazio --fixture /tmp/overpass.json --dry-run
//   (--stages auto|official|computed, --save-fixture <file> per salvare la risposta grezza)

export function overpassQuery(config: CamminoConfig): string {
  const [s, w, n, e] = config.bbox
  const bbox = `${s},${w},${n},${e}`
  // Query leggera (la prima versione chiedeva `out geom` della relazione intera, che per un cammino
  // europeo significa risolvere migliaia di way: 504 su tutti i server). Qui: le relazioni escono
  // solo con l'elenco dei membri (`out body`, nessuna geometria) e la geometria è emessa a parte,
  // limitata alle way dentro il ritaglio. Il builder le ricollega per id. Solo route=hiking|foot.
  return `[out:json][timeout:180];
rel["route"~"^(hiking|foot)$"]["name"~"${config.nameRegex}",i](${bbox})->.main;
rel(r.main)["route"~"^(hiking|foot)$"]->.kids;
(.main; .kids;)->.all;
way(r.all)(${bbox})->.w;
.all out body;
.w out geom;`
}

async function fetchElements(query: string): Promise<OverpassElement[]> {
  const json = await runOverpass<{ elements?: OverpassElement[] }>(query)
  return (json.elements ?? []).filter(e => e.type === 'relation' || e.type === 'way')
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

// Borghi/Città del catalogo nel ritaglio: punti di sosta candidati a chiudere una tappa.
async function loadAnchors(supabase: SupabaseClient | null, config: CamminoConfig): Promise<TappaAnchor[]> {
  if (!supabase) return []
  const [s, w, n, e] = config.bbox
  const { data, error } = await supabase.from('dtrek_places')
    .select('id, name, latitude, longitude, population')
    .eq('meta_type', 'borgo_citta')
    .gte('latitude', s).lte('latitude', n).gte('longitude', w).lte('longitude', e)
    .limit(2000)
  if (error) throw error
  return (data ?? []).map(r => ({ id: r.id as string, name: r.name as string, lat: r.latitude as number, lon: r.longitude as number, population: r.population as number | null }))
}

async function main() {
  const DRY_RUN = process.argv.includes('--dry-run')
  const id = arg('id') ?? 'via-francigena-lazio'
  const config = CAMMINI.find(c => c.id === id)
  if (!config) { console.error(`Cammino sconosciuto: ${id}. Disponibili: ${CAMMINI.map(c => c.id).join(', ')}`); process.exit(1) }
  const stages = (arg('stages') ?? 'auto') as StagesMode

  const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabase = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null
  if (!supabase && !DRY_RUN) { console.error('Servono SUPABASE_URL e SUPABASE_SERVICE_KEY, oppure --dry-run.'); process.exit(1) }
  if (!supabase) console.warn('Nessuna credenziale Supabase: dry-run senza borghi, le tappe calcolate non si chiudono su paesi.')

  const fixture = arg('fixture')
  const elements: OverpassElement[] = fixture
    ? (JSON.parse(fs.readFileSync(fixture, 'utf8')).elements as OverpassElement[])
    : await fetchElements(overpassQuery(config))
  console.log(`${elements.length} elementi ricevuti.`)
  const saveFixture = arg('save-fixture')
  if (saveFixture && !fixture) fs.writeFileSync(saveFixture, JSON.stringify({ elements }))

  const anchors = await loadAnchors(supabase, config)
  console.log(`${anchors.length} borghi/città nel ritaglio.`)

  const built = buildCammino(elements, config, anchors, { stages })
  built.diagnostics.forEach(d => console.log(`  · ${d}`))
  console.log(`${config.name}: ${(built.lengthM / 1000).toFixed(1)} km, ${built.tappe.length} tappe (${built.tappeSource}).`)
  for (const t of built.tappe) {
    console.log(`  ${String(t.ordinal).padStart(2)}. ${t.name} — ${(t.lengthM / 1000).toFixed(1)} km${t.fromName || t.toName ? ` · ${t.fromName ?? '?'} → ${t.toName ?? '?'}` : ''}${t.endsAtAnchor === false ? ' · fine in campagna' : ''}`)
  }

  if (DRY_RUN) {
    const c = camminoToPlaceCandidate(built)
    console.log('[DRY RUN] Candidato:', JSON.stringify({ ...c, metadata: { ...c.metadata, overviewPolyline: `${(c.metadata?.overviewPolyline as unknown[]).length} punti` } }, null, 2))
    console.log('[DRY RUN] Nessuna scrittura.')
    return
  }
  const stats = await importCammino(supabase!, built)
  console.log(JSON.stringify(stats, null, 2))
}

const isDirectRun = process.argv[1]?.endsWith('fetch.ts') && process.argv[1]?.includes('cammini')
if (isDirectRun) main().catch(err => { console.error(err); process.exit(1) })
