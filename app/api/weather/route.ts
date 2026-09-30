import { NextRequest, NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { parseMetno, expandToHourly, dailyFrom, type MetnoHourly, type MetnoDaily, type MetnoResponse } from '@/lib/weather/metno'

export const dynamic = 'force-dynamic'

// GET /api/weather?lat=..&lon=.. → previsioni MET Norway (Locationforecast 2.0) normalizzate.
// Perché passa da qui e non dal browser: MET Norway richiede un User-Agent che identifichi l'app (un
// browser non può impostarlo) e chiede di non ripetere le stesse richieste — qui le coordinate sono
// arrotondate a una griglia di ~2 km e la risposta si tiene 30 minuti (Upstash se configurato,
// altrimenti in memoria dell'istanza), quindi molte persone nella stessa zona costano una sola
// chiamata. Solo utenti autenticati, per non offrire un proxy aperto a chiunque.
// Dati: MET Norway, CC BY 4.0 / NLOD (https://api.met.no/doc/License) — attribuzione in Fonti e crediti.

const GRID_DEG = 0.02
const TTL_SECONDS = 30 * 60
const MET_URL = 'https://api.met.no/weatherapi/locationforecast/2.0/complete'
const FETCH_TIMEOUT_MS = 8000

export interface WeatherApiResponse {
  source: 'met.no'
  fetchedAt: string
  hourly: MetnoHourly[]
  daily: MetnoDaily[]
}

const memory = new Map<string, { at: number; value: WeatherApiResponse }>()
const MEMORY_MAX = 300

function getRedis(): Redis | null {
  const url = process.env.KV_REST_API_URL
  const token = process.env.KV_REST_API_TOKEN
  return url && token ? new Redis({ url, token }) : null
}

function snap(n: number): number { return Math.round(n / GRID_DEG) * GRID_DEG }

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const lat = Number(req.nextUrl.searchParams.get('lat'))
  const lon = Number(req.nextUrl.searchParams.get('lon'))
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return NextResponse.json({ error: 'Coordinate non valide' }, { status: 400 })
  }
  const sLat = Number(snap(lat).toFixed(2))
  const sLon = Number(snap(lon).toFixed(2))
  const key = `wx:metno:${sLat}:${sLon}`

  const cached = await readCache(key)
  if (cached) return NextResponse.json(cached, { headers: { 'X-Weather-Cache': 'hit' } })

  try {
    const origin = req.nextUrl.origin
    const contact = process.env.WEATHER_CONTACT ?? process.env.TILE_CONTACT
    const res = await fetch(`${MET_URL}?lat=${sLat}&lon=${sLon}`, {
      headers: {
        'User-Agent': `DTrek/1.0 (+${origin}${contact ? `; ${contact}` : ''})`,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) return NextResponse.json({ error: `MET Norway ${res.status}` }, { status: 502 })
    const hourly = expandToHourly(parseMetno((await res.json()) as MetnoResponse))
    const value: WeatherApiResponse = { source: 'met.no', fetchedAt: new Date().toISOString(), hourly, daily: dailyFrom(hourly) }
    await writeCache(key, value)
    return NextResponse.json(value, { headers: { 'X-Weather-Cache': 'miss' } })
  } catch (e) {
    console.error('[weather] MET Norway fetch failed:', e)
    return NextResponse.json({ error: 'Previsioni non disponibili' }, { status: 502 })
  }
}

async function readCache(key: string): Promise<WeatherApiResponse | null> {
  const redis = getRedis()
  if (redis) {
    try { return (await redis.get<WeatherApiResponse>(key)) ?? null } catch { /* ripiega sulla memoria */ }
  }
  const m = memory.get(key)
  return m && Date.now() - m.at < TTL_SECONDS * 1000 ? m.value : null
}

async function writeCache(key: string, value: WeatherApiResponse): Promise<void> {
  if (memory.size >= MEMORY_MAX) memory.delete(memory.keys().next().value as string)
  memory.set(key, { at: Date.now(), value })
  const redis = getRedis()
  if (redis) { try { await redis.set(key, value, { ex: TTL_SECONDS }) } catch { /* la cache è opzionale */ } }
}
