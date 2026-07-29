// Servizi di trasporto (bus/treno/taxi) entro un raggio dal punto di arrivo di un percorso a sola
// andata — vedi lib/routeBuilder/returnOptions.ts. Chiamata client-side da
// components/guida/GuideReader.tsx, una volta per visione della guida (nessuna persistenza, stesso
// pattern di app/api/route-build/start-point/route.ts).
import { NextRequest, NextResponse } from 'next/server'
import { findReturnOptions } from '@/lib/routeBuilder/returnOptions'

export const dynamic = 'force-dynamic'
export const maxDuration = 20

const DEFAULT_RADIUS_M = 1000
const MAX_RADIUS_M = 3000

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const lat = Number(searchParams.get('lat'))
  const lon = Number(searchParams.get('lon'))
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ error: 'lat/lon mancanti o non validi' }, { status: 400 })
  }
  const radiusParam = Number(searchParams.get('radius'))
  const radius = Number.isFinite(radiusParam) ? Math.min(Math.max(radiusParam, 100), MAX_RADIUS_M) : DEFAULT_RADIUS_M

  const options = await findReturnOptions(lat, lon, radius).catch(() => [])
  return NextResponse.json({ options })
}
