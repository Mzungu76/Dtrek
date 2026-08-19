// DTM raster client (after the pivot off TINITALY/WCS — see lib/dtm/openTopographyClient.ts).
// Two distinct failure modes, not one: (1) OPENTOPOGRAPHY_API_KEY not set at all is a static
// fact, known before any network call — throws DtmUnavailableError, same contract as
// PaiUnavailableError; (2) key set but no coverage for this specific
// bbox (e.g. the API answers with an error for this dataset/area) is a per-request fact —
// returns null, never throws, because there's nothing anomalous to report, it's the normal
// "no DTM here". fetchDtmTile is the single network-aware boundary that folds every flavor of
// (2) — HTTP error, rate limit, undecodable GeoTIFF — into null. Callers that want to tell a
// transient rate limit apart from genuine no-coverage (DTREK-AUDIT.md P1 #11) can pass
// `onUnavailable` — purely informational, doesn't change the null-never-throws contract above.
import { fetchGlobalDem, OpenTopographyApiError } from '@/lib/dtm/openTopographyClient'
import { parseDtmGeoTiff } from '@/lib/dtm/slopeAspect'
import { isCircuitOpen, recordFailure, recordSuccess } from '@/lib/geo/circuitBreaker'

// Breaker key for portal.opentopography.org — same reasoning as geologiaClient.ts's
// 'geologia-wms' breaker: repeated failures shouldn't each wait out the full fetch timeout.
const BREAKER_KEY = 'dtm-opentopography'

export class DtmUnavailableError extends Error {}

// DTREK-AUDIT.md P1 #11 — 'rate_limited' (quota 50 chiamate/24h esaurita, o breaker aperto per
// fallimenti recenti: entrambi transitori, si risolvono da soli) vs 'no_coverage' (bbox
// genuinamente fuori dal dataset EU_DTM, o errore diverso: non si risolve ritentando più tardi).
// Puramente informativo via il callback opzionale `onUnavailable` sotto — non cambia il
// contratto esistente di fetchDtmTile (torna sempre null per questi casi, mai un throw), per non
// rompere i chiamanti tolleranti che oggi si aspettano "mai un'eccezione qui" (es.
// lib/routeBuilder/resolveTrack.ts:108, lib/dtm/graphElevation.ts).
export type DtmUnavailableReason = 'rate_limited' | 'no_coverage'

export interface FetchDtmTileOptions {
  onUnavailable?: (reason: DtmUnavailableReason) => void
}

/**
 * Pura, testabile senza mock di rete — HTTP 429 è l'unico segnale affidabile di rate limit che
 * OpenTopography restituisce (vedi openTopographyClient.ts); ogni altro fallimento (bbox fuori
 * copertura, chiave non valida, timeout, GeoTIFF non decodificabile) è 'no_coverage': non c'è
 * modo di distinguerli ulteriormente da qui, ma nessuno di questi si risolve da solo ritentando
 * più tardi come invece fa il rate limit.
 */
export function classifyDtmFailure(e: unknown): DtmUnavailableReason {
  return e instanceof OpenTopographyApiError && e.status === 429 ? 'rate_limited' : 'no_coverage'
}

export interface DtmTile {
  elevations: Float64Array
  width: number
  height: number
  cellSizeXM: number
  cellSizeYM: number // always in meters, derived from degrees or native units depending on the response CRS
  bbox: { minLat: number; maxLat: number; minLon: number; maxLon: number }
}

// Alzato da 8s a 20s: gli 8s originali (motivati da "tei-dtm deve fallire in fretta") si sono
// rivelati in produzione troppo stretti per una risposta REALE e riuscita di OpenTopography (log
// confermato: "The operation was aborted due to timeout" su ogni tentativo, mai un vero errore
// HTTP) — l'API genera/ritaglia il DEM al volo e può richiedere più di 8s anche quando funziona
// correttamente. 20s resta ampiamente entro il budget di ogni chiamante attuale (tei-dtm:
// maxDuration 30s: route-search/resolve, route-import, route-build: maxDuration 60s).
const DTM_TIMEOUT_MS = 20000

export async function fetchDtmTile(bbox: string, opts: FetchDtmTileOptions = {}): Promise<DtmTile | null> {
  if (!process.env.OPENTOPOGRAPHY_API_KEY) {
    throw new DtmUnavailableError('OPENTOPOGRAPHY_API_KEY not set (see .env.example)')
  }

  // Se il breaker è aperto (3+ fallimenti reali consecutivi entro l'ultimo minuto — vedi
  // lib/geo/circuitBreaker.ts), questa chiamata torna null SENZA nemmeno provare a contattare
  // OpenTopography — un punto cieco reale: senza questo log, un breaker aperto è indistinguibile
  // da un fallimento appena avvenuto, e su un'istanza Vercel "calda" riusata tra richieste
  // ravvicinate può far sembrare che ogni tentativo fallisca dal vivo quando in realtà i
  // tentativi reali sono stati solo i primi 3.
  if (isCircuitOpen(BREAKER_KEY)) {
    console.warn(`[dtm] circuit breaker aperto per ${BREAKER_KEY} — richiesta per bbox ${bbox} saltata senza contattare OpenTopography`)
    opts.onUnavailable?.('rate_limited')
    return null
  }

  try {
    const buf = await fetchGlobalDem(bbox, { timeoutMs: DTM_TIMEOUT_MS })
    const tile = await parseDtmGeoTiff(buf)
    recordSuccess(BREAKER_KEY)
    return tile
  } catch (e) {
    // Non cambia il contratto (resta "nessuna copertura", mai un errore per il chiamante) — solo
    // visibilità sul motivo reale, altrimenti indistinguibile dall'esterno tra bbox genuinamente
    // fuori copertura, rate limit (50 chiamate/24h per chiavi non accademiche, vedi
    // scripts/probe-dtm.ts), chiave non valida o timeout.
    const reason = classifyDtmFailure(e)
    console.warn(`[dtm] fetchDtmTile fallito per bbox ${bbox} (${reason}):`, e instanceof Error ? e.message : e)
    recordFailure(BREAKER_KEY)
    opts.onUnavailable?.(reason)
    return null
  }
}
