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

interface WaySummary {
  wayId: number
  highway: string
  tags: Record<string, string>
  lengthKm: number
  segmentCount: number
  avgScore: number
  minScore: number
  maxScore: number
  tier: ReturnType<typeof classifyFinalScore>
  midLat: number
  midLon: number
}

// Un way lungo e ben digitalizzato su OSM (molti nodi) produce decine di archi nodo-nodo con lo
// STESSO punteggio (i tag sono gli stessi per tutta la way) — senza raggruppare, un singolo
// sentiero molto ben taggato monopolizza l'intera classifica "top" e nasconde tutti gli altri.
// Qui si aggrega per wayId: punteggio medio pesato per lunghezza (una way parzialmente dentro
// un'area protetta o vicino a un POI non ha lo stesso contextScore per tutta la sua lunghezza),
// più min/max per far vedere quanto varia lungo il tracciato.
function summarizeByWay(edges: ScoredEdge[]): WaySummary[] {
  const groups = new Map<number, ScoredEdge[]>()
  for (const e of edges) {
    if (e.excluded) continue
    const group = groups.get(e.wayId)
    if (group) group.push(e); else groups.set(e.wayId, [e])
  }

  const summaries: WaySummary[] = []
  for (const [wayId, group] of Array.from(groups)) {
    let lengthM = 0
    let weightedScore = 0
    let minScore = Infinity
    let maxScore = -Infinity
    for (const e of group) {
      lengthM += e.distM
      weightedScore += e.finalScore * e.distM
      if (e.finalScore < minScore) minScore = e.finalScore
      if (e.finalScore > maxScore) maxScore = e.finalScore
    }
    const avgScore = lengthM > 0 ? weightedScore / lengthM : group[0].finalScore
    // Punto rappresentativo: il segmento centrale del gruppo (non la media di lat/lon, che
    // "taglierebbe" le curve di un tracciato non rettilineo).
    const mid = group[Math.floor(group.length / 2)]

    summaries.push({
      wayId,
      highway: group[0].highway,
      tags: group[0].tags,
      lengthKm: Math.round(lengthM / 10) / 100,
      segmentCount: group.length,
      avgScore: Math.round(avgScore),
      minScore: Math.round(minScore),
      maxScore: Math.round(maxScore),
      tier: classifyFinalScore(avgScore),
      midLat: mid.midLat,
      midLon: mid.midLon,
    })
  }

  return summaries.sort((a, b) => b.avgScore - a.avgScore)
}

function summarize(ways: WaySummary[], excludedWayCount: number) {
  const tiers = {
    quasi_certo: { ways: 0, km: 0 },
    molto_probabile: { ways: 0, km: 0 },
    possibile: { ways: 0, km: 0 },
    improbabile: { ways: 0, km: 0 },
  }
  let scoredLengthKm = 0
  for (const w of ways) {
    tiers[w.tier].ways++
    tiers[w.tier].km = Math.round((tiers[w.tier].km + w.lengthKm) * 100) / 100
    if (w.tier !== 'improbabile') scoredLengthKm += w.lengthKm
  }
  return { tiers, excludedWayCount, totalWayCount: ways.length, scoredLengthKm: Math.round(scoredLengthKm * 10) / 10 }
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
    const excludedWayCount = new Set(edges.filter(e => e.excluded).map(e => e.wayId)).size

    const ways = summarizeByWay(edges)
    const topWays = ways.slice(0, 50).map(w => ({
      ...w,
      midLat: Math.round(w.midLat * 1e6) / 1e6,
      midLon: Math.round(w.midLon * 1e6) / 1e6,
    }))

    return NextResponse.json({
      place: place
        ? { lat: place.lat, lon: place.lon, displayName: place.displayName, source: place.source }
        : { lat, lon, source: 'coords' },
      bbox,
      radiusKm,
      totalEdges: edges.length,
      ...summarize(ways, excludedWayCount),
      topWays,
    })
  } catch (e) {
    console.error('[route-build/hiking-probability] Errore:', e)
    return NextResponse.json({ error: 'Calcolo fallito, riprova' }, { status: 500 })
  }
}
