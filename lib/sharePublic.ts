// Public (unauthenticated) read access to a single shared activity.
// Uses the service-role client, which bypasses RLS — access is gated solely
// by an unguessable share_token, so only activities the owner opted to share
// are reachable. Returns a curated, privacy-safe subset (no private notes).

import { supabase } from './supabase'
import { tsLabel } from './trailScore'

export interface PublicActivity {
  title:            string
  startTime:        string
  distanceMeters:   number
  totalTimeSeconds: number
  elevationGain:    number
  elevationLoss:    number
  altitudeMax:      number
  avgHeartRate:     number
  calories:         number
  routePolyline:    [number, number][]
  elevationProfile: number[]
  trailScore?:      number
  trailLabel?:      string
  trailColor?:      string
  beautyGrade?:     string
  beautyLabel?:     string
  ownerName?:       string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface AltPoint { altitudeMeters?: number }

export async function fetchPublicActivity(token: string): Promise<PublicActivity | null> {
  if (!UUID_RE.test(token)) return null

  const { data, error } = await supabase
    .from('activities')
    .select('title,start_time,distance_meters,total_time_seconds,elevation_gain,elevation_loss,altitude_max,avg_heart_rate,calories,route_polyline,track_points,trail_score,linked_beauty_score,user_id')
    .eq('share_token', token)
    .single()

  if (error || !data) return null

  // Owner display name for attribution (optional)
  let ownerName: string | undefined
  if (data.user_id) {
    const { data: s } = await supabase
      .from('user_settings').select('display_name').eq('user_id', data.user_id).single()
    ownerName = (s?.display_name as string) || undefined
  }

  // Downsample altitude track → elevation profile (~120 pts)
  const tps  = (data.track_points as AltPoint[]) ?? []
  const alts = tps.filter(p => p.altitudeMeters !== undefined).map(p => p.altitudeMeters!)
  const step = Math.max(1, Math.ceil(alts.length / 120))
  const elevationProfile = alts.length > 4 ? alts.filter((_, i) => i % step === 0) : []

  const bs = data.linked_beauty_score as { grade?: string; gradeLabel?: string } | null
  const ts = typeof data.trail_score === 'number' && data.trail_score > 0 ? data.trail_score : undefined
  const tl = ts !== undefined ? tsLabel(ts) : undefined

  return {
    title:            (data.title as string) || 'Escursione',
    startTime:        data.start_time as string,
    distanceMeters:   (data.distance_meters as number) ?? 0,
    totalTimeSeconds: (data.total_time_seconds as number) ?? 0,
    elevationGain:    (data.elevation_gain as number) ?? 0,
    elevationLoss:    (data.elevation_loss as number) ?? 0,
    altitudeMax:      (data.altitude_max as number) ?? 0,
    avgHeartRate:     (data.avg_heart_rate as number) ?? 0,
    calories:         (data.calories as number) ?? 0,
    routePolyline:    (data.route_polyline as [number, number][]) ?? [],
    elevationProfile,
    trailScore:       ts,
    trailLabel:       tl?.label,
    trailColor:       tl?.color,
    beautyGrade:      bs?.grade,
    beautyLabel:      bs?.gradeLabel,
    ownerName,
  }
}

// SVG path string for a route polyline, fitted into a viewBox of `size`×`size`
// (preserving aspect ratio). Shared by the public page and the OG image.
export function routeToSvgPath(polyline: [number, number][], size = 100, pad = 8): string {
  if (polyline.length < 2) return ''
  const lats = polyline.map(p => p[0]), lons = polyline.map(p => p[1])
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLon = Math.min(...lons), maxLon = Math.max(...lons)
  const latR = maxLat - minLat || 1e-4, lonR = maxLon - minLon || 1e-4
  const scale = Math.min((size - 2 * pad) / lonR, (size - 2 * pad) / latR)
  const usedW = lonR * scale, usedH = latR * scale
  const offX = (size - usedW) / 2, offY = (size - usedH) / 2
  return 'M ' + polyline.map(([lat, lon]) =>
    `${(offX + (lon - minLon) * scale).toFixed(2)},${(offY + (maxLat - lat) * scale).toFixed(2)}`
  ).join(' L ')
}

// SVG path for an elevation profile (filled area), fitted into w×h.
export function profileToSvgPath(profile: number[], w: number, h: number): { area: string; line: string } {
  if (profile.length < 3) return { area: '', line: '' }
  const min = Math.min(...profile), max = Math.max(...profile)
  const range = max - min || 1
  const px = (i: number) => (i / (profile.length - 1)) * w
  const py = (v: number) => h - ((v - min) / range) * h
  const pts = profile.map((v, i) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`)
  const line = 'M ' + pts.join(' L ')
  const area = `${line} L ${w.toFixed(1)},${h.toFixed(1)} L 0,${h.toFixed(1)} Z`
  return { area, line }
}
