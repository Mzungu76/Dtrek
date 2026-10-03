import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { buildFromGpxFiles, type GpxCamminoInfo } from '../../../lib/cammini/gpxTappe'
import { importCammino } from './import'

// Importa un cammino dai GPX ufficiali delle sue tappe (uno zip con una cartella per tratto, ogni
// file una tappa numerata) invece che da Overpass — per i cammini le cui relazioni OSM non si
// incatenano in un unico tracciato (vedi diagnostics di import-registry.ts per via-francigena:
// "tappe non collegate", perché le relazioni regionali hanno sia un pezzo di tracciato proprio sia
// sotto-relazioni, e buildFromRegistry oggi usa solo le relazioni "foglia pura" — limite noto,
// riportato ma non corretto qui per non toccare la logica condivisa con gli altri cammini).
//
// Uso (un tratto = una cartella dello zip = un cammino):
//   npx tsx scripts/places/cammini/importFromGpx.ts --zip Via-Francigena.zip \
//     --folder "01a - Colle Gran San Bernardo - Roma" --id via-francigena --name "Via Francigena" --theme religioso
//   npx tsx scripts/places/cammini/importFromGpx.ts --zip Via-Francigena.zip \
//     --folder "02 - Roma - Santa Maria di Leuca" --id via-francigena-sud --name "Via Francigena del Sud" --theme religioso --write
//
// Richiede `unzip` in PATH (preinstallato su GitHub Actions ubuntu-latest e sulla maggior parte
// delle distribuzioni Linux/macOS). Di default dry-run: scrive in database solo con --write.

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function loadBorghi(supabase: SupabaseClient) {
  const out: { id: string; name: string; lat: number; lon: number; population: number | null }[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('dtrek_places').select('id, name, latitude, longitude, population')
      .eq('meta_type', 'borgo_citta').range(from, from + 999)
    if (error) throw error
    for (const r of data ?? []) out.push({ id: r.id as string, name: r.name as string, lat: r.latitude as number, lon: r.longitude as number, population: r.population as number | null })
    if (!data || data.length < 1000) break
  }
  return out
}

async function main() {
  const zipPath = arg('zip')
  const folder = arg('folder')
  const id = arg('id')
  const name = arg('name')
  const theme = (arg('theme') ?? 'religioso') as GpxCamminoInfo['theme']
  if (!zipPath || !folder || !id || !name) { console.error('Servono --zip, --folder, --id, --name (--theme opzionale, default religioso).'); process.exit(1) }
  if (!fs.existsSync(zipPath)) { console.error(`File non trovato: ${zipPath}`); process.exit(1) }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cammini-gpx-'))
  console.log(`Estraggo "${folder}" da ${zipPath}…`)
  try {
    execFileSync('unzip', ['-o', '-q', path.resolve(zipPath), `${folder}/*`, '-d', tmpDir])
  } catch (err) {
    console.error('`unzip` non è disponibile o ha fallito (serve in PATH).')
    throw err
  }
  const folderPath = path.join(tmpDir, folder)
  if (!fs.existsSync(folderPath)) { console.error(`Nella zip non c'è la cartella "${folder}".`); process.exit(1) }
  const files = fs.readdirSync(folderPath).filter(f => f.toLowerCase().endsWith('.gpx'))
    .map(f => ({ filename: f, xml: fs.readFileSync(path.join(folderPath, f), 'utf8') }))
  console.log(`${files.length} file .gpx trovati.`)

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) { console.error('Servono SUPABASE_URL e SUPABASE_SERVICE_KEY (comuni del catalogo per i nomi delle tappe).'); process.exit(1) }
  const supabase = createClient(url, key)
  const borghi = await loadBorghi(supabase)
  console.log(`${borghi.length} borghi/città nel catalogo.`)
  const anchors = borghi.map(b => ({ id: b.id, name: b.name, lat: b.lat, lon: b.lon, population: b.population }))

  const { built, skipped } = buildFromGpxFiles(files, { id, name, theme }, anchors)
  fs.rmSync(tmpDir, { recursive: true, force: true })

  console.log(`\n${built.config.name} [${built.config.id}]: ${(built.lengthM / 1000).toFixed(1)} km, ${built.tappe.length} tappe → ${built.quality!.status.toString().toUpperCase()}`)
  built.diagnostics.forEach(d => console.log(`  · ${d}`))
  if ((built.quality as { reasons: string[] }).reasons.length > 0) console.log(`  da rivedere: ${(built.quality as { reasons: string[] }).reasons.join('; ')}`)
  for (const t of built.tappe) console.log(`  ${String(t.ordinal).padStart(3)}. ${(t.lengthM / 1000).toFixed(1).padStart(5)} km  ${t.fromName ?? '?'} → ${t.toName ?? '?'}`)
  if (skipped.length > 0) { console.log(`\nFile scartati:`); skipped.forEach(s => console.log(`  ${s.filename}: ${s.reason}`)) }

  if (!process.argv.includes('--write')) { console.log('\n[DRY RUN] Nessuna scrittura.'); return }
  const minStatus = arg('min-status') ?? 'pronto'
  if (minStatus === 'pronto' && (built.quality as { status: string }).status !== 'pronto') {
    console.log(`\nSALTATO: stato ${(built.quality as { status: string }).status}. Usa --min-status da_rivedere per scriverlo comunque.`)
    return
  }
  const stats = await importCammino(supabase, built)
  console.log(`\nSCRITTO: ${JSON.stringify(stats)}`)
}

const isDirectRun = process.argv[1]?.endsWith('importFromGpx.ts')
if (isDirectRun) main().catch(err => { console.error(err); process.exit(1) })
