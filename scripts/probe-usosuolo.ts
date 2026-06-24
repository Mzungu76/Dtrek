/**
 * Probe script — Uso/copertura del suolo (ISPRA) WCS endpoint.
 *
 * Run once after populating lib/geo/datasetConfig.ts's USO_SUOLO_DATASET.baseUrl/coverageId
 * with a real endpoint, to confirm reachability, inspect the real DescribeCoverage response
 * (native CRS, resolution, extent — same geographic-CRS assumption as dtmClient.ts), and —
 * most importantly — resolve which class-code nomenclature the coverage actually serves
 * (raw Corine Land Cover level-3, a national reclass, or Copernicus HRL), the open question
 * blocking lib/tei/landCoverSurfaceMap.ts from being populated.
 *
 * Usage:
 *   npx tsx scripts/probe-usosuolo.ts [--bbox s,w,n,e]
 *
 * Default bbox is the Vernazza/Cinque Terre area (Liguria), same as the other probe scripts —
 * mixed terraced cropland/woodland/coastline, useful to sample a few distinct class codes at once.
 */

import { USO_SUOLO_DATASET } from '@/lib/geo/datasetConfig'
import { wcsDescribeCoverage } from '@/lib/geo/wcsClient'
import { fetchUsoSuoloTile, sampleLandCoverAtPoint } from '@/lib/usosuolo/usoSuoloClient'

const BBOX_IDX = process.argv.indexOf('--bbox')
const BBOX = BBOX_IDX !== -1 ? process.argv[BBOX_IDX + 1] : '44.10,9.65,44.15,9.70'

async function main() {
  console.log('--- USO_SUOLO_DATASET config (lib/geo/datasetConfig.ts) ---')
  console.log(JSON.stringify(USO_SUOLO_DATASET, null, 2))

  if (!USO_SUOLO_DATASET.baseUrl || !USO_SUOLO_DATASET.coverageId) {
    console.log(
      '\nUSO_SUOLO_DATASET.baseUrl/coverageId non sono ancora configurati — ' +
      'questo è lo stato corrente atteso finché un endpoint WCS reale non viene verificato ' +
      '(vedi Rischio #5 del piano di integrazione). Nulla da probare.',
    )
    return
  }

  console.log(`\n--- DescribeCoverage: ${USO_SUOLO_DATASET.baseUrl} (coverageId=${USO_SUOLO_DATASET.coverageId}) ---`)
  const describe = await wcsDescribeCoverage(USO_SUOLO_DATASET.baseUrl, USO_SUOLO_DATASET.coverageId)
  console.log(`(${describe.length} bytes)`)
  console.log(describe.slice(0, 1000))

  console.log(`\n--- GetCoverage su bbox=${BBOX} ---`)
  const tile = await fetchUsoSuoloTile(BBOX)
  if (!tile) {
    console.log(
      'fetchUsoSuoloTile ha restituito null — nessuna copertura per questo bbox, oppure ' +
      'risposta GeoTIFF non decodificabile. Comportamento atteso fuori dalla copertura del dataset, ' +
      'da non confondere con un endpoint mal configurato.',
    )
    return
  }

  console.log(`Tile ${tile.width}x${tile.height}px`)
  console.log(`bbox tile: ${JSON.stringify(tile.bbox)}`)

  const [s, w, n, e] = BBOX.split(',').map(Number)
  const centerLat = (s + n) / 2
  const centerLon = (w + e) / 2
  const sample = sampleLandCoverAtPoint(tile, centerLat, centerLon)
  console.log(`Campione al centro del bbox richiesto (${centerLat}, ${centerLon}): classCode=${sample}`)
  if (sample == null) {
    console.log('Punto centrale fuori dal bbox effettivo del tile restituito — verificare l\'allineamento tra bbox richiesto e risposta del server.')
  }

  const unique = new Set<number>()
  for (const v of tile.classCodes) unique.add(v)
  console.log(`\nCodici classe distinti nel tile (${unique.size}): ${[...unique].sort((a, b) => a - b).join(', ')}`)
  console.log(
    'Confrontare questi codici con la documentazione ISPRA reale del dataset per determinare la ' +
    'nomenclatura esatta (CLC raw 111-523, reclass nazionale, o Copernicus HRL 0-100), poi popolare ' +
    'lib/tei/landCoverSurfaceMap.ts di conseguenza.',
  )
}

main().catch(err => {
  console.error('Probe fallita:', err)
  process.exit(1)
})
