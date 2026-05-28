// Overpass API — OpenStreetMap, 100% gratuita, nessuna chiave
// https://overpass-api.de/

export type PoiType =
  | 'peak'
  | 'hut'
  | 'bivouac'
  | 'spring'
  | 'viewpoint'
  | 'cross'
  | 'pass'
  | 'waterfall'
  | 'cave'
  | 'shelter'
  | 'ruins'

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
  peak:      { label: 'Cima',       emoji: '⛰',  color: '#6b7280' },
  hut:       { label: 'Rifugio',    emoji: '🏠',  color: '#d97706' },
  bivouac:   { label: 'Bivacco',    emoji: '⛺',  color: '#92400e' },
  spring:    { label: 'Acqua',      emoji: '💧',  color: '#0284c7' },
  viewpoint: { label: 'Belvedere',  emoji: '👁',  color: '#7c3aed' },
  cross:     { label: 'Croce',      emoji: '✝',   color: '#dc2626' },
  pass:      { label: 'Valico',     emoji: '🏔',  color: '#4b5563' },
  waterfall: { label: 'Cascata',    emoji: '💦',  color: '#0369a1' },
  cave:      { label: 'Grotta',     emoji: '🕳',  color: '#78350f' },
  shelter:   { label: 'Riparo',     emoji: '🛖',  color: '#a16207' },
  ruins:     { label: 'Rovine',     emoji: '🏛',  color: '#713f12' },
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

export function trackBbox(track: [number, number][], pad = 0.006): string {
  const lats = track.map(p => p[0])
  const lons = track.map(p => p[1])
  return `${Math.min(...lats) - pad},${Math.min(...lons) - pad},${Math.max(...lats) + pad},${Math.max(...lons) + pad}`
}

export interface TerrainContext {
  hasForest:      boolean
  hasLake:        boolean
  hasGlacier:     boolean
  hasCoast:       boolean
  isProtected:    boolean   // riserva naturale / area protetta
  isNationalPark: boolean
  openTerrain:    boolean   // fell / heath / grassland / scree / bare_rock
  sacScale?:      string    // massimo SAC trovato sui sentieri (T1–T6)
  surfaces:       string[]  // valori unici di surface= sul tracciato
}

export async function fetchTerrainContext(track: [number, number][]): Promise<TerrainContext> {
  if (track.length === 0) return emptyTerrain()
  const bbox  = trackBbox(track, 0.01)  // ~1 km di padding per le aree

  const query = `[out:json][timeout:25];
(
  way["natural"="wood"](${bbox});
  way["landuse"="forest"](${bbox});
  way["natural"="water"]["water"="lake"](${bbox});
  relation["natural"="water"]["water"="lake"](${bbox});
  way["natural"="glacier"](${bbox});
  way["natural"="coastline"](${bbox});
  way["natural"="fell"](${bbox});
  way["natural"="heath"](${bbox});
  way["natural"="grassland"](${bbox});
  way["natural"="scree"](${bbox});
  way["natural"="bare_rock"](${bbox});
  relation["boundary"="national_park"](${bbox});
  relation["boundary"="protected_area"]["protect_class"~"^(1|2|3|4)$"](${bbox});
  way["leisure"="nature_reserve"](${bbox});
  relation["leisure"="nature_reserve"](${bbox});
  way["highway"~"path|footway|track"]["sac_scale"](${bbox});
  way["highway"~"path|footway|track"]["surface"](${bbox});
);
out tags;`

  const res = await fetch('/api/overpass', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    `data=${encodeURIComponent(query)}`,
  })
  if (!res.ok) return emptyTerrain()
  const data = await res.json()

  const ctx = emptyTerrain()
  const sacOrder = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6']
  const surfaces = new Set<string>()
  let maxSac = -1

  for (const el of data.elements as any[]) {
    const t = el.tags ?? {}
    if (t['natural'] === 'wood'  || t['landuse'] === 'forest')              ctx.hasForest      = true
    if (t['natural'] === 'water' && t['water'] === 'lake')                  ctx.hasLake        = true
    if (t['natural'] === 'glacier')                                          ctx.hasGlacier     = true
    if (t['natural'] === 'coastline')                                        ctx.hasCoast       = true
    if (['fell','heath','grassland','scree','bare_rock'].includes(t['natural'])) ctx.openTerrain = true
    if (t['boundary'] === 'national_park')                                  { ctx.isNationalPark = true; ctx.isProtected = true }
    if (t['boundary'] === 'protected_area' || t['leisure'] === 'nature_reserve') ctx.isProtected = true
    if (t['sac_scale']) { const i = sacOrder.indexOf(t['sac_scale']); if (i > maxSac) maxSac = i }
    if (t['surface'])   surfaces.add(t['surface'])
  }

  if (maxSac >= 0) ctx.sacScale = sacOrder[maxSac]
  ctx.surfaces = Array.from(surfaces)
  return ctx
}

function emptyTerrain(): TerrainContext {
  return { hasForest: false, hasLake: false, hasGlacier: false, hasCoast: false,
           isProtected: false, isNationalPark: false, openTerrain: false, surfaces: [] }
}

export async function fetchPoisNearTrack(
  track: [number, number][],
  maxDistM = 300,
): Promise<PoiItem[]> {
  if (track.length === 0) return []

  const bbox = trackBbox(track)

  const query = `[out:json][timeout:30];
(
  node["natural"="peak"](${bbox});
  node["amenity"="alpine_hut"](${bbox});
  node["tourism"="wilderness_hut"](${bbox});
  node["natural"="spring"](${bbox});
  node["amenity"="drinking_water"](${bbox});
  node["tourism"="viewpoint"](${bbox});
  node["historic"="wayside_cross"]["ele"](${bbox});
  node["mountain_pass"="yes"](${bbox});
  node["natural"="saddle"](${bbox});
  node["natural"="waterfall"](${bbox});
  node["natural"="cave_entrance"](${bbox});
  node["amenity"="shelter"](${bbox});
  node["tourism"="lean_to"](${bbox});
  node["historic"="ruins"](${bbox});
  node["historic"="castle"](${bbox});
  node["historic"="archaeological_site"](${bbox});
);
out body;`

  const res = await fetch('/api/overpass', {
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
    if      (t['natural']      === 'peak')                                     type = 'peak'
    else if (t['amenity']      === 'alpine_hut')                               type = 'hut'
    else if (t['tourism']      === 'wilderness_hut')                           type = 'bivouac'
    else if (t['natural']      === 'spring' || t['amenity'] === 'drinking_water') type = 'spring'
    else if (t['tourism']      === 'viewpoint')                                type = 'viewpoint'
    else if (t['historic']     === 'wayside_cross')                            type = 'cross'
    else if (t['mountain_pass'] === 'yes' || t['natural'] === 'saddle')        type = 'pass'
    else if (t['natural']      === 'waterfall')                                type = 'waterfall'
    else if (t['natural']      === 'cave_entrance')                            type = 'cave'
    else if (t['amenity']      === 'shelter' || t['tourism'] === 'lean_to')    type = 'shelter'
    else if (t['historic']     === 'ruins' || t['historic'] === 'castle' ||
             t['historic']     === 'archaeological_site')                       type = 'ruins'

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
