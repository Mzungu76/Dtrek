// Copertura Street View plausibile per un elenco di punti (POI) — vedi
// lib/routeBuilder/streetViewCoverage.ts. POST (non GET) perché l'elenco punti può essere lungo
// quanto la Galleria di una guida, oltre i limiti ragionevoli di una query string. Cache Supabase
// (street_view_coverage_cache, dato condiviso — vedi add_guide_geo_info_cache_tables.sql) davanti
// a Overpass, stesso pattern delle altre rotte route-build/*: la chiave è l'elenco di punti stesso
// (ordinato e arrotondato, così lo stesso set — tipicamente la Galleria di una guida — riusa la
// cache indipendentemente dall'ordine con cui arriva dal client).
import { NextRequest, NextResponse } from 'next/server'
import { findLikelyStreetViewCoverage } from '@/lib/routeBuilder/streetViewCoverage'
import { supabase } from '@/lib/supabase'
import { shouldRunCleanup } from '@/lib/cacheCleanupThrottle'

export const dynamic = 'force-dynamic'
export const maxDuration = 20

const TTL_MS = 30 * 24 * 60 * 60 * 1000

interface PointInput { lat?: unknown; lon?: unknown }

// Arrotondato a 5 decimali (~1m) — precisione di un singolo POI, non di un'area come le altre
// cache bbox-keyed.
function pointToken(p: { lat: number; lon: number }): string {
  return `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`
}

// Chiave del set (ordine-indipendente, per riusare la cache qualunque sia l'ordine con cui il
// client invia lo stesso insieme di punti).
function pointsKey(points: { lat: number; lon: number }[]): string {
  return points.map(pointToken).sort().join(';')
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const raw: PointInput[] = Array.isArray(body?.points) ? body.points : []
  const points = raw
    .filter((p): p is { lat: number; lon: number } => typeof p.lat === 'number' && typeof p.lon === 'number')
    .slice(0, 60) // stesso ordine di grandezza della Galleria di una guida, mai un elenco arbitrario

  if (points.length === 0) return NextResponse.json({ covered: [] })

  const key = pointsKey(points)

  if (shouldRunCleanup('street_view_coverage_cache')) {
    supabase.from('street_view_coverage_cache').delete().lt('expires_at', new Date().toISOString())
      .then(({ error }) => { if (error) console.warn('[street_view_coverage_cache] cleanup error:', error.message) })
  }

  const { data: cached } = await supabase
    .from('street_view_coverage_cache')
    .select('covered')
    .eq('points_key', key)
    .gt('expires_at', new Date().toISOString())
    .single()

  // `covered` è salvato come mappa { token: boolean }, non come array posizionale: l'ordine dei
  // punti in ingresso non è garantito uguale a quello della richiesta che ha popolato la cache
  // (la chiave stessa è ordine-indipendente), quindi un array posizionale letto dalla cache
  // rischierebbe di abbinare la copertura al punto sbagliato.
  if (cached?.covered && typeof cached.covered === 'object') {
    const map = cached.covered as Record<string, boolean>
    return NextResponse.json({ covered: points.map(p => map[pointToken(p)] ?? false) })
  }

  const coveredArr = await findLikelyStreetViewCoverage(points).catch(() => points.map(() => false))
  const coveredMap: Record<string, boolean> = {}
  points.forEach((p, i) => { coveredMap[pointToken(p)] = coveredArr[i] })

  const expiresAt = new Date(Date.now() + TTL_MS).toISOString()
  supabase.from('street_view_coverage_cache')
    .upsert({ points_key: key, covered: coveredMap, expires_at: expiresAt }, { onConflict: 'points_key' })
    .then(({ error }) => { if (error) console.error('[street_view_coverage_cache] upsert error:', error.message) })

  return NextResponse.json({ covered: coveredArr })
}
