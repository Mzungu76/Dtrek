import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { incrementHistoryStatsForNewActivity, type RecentHikeEntry } from '@/lib/hikerHistory'
import { supabase } from '@/lib/supabase'

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

  // "Percorsi per te" (vedi lib/routeBuilder/generateRecommendations.ts): marca il batch corrente
  // come da rigenerare al prossimo giro del cron — scrittura sincrona ed economica, non la
  // generazione vera e propria (che gira solo dentro il cron, con il proprio budget di tempo: un
  // kill della piattaforma a metà di una generazione avviata da qui non lascerebbe scrivere né
  // una risposta né un progresso, esattamente il problema già visto altrove in questo route
  // builder). Fa anche da seed della prima riga (con i default della tabella) per il primo utente
  // al primo hike completato mai — best-effort, un fallimento qui non deve mai far fallire il
  // salvataggio dell'attività stessa.
  try {
    await supabase.from('route_recommendations').upsert(
      { user_id: user.id, dirty: true, dirty_reason: 'new_activity', updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    )
  } catch (e) {
    console.error('[user-settings/history] flag dirty per route_recommendations fallito (non bloccante):', e)
  }

  return NextResponse.json({ ok: true })
}
