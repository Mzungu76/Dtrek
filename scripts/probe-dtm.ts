/**
 * Probe script — DTM 1m LiDAR (Piano Straordinario di Telerilevamento Ambientale) WCS endpoint.
 *
 * Run once after populating lib/geo/datasetConfig.ts's DTM_DATASET.baseUrl/coverageId with
 * a real endpoint, to confirm reachability, inspect the real DescribeCoverage response
 * (native CRS, resolution, extent — cross-check against slopeAspect.ts's geographic-vs-
 * projected CRS handling), and sanity check a sample slope/aspect against a known feature
 * for the same bbox.
 *
 * Usage:
 *   npx tsx scripts/probe-dtm.ts [--bbox s,w,n,e]
 *
 * Default bbox is the Vernazza/Cinque Terre area (Liguria), same as scripts/probe-pai.ts/
 * probe-psinsar.ts — steep terraced terrain, useful as a manual sanity check once real
 * data comes back.
 */

import { DTM_DATASET } from '@/lib/geo/datasetConfig'
import { wcsDescribeCoverage } from '@/lib/geo/wcsClient'
import { fetchDtmTile } from '@/lib/dtm/dtmClient'
import { sampleSlopeAspectAtPoint } from '@/lib/dtm/slopeAspect'

const BBOX_IDX = process.argv.indexOf('--bbox')
const BBOX = BBOX_IDX !== -1 ? process.argv[BBOX_IDX + 1] : '44.10,9.65,44.15,9.70'

async function main() {
  console.log('--- DTM_DATASET config (lib/geo/datasetConfig.ts) ---')
  console.log(JSON.stringify(DTM_DATASET, null, 2))

  if (!DTM_DATASET.baseUrl || !DTM_DATASET.coverageId) {
    console.log(
      '\nDTM_DATASET.baseUrl/coverageId non sono ancora configurati — ' +
      'questo è lo stato corrente atteso finché un endpoint WCS reale non viene verificato ' +
      '(vedi Rischio #4 del piano di integrazione: copertura PST nazionale parziale). Nulla da probare.',
    )
    return
  }

  console.log(`\n--- DescribeCoverage: ${DTM_DATASET.baseUrl} (coverageId=${DTM_DATASET.coverageId}) ---`)
  const describe = await wcsDescribeCoverage(DTM_DATASET.baseUrl, DTM_DATASET.coverageId)
  console.log(`(${describe.length} bytes)`)
  console.log(describe.slice(0, 1000))

  console.log(`\n--- GetCoverage su bbox=${BBOX} ---`)
  const tile = await fetchDtmTile(BBOX)
  if (!tile) {
    console.log(
      'fetchDtmTile ha restituito null — nessuna copertura LiDAR per questo bbox, oppure ' +
      'risposta GeoTIFF non decodificabile. Comportamento atteso per zone fuori dalla ' +
      'copertura PST, da non confondere con un endpoint mal configurato.',
    )
    return
  }

  console.log(`Tile ${tile.width}x${tile.height}px, cella ${tile.cellSizeXM.toFixed(2)}x${tile.cellSizeYM.toFixed(2)}m`)
  console.log(`bbox tile: ${JSON.stringify(tile.bbox)}`)

  const [s, w, n, e] = BBOX.split(',').map(Number)
  const centerLat = (s + n) / 2
  const centerLon = (w + e) / 2
  const sample = sampleSlopeAspectAtPoint(tile, centerLat, centerLon)
  console.log(`Campione al centro del bbox richiesto (${centerLat}, ${centerLon}): ${JSON.stringify(sample)}`)
  if (!sample) {
    console.log('Punto centrale fuori dal bbox effettivo del tile restituito — verificare l\'allineamento tra bbox richiesto e risposta del server.')
  }
}

main().catch(err => {
  console.error('Probe fallita:', err)
  process.exit(1)
})
