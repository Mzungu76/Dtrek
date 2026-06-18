export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import {
  WMT_BASE, USER_AGENT, pickNumber, extractElevationProfile, computeElevationStats,
} from '@/lib/waymarkedTrails'

async function fetchJson(url: string) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`status ${res.status}`)
  return res.json()
}

// GET ?id= — metadata + elevation stats for a single trail relation.
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id || !/^\d+$/.test(id)) {
    return NextResponse.json({ error: 'id numerico richiesto' }, { status: 400 })
  }

  const [metaResult, elevResult] = await Promise.allSettled([
    fetchJson(`${WMT_BASE}/details/relation/${id}`),
    fetchJson(`${WMT_BASE}/details/relation/${id}/elevation?segments=200`),
  ])

  if (metaResult.status === 'rejected') {
    return NextResponse.json({ error: 'Waymarked Trails non disponibile' }, { status: 502 })
  }

  const meta = metaResult.value as Record<string, unknown>
  const tags = (meta.tags as Record<string, string>) ?? {}

  // Prefer ascent/descent/min/max already computed server-side by Waymarked Trails, if present.
  let elevationGain = pickNumber(meta, ['ascend', 'ascent', 'ele_gain'])
  let elevationLoss = pickNumber(meta, ['descend', 'descent', 'ele_loss'])
  let altitudeMax   = pickNumber(meta, ['maxalt', 'max_alt', 'highest_point'])
  let altitudeMin   = pickNumber(meta, ['minalt', 'min_alt', 'lowest_point'])

  if ((elevationGain === null || elevationLoss === null) && elevResult.status === 'fulfilled') {
    const profile = extractElevationProfile(elevResult.value)
    if (profile && profile.length > 1) {
      const stats = computeElevationStats(profile)
      elevationGain ??= stats.elevationGain
      elevationLoss ??= stats.elevationLoss
      altitudeMax   ??= stats.altitudeMax
      altitudeMin   ??= stats.altitudeMin
    }
  }

  const lengthM = pickNumber(meta, ['length', 'mapped_length', 'official_length'])

  return NextResponse.json({
    name: (meta.name as string) || tags.name || `Percorso ${id}`,
    ref: (meta.ref as string) || tags.ref,
    network: (meta.network as string) || (meta.level as string),
    distanceKm: lengthM !== null ? lengthM / 1000 : null,
    elevationGain,
    elevationLoss,
    altitudeMax,
    altitudeMin,
    sacScale: tags.sac_scale,
    caiScale: tags.cai_scale,
    description: tags.description,
    from: tags.from,
    to: tags.to,
  })
}
