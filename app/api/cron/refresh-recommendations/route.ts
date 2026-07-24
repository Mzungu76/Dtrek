import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { refreshRecommendationsForUser } from '@/lib/routeBuilder/generateRecommendations'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Vercel Cron Job (vedi vercel.json), una volta al giorno — il piano Hobby non permette una
// frequenza maggiore. Copre sia la cadenza "settimanale" (STALE_AFTER_DAYS) sia il pickup dello
// stesso giorno per chi è stato marcato `dirty` da un'escursione appena completata (vedi il flag
// scritto in app/api/user-settings/history/route.ts).
const SWEEP_BATCH_CAP = 25
// Stesso principio già usato in app/api/route-build/route.ts: un tetto morbido con margine
// rispetto al limite duro della piattaforma (maxDuration sopra), per uscire dal giro prima che la
// funzione venga terminata a metà — le righe non ancora processate restano `dirty`/stale e vengono
// riprese dal giro di domani, invece di rischiare un kill silenzioso senza alcun progresso salvato.
const SOFT_DEADLINE_MS = 45_000
const STALE_AFTER_DAYS = 7

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const startedAt = Date.now()
  const staleBefore = new Date(Date.now() - STALE_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString()

  // Sweep limitato a chi ha già una riga in route_recommendations (mai un giro su tutta
  // auth.users) — il lavoro cresce con l'uso reale della funzionalità, non con gli iscritti
  // totali. Più vecchie/mai generate per prime, per garantire progresso anche se il tetto morbido
  // interrompe il giro prima di coprire tutte le righe candidate.
  const { data: rows, error } = await supabase
    .from('route_recommendations')
    .select('user_id')
    .or(`dirty.eq.true,generated_at.lt.${staleBefore}`)
    .order('generated_at', { ascending: true, nullsFirst: true })
    .limit(SWEEP_BATCH_CAP)

  if (error) {
    console.error('[cron/refresh-recommendations] lettura righe da aggiornare fallita:', error.message)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  let refreshed = 0
  let skipped = 0
  for (const row of rows ?? []) {
    if (Date.now() - startedAt > SOFT_DEADLINE_MS) { skipped++; continue }
    await refreshRecommendationsForUser(row.user_id).catch(e => console.error('[cron/refresh-recommendations]', row.user_id, e))
    refreshed++
  }

  return NextResponse.json({ ok: true, refreshed, skipped, swept: rows?.length ?? 0 })
}
