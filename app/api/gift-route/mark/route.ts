import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { resolveDtrekEntitlement } from '@/lib/dtrekEntitlement'
import { isItalianRegionSlug } from '@/lib/italianRegions'

export const dynamic = 'force-dynamic'

// Strumento owner-only per taggare un percorso come "master" regionale del percorso omaggio
// (docs/navigator-dtrek-boundary.md) — solo sulle proprie righe planned_hikes, mai su quelle di
// un altro utente (vedi lib/giftRoute.ts, che poi le clona per ogni nuovo account).

// ── GET ?hikeId=X → stato attuale (is_sample, sample_region) ─────────────────
export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const entitlement = await resolveDtrekEntitlement(user.id)
  if (!entitlement.isOwner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const hikeId = req.nextUrl.searchParams.get('hikeId')
  if (!hikeId) return NextResponse.json({ error: 'hikeId mancante' }, { status: 400 })

  const { data, error } = await supabase
    .from('planned_hikes')
    .select('is_sample, sample_region')
    .eq('id', hikeId).eq('user_id', user.id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    isSample:     (data?.is_sample as boolean | null) ?? false,
    sampleRegion: (data?.sample_region as string | null) ?? null,
  })
}

// ── POST { hikeId, region, isSample } → imposta/rimuove il flag ──────────────
export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const entitlement = await resolveDtrekEntitlement(user.id)
  if (!entitlement.isOwner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({} as Record<string, unknown>))
  const hikeId   = body.hikeId as string | undefined
  const isSample = !!body.isSample
  const region   = body.region as string | undefined
  if (!hikeId) return NextResponse.json({ error: 'hikeId mancante' }, { status: 400 })

  if (isSample) {
    if (!isItalianRegionSlug(region)) {
      return NextResponse.json({ error: 'Regione non valida' }, { status: 400 })
    }
    // Un solo master per regione — toglie il flag da un eventuale altro percorso già marcato per
    // la stessa regione, altrimenti lib/giftRoute.ts troverebbe due righe candidate ed errore.
    await supabase.from('planned_hikes')
      .update({ is_sample: false, sample_region: null })
      .eq('user_id', user.id).eq('is_sample', true).eq('sample_region', region).neq('id', hikeId)

    const { error } = await supabase.from('planned_hikes')
      .update({ is_sample: true, sample_region: region })
      .eq('id', hikeId).eq('user_id', user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await supabase.from('planned_hikes')
      .update({ is_sample: false, sample_region: null })
      .eq('id', hikeId).eq('user_id', user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
