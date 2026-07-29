// Classificazione del punto di partenza di un percorso (parcheggio/strada/POI nei pressi di un
// parcheggio) — vedi lib/routeBuilder/startPointInfo.ts. Chiamata client-side da
// components/guida/GuideReader.tsx, una volta per visione della guida. Cache Supabase
// (start_point_cache, dato condiviso non per-utente — vedi la migrazione
// add_guide_geo_info_cache_tables.sql) davanti a Overpass, stesso pattern di app/api/pois/route.ts:
// senza, ogni visione della stessa guida — da qualsiasi utente/dispositivo — ripeterebbe la
// chiamata. La cache locale IndexedDB (lib/routeBuilder/geoInfoCache.ts) resta come L1 più veloce
// del round-trip di rete, questa è l'L2 condivisa.
import { NextRequest, NextResponse } from 'next/server'
import { classifyStartPoint, type StartPointInfo } from '@/lib/routeBuilder/startPointInfo'
import { supabase } from '@/lib/supabase'
import { shouldRunCleanup } from '@/lib/cacheCleanupThrottle'

export const dynamic = 'force-dynamic'
export const maxDuration = 20

const TTL_MS = 30 * 24 * 60 * 60 * 1000

function pointKey(lat: number, lon: number): string {
  return `${lat.toFixed(4)}_${lon.toFixed(4)}`
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const lat = Number(searchParams.get('lat'))
  const lon = Number(searchParams.get('lon'))
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ error: 'lat/lon mancanti o non validi' }, { status: 400 })
  }

  const key = pointKey(lat, lon)

  if (shouldRunCleanup('start_point_cache')) {
    supabase.from('start_point_cache').delete().lt('expires_at', new Date().toISOString())
      .then(({ error }) => { if (error) console.warn('[start_point_cache] cleanup error:', error.message) })
  }

  const { data: cached } = await supabase
    .from('start_point_cache')
    .select('info')
    .eq('point_key', key)
    .gt('expires_at', new Date().toISOString())
    .single()

  if (cached !== null) {
    return NextResponse.json({ info: (cached.info ?? null) as StartPointInfo | null })
  }

  const info = await classifyStartPoint(lat, lon).catch(() => null)

  const expiresAt = new Date(Date.now() + TTL_MS).toISOString()
  supabase.from('start_point_cache')
    .upsert({ point_key: key, info, expires_at: expiresAt }, { onConflict: 'point_key' })
    .then(({ error }) => { if (error) console.error('[start_point_cache] upsert error:', error.message) })

  return NextResponse.json({ info })
}
