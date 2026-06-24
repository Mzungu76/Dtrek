/**
 * Probe script — PSInSAR (radar ground deformation velocity) WFS endpoint.
 *
 * Run once after populating lib/geo/datasetConfig.ts's PSINSAR_DATASET.baseUrl/
 * typeName with a real endpoint, to confirm reachability, inspect the real
 * attribute schema (cross-check against psinsarClient.ts's VELOCITY_FIELDS/
 * COHERENCE_FIELDS/SENSOR_FIELDS guesses), and sanity check a sample of mapped
 * points against an official PSInSAR viewer for the same bbox.
 *
 * Usage:
 *   npx tsx scripts/probe-psinsar.ts [--bbox s,w,n,e]
 *
 * Default bbox is the Vernazza/Cinque Terre area (Liguria), same as
 * scripts/probe-pai.ts — known slope-instability history, useful as a manual
 * sanity check once real data comes back.
 */

import { PSINSAR_DATASET } from '@/lib/geo/datasetConfig'
import { wfsGetCapabilities } from '@/lib/geo/wfsClient'
import { fetchPsinsarPoints } from '@/lib/psinsar/psinsarClient'

const BBOX_IDX = process.argv.indexOf('--bbox')
const BBOX = BBOX_IDX !== -1 ? process.argv[BBOX_IDX + 1] : '44.10,9.65,44.15,9.70'

async function main() {
  console.log('--- PSINSAR_DATASET config (lib/geo/datasetConfig.ts) ---')
  console.log(JSON.stringify(PSINSAR_DATASET, null, 2))

  if (!PSINSAR_DATASET.baseUrl || !PSINSAR_DATASET.typeName) {
    console.log(
      '\nPSINSAR_DATASET.baseUrl/typeName non sono ancora configurati — ' +
      'questo è lo stato corrente atteso finché un endpoint WFS reale non viene verificato ' +
      '(vedi Rischio #1 del piano di integrazione). Nulla da probare.',
    )
    return
  }

  console.log(`\n--- GetCapabilities: ${PSINSAR_DATASET.baseUrl} ---`)
  const caps = await wfsGetCapabilities(PSINSAR_DATASET.baseUrl)
  console.log(`(${caps.length} bytes)`)
  console.log(caps.includes(PSINSAR_DATASET.typeName)
    ? `typeName "${PSINSAR_DATASET.typeName}" trovato nella GetCapabilities.`
    : `ATTENZIONE: typeName "${PSINSAR_DATASET.typeName}" NON trovato nella GetCapabilities — verificare il nome esatto.`)

  console.log(`\n--- GetFeature su bbox=${BBOX} ---`)
  const points = await fetchPsinsarPoints(BBOX)
  console.log(`${points.length} punti mappati.`)
  for (const p of points.slice(0, 10)) {
    console.log(`  lat=${p.lat} lon=${p.lon} velocity=${p.velocityMmYear}mm/anno coherence=${p.coherence ?? '?'} sensor=${p.sensor ?? '?'}`)
  }
  if (points.length === 0) {
    console.log(
      '\nNota: 0 punti per questo bbox — verificare che il bbox sia corretto e che il dataset ' +
      'abbia copertura per questa zona prima di concludere che il typeName sia sbagliato.',
    )
  }
}

main().catch(err => {
  console.error('Probe fallita:', err)
  process.exit(1)
})
