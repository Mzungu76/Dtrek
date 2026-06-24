/**
 * Probe script — Rete Natura 2000 (SIC/ZSC/ZPS) WFS endpoint.
 *
 * Run once after populating lib/geo/datasetConfig.ts's NATURA2000_DATASET.baseUrl/
 * typeName with a real endpoint, to confirm reachability and inspect the real
 * attribute schema (cross-check against lib/natura2000/natura2000Client.ts's
 * SITE_CODE_FIELDS/SITE_NAME_FIELDS/DESIGNATION_FIELDS field-name guesses).
 *
 * Usage:
 *   npx tsx scripts/probe-natura2000.ts [--bbox s,w,n,e]
 *
 * Default bbox is the Cinque Terre area (Liguria) — overlaps the Parco Nazionale
 * delle Cinque Terre / area marina protetta, useful as a manual sanity check
 * once real data comes back.
 */

import { NATURA2000_DATASET } from '@/lib/geo/datasetConfig'
import { wfsGetCapabilities } from '@/lib/geo/wfsClient'
import { fetchNatura2000Polygons } from '@/lib/natura2000/natura2000Client'

const BBOX_IDX = process.argv.indexOf('--bbox')
const BBOX = BBOX_IDX !== -1 ? process.argv[BBOX_IDX + 1] : '44.10,9.65,44.15,9.70'

async function main() {
  console.log('--- NATURA2000_DATASET config (lib/geo/datasetConfig.ts) ---')
  console.log(JSON.stringify(NATURA2000_DATASET, null, 2))

  if (!NATURA2000_DATASET.baseUrl || !NATURA2000_DATASET.typeName) {
    console.log(
      '\nNATURA2000_DATASET.baseUrl/typeName non sono ancora configurati — ' +
      'questo è lo stato corrente atteso finché un endpoint WFS reale non viene verificato ' +
      '(vedi Rischio #1 del piano di integrazione). Nulla da probare.',
    )
    return
  }

  console.log(`\n--- GetCapabilities: ${NATURA2000_DATASET.baseUrl} ---`)
  const caps = await wfsGetCapabilities(NATURA2000_DATASET.baseUrl)
  console.log(`(${caps.length} bytes)`)
  console.log(caps.includes(NATURA2000_DATASET.typeName)
    ? `typeName "${NATURA2000_DATASET.typeName}" trovato nella GetCapabilities.`
    : `ATTENZIONE: typeName "${NATURA2000_DATASET.typeName}" NON trovato nella GetCapabilities — verificare il nome esatto.`)

  console.log(`\n--- GetFeature su bbox=${BBOX} ---`)
  const features = await fetchNatura2000Polygons(BBOX)
  console.log(`${features.length} feature mappate.`)
  for (const f of features.slice(0, 10)) {
    console.log(`  ${f.designation} ${f.siteCode ?? '?'} — ${f.siteName ?? '?'} — attributi raw: ${JSON.stringify(f.rawAttributes).slice(0, 200)}`)
  }
  if (features.some(f => f.designation === 'unknown')) {
    console.log(
      '\nNota: alcune feature hanno designation "unknown" — significa che nessun campo noto ' +
      'in lib/natura2000/natura2000Client.ts ha trovato un match. Ispezionare rawAttributes sopra ' +
      'e aggiungere il nome del campo reale a DESIGNATION_FIELDS.',
    )
  }
}

main().catch(err => {
  console.error('Probe fallita:', err)
  process.exit(1)
})
