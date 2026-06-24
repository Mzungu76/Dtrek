/**
 * Probe script — Geologia CARG (Carta Geologica d'Italia) WMS endpoint.
 *
 * Run once after populating lib/geo/datasetConfig.ts's GEOLOGIA_DATASET.baseUrl/layerName
 * with a real endpoint, to confirm reachability, inspect the real GetFeatureInfo response
 * shape (cross-check against lib/geologia/geologiaClient.ts's LITHOLOGY_FIELDS guesses and
 * the GeoServer-style features[0].properties assumption), and resolve the open protocol
 * question noted in lib/geo/datasetConfig.ts (possible WMS-only, no vector WFS for the
 * lithology attribute table).
 *
 * Usage:
 *   npx tsx scripts/probe-geologia.ts [--lat 44.12] [--lon 9.68]
 *
 * Default point is inside the Vernazza/Cinque Terre bbox used by probe-pai.ts/probe-dtm.ts/
 * probe-psinsar.ts, for a consistent manual cross-check across all probes.
 */

import { GEOLOGIA_DATASET } from '@/lib/geo/datasetConfig'
import { wmsGetCapabilities } from '@/lib/geo/wmsClient'
import { fetchGeologiaAtPoint } from '@/lib/geologia/geologiaClient'

const LAT_IDX = process.argv.indexOf('--lat')
const LON_IDX = process.argv.indexOf('--lon')
const LAT = LAT_IDX !== -1 ? Number(process.argv[LAT_IDX + 1]) : 44.12
const LON = LON_IDX !== -1 ? Number(process.argv[LON_IDX + 1]) : 9.68

async function main() {
  console.log('--- GEOLOGIA_DATASET config (lib/geo/datasetConfig.ts) ---')
  console.log(JSON.stringify(GEOLOGIA_DATASET, null, 2))

  if (!GEOLOGIA_DATASET.baseUrl || !GEOLOGIA_DATASET.layerName) {
    console.log(
      '\nGEOLOGIA_DATASET.baseUrl/layerName non sono ancora configurati — ' +
      'questo è lo stato corrente atteso finché un endpoint WMS reale non viene verificato ' +
      '(vedi Rischio #5 del piano di integrazione: protocollo CARG incerto, WMS-only vs WFS). Nulla da probare.',
    )
    return
  }

  console.log(`\n--- GetCapabilities: ${GEOLOGIA_DATASET.baseUrl} ---`)
  const caps = await wmsGetCapabilities(GEOLOGIA_DATASET.baseUrl)
  console.log(`(${caps.length} bytes)`)
  console.log(caps.includes(GEOLOGIA_DATASET.layerName)
    ? `layerName "${GEOLOGIA_DATASET.layerName}" trovato nella GetCapabilities.`
    : `ATTENZIONE: layerName "${GEOLOGIA_DATASET.layerName}" NON trovato nella GetCapabilities — verificare il nome esatto. ` +
      'Se la GetCapabilities espone anche un WFS per lo stesso layer, valutare lo swap suggerito in geologiaClient.ts.')

  console.log(`\n--- GetFeatureInfo a (${LAT}, ${LON}) ---`)
  const feature = await fetchGeologiaAtPoint(LAT, LON)
  if (!feature) {
    console.log(
      'fetchGeologiaAtPoint ha restituito null — nessun dato litologico per questo punto, oppure ' +
      'risposta GetFeatureInfo vuota/non riconosciuta. Comportamento atteso fuori dalla copertura CARG, ' +
      'da non confondere con un endpoint mal configurato.',
    )
    return
  }

  console.log(`lithologyCode: ${feature.lithologyCode ?? '(non trovato in LITHOLOGY_FIELDS)'}`)
  console.log(`rockfallRisk: ${feature.rockfallRisk} (sempre "unknown" finché lithologyRiskMap.ts non viene popolata con la legenda ISPRA reale)`)
  console.log(`rawProperties: ${JSON.stringify(feature.rawProperties).slice(0, 500)}`)
  if (feature.lithologyCode == null) {
    console.log(
      '\nNota: lithologyCode è null pur con rawProperties non vuote — ispezionare rawProperties sopra ' +
      'e aggiungere il nome del campo reale a LITHOLOGY_FIELDS in lib/geologia/geologiaClient.ts.',
    )
  }
}

main().catch(err => {
  console.error('Probe fallita:', err)
  process.exit(1)
})
