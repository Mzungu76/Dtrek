import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import type { PoiItem } from '@/lib/overpass'
import { fetchGnaPois } from '@/lib/pois/gnaSource'
import { fetchPtprPois } from '@/lib/pois/ptprSource'
import { fetchWikidataPois } from '@/lib/pois/wikidataSource'
import { fetchOverpassPois } from '@/lib/pois/overpassSource'
import { deduplicateByProximity } from '@/lib/pois/dedupe'
import { SUCCESS_CACHE_CONTROL } from '@/lib/apiCacheHeaders'

export const dynamic = 'force-dynamic'

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeBboxKey(bbox: string): string {
  return 'v2_' + bbox.split(',').map(v => (Math.round(parseFloat(v) * 100) / 100).toFixed(2)).join('_')
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const bbox = req.nextUrl.searchParams.get('bbox')
    if (!bbox || bbox.split(',').length !== 4) {
      return NextResponse.json({ error: 'bbox required (s,w,n,e)' }, { status: 400 })
    }

    const bboxKey = normalizeBboxKey(bbox)

    // Lazy cleanup of expired entries (fire-and-forget — .then() triggers lazy execution)
    supabase.from('poi_cache').delete().lt('expires_at', new Date().toISOString())
      .then(({ error }) => { if (error) console.warn('[poi_cache] cleanup error:', error.message) })

    // Check cache
    const { data: cached } = await supabase
      .from('poi_cache')
      .select('pois')
      .eq('bbox_key', bboxKey)
      .gt('expires_at', new Date().toISOString())
      .single()

    if (cached?.pois) {
      // Handle both legacy array format and new {pois, meta} object format
      const payload = cached.pois as PoiItem[] | { pois: PoiItem[] }
      return NextResponse.json(Array.isArray(payload) ? payload : payload.pois, { headers: { 'Cache-Control': SUCCESS_CACHE_CONTROL } })
    }

    // Fetch from all 4 sources in parallel — tolerate individual failures
    const [gnaResult, ptprResult, wikidataResult, overpassResult] = await Promise.allSettled([
      fetchGnaPois(bbox),
      fetchPtprPois(bbox),
      fetchWikidataPois(bbox),
      fetchOverpassPois(bbox),
    ])

    const allPois = [
      ...(gnaResult.status      === 'fulfilled' ? gnaResult.value      : []),
      ...(ptprResult.status     === 'fulfilled' ? ptprResult.value     : []),
      ...(wikidataResult.status === 'fulfilled' ? wikidataResult.value : []),
      ...(overpassResult.status === 'fulfilled' ? overpassResult.value : []),
    ]

    const pois = deduplicateByProximity(allPois, 50)

    // Cache result with source metadata (fire-and-forget)
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const cachePayload = {
      pois,
      meta: {
        gna_count:      gnaResult.status      === 'fulfilled' ? gnaResult.value.length      : -1,
        ptpr_count:     ptprResult.status     === 'fulfilled' ? ptprResult.value.length     : -1,
        wikidata_count: wikidataResult.status === 'fulfilled' ? wikidataResult.value.length : -1,
        overpass_count: overpassResult.status === 'fulfilled' ? overpassResult.value.length : -1,
        merged_count:   pois.length,
        cached_at:      new Date().toISOString(),
      },
    }
    supabase.from('poi_cache')
      .upsert({ bbox_key: bboxKey, pois: cachePayload, expires_at: expiresAt }, { onConflict: 'bbox_key' })
      .then(({ error }) => {
        if (error) console.error('[poi_cache] upsert error:', error.message, error.code)
        else console.log(`[poi_cache] cached ${pois.length} POIs for ${bboxKey}`)
      })

    return NextResponse.json(pois, { headers: { 'Cache-Control': SUCCESS_CACHE_CONTROL } })
  } catch (e) {
    console.error('GET /api/pois:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
