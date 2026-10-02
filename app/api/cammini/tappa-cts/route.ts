import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import type { CamminoPlan } from '@/lib/cammini/plan'

export const dynamic = 'force-dynamic'

// Salva il CTS calcolato nel browser per una tappa (docs/piano-cammini.md). Il merge è lato server su
// una lettura fresca del piano: il client non rimanda mai l'intero piano, che potrebbe essere vecchio
// e cancellare testi o reportage scritti nel frattempo dalle altre route.
export async function PUT(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  let body: { hikeId?: unknown; ordinal?: unknown; ts?: unknown; label?: unknown; color?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 }) }
  const hikeId = typeof body.hikeId === 'string' ? body.hikeId : ''
  const ordinal = Number(body.ordinal)
  const ts = Number(body.ts)
  if (!hikeId || !Number.isInteger(ordinal) || !Number.isFinite(ts) || ts < 0 || ts > 100
    || typeof body.label !== 'string' || typeof body.color !== 'string') {
    return NextResponse.json({ error: 'Parametri non validi' }, { status: 400 })
  }
  const { data } = await supabase.from('planned_hikes').select('cammino_plan').eq('id', hikeId).eq('user_id', user.id).maybeSingle()
  const plan = data?.cammino_plan as CamminoPlan | null | undefined
  if (!plan || !plan.tappe.some(t => t.ordinal === ordinal)) return NextResponse.json({ error: 'Tappa non trovata' }, { status: 404 })
  const cts = { ts: Math.round(ts), label: body.label.slice(0, 40), color: body.color.slice(0, 16), computedAt: new Date().toISOString() }
  const next: CamminoPlan = { ...plan, tappe: plan.tappe.map(t => (t.ordinal === ordinal ? { ...t, cts } : t)) }
  const { error } = await supabase.from('planned_hikes').update({ cammino_plan: next }).eq('id', hikeId).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: 'Errore interno' }, { status: 500 })
  return NextResponse.json({ cts })
}
