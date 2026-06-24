/**
 * Probe script — PAI (Piano di Assetto Idrogeologico) WFS endpoint.
 *
 * Run once after populating lib/geo/datasetConfig.ts's PAI_DATASET.baseUrl/typeName
 * with a real endpoint, to confirm reachability, inspect the real attribute schema
 * (cross-check against lib/pai/paiAttributeMap.ts's field-name guesses), and sanity
 * check a sample of mapped features against an official PAI map for the same bbox.
 *
 * Usage:
 *   npx tsx scripts/probe-pai.ts [--bbox s,w,n,e]
 *
 * Default bbox is the Vernazza/Cinque Terre area (Liguria) — known flash-flood/
 * landslide history (2011 alluvione), useful as a manual sanity check once real
 * data comes back.
 */

import { PAI_DATASET } from '@/lib/geo/datasetConfig'
import { wfsGetCapabilities } from '@/lib/geo/wfsClient'
import { fetchPaiPolygons } from '@/lib/pai/paiClient'

const BBOX_IDX = process.argv.indexOf('--bbox')
const BBOX = BBOX_IDX !== -1 ? process.argv[BBOX_IDX + 1] : '44.10,9.65,44.15,9.70'

async function main() {
  console.log('--- PAI_DATASET config (lib/geo/datasetConfig.ts) ---')
  console.log(JSON.stringify(PAI_DATASET, null, 2))

  if (!PAI_DATASET.baseUrl || !PAI_DATASET.typeName) {
    console.log(
      '\nPAI_DATASET.baseUrl/typeName non sono ancora configurati — ' +
      'questo è lo stato corrente atteso finché un endpoint WFS reale non viene verificato ' +
      '(vedi Rischio #1 del piano di integrazione). Nulla da probare.',
    )
    return
  }

  console.log(`\n--- GetCapabilities: ${PAI_DATASET.baseUrl} ---`)
  const caps = await wfsGetCapabilities(PAI_DATASET.baseUrl)
  console.log(`(${caps.length} bytes)`)
  console.log(caps.includes(PAI_DATASET.typeName)
    ? `typeName "${PAI_DATASET.typeName}" trovato nella GetCapabilities.`
    : `ATTENZIONE: typeName "${PAI_DATASET.typeName}" NON trovato nella GetCapabilities — verificare il nome esatto.`)

  console.log(`\n--- GetFeature su bbox=${BBOX} ---`)
  const features = await fetchPaiPolygons(BBOX)
  console.log(`${features.length} feature mappate.`)
  for (const f of features.slice(0, 10)) {
    console.log(`  ${f.riskType} ${f.riskClass} — autorità: ${f.sourceAuthority ?? '?'} — attributi raw: ${JSON.stringify(f.rawAttributes).slice(0, 200)}`)
  }
  if (features.some(f => f.riskClass === 'unknown')) {
    console.log(
      '\nNota: alcune feature hanno riskClass "unknown" — significa che nessun campo noto ' +
      'in lib/pai/paiAttributeMap.ts ha trovato un match. Ispezionare rawAttributes sopra ' +
      'e aggiungere il nome del campo reale a LANDSLIDE_FIELDS/FLOOD_FIELDS/AUTHORITY_FIELDS.',
    )
  }
}

main().catch(err => {
  console.error('Probe fallita:', err)
  process.exit(1)
})
