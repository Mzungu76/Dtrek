/**
 * Probe script — DTM backend (OpenTopography Global DEM REST API, EU_DTM dataset, after the
 * pivot off TINITALY/WCS — see lib/dtm/openTopographyClient.ts's header comment).
 *
 * Run once OPENTOPOGRAPHY_API_KEY is set (free key: portal.opentopography.org/requestService
 * ?service=other) to confirm reachability, inspect a real response, and sanity check a sample
 * slope/aspect against a known feature for the same bbox. This sandbox cannot reach
 * portal.opentopography.org (policy-denied egress) — run this from an environment with real
 * network access (local dev, or the deployed app) with a real key.
 *
 * Usage:
 *   npx tsx scripts/probe-dtm.ts [--bbox s,w,n,e]
 *
 * Default bbox is the Vernazza/Cinque Terre area (Liguria), same as scripts/probe-pai.ts/
 * probe-psinsar.ts — steep terraced terrain, useful as a manual sanity check.
 */

import { fetchDtmTile, DtmUnavailableError } from '@/lib/dtm/dtmClient'
import { sampleSlopeAspectAtPoint } from '@/lib/dtm/slopeAspect'

const BBOX_IDX = process.argv.indexOf('--bbox')
const BBOX = BBOX_IDX !== -1 ? process.argv[BBOX_IDX + 1] : '44.10,9.65,44.15,9.70'

async function main() {
  console.log(`OPENTOPOGRAPHY_API_KEY: ${process.env.OPENTOPOGRAPHY_API_KEY ? 'set' : 'NOT SET'}`)

  let tile
  try {
    tile = await fetchDtmTile(BBOX)
  } catch (err) {
    if (err instanceof DtmUnavailableError) {
      console.log(`\n${err.message}`)
      return
    }
    throw err
  }

  if (!tile) {
    console.log(
      'fetchDtmTile ha restituito null — nessuna copertura DTM per questo bbox, risposta ' +
      'GeoTIFF non decodificabile, oppure rate limit raggiunto (50 chiamate/24h per chiavi ' +
      'non accademiche). Comportamento atteso per zone fuori dalla copertura del DEM, da non ' +
      'confondere con una chiave mal configurata.',
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
