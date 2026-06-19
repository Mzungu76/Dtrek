export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { fetchOverpass, parseOsmDistance, stitchWays, type OsmRelation, type OsmWay } from '@/lib/overpassTrails'
import { totalDistanceKm, sampleEveryNMeters, boundingBox, estimateStats, estimateTimeMinutes, detectRouteType } from '@/lib/trailStats'
import { getCachedTrail, upsertTrailCache, type TrailCacheRow } from '@/lib/trailsCache'

// GET ?id= — metadata (parsed from OSM tags) + stitched geometry for a single trail relation.
// Backed by Overpass, not the Waymarked Trails REST API (which 403s server-side requests).
//
// Trail stats (distance/elevation/duration) often aren't in the OSM tags, so this route
// runs a cascading fallback and caches the result in the `trails` table:
//   1. osm_tags   — distance/ascent/descent all present in the relation tags
//   2/3. calculated/estimated — Haversine distance from geometry + elevation from
//      OpenTopoData (or a bbox estimate if that fails) — needs a slow external call,
//      so this route returns a partial response (statsPending: true) and lets the
//      client finish the job via POST /api/waymarked-trails/stats
//   4. estimated  — no usable geometry at all, bbox estimate for both distance and elevation
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id || !/^\d+$/.test(id)) {
    return NextResponse.json({ error: 'id numerico richiesto' }, { status: 400 })
  }
  const osmId = Number(id)

  // Fast path: a non-estimated cached row skips Overpass entirely, using the
  // simplified geometry (sampled every ~200m) for the map highlight.
  const cached = await getCachedTrail(osmId)
  if (cached && cached.dataQuality !== 'estimated') {
    return NextResponse.json({
      name: cached.name,
      ref: cached.ref,
      network: cached.network,
      distanceKm: cached.distanceKm,
      elevationGain: cached.elevationGain,
      elevationLoss: cached.elevationLoss,
      estimatedTimeMin: cached.estimatedTimeMin,
      routeType: cached.routeType,
      sacScale: cached.difficulty,
      caiScale: cached.caiScale,
      description: cached.description,
      from: cached.fromLabel,
      to: cached.toLabel,
      dataQuality: cached.dataQuality,
      statsPending: false,
      polyline: cached.geometrySimplified,
    })
  }

  const query = `[out:json][timeout:20];
relation(${id})->.rel;
.rel out body;
way(r.rel);
out geom;`

  try {
    const json = await fetchOverpass<{ elements: (OsmRelation | OsmWay)[] }>(query)
    const elements = json.elements ?? []

    const relation = elements.find((e): e is OsmRelation => e.type === 'relation')
    if (!relation) {
      return NextResponse.json({ error: 'Sentiero non trovato' }, { status: 404 })
    }
    const wayMap = new Map(
      elements
        .filter((e): e is OsmWay => e.type === 'way')
        .map(w => [w.id, w]),
    )

    const t = relation.tags ?? {}
    const points = relation.members ? stitchWays(relation.members, wayMap) : []

    const name = t.name || `Percorso ${id}`
    const descriptive = {
      ref: t.ref,
      network: t.network,
      sacScale: t.sac_scale,
      caiScale: t.cai_scale,
      description: t.description,
      from: t.from,
      to: t.to,
      operator: t.operator,
    }
    const altitudeMax = parseInt(t['ele:max'] ?? t.highest_point ?? '') || null
    const altitudeMin = parseInt(t['ele:min'] ?? t.lowest_point ?? '') || null

    const osmDistance = parseOsmDistance(t.distance ?? t.length)
    const osmAscent = parseInt(t.ascent ?? t['ele:gain'] ?? '')
    const osmDescent = parseInt(t.descent ?? t['ele:loss'] ?? '')
    const hasFullOsmStats = osmDistance != null && osmDistance > 0 && !isNaN(osmAscent) && !isNaN(osmDescent)

    if (hasFullOsmStats) {
      const routeType = detectRouteType(points)
      const estimatedTimeMin = estimateTimeMinutes(osmDistance, osmAscent)
      const bbox = points.length >= 2 ? boundingBox(points) : { minLat: 0, maxLat: 0, minLon: 0, maxLon: 0 }
      const geometrySimplified = sampleEveryNMeters(points, 200)

      const row: TrailCacheRow = {
        osmRelationId: osmId, name, distanceKm: osmDistance, elevationGain: osmAscent, elevationLoss: osmDescent,
        estimatedTimeMin, difficulty: descriptive.sacScale, routeType, operator: descriptive.operator,
        network: descriptive.network, bbox, geometrySimplified, dataQuality: 'osm_tags',
        description: descriptive.description, fromLabel: descriptive.from, toLabel: descriptive.to,
        ref: descriptive.ref, caiScale: descriptive.caiScale,
      }
      await upsertTrailCache(row)

      return NextResponse.json({
        name, ...descriptive, altitudeMax, altitudeMin,
        distanceKm: osmDistance, elevationGain: osmAscent, elevationLoss: osmDescent,
        estimatedTimeMin, routeType, dataQuality: 'osm_tags', statsPending: false, polyline: points,
      })
    }

    if (points.length >= 2) {
      // Distance is always resolvable synchronously — only elevation needs the
      // slow OpenTopoData round trip, done by the client's follow-up call.
      const distanceKm = totalDistanceKm(points)
      const routeType = detectRouteType(points)
      const bbox = boundingBox(points)
      const geometrySimplified = sampleEveryNMeters(points, 200)

      return NextResponse.json({
        name, ...descriptive, altitudeMax, altitudeMin,
        distanceKm, routeType, dataQuality: null, statsPending: true,
        polyline: points, geometrySimplified, bbox, osmId,
      })
    }

    // No usable geometry at all — full bbox estimate for both distance and elevation.
    const fallbackBbox = points.length === 1
      ? { minLat: points[0][0] - 0.005, maxLat: points[0][0] + 0.005, minLon: points[0][1] - 0.005, maxLon: points[0][1] + 0.005 }
      : { minLat: 0, maxLat: 0, minLon: 0, maxLon: 0 }
    const estimate = estimateStats(fallbackBbox)
    const estimatedTimeMin = estimateTimeMinutes(estimate.distanceKm, estimate.elevationGain)
    const routeType = 'point_to_point' as const

    const row: TrailCacheRow = {
      osmRelationId: osmId, name, distanceKm: estimate.distanceKm, elevationGain: estimate.elevationGain,
      elevationLoss: estimate.elevationGain, estimatedTimeMin, difficulty: descriptive.sacScale, routeType,
      operator: descriptive.operator, network: descriptive.network, bbox: fallbackBbox, geometrySimplified: points,
      dataQuality: 'estimated', description: descriptive.description, fromLabel: descriptive.from,
      toLabel: descriptive.to, ref: descriptive.ref, caiScale: descriptive.caiScale,
    }
    await upsertTrailCache(row)

    return NextResponse.json({
      name, ...descriptive, altitudeMax, altitudeMin,
      distanceKm: estimate.distanceKm, elevationGain: estimate.elevationGain, elevationLoss: estimate.elevationGain,
      estimatedTimeMin, routeType, dataQuality: 'estimated', statsPending: false, polyline: points,
    })
  } catch {
    return NextResponse.json({ error: 'Overpass non disponibile' }, { status: 502 })
  }
}
