/**
 * Probe script — Uso/copertura del suolo (ISPRA Corine Land Cover) WFS endpoint.
 *
 * Run once after populating lib/geo/datasetConfig.ts's USO_SUOLO_DATASET.baseUrl/typeName
 * with a real endpoint, to confirm reachability and inspect the real attribute schema
 * (cross-check against lib/usosuolo/usoSuoloClient.ts's CLASS_CODE_FIELDS field-name guesses).
 *
 * Usage:
 *   npx tsx scripts/probe-usosuolo.ts [--bbox s,w,n,e]
 *
 * Default bbox is the Vernazza/Cinque Terre area (Liguria), same as the other probe scripts —
 * mixed terraced cropland/woodland/coastline, useful to sample a few distinct class codes at once.
 */

import { USO_SUOLO_DATASET } from '@/lib/geo/datasetConfig'
import { wfsGetCapabilities } from '@/lib/geo/wfsClient'
import { fetchUsoSuoloTile, sampleLandCoverAtPoint } from '@/lib/usosuolo/usoSuoloClient'
import { landCoverCodeToSurface } from '@/lib/tei/landCoverSurfaceMap'

const BBOX_IDX = process.argv.indexOf('--bbox')
const BBOX = BBOX_IDX !== -1 ? process.argv[BBOX_IDX + 1] : '44.10,9.65,44.15,9.70'

async function main() {
  console.log('--- USO_SUOLO_DATASET config (lib/geo/datasetConfig.ts) ---')
  console.log(JSON.stringify(USO_SUOLO_DATASET, null, 2))

  if (!USO_SUOLO_DATASET.baseUrl || !USO_SUOLO_DATASET.typeName) {
    console.log(
      '\nUSO_SUOLO_DATASET.baseUrl/typeName non sono ancora configurati — ' +
      'questo è lo stato corrente atteso finché un endpoint WFS reale non viene verificato. ' +
      'Nulla da probare.',
    )
    return
  }

  console.log(`\n--- GetCapabilities: ${USO_SUOLO_DATASET.baseUrl} ---`)
  const caps = await wfsGetCapabilities(USO_SUOLO_DATASET.baseUrl)
  console.log(`(${caps.length} bytes)`)
  console.log(caps.includes(USO_SUOLO_DATASET.typeName)
    ? `typeName "${USO_SUOLO_DATASET.typeName}" trovato nella GetCapabilities.`
    : `ATTENZIONE: typeName "${USO_SUOLO_DATASET.typeName}" NON trovato nella GetCapabilities — verificare il nome esatto.`)

  console.log(`\n--- GetFeature su bbox=${BBOX} ---`)
  const tile = await fetchUsoSuoloTile(BBOX)
  if (!tile) {
    console.log('fetchUsoSuoloTile ha restituito null — richiesta fallita o non decodificabile.')
    return
  }

  console.log(`${tile.features.length} poligoni CLC nel bbox.`)
  for (const f of tile.features.slice(0, 10)) {
    console.log(`  classCode=${f.classCode} -> surface=${landCoverCodeToSurface(f.classCode)}`)
  }
  if (tile.features.some(f => f.classCode == null)) {
    console.log(
      '\nNota: alcuni poligoni hanno classCode null — significa che nessun campo noto ' +
      'in lib/usosuolo/usoSuoloClient.ts (CLASS_CODE_FIELDS) ha trovato un match. Ispezionare le ' +
      'properties raw del GetFeature e aggiungere il nome del campo reale a CLASS_CODE_FIELDS.',
    )
  }

  const [s, w, n, e] = BBOX.split(',').map(Number)
  const centerLat = (s + n) / 2
  const centerLon = (w + e) / 2
  const sample = sampleLandCoverAtPoint(tile, centerLat, centerLon)
  console.log(`\nCampione al centro del bbox richiesto (${centerLat}, ${centerLon}): classCode=${sample} -> surface=${landCoverCodeToSurface(sample)}`)
}

main().catch(err => {
  console.error('Probe fallita:', err)
  process.exit(1)
})
