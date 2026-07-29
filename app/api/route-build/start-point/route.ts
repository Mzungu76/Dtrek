// Classificazione del punto di partenza di un percorso (parcheggio/strada/POI nei pressi di un
// parcheggio) — vedi lib/routeBuilder/startPointInfo.ts. Chiamata client-side da
// components/guida/GuideReader.tsx, una volta per visione della guida (nessuna persistenza,
// il dato è economico da rifare al bisogno).
import { NextRequest, NextResponse } from 'next/server'
import { classifyStartPoint } from '@/lib/routeBuilder/startPointInfo'

export const dynamic = 'force-dynamic'
export const maxDuration = 20

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const lat = Number(searchParams.get('lat'))
  const lon = Number(searchParams.get('lon'))
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ error: 'lat/lon mancanti o non validi' }, { status: 400 })
  }
  const info = await classifyStartPoint(lat, lon).catch(() => null)
  return NextResponse.json({ info })
}
