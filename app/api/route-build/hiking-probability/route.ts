// Endpoint di test per il classificatore euristico di lib/routeBuilder/hikingProbability.ts — non
// collegato a nessuna UI, pensato per essere richiamato a mano su tanti luoghi diversi durante la
// taratura (query param invece di dover passare dalla UI di ricerca per ogni prova). Anonimo, stesso
// trattamento di resolve-place/route.ts: nessun costo/dato per-utente, solo Overpass + Nominatim.
//
// Uso:
//   GET /api/route-build/hiking-probability?q=Nera+Montoro,+Narni&radiusKm=3
//   GET /api/route-build/hiking-probability?lat=42.518&lon=12.514&radiusKm=2
import { NextRequest, NextResponse } from 'next/server'
import { resolvePlaceName, type ResolvedPlace } from '@/lib/routeBuilder/resolvePlace'
import { padBbox } from '@/lib/overpassTrails'
import { computeHikingProbability, classifyFinalScore, type Bbox, type ScoredEdge } from '@/lib/routeBuilder/hikingProbability'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const DEFAULT_RADIUS_KM = 3
const MAX_RADIUS_KM = 8

function summarize(edges: ScoredEdge[]) {
  const tiers = { quasi_certo: 0, molto_probabile: 0, possibile: 0, improbabile: 0 }
  let excludedEdges = 0
  let scoredLengthM = 0
  for (const e of edges) {
    if (e.excluded) { excludedEdges++; continue }
    const tier = classifyFinalScore(e.finalScore)
    tiers[tier]++
    if (tier !== 'improbabile') scoredLengthM += e.distM
  }
  return { tiers, excludedEdges, scoredLengthKm: Math.round(scoredLengthM / 100) / 10 }
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const q = params.get('q')?.trim()
  const latParam = params.get('lat')
  const lonParam = params.get('lon')
  const radiusKm = Math.min(MAX_RADIUS_KM, Math.max(0.5, Number(params.get('radiusKm')) || DEFAULT_RADIUS_KM))

  let lat: number
  let lon: number
  let place: ResolvedPlace | null = null

  if (latParam && lonParam) {
    lat = Number(latParam)
    lon = Number(lonParam)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return NextResponse.json({ error: 'lat/lon non validi' }, { status: 400 })
    }
  } else if (q) {
    place = await resolvePlaceName(q).catch(() => null)
    if (!place) return NextResponse.json({ error: `Luogo non risolto: "${q}"` }, { status: 404 })
    lat = place.lat
    lon = place.lon
  } else {
    return NextResponse.json({ error: 'Serve il parametro "q" (nome luogo) oppure "lat" + "lon"' }, { status: 400 })
  }

  const bbox = padBbox([lat, lon, lat, lon], radiusKm) as Bbox

  try {
    const { edges } = await computeHikingProbability(bbox)

    const topEdges = edges
      .filter(e => !e.excluded)
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, 100)
      .map(e => ({
        wayId: e.wayId,
        highway: e.highway,
        tags: e.tags,
        midLat: Math.round(e.midLat * 1e6) / 1e6,
        midLon: Math.round(e.midLon * 1e6) / 1e6,
        finalScore: e.finalScore,
        tier: classifyFinalScore(e.finalScore),
        relationScore: e.relationScore,
        wayScore: e.wayScore,
        contextScore: e.contextScore,
        topologyScore: e.topologyScore,
      }))

    return NextResponse.json({
      place: place
        ? { lat: place.lat, lon: place.lon, displayName: place.displayName, source: place.source }
        : { lat, lon, source: 'coords' },
      bbox,
      radiusKm,
      totalEdges: edges.length,
      ...summarize(edges),
      topEdges,
    })
  } catch (e) {
    console.error('[route-build/hiking-probability] Errore:', e)
    return NextResponse.json({ error: 'Calcolo fallito, riprova' }, { status: 500 })
  }
}
