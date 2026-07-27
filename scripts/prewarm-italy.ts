/**
 * Pre-riscalda la cache `trails` per TUTTA l'Italia, non solo il Nord-Est già coperto — stessa
 * identica risoluzione (Overpass, stima, mai il DTM reale) già usata da app/api/admin/prewarm-trails
 * e dalla ricerca interattiva "Esistenti" (lib/routeBuilder/searchSteps.ts), qui semplicemente
 * eseguita in locale invece che a celle via HTTP: un processo Node lungo non ha il tetto di 60s di
 * una funzione serverless, quindi può risolvere una cella per intero invece di fermarsi al tetto
 * morbido e aspettare una chiamata successiva.
 *
 * QUESTO SCRIPT NON PUÒ GIRARE nel sandbox di sviluppo di Claude Code (egress bloccato verso
 * Overpass) — va eseguito da una macchina con accesso di rete reale (locale, o CI), con
 * SUPABASE_SERVICE_ROLE_KEY e NEXT_PUBLIC_SUPABASE_URL già impostate nell'ambiente (le stesse usate
 * dall'app, vedi lib/supabase.ts).
 *
 * Resumibile: salva l'avanzamento in scripts/.prewarm-italy-progress.json (celle già completate) —
 * se interrotto (Ctrl+C, rete, crash), rilanciarlo riparte dalla cella successiva invece che da capo.
 * Rispetta MAX_TRAILS_CACHE_ROWS: si ferma da solo se il tetto è già raggiunto.
 *
 * Uso:
 *   npx tsx scripts/prewarm-italy.ts
 *   npx tsx scripts/prewarm-italy.ts --dry     (solo conteggio candidati per cella, non scrive nulla)
 */
import fs from 'node:fs'
import path from 'node:path'
import { queryHikingRelationsInBbox, type HikingRouteCandidate } from '@/lib/overpassTrails'
import { resolveTrackForCandidate } from '@/lib/routeBuilder/resolveTrack'
import { cacheResolvedTrail } from '@/lib/routeBuilder/searchSteps'
import { getCachedTrailsInBbox, getTrailsCacheRowCount, MAX_TRAILS_CACHE_ROWS } from '@/lib/trailsCache'

// Rettangolo che contiene tutta l'Italia (continentale + Sicilia + Sardegna) — include margine di
// mare/estero ai bordi: le celle senza terraferma tornano semplicemente "candidatesFound: 0" in
// fretta, un costo accettabile rispetto a disegnare un poligono preciso dei confini.
const ITALY_BBOX = { minLat: 35.3, maxLat: 47.3, minLon: 6.5, maxLon: 18.6 }
// Sotto il tetto di 0.5° imposto dall'endpoint admin per lo stesso motivo (query Overpass "out geom"
// troppo pesante oltre quella soglia, causa osservata di 504 in produzione).
const CELL_DEG = 0.4
// Pausa tra una cella e l'altra e tra una risoluzione candidato e l'altra — Overpass è un servizio
// pubblico condiviso, già osservato non disponibile sotto carico in questa stessa app: teniamo un
// ritmo prudente piuttosto che massimizzare la velocità di importazione.
const DELAY_BETWEEN_CANDIDATES_MS = 800
const DELAY_BETWEEN_CELLS_MS = 2_500
const DELAY_AFTER_CELL_FAILURE_MS = 15_000

const PROGRESS_FILE = path.join(__dirname, '.prewarm-italy-progress.json')
const DRY_RUN = process.argv.includes('--dry')

interface Cell { minLat: number; minLon: number; maxLat: number; maxLon: number }

function buildGrid(): Cell[] {
  const cells: Cell[] = []
  for (let lat = ITALY_BBOX.minLat; lat < ITALY_BBOX.maxLat; lat += CELL_DEG) {
    for (let lon = ITALY_BBOX.minLon; lon < ITALY_BBOX.maxLon; lon += CELL_DEG) {
      cells.push({
        minLat: lat, minLon: lon,
        maxLat: Math.min(lat + CELL_DEG, ITALY_BBOX.maxLat),
        maxLon: Math.min(lon + CELL_DEG, ITALY_BBOX.maxLon),
      })
    }
  }
  return cells
}

