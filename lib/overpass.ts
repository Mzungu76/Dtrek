// Overpass API — OpenStreetMap, 100% gratuita, nessuna chiave
// https://overpass-api.de/

export type PoiType = 'peak' | 'hut' | 'bivouac' | 'spring' | 'viewpoint' | 'cross'

export interface PoiItem {
  id: number
  type: PoiType
  lat: number
  lon: number
  name?: string
  ele?: number
  distFromTrack: number  // meters
}

export const POI_META: Record<PoiType, { label: string; emoji: string; color: string }> = {
  peak:      { label: 'Cima',      emoji: '⛰',  color: '#6b7280' },
  hut:       { label: 'Rifugio',   emoji: '🏠',  color: '#d97706' },
  bivouac:   { label: 'Bivacco',   emoji: '⛺',  color: '#92400e' },
  spring:    { label: 'Acqua',     emoji: '💧',  color: '#0284c7' },
  viewpoint: { label: 'Belvedere', emoji: '👁',  color: '#7c3aed' },
  cross:     { label: 'Croce',     emoji: '✝',   color: '#dc2626' },
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const f1 = lat1 * Math.PI / 180, f2 = lat2 * Math.PI / 180
  const df = (lat2 - lat1) * Math.PI / 180
  const dl = (lon2 - lon1) * Math.PI / 180
  const a  = Math.sin(df / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function minDistToTrack(lat: number, lon: number, sample: [number, number][]): number {
  let min = Infinity
  for (const [slat, slon] of sample) {
    const d = haversineM(lat, lon, slat, slon)
    if (d < min) min = d
  }
  return min
}

export async function fetchPoisNearTrack(
  track: [number, number][],
  maxDistM = 300,
): Promise<PoiItem[]> {
  if (track.length === 0) return []

  const lats = track.map(p => p[0])
  const lons = track.map(p => p[1])
  const pad  = 0.006  // ~600m padding
  const bbox = `${Math.min(...lats) - pad},${Math.min(...lons) - pad},${Math.max(...lats) + pad},${Math.max(...lons) + pad}`

  const query = `[out:json][timeout:25];
(
  node["natural"="peak"](${bbox});
  node["amenity"="alpine_hut"](${bbox});
  node["tourism"="wilderness_hut"](${bbox});
  node["natural"="spring"](${bbox});
  node["amenity"="drinking_water"](${bbox});
  node["tourism"="viewpoint"](${bbox});
  node["historic"="wayside_cross"]["ele"](${bbox});
);
out body;`

  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    `data=${encodeURIComponent(query)}`,
  })
  if (!res.ok) throw new Error('Overpass API error: ' + res.status)
  const data = await res.json()

  // Subsample track for distance check (max 120 points → fast)
  const step   = Math.max(1, Math.floor(track.length / 120))
  const sample = track.filter((_, i) => i % step === 0)

  const pois: PoiItem[] = []
  for (const el of data.elements as any[]) {
    const dist = minDistToTrack(el.lat, el.lon, sample)
    if (dist > maxDistM) continue

    const t = el.tags ?? {}
    let type: PoiType = 'peak'
    if      (t['natural']    === 'peak')              type = 'peak'
    else if (t['amenity']    === 'alpine_hut')         type = 'hut'
    else if (t['tourism']    === 'wilderness_hut')     type = 'bivouac'
    else if (t['natural']    === 'spring' || t['amenity'] === 'drinking_water') type = 'spring'
    else if (t['tourism']    === 'viewpoint')          type = 'viewpoint'
    else if (t['historic']   === 'wayside_cross')      type = 'cross'

    pois.push({
      id:   el.id,
      type,
      lat:  el.lat,
      lon:  el.lon,
      name: t['name'],
      ele:  t['ele'] ? parseFloat(t['ele']) : undefined,
      distFromTrack: Math.round(dist),
    })
  }

  return pois
}
