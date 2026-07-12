import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { incrementHistoryStatsForNewActivity, type RecentHikeEntry } from '@/lib/hikerHistory'

export const dynamic = 'force-dynamic'

// Chiamata da lib/activitySave.ts subito dopo che una nuova escursione completata è stata
// salvata (Resoconto) — aggiorna lo storico aggregato usato dalla sezione guida "Su misura per
// te" (app/api/guide/route.ts). Fire-and-forget lato client, nessun dato restituito: se fallisce
// (rete, blackout) lo storico resta semplicemente quello di prima, non blocca mai il salvataggio
// dell'attività stessa.
export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  let entry: RecentHikeEntry
  try {
    const body = await req.json()
    const distanceKm = Number(body.distanceMeters) / 1000
    const elevationGainM = Number(body.elevationGain)
    const durationMin = Number(body.totalTimeSeconds) / 60
    if (!Number.isFinite(distanceKm) || !Number.isFinite(elevationGainM) || !Number.isFinite(durationMin)) {
      throw new Error('dati non validi')
    }
    entry = { distanceKm, elevationGainM, durationMin, completedAt: body.completedAt || new Date().toISOString() }
  } catch {
    return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  }

  await incrementHistoryStatsForNewActivity(user.id, entry)
  return NextResponse.json({ ok: true })
}