function cellKey(c: Cell): string {
  return `${c.minLat.toFixed(2)},${c.minLon.toFixed(2)}`
}

function loadProgress(): Set<string> {
  try {
    const raw = fs.readFileSync(PROGRESS_FILE, 'utf-8')
    return new Set(JSON.parse(raw) as string[])
  } catch {
    return new Set()
  }
}

function saveProgress(done: Set<string>) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify([...done]))
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function resolveAndCacheOne(c: HikingRouteCandidate): Promise<boolean> {
  try {
    const track = await resolveTrackForCandidate({ osmId: c.id, gpxUrl: null }, { estimateOnly: true })
    if (!track.ok) return false
    await cacheResolvedTrail(c, track)
    return true
  } catch (e) {
    console.error(`  candidato ${c.id} fallito:`, e instanceof Error ? e.message : e)
    return false
  }
}

async function processCell(cell: Cell, index: number, total: number): Promise<void> {
  const rowCount = await getTrailsCacheRowCount()
  if (rowCount >= MAX_TRAILS_CACHE_ROWS) {
    throw new Error(`tetto di sicurezza raggiunto: trails ha già ${rowCount} righe (limite ${MAX_TRAILS_CACHE_ROWS})`)
  }

  const label = `[${index + 1}/${total}] cella (${cell.minLat.toFixed(2)},${cell.minLon.toFixed(2)})–(${cell.maxLat.toFixed(2)},${cell.maxLon.toFixed(2)})`
  const candidates = await queryHikingRelationsInBbox(cell.minLat, cell.minLon, cell.maxLat, cell.maxLon, 200)

  if (DRY_RUN) {
    console.log(`${label}: ${candidates.length} candidati trovati (dry-run, nessuna scrittura)`)
    return
  }

  if (candidates.length === 0) {
    console.log(`${label}: nessun candidato (righe totali: ${rowCount})`)
    return
  }

  const cachedById = await getCachedTrailsInBbox(candidates.map(c => c.id))
  const notCached = candidates.filter(c => !cachedById.has(c.id))
  console.log(`${label}: ${candidates.length} candidati, ${cachedById.size} già in cache, ${notCached.length} da risolvere`)

  let resolved = 0
  let failed = 0
  for (const c of notCached) {
    const ok = await resolveAndCacheOne(c)
    if (ok) resolved++
    else failed++
    await sleep(DELAY_BETWEEN_CANDIDATES_MS)
  }
  console.log(`${label}: risolti ${resolved}, falliti ${failed} (righe totali dopo: ${rowCount + resolved})`)
}

async function main() {
  const grid = buildGrid()
  const done = DRY_RUN ? new Set<string>() : loadProgress()
  const todo = grid.filter(c => !done.has(cellKey(c)))

  console.log(`Griglia Italia: ${grid.length} celle totali, ${done.size} già completate, ${todo.length} da fare.`)
  if (DRY_RUN) console.log('Modalità DRY-RUN: nessuna scrittura, solo conteggio candidati per cella.\n')

  for (let i = 0; i < todo.length; i++) {
    const cell = todo[i]
    try {
      await processCell(cell, i, todo.length)
      if (!DRY_RUN) {
        done.add(cellKey(cell))
        saveProgress(done)
      }
      await sleep(DELAY_BETWEEN_CELLS_MS)
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('tetto di sicurezza')) {
        console.error(`\n${e.message} — importazione interrotta, niente altro da fare.`)
        return
      }
      console.error(`Cella fallita, ritento dopo una pausa più lunga:`, e instanceof Error ? e.message : e)
      await sleep(DELAY_AFTER_CELL_FAILURE_MS)
    }
  }

  const finalCount = await getTrailsCacheRowCount()
  console.log(`\nCompletato. Righe totali in trails: ${finalCount}.`)
}

main().catch(e => {
  console.error('Errore fatale:', e)
  process.exit(1)
})
