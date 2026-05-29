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
  | 'archaeological' | 'castle' | 'fountain' | 'bench' | 'chapel' | 'picnic' | 'tower' | 'monument'

export interface PoiItem {
  id: number
  type: PoiType
  lat: number
  lon: number
  name?: string
  ele?: number
  distFromTrack: number  // meters
  tags?: Record<string, string>
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
  archaeological: { label: 'Sito Archeologico', emoji: '🏛', color: '#92400e' },
  castle:         { label: 'Castello',           emoji: '🏰', color: '#5b21b6' },
  fountain:       { label: 'Fontana',            emoji: '⛲', color: '#0891b2' },
  bench:          { label: 'Panchina',           emoji: '🪑', color: '#65a30d' },
  chapel:         { label: 'Cappella/Chiesa',    emoji: '⛪', color: '#b45309' },
  picnic:         { label: 'Area Picnic',        emoji: '🧺', color: '#16a34a' },
  tower:          { label: 'Torre',              emoji: '🗼', color: '#7c3aed' },
  monument:       { label: 'Monumento',          emoji: '🗿', color: '#6b7280' },
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
  relation["boundary"="protected_area"](${bbox});
  way["boundary"="protected_area"](${bbox});
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
  node["historic"="wayside_cross"](${bbox});
  node["mountain_pass"="yes"](${bbox});
  node["natural"="saddle"](${bbox});
  node["natural"="waterfall"](${bbox});
  node["natural"="cave_entrance"](${bbox});
  node["amenity"="shelter"](${bbox});
  node["tourism"="lean_to"](${bbox});
  node["historic"="ruins"](${bbox});
  node["historic"="castle"](${bbox});
  node["historic"="archaeological_site"](${bbox});
  node["amenity"="fountain"](${bbox});
  node["amenity"="bench"](${bbox});
  node["amenity"="place_of_worship"](${bbox});
  node["building"="chapel"](${bbox});
  node["tourism"="picnic_site"](${bbox});
  node["man_made"="tower"](${bbox});
  node["historic"="tower"](${bbox});
  node["historic"="monument"](${bbox});
  node["historic"="memorial"](${bbox});
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
    else if (t['historic']     === 'ruins')                                   type = 'ruins'
    else if (t['historic']     === 'castle')                                  type = 'castle'
    else if (t['historic']     === 'archaeological_site')                     type = 'archaeological'
    else if (t['amenity']      === 'fountain')                                type = 'fountain'
    else if (t['amenity']      === 'bench')                                   type = 'bench'
    else if (t['amenity']      === 'place_of_worship' || t['building'] === 'chapel' || t['building'] === 'church') type = 'chapel'
    else if (t['tourism']      === 'picnic_site')                             type = 'picnic'
    else if (t['man_made']     === 'tower' || t['historic'] === 'tower')      type = 'tower'
    else if (t['historic']     === 'monument' || t['historic'] === 'memorial') type = 'monument'

    pois.push({
      id:   el.id,
      type,
      lat:  el.lat,
      lon:  el.lon,
      name: t['name'],
      ele:  t['ele'] ? parseFloat(t['ele']) : undefined,
      distFromTrack: Math.round(dist),
      tags: { ...(el.tags ?? {}) } as Record<string, string>,
    })
  }

  return pois
}

export type SurfaceType = 'sentiero' | 'sterrato' | 'ciclabile' | 'locale' | 'trafficata' | 'altro'

export interface SurfaceSegment {
  type: SurfaceType
  label: string
  color: string
  distanceKm: number
  pct: number
}

const HIGHWAY_SURFACE: Record<SurfaceType, { label: string; color: string }> = {
  sentiero:   { label: 'Sentiero / Mulattiera', color: '#10b981' },
  sterrato:   { label: 'Sterrato / Pista',      color: '#f59e0b' },
  ciclabile:  { label: 'Ciclabile',             color: '#3b82f6' },
  locale:     { label: 'Strada locale',          color: '#9ca3af' },
  trafficata: { label: 'Strada trafficata',      color: '#ef4444' },
  altro:      { label: 'Non rilevato',           color: '#d1d5db' },
}

