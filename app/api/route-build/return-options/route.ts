// Servizi di trasporto (bus/treno/taxi) entro un raggio dal punto di arrivo di un percorso a sola
// andata — vedi lib/routeBuilder/returnOptions.ts. Chiamata client-side da
// components/guida/GuideReader.tsx, una volta per visione della guida. Cache Supabase
// (return_options_cache, dato condiviso — vedi add_guide_geo_info_cache_tables.sql) davanti a
// Overpass, stesso pattern di app/api/route-build/start-point/route.ts.
import { NextRequest, NextResponse } from 'next/server'
import { findReturnOptions, type ReturnOption } from '@/lib/routeBuilder/returnOptions'
import { supabase } from '@/lib/supabase'
import { shouldRunCleanup } from '@/lib/cacheCleanupThrottle'

export const dynamic = 'force-dynamic'
export const maxDuration = 20

const DEFAULT_RADIUS_M = 1000
const MAX_RADIUS_M = 3000
const TTL_MS = 30 * 24 * 60 * 60 * 1000

function pointKey(lat: number, lon: number, radius: number): string {
  return `${lat.toFixed(4)}_${lon.toFixed(4)}_r${Math.round(radius)}`
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const lat = Number(searchParams.get('lat'))
  const lon = Number(searchParams.get('lon'))
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ error: 'lat/lon mancanti o non validi' }, { status: 400 })
  }
  const radiusParam = Number(searchParams.get('radius'))
  const radius = Number.isFinite(radiusParam) ? Math.min(Math.max(radiusParam, 100), MAX_RADIUS_M) : DEFAULT_RADIUS_M

  const key = pointKey(lat, lon, radius)

  if (shouldRunCleanup('return_options_cache')) {
    supabase.from('return_options_cache').delete().lt('expires_at', new Date().toISOString())
      .then(({ error }) => { if (error) console.warn('[return_options_cache] cleanup error:', error.message) })
  }

  const { data: cached } = await supabase
    .from('return_options_cache')
    .select('options')
    .eq('point_key', key)
    .gt('expires_at', new Date().toISOString())
    .single()

  if (cached?.options) {
    return NextResponse.json({ options: cached.options as ReturnOption[] })
  }

  const options = await findReturnOptions(lat, lon, radius).catch(() => [])

  const expiresAt = new Date(Date.now() + TTL_MS).toISOString()
  supabase.from('return_options_cache')
    .upsert({ point_key: key, options, expires_at: expiresAt }, { onConflict: 'point_key' })
    .then(({ error }) => { if (error) console.error('[return_options_cache] upsert error:', error.message) })

  return NextResponse.json({ options })
}
