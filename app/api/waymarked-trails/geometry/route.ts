export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { WMT_BASE, USER_AGENT, epsg3857ToWgs84 } from '@/lib/waymarkedTrails'

interface GeoJsonGeometry {
  type: string
  coordinates: unknown
}
interface GeoJsonFeature {
  type: 'Feature'
  geometry: GeoJsonGeometry
}

function flattenLineStrings(geom: GeoJsonGeometry | undefined, out: [number, number][]) {
  if (!geom) return
  if (geom.type === 'LineString') {
    for (const [x, y] of geom.coordinates as [number, number][]) {
      const [lon, lat] = epsg3857ToWgs84(x, y)
      out.push([lat, lon])
    }
  } else if (geom.type === 'MultiLineString') {
    for (const line of geom.coordinates as [number, number][][]) {
      for (const [x, y] of line) {
        const [lon, lat] = epsg3857ToWgs84(x, y)
        out.push([lat, lon])
      }
    }
  }
}

// GET ?id= — already-"stitched" relation geometry (EPSG:3857), reprojected to WGS84 [lat, lon] pairs.
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id || !/^\d+$/.test(id)) {
    return NextResponse.json({ error: 'id numerico richiesto', polyline: [] }, { status: 400 })
  }

  try {
    const res = await fetch(`${WMT_BASE}/details/relation/${id}/geometry`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) throw new Error(`status ${res.status}`)
    const json = await res.json() as {
      type: string
      features?: GeoJsonFeature[]
      geometry?: GeoJsonGeometry
      coordinates?: unknown
    }

    const polyline: [number, number][] = []
    if (json.type === 'FeatureCollection' && Array.isArray(json.features)) {
      for (const f of json.features) flattenLineStrings(f.geometry, polyline)
    } else if (json.type === 'Feature') {
      flattenLineStrings(json.geometry, polyline)
    } else if (json.type === 'LineString' || json.type === 'MultiLineString') {
      flattenLineStrings(json as unknown as GeoJsonGeometry, polyline)
    }

    return NextResponse.json({ polyline })
  } catch {
    return NextResponse.json({ error: 'Waymarked Trails non disponibile', polyline: [] }, { status: 502 })
  }
}