function classifyHighway(h: string): SurfaceType {
  if (['path','footway','bridleway','steps','hiking'].includes(h)) return 'sentiero'
  if (h === 'track')                                                return 'sterrato'
  if (h === 'cycleway')                                             return 'ciclabile'
  if (['residential','service','unclassified','living_street','pedestrian','road'].includes(h)) return 'locale'
  if (['primary','secondary','tertiary','trunk','motorway',
       'primary_link','secondary_link','tertiary_link','trunk_link','motorway_link'].includes(h)) return 'trafficata'
  return 'altro'
}

function distToSeg(plat: number, plon: number, alat: number, alon: number, blat: number, blon: number): number {
  const cos = Math.cos(plat * Math.PI / 180)
  const px = plon * cos, py = plat
  const ax = alon * cos, ay = alat
  const bx = blon * cos, by = blat
  const dx = bx - ax, dy = by - ay
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-18) return haversineM(plat, plon, alat, alon)
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
  return haversineM(plat, plon, alat + t * (blat - alat), alon + t * (blon - alon))
}

export async function fetchSurfaceBreakdown(track: [number, number][]): Promise<SurfaceSegment[]> {
  if (track.length < 2) return []
  const bbox = trackBbox(track, 0.002)

  // Only the highway types that matter for hiking surface classification;
  // omitting residential/service/unclassified avoids enormous responses in urban areas.
  const query = `[out:json][timeout:20][maxsize:1500000];
way["highway"~"^(path|footway|cycleway|track|bridleway|steps|tertiary|secondary|primary|trunk|motorway|primary_link|secondary_link|tertiary_link|trunk_link|motorway_link)$"](${bbox});
out geom;`

  const res = await fetch('/api/overpass', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  })
  if (!res.ok) return []
  const data = await res.json()

  const ways: Array<{ type: SurfaceType; nodes: [number, number][] }> = []
  for (const el of data.elements as any[]) {
    if (el.type !== 'way' || !el.geometry?.length) continue
    const hw = el.tags?.highway
    if (!hw) continue
    ways.push({ type: classifyHighway(hw), nodes: el.geometry.map((g: any) => [g.lat, g.lon] as [number, number]) })
  }

  // Downsample track
  const maxSamp = 80
  const step = Math.max(1, Math.ceil(track.length / maxSamp))
  const samples = track.filter((_, i) => i % step === 0)

  const totals: Record<SurfaceType, number> = { sentiero: 0, sterrato: 0, ciclabile: 0, locale: 0, trafficata: 0, altro: 0 }
  const MAX_SNAP = 40

  for (let i = 0; i < samples.length - 1; i++) {
    const mid: [number, number] = [(samples[i][0] + samples[i + 1][0]) / 2, (samples[i][1] + samples[i + 1][1]) / 2]
    const segLen = haversineM(samples[i][0], samples[i][1], samples[i + 1][0], samples[i + 1][1])

    let nearestType: SurfaceType = 'altro'
    let nearestDist = MAX_SNAP

    for (const way of ways) {
      for (let j = 0; j < way.nodes.length - 1; j++) {
        const d = distToSeg(mid[0], mid[1], way.nodes[j][0], way.nodes[j][1], way.nodes[j + 1][0], way.nodes[j + 1][1])
        if (d < nearestDist) { nearestDist = d; nearestType = way.type }
      }
    }
    totals[nearestType] += segLen
  }

  const totalDist = Object.values(totals).reduce((a, b) => a + b, 0)
  if (totalDist === 0) return []

  return (Object.entries(totals) as [SurfaceType, number][])
    .filter(([, m]) => m > 50)
    .map(([type, meters]) => ({
      type,
      label: HIGHWAY_SURFACE[type].label,
      color: HIGHWAY_SURFACE[type].color,
      distanceKm: meters / 1000,
      pct: Math.round((meters / totalDist) * 100),
    }))
    .sort((a, b) => b.distanceKm - a.distanceKm)
}
