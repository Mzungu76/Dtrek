import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import type { CamminoPlan } from '@/lib/cammini/plan'
import { emptyReport } from '@/lib/cammini/report'

export const dynamic = 'force-dynamic'

// POST { hikeId, enabled } — pubblica o ritira il link del reportage del cammino. Il token sta nel piano
// (cammino_plan.report.shareToken) e si legge da /leggi/p/<token> (lib/sharePublicReport.ts).
export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  let body: { hikeId?: unknown; enabled?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 }) }
  const hikeId = typeof body.hikeId === 'string' ? body.hikeId : ''
  if (!hikeId) return NextResponse.json({ error: 'Cammino mancante' }, { status: 400 })

  // Rilegge subito prima di scrivere: non sovrascrive i capitoli scritti nel frattempo.
  const { data } = await supabase.from('planned_hikes').select('cammino_plan').eq('id', hikeId).eq('user_id', user.id).maybeSingle()
  const plan = data?.cammino_plan as CamminoPlan | null | undefined
  if (!plan) return NextResponse.json({ error: 'Cammino non trovato' }, { status: 404 })

  const now = new Date().toISOString()
  const report = plan.report ?? emptyReport(now)
  const token = body.enabled ? (report.shareToken ?? crypto.randomUUID()) : undefined
  const { shareToken: _old, ...rest } = report
  void _old
  const next: CamminoPlan = { ...plan, report: { ...rest, ...(token ? { shareToken: token } : {}), updatedAt: now } }
  const { error } = await supabase.from('planned_hikes').update({ cammino_plan: next }).eq('id', hikeId).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: 'Non sono riuscita a salvare' }, { status: 500 })
  return NextResponse.json({ token: token ?? null })
}
