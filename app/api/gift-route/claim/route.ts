import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { claimGiftRoute } from '@/lib/giftRoute'
import { nearestItalianRegion, isItalianRegionSlug } from '@/lib/italianRegions'

export const dynamic = 'force-dynamic'

// Reclama il percorso omaggio (docs/navigator-dtrek-boundary.md) — regione esplicita (picker
// manuale) oppure lat/lon (geolocalizzazione, risolta qui alla regione più vicina).
export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({} as Record<string, unknown>))

  let region: string | null = null
  if (typeof body.region === 'string' && isItalianRegionSlug(body.region)) {
    region = body.region
  } else if (typeof body.lat === 'number' && typeof body.lon === 'number') {
    region = nearestItalianRegion(body.lat, body.lon).slug
  }
  if (!region) return NextResponse.json({ error: 'Regione mancante o non valida' }, { status: 400 })

  const result = await claimGiftRoute(user.id, region)
  return NextResponse.json(result)
}
