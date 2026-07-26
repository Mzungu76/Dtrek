/**
 * Pre-riscaldamento manuale della cache `trails` per una singola cella (bbox piccolo, es. ~0.25°)
 * — pensato per essere chiamato ripetutamente, una cella alla volta, componendo una griglia su una
 * regione (Trentino-Alto Adige come primo caso reale, vedi conversazione), PRIMA che un utente
 * reale ci cerchi qualcosa. Stessa identica risoluzione (Overpass, quota stimata, mai il DTM reale)
 * già usata dalla ricerca interattiva "Esistenti" (lib/routeBuilder/searchSteps.ts) e da "Percorsi
 * per te" (generateRecommendations.ts) — qui semplicemente anticipata, invece di aspettare che sia
 * il primo utente di quella zona a pagarne il costo la prima volta.
 *
 * Tetto di sicurezza: si ferma da solo (nessuna scrittura) se `trails` ha già raggiunto
 * MAX_TRAILS_CACHE_ROWS — non una stima, un controllo reale fatto ad ogni chiamata, così uno
 * scaldamento troppo ambizioso non può mai avvicinare il limite di spazio del piano Supabase
 * gratuito.
 *
 * Resumibile per costruzione: i candidati già in cache vengono saltati (getCachedTrailsInBbox),
 * quindi richiamare la STESSA cella una seconda volta costa pochissimo e completa solo quanto non
 * si è fatto in tempo a risolvere nella chiamata precedente (tetto morbido di 45s, stesso principio
 * di step/search-resolve/route.ts).
 *
 * Protezione: richiede ?secret=<prime 32 char di SUPABASE_SERVICE_ROLE_KEY> — stessa convenzione di
 * app/api/admin/seed-n2000/route.ts.
 * Chiama: GET /api/admin/prewarm-trails?secret=<secret>&minLat=..&minLon=..&maxLat=..&maxLon=..
 *         &dry=true per una stima senza scrivere nulla (solo conteggio candidati nella cella).
 */
import { NextRequest, NextResponse } from 'next/server'
import { timingSafeCompare } from '@/lib/timingSafeCompare'
import { queryHikingRelationsInBbox, type HikingRouteCandidate } from '@/lib/overpassTrails'
import { resolveTrackForCandidate } from '@/lib/routeBuilder/resolveTrack'
import { cacheResolvedTrail } from '@/lib/routeBuilder/searchSteps'
import { getCachedTrailsInBbox, getTrailsCacheRowCount, MAX_TRAILS_CACHE_ROWS } from '@/lib/trailsCache'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Margine sotto il tetto duro di 60s della piattaforma — stesso principio già applicato ovunque in
// questo modulo (search-resolve, search-find): rispondere con il progresso fatto finora prima del
// kill, invece di perdere tutto il lavoro già scritto in cache in questa chiamata.
const SOFT_DEADLINE_MS = 45_000

// Quanti candidati risolvere al massimo per chiamata — una cella densa (zone alpine, molte
// relazioni CAI/SAT) potrebbe averne più del tempo disponibile; il resto resta per la chiamata
// successiva sulla stessa cella (i già cachati vengono saltati, vedi sopra).
const MAX_PER_CALL = 60

function isValidCoord(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

export async function GET(req: NextRequest) {
  try {
    return await handleGet(req)
  } catch (e) {
    console.error('[admin/prewarm-trails] Errore imprevisto:', e)
    return NextResponse.json({ error: 'Errore interno' }, { status: 500 })
  }
}

async function handleGet(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url)

  const serviceKey = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  const expected = serviceKey.slice(0, 32)
  if (!expected || !timingSafeCompare(searchParams.get('secret') ?? '', expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const minLat = Number(searchParams.get('minLat'))
  const minLon = Number(searchParams.get('minLon'))
  const maxLat = Number(searchParams.get('maxLat'))
  const maxLon = Number(searchParams.get('maxLon'))
  if (![minLat, minLon, maxLat, maxLon].every(isValidCoord) || minLat >= maxLat || minLon >= maxLon) {
    return NextResponse.json({ error: 'bbox non valido (minLat/minLon/maxLat/maxLon richiesti, min < max)' }, { status: 400 })
  }
  // Stesso limite di sicurezza già applicato altrove alle query Overpass per bbox (vedi
  // PROBABILITY_MAX_RADIUS_KM in searchSteps.ts) — una cella troppo grande produce una query "out
  // geom" pesante per ogni candidato trovato, lo stesso genere di query che ha già causato 504 in
  // produzione. ~0.5° di lato (~50km) resta un margine ampio sopra la griglia pensata (~0.25°).
  const MAX_CELL_DEG = 0.5
  if (maxLat - minLat > MAX_CELL_DEG || maxLon - minLon > MAX_CELL_DEG) {
    return NextResponse.json({ error: `cella troppo grande, max ${MAX_CELL_DEG}° di lato — usa una griglia più fitta` }, { status: 400 })
  }

  const dryRun = searchParams.get('dry') === 'true'
  const startedAt = Date.now()

  const currentRows = await getTrailsCacheRowCount()
  if (currentRows >= MAX_TRAILS_CACHE_ROWS) {
    return NextResponse.json({
      stopped: true,
      reason: `tetto di sicurezza raggiunto: trails ha già ${currentRows} righe (limite ${MAX_TRAILS_CACHE_ROWS})`,
      currentRows,
    })
  }

  const candidates = await queryHikingRelationsInBbox(minLat, minLon, maxLat, maxLon, 200)
  if (dryRun) {
    return NextResponse.json({ dryRun: true, bbox: { minLat, minLon, maxLat, maxLon }, candidatesFound: candidates.length, currentRows })
  }

  const cachedById = await getCachedTrailsInBbox(candidates.map(c => c.id))
  const notCached = candidates.filter(c => !cachedById.has(c.id))
  const toResolve = notCached.slice(0, MAX_PER_CALL)

  let resolved = 0
  let failed = 0
  let stoppedEarly = false
  for (const c of toResolve) {
    if (Date.now() - startedAt > SOFT_DEADLINE_MS) {
      stoppedEarly = true
      break
    }
    const ok = await resolveAndCacheOne(c)
    if (ok) resolved++
    else failed++
  }

  return NextResponse.json({
    bbox: { minLat, minLon, maxLat, maxLon },
    candidatesFound: candidates.length,
    alreadyCached: cachedById.size,
    resolvedNow: resolved,
    failed,
    stoppedEarly,
    // Candidati non ancora tentati in questa chiamata (oltre MAX_PER_CALL, o dopo aver interrotto
    // per il tetto morbido) — richiamare la STESSA cella li riprende, i già risolti/cachati sopra
    // vengono saltati automaticamente.
    remainingInCell: notCached.length - resolved - failed,
    currentRowsAfter: currentRows + resolved,
    durationMs: Date.now() - startedAt,
  })
}

async function resolveAndCacheOne(c: HikingRouteCandidate): Promise<boolean> {
  try {
    const track = await resolveTrackForCandidate({ osmId: c.id, gpxUrl: null }, { estimateOnly: true })
    if (!track.ok) return false
    await cacheResolvedTrail(c, track)
    return true
  } catch (e) {
    console.error(`[admin/prewarm-trails] candidato ${c.id} fallito:`, e)
    return false
  }
}
