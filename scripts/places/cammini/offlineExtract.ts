import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { parseOsmXml } from '../../../lib/cammini/osmXml'

// Estrae dai dati OSM dell'Italia (un estratto .osm.pbf scaricato una volta, es. da Geofabrik) tutte le
// relazioni a piedi (route=hiking|foot) con la loro geometria completa, SENZA toccare Overpass: una sola
// chiamata a `osmium tags-filter` (verificata — vedi lib/__tests__/osmXml.test.ts — con osmium-tool 1.16),
// che risolve da sola le sotto-relazioni e le way con le coordinate dei nodi. Il risultato è un unico file
// "relazioni + way" che `import-registry.ts --shared-fixture <file>` usa al posto del download live per
// TUTTI i cammini del registro (ognuno pesca le sue relazioni per nome/id, come fa con Overpass).
//
// Uso:
//   1. Scarica una volta l'estratto Italia, es.:
//        curl -LO https://download.geofabrik.de/europe/italy-latest.osm.pbf
//   2. npx tsx scripts/places/cammini/offlineExtract.ts --pbf italy-latest.osm.pbf --out /tmp/italy-routes.json
//   3. npx tsx scripts/places/cammini/import-registry.ts --id tutti --shared-fixture /tmp/italy-routes.json
//
// Il file .pbf può restare dov'è e essere riusato: l'estrazione (passo 2) richiede solo `osmium`
// (`apt install osmium-tool` / `brew install osmium-tool`) e qualche minuto per tutta l'Italia.

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

export function buildOsmiumArgs(osmFile: string, outFile: string): string[] {
  // route=hiking,foot: osmium risolve da sé le way e i nodi (geometria) delle relazioni che matchano,
  // comprese le sotto-relazioni — verificato a mano, non è un comportamento indovinato dalla doc.
  return ['tags-filter', '--overwrite', '-o', outFile, '-f', 'osm', osmFile, 'r/route=hiking,foot']
}

function main() {
  const pbf = arg('pbf')
  const out = arg('out')
  if (!pbf || !out) { console.error('Uso: --pbf <italy-latest.osm.pbf> --out <file.json> [--keep-osm <file.osm>]'); process.exit(1) }
  if (!fs.existsSync(pbf)) { console.error(`File non trovato: ${pbf}`); process.exit(1) }

  const osmOut = arg('keep-osm') ?? path.join(os.tmpdir(), `cammini-routes-${Date.now()}.osm`)
  const osmiumArgs = buildOsmiumArgs(pbf, osmOut)
  console.log(`osmium ${osmiumArgs.join(' ')}`)
  try {
    execFileSync('osmium', osmiumArgs, { stdio: 'inherit' })
  } catch (err) {
    console.error('osmium non è disponibile o ha fallito. Installalo con `apt install osmium-tool` (Linux) o `brew install osmium-tool` (macOS).')
    throw err
  }

  console.log('Leggo e converto l\'estratto…')
  const xml = fs.readFileSync(osmOut, 'utf8')
  const { relations, ways } = parseOsmXml(xml)
  console.log(`${relations.length} relazioni a piedi, ${ways.size} way con geometria.`)

  fs.writeFileSync(out, JSON.stringify({ relations, ways: Array.from(ways.entries()) }))
  console.log(`Scritto ${out}. Usa: import-registry.ts --id tutti --shared-fixture ${out}`)

  if (!arg('keep-osm')) fs.rmSync(osmOut, { force: true })
}

const isDirectRun = process.argv[1]?.endsWith('offlineExtract.ts')
if (isDirectRun) main()
