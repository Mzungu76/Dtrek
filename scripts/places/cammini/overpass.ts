// Client Overpass condiviso dagli script dei cammini: più endpoint a rotazione, più giri con attesa
// crescente + jitter, timeout per richiesta, e il campo `remark` (Overpass risponde 200 anche quando
// va in timeout/memoria). Un 504 non deve bloccare il processo per ore: ogni richiesta ha il suo limite.
import { backoffMs, endpointOrder } from '../../../lib/cammini/overpassPlan'

export const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]
const ROUNDS = 4
/** Tempo massimo di attesa per una singola richiesta (il [timeout:300] della query + margine). */
const REQUEST_TIMEOUT_MS = 330_000

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
let startOffset = 0

export async function runOverpass<T = { elements?: unknown[] }>(query: string): Promise<T> {
  let lastError: unknown
  for (let round = 1; round <= ROUNDS; round++) {
    for (const endpoint of endpointOrder(OVERPASS_ENDPOINTS, round, startOffset)) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'dtrek-places-etl/1.0' },
          body: `data=${encodeURIComponent(query)}`,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json() as T & { elements?: unknown[]; remark?: string }
        if (json.remark && !(json.elements?.length)) throw new Error(`remark: ${json.remark}`)
        return json
      } catch (err) {
        lastError = err
        console.warn(`Overpass fallito su ${endpoint} (giro ${round}/${ROUNDS}): ${err instanceof Error ? err.message : err}`)
      }
    }
    // Il prossimo `runOverpass` parte da un altro endpoint: non si insiste su quelli già lenti.
    startOffset = (startOffset + 1) % OVERPASS_ENDPOINTS.length
    if (round < ROUNDS) { const ms = backoffMs(round, Math.random()); console.warn(`Attendo ${Math.round(ms / 1000)}s prima di riprovare…`); await sleep(ms) }
  }
  throw new Error(`Tutti gli endpoint Overpass hanno fallito dopo ${ROUNDS} giri. Ultimo errore: ${lastError instanceof Error ? lastError.message : lastError}`)
}
