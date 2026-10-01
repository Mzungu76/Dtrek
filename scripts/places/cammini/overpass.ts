// Client Overpass condiviso dagli script dei cammini: più endpoint, più giri con attesa crescente,
// e il campo `remark` (Overpass risponde 200 anche quando va in timeout/memoria).

export const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]
const ROUNDS = 3

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export async function runOverpass<T = { elements?: unknown[] }>(query: string): Promise<T> {
  let lastError: unknown
  for (let round = 1; round <= ROUNDS; round++) {
    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'dtrek-places-etl/1.0' },
          body: `data=${encodeURIComponent(query)}`,
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
    if (round < ROUNDS) { console.warn(`Attendo ${round * 30}s prima di riprovare…`); await sleep(round * 30_000) }
  }
  throw new Error(`Tutti gli endpoint Overpass hanno fallito dopo ${ROUNDS} giri. Ultimo errore: ${lastError instanceof Error ? lastError.message : lastError}`)
}
