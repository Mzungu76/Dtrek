// lib/tei.ts — Trekking Excellence Index (TEI) v2
// Replaces BeautyScore v1 with objective WLC scoring
import type { PoiItem } from './overpass'
import type { BeautyScore, CategoryScore } from './beautyScore'
import type { CtsConfidence } from './trailScore'
import { haversineM } from './geoUtils'

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface GpxSegment {
  points: [number, number][]
  lengthM: number
  elevations: number[]
  centroid: [number, number]
}

export interface OsmElement {
  lat: number
  lon: number
  tags: Record<string, string>
}

export interface OsmTeiData {
  waterways:    OsmElement[]
  highways:     OsmElement[]
  antrHighways: OsmElement[]
  powerLines:   OsmElement[]
  waterShore?:  OsmElement[]  // sampled shoreline points from natural=water areas (lakes/ponds)
}

export interface TeiBreakdown {
  vCult: number
  vTopo: number
  vIdro: number
  vFond: number
  vGeo:  number
  fAntr: number
  raw:   number
}

export interface TeiResult {
  score:      number
  label:      string
  color:      string
  breakdown:  TeiBreakdown
  confidence: CtsConfidence
  version:    2
}

export interface TeiInput {
  track:           [number, number][]
  elevGain:        number
  distanceMeters:  number
  altitudeMax?:    number
  elevProfile?:    number[]   // elevation (m) aligned with track[]
  pois:            PoiItem[]
  osmData?:        OsmTeiData
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function clamp(v: number, min = 0, max = 10): number {
  return Math.max(min, Math.min(max, v))
}

function teiLabel(score: number): { label: string; color: string } {
  if (score >= 8.5) return { label: 'Eccellente',   color: '#1D9E75' }
  if (score >= 7.0) return { label: 'Molto buono',  color: '#378ADD' }
  if (score >= 5.5) return { label: 'Buono',        color: '#BA7517' }
  if (score >= 4.0) return { label: 'Sufficiente',  color: '#D85A30' }
  return               { label: 'Basso',           color: '#E24B4A' }
}

// ── GPX Segmentation ─────────────────────────────────────────────────────────

export function segmentGpx(
  track: [number, number][],
  elevProfile: number[] = [],
  segmentLenM = 100,
): GpxSegment[] {
  if (track.length < 2) return []
  const segments: GpxSegment[] = []
  let current: [number, number][] = [track[0]]
  let elevCurrent: number[] = [elevProfile[0] ?? 0]
  let accumulated = 0

  for (let i = 1; i < track.length; i++) {
    const d = haversineM(track[i - 1][0], track[i - 1][1], track[i][0], track[i][1])
    accumulated += d
    current.push(track[i])
    elevCurrent.push(elevProfile[i] ?? 0)
    if (accumulated >= segmentLenM) {
      const centroid = current[Math.floor(current.length / 2)]
      segments.push({ points: [...current], lengthM: accumulated, elevations: [...elevCurrent], centroid })
      current = [track[i]]
      elevCurrent = [elevProfile[i] ?? 0]
      accumulated = 0
    }
  }
  if (current.length > 1) {
    const centroid = current[Math.floor(current.length / 2)]
    segments.push({ points: current, lengthM: accumulated, elevations: elevCurrent, centroid })
  }
  return segments
}

// ── V_cult: POI Relevance Grade ───────────────────────────────────────────────

function relevanceGrade(poi: PoiItem): number {
  const source = poi.tags?.source as string | undefined
  const name = (poi.name ?? '').toLowerCase()

  // Grade 5: necropoli/tombe/vie cave from PTPR or GNA
  if ((source === 'ptpr_lazio' || source === 'gna') &&
      (name.includes('necropoli') || name.includes('tomba') || name.includes('tombe') ||
       name.includes('via cava') || name.includes('viis cava') || name.includes('tagliata') ||
       name.includes('sepolcro') || name.includes('sepolture'))) {
    return 5
  }
  // Grade 5: any PTPR archaeological point protection
  if (source === 'ptpr_lazio' && poi.type === 'archaeological') {
    return 5
  }
  // Grade 4: PTPR lines (ancient roads, aqueducts) and all GNA sites
  if (source === 'ptpr_lazio' && poi.type === 'ruins') {
    return 4
  }
  if (source === 'gna') {
    return 4
  }
  // Grade 3: Castles, chapels (named historic structures)
  if (poi.type === 'castle' || poi.type === 'chapel') {
    return 3
  }
  // Grade 2: Generic ruins
  if (poi.type === 'ruins') {
    return 2
  }
  // Grade 2: Archaeological without further specification
  if (poi.type === 'archaeological') {
    return 2
  }
  // Grade 1: Viewpoints count minimally for V_cult
  if (poi.type === 'viewpoint') {
    return 1
  }
  return 0
}

function proximityFactor(distM: number): number {
  if (distM < 30)  return 2.0  // direct traversal / immediate adjacency
  if (distM < 150) return 1.5  // probable direct visibility
  if (distM < 300) return 1.0  // proximity, short detour needed
  return 0
}

// ── V_cult ────────────────────────────────────────────────────────────────────

function computeVcult(segments: GpxSegment[], pois: PoiItem[]): number {
  const cultPois = pois.filter(p => relevanceGrade(p) > 0)
  if (cultPois.length === 0) return 2

  let weightedSum = 0
  let totalLength = 0

  for (const seg of segments) {
    const nearPois = cultPois.filter(
      poi => haversineM(seg.centroid[0], seg.centroid[1], poi.lat, poi.lon) <= 300
    )
    if (nearPois.length === 0) continue

    let segScore = 0
    for (const poi of nearPois) {
      const distM = haversineM(seg.centroid[0], seg.centroid[1], poi.lat, poi.lon)
      const grade = relevanceGrade(poi)
      const prox  = proximityFactor(distM)
      if (prox > 0) {
        const s = Math.min(10, grade * prox)
        if (s > segScore) segScore = s
      }
    }
    if (segScore > 0) {
      weightedSum += segScore * seg.lengthM
      totalLength += seg.lengthM
    }
  }

  if (totalLength === 0) return 2
  return clamp(weightedSum / totalLength)
}

// ── V_topo ────────────────────────────────────────────────────────────────────

function computeVtopo(
  elevGain: number,
  distanceMeters: number,
  segments: GpxSegment[],
): number {
  const distKm = distanceMeters / 1000 || 1

  // Component 3 always available
  const relativeGainScore = clamp((elevGain / distKm) / 80, 0, 1) * 10

  // Per-segment slope analysis
  const slopes: number[] = []
  for (const seg of segments) {
    if (seg.elevations.length < 2 || seg.lengthM <= 0) continue
    const elevDiff = Math.abs(seg.elevations[seg.elevations.length - 1] - seg.elevations[0])
    slopes.push((elevDiff / seg.lengthM) * 100)
  }

  let stdScore = 5
  let optimalSlopeScore = 5

  if (slopes.length >= 3) {
    const mean = slopes.reduce((a, b) => a + b, 0) / slopes.length
    const variance = slopes.map(s => (s - mean) ** 2).reduce((a, b) => a + b, 0) / slopes.length
    stdScore = clamp(Math.sqrt(variance) / 15 * 10, 1, 10)

    const optimalCount = slopes.filter(s => s >= 10 && s <= 25).length
    optimalSlopeScore = clamp((optimalCount / slopes.length) * 10, 1, 10)
  }

  return clamp(stdScore * 0.40 + optimalSlopeScore * 0.35 + relativeGainScore * 0.25)
}

// ── V_idro ────────────────────────────────────────────────────────────────────

function computeVidro(
  segments: GpxSegment[],
  pois: PoiItem[],
  waterways: OsmElement[],
  waterShore: OsmElement[] = [],
): number {
  const waterPois = pois.filter(p => p.type === 'waterfall' || p.type === 'spring')

  let waterSegCount = 0
  for (const seg of segments) {
    const hasWaterPoi = waterPois.some(
      p => haversineM(seg.centroid[0], seg.centroid[1], p.lat, p.lon) <= 50
    )
    const hasWaterway = waterways.some(
      w => haversineM(seg.centroid[0], seg.centroid[1], w.lat, w.lon) <= 50
    )
    // Lake shores use 100m radius: large lakes are represented by shore nodes, not centers
    const hasLakeShore = waterShore.length > 0 && waterShore.some(
      w => haversineM(seg.centroid[0], seg.centroid[1], w.lat, w.lon) <= 100
    )
    if (hasWaterPoi || hasWaterway || hasLakeShore) waterSegCount++
  }

  if (segments.length === 0) return 1
  const idroCoverage = waterSegCount / segments.length
  return clamp(idroCoverage * 10 * 1.5, 1, 10)
}

// ── V_fond ────────────────────────────────────────────────────────────────────

const SURFACE_SCORE: Record<string, number> = {
  unpaved: 9, ground: 9, dirt: 9, grass: 9, rock: 9,
  fine_gravel: 8, gravel: 7, compacted: 7,
  paving_stones: 6,
  asphalt: 3, concrete: 2, paved: 3,
  unknown: 5,
}

function surfaceScore(surface: string | undefined): number {
  if (!surface) return 5
  return SURFACE_SCORE[surface] ?? 5
}

function computeVfond(segments: GpxSegment[], highways: OsmElement[]): number {
  if (highways.length === 0) return 5  // neutral: no surface data

  let totalWeight = 0
  let totalScore = 0

  for (const seg of segments) {
    let nearestDist = Infinity
    let nearestSurface: string | undefined
    for (const h of highways) {
      const d = haversineM(seg.centroid[0], seg.centroid[1], h.lat, h.lon)
      if (d < nearestDist && d <= 100) {
        nearestDist = d
        nearestSurface = h.tags.surface
      }
    }
    totalScore += surfaceScore(nearestSurface) * seg.lengthM
    totalWeight += seg.lengthM
  }

  if (totalWeight === 0) return 5
  return clamp(totalScore / totalWeight)
}

// ── V_geo ─────────────────────────────────────────────────────────────────────
// Stima di geodiversità dal profilo altimetrico già disponibile (nessun DEM esterno):
// combina il range altimetrico complessivo (più dislivello tra punto più basso e più
// alto = più forme del terreno diverse attraversate) con l'alternanza salita/discesa
// tra segmenti consecutivi (un percorso che alterna su e giù di continuo attraversa
// morfologie più varie di una singola salita o discesa monotona).
function computeVgeo(segments: GpxSegment[], elevProfile: number[]): number {
  if (segments.length < 3 || elevProfile.length < 3) return 5

  const minElev = Math.min(...elevProfile)
  const maxElev = Math.max(...elevProfile)
  const rangeScore = clamp((maxElev - minElev) / 100)

  let signChanges = 0
  let prevSign = 0
  for (const seg of segments) {
    if (seg.elevations.length < 2) continue
    const diff = seg.elevations[seg.elevations.length - 1] - seg.elevations[0]
    const sign = diff > 1 ? 1 : diff < -1 ? -1 : 0
    if (sign !== 0 && prevSign !== 0 && sign !== prevSign) signChanges++
    if (sign !== 0) prevSign = sign
  }
  const alternationScore = clamp((signChanges / Math.max(segments.length - 1, 1)) * 20)

  return clamp(rangeScore * 0.5 + alternationScore * 0.5)
}

// ── f_antr ────────────────────────────────────────────────────────────────────

function computeFantr(
  track: [number, number][],
  segments: GpxSegment[],
  highways: OsmElement[],
  antrHighways: OsmElement[],
  powerLines: OsmElement[],
): number {
  let fantr = 0

  // Asphalt penalty: >20% of route on asphalt/concrete
  if (segments.length > 0 && highways.length > 0) {
    const asphaltEls = highways.filter(
      h => h.tags.surface === 'asphalt' || h.tags.surface === 'concrete' || h.tags.surface === 'paved'
    )
    if (asphaltEls.length > 0) {
      const asphaltSegs = segments.filter(seg =>
        asphaltEls.some(h => haversineM(seg.centroid[0], seg.centroid[1], h.lat, h.lon) <= 50)
      )
      if (asphaltSegs.length / segments.length > 0.20) fantr += 0.15
    }
  }

  // Power lines within 100m of any track point
  if (powerLines.length > 0) {
    const hasPowerLine = track.some(pt =>
      powerLines.some(pl => haversineM(pt[0], pt[1], pl.lat, pl.lon) <= 100)
    )
    if (hasPowerLine) fantr += 0.05
  }

  // Heavy traffic roads within 50m for >500m of route
  if (antrHighways.length > 0) {
    let closeLength = 0
    for (const seg of segments) {
      if (antrHighways.some(h => haversineM(seg.centroid[0], seg.centroid[1], h.lat, h.lon) <= 50)) {
        closeLength += seg.lengthM
      }
    }
    if (closeLength > 500) fantr += 0.10
  }

  return Math.min(fantr, 0.25)
}

// ── Main: computeTEI ──────────────────────────────────────────────────────────

export function computeTEI(input: TeiInput): TeiResult {
  const { track, elevGain, distanceMeters, pois, osmData } = input
  const elevProfile = input.elevProfile ?? []

  const segments = segmentGpx(track, elevProfile)

  const vCult = computeVcult(segments, pois)
  const vTopo = computeVtopo(elevGain, distanceMeters, segments)
  const vIdro = computeVidro(segments, pois, osmData?.waterways ?? [], osmData?.waterShore ?? [])
  const vFond = computeVfond(segments, osmData?.highways ?? [])
  const vGeo  = computeVgeo(segments, elevProfile)

  const fAntr = computeFantr(
    track, segments,
    osmData?.highways ?? [],
    osmData?.antrHighways ?? [],
    osmData?.powerLines ?? [],
  )

  const raw   = vCult * 0.20 + vTopo * 0.30 + vIdro * 0.20 + vFond * 0.20 + vGeo * 0.10
  const score = clamp(raw * (1 - fAntr))

  const { label, color } = teiLabel(score)

  const cultPois = pois.filter(p => relevanceGrade(p) > 0)
  const confidence: CtsConfidence =
    cultPois.length === 0 ? 'default' :
    cultPois.length < 3   ? 'estimated' : 'high'

  return {
    score,
    label,
    color,
    breakdown: { vCult, vTopo, vIdro, vFond, vGeo, fAntr, raw },
    confidence,
    version: 2,
  }
}

// ── Convert TeiResult → BeautyScore (backward compat for storage) ─────────────

function teiGrade(score: number): { grade: string; gradeLabel: string; color: string } {
  if (score >= 8.5) return { grade: 'S', gradeLabel: 'Eccellente',   color: '#1D9E75' }
  if (score >= 7.0) return { grade: 'A', gradeLabel: 'Molto buono',  color: '#378ADD' }
  if (score >= 5.5) return { grade: 'B', gradeLabel: 'Buono',        color: '#BA7517' }
  if (score >= 4.0) return { grade: 'C', gradeLabel: 'Sufficiente',  color: '#D85A30' }
  return               { grade: 'D', gradeLabel: 'Basso',          color: '#E24B4A' }
}

function mkCat(key: string, label: string, emoji: string, score: number): CategoryScore {
  const g = teiGrade(score)
  return { key, label, emoji, score, grade: g.grade, gradeLabel: g.gradeLabel, color: g.color, reasons: [] }
}

export function teiToBeautyScore(tei: TeiResult): BeautyScore {
  const { vCult, vTopo, vIdro, vFond, vGeo, fAntr, raw } = tei.breakdown
  const { grade, gradeLabel, color } = teiGrade(tei.score)
  const categories: CategoryScore[] = [
    mkCat('v_cult', 'V. Culturale',    '🏛',  vCult),
    mkCat('v_topo', 'V. Topografico',  '⛰',   vTopo),
    mkCat('v_idro', 'V. Idrografico',  '💧',  vIdro),
    mkCat('v_fond', 'V. Fondo',        '🛤',  vFond),
    mkCat('v_geo',  'V. Geodiversità', '🌍',  vGeo),
  ]
  // Store penalty metadata as special categories so the widget can explain the score reduction
  if (fAntr > 0.001) {
    categories.push({
      key: 'tei_raw', label: 'Punteggio grezzo', emoji: '📊',
      score: raw, grade: '-', gradeLabel: raw.toFixed(1), color: '#64748b', reasons: [],
    })
    categories.push({
      key: 'f_antr', label: 'Penalità antropica', emoji: '🏗',
      score: fAntr, grade: '-', gradeLabel: `-${Math.round(fAntr * 100)}%`, color: '#dc2626', reasons: [],
    })
  }
  return { overall: tei.score, grade, gradeLabel, color, version: 2, categories }
}
