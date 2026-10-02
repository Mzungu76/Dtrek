import { createClient } from '@supabase/supabase-js'
import { buildServicesQuery, servicesAlongTrack, servicesBbox } from '../../../lib/cammini/services'
import { runOverpass } from './overpass'

// Precarica i servizi (acqua, cibo, negozi, alloggi, trasporti, farmacie) di tutte le tappe dei cammini da OpenStreetMap
// e li salva in dtrek_cammino_tappe.services, come i luoghi: così nessuno aspetta la prima lettura (docs/piano-cammini.md,
// Fase E). Di default dry-run: scrive solo con --write. Salta le tappe già lette e recenti, salvo --refresh.
//
// Uso:
//   npx tsx scripts/places/cammini/prefetch-services.ts [--cammino <id>] [--limit N] [--refresh] [--write]

const RADIUS_M = 600
const PAUSE_MS = 3000
const MAX_AGE_MS = 90 * 24 * 3600 * 1000

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined }
const flag = (n: string) => process.argv.includes(`--${n}`)
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function main() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Servono SUPABASE_URL e SUPABASE_SERVICE_KEY (o SUPABASE_SERVICE_ROLE_KEY).')
  const supabase = createClient(url, key)
  const write = flag('write'), refresh = flag('refresh')
  const only = arg('cammino'), limit = arg('limit') ? Number(arg('limit')) : Infinity

  type Row = { id: string; cammino_id: string; ordinal: number; polyline: [number, number][]; services_at: string | null; services: unknown[] | null }
  const rows: Row[] = []
  for (let from = 0; ; from += 200) {
    let q = supabase.from('dtrek_cammino_tappe').select('id, cammino_id, ordinal, polyline, services_at, services').order('cammino_id').order('ordinal').range(from, from + 199)
    if (only) q = q.eq('cammino_id', only)
    const { data, error } = await q
    if (error) throw error
    rows.push(...((data ?? []) as Row[]))
    if (!data || data.length < 200) break
  }

  const stale = (r: Row) => !r.services_at || !Array.isArray(r.services) || Date.now() - new Date(r.services_at).getTime() > MAX_AGE_MS
  const todo = rows.filter(r => r.polyline?.length >= 2 && (refresh || stale(r))).slice(0, limit)
  console.log(`Tappe nel catalogo: ${rows.length} · da leggere: ${todo.length} · modalità: ${write ? 'WRITE' : 'dry-run'}`)

  let ok = 0, failed = 0, items = 0
  for (const [i, r] of todo.entries()) {
    try {
      const res = await runOverpass<{ elements?: unknown[] }>(buildServicesQuery(servicesBbox(r.polyline, RADIUS_M)))
      const services = servicesAlongTrack((res.elements ?? []) as never[], r.polyline, RADIUS_M)
      items += services.length
      const by = services.reduce<Record<string, number>>((m, s) => ({ ...m, [s.category]: (m[s.category] ?? 0) + 1 }), {})
      console.log(`[${i + 1}/${todo.length}] ${r.cammino_id} tappa ${r.ordinal}: ${services.length} servizi ${JSON.stringify(by)}`)
      if (write) {
        const { error } = await supabase.from('dtrek_cammino_tappe').update({ services, services_at: new Date().toISOString() }).eq('id', r.id)
        if (error) throw error
      }
      ok++
    } catch (e) {
      failed++
      console.warn(`[${i + 1}/${todo.length}] ${r.cammino_id} tappa ${r.ordinal}: NON letta — ${e instanceof Error ? e.message : e}`)
    }
    await sleep(PAUSE_MS)
  }
  console.log(`\nFatto: ${ok} tappe ${write ? 'salvate' : 'lette (dry-run, nulla scritto)'}, ${failed} non lette, ${items} servizi in totale.`)
  if (failed > 0) process.exitCode = 1
}

main().catch(e => { console.error(e); process.exit(1) })
