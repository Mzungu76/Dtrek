// Registra l'esito della pipeline "Su misura" a step (chiamato dal client una sola volta a fine
// flusso, che sia successo o fallimento — vedi components/upload/RouteBuilder.tsx) in
// route_build_logs, esattamente come faceva la pipeline monolitica (app/api/route-build/route.ts's
// logBuild) — nessuna riga sporca a metà percorso, /profilo/log-ricerche resta invariato: una riga
// per ricerca, con la durata totale aggregata lato client su tutti gli step effettivamente chiamati
// (non solo l'ultimo).
import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequestDetailed } from '@/lib/supabaseAuth'
import { logRouteBuildEvent } from '@/lib/routeBuilder/operationsLog'

export const dynamic = 'force-dynamic'
export const maxDuration = 10

export async function POST(req: NextRequest) {
  try {
    const { user } = await getUserFromRequestDetailed(req)
    if (!user) return NextResponse.json({ ok: true }) // modalità degradata: nessuna riga da associare, no-op

    const body = await req.json()
    await logRouteBuildEvent({
      userId: user.id,
      kind: 'build',
      routeType: typeof body.routeType === 'string' ? body.routeType : null,
      targetDistanceKm: typeof body.targetDistanceKm === 'number' ? body.targetDistanceKm : null,
      useAi: false,
      tierReached: typeof body.tierReached === 'string' ? body.tierReached : 'unknown',
      builtCount: typeof body.builtCount === 'number' ? body.builtCount : null,
      retried: body.retried === true,
      message: typeof body.message === 'string' ? body.message : null,
      durationMs: typeof body.durationMs === 'number' ? body.durationMs : 0,
      details: body.details && typeof body.details === 'object' ? body.details : null,
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    // Best-effort, come logRouteBuildEvent stessa: un fallimento qui non deve mai interrompere
    // il flusso del client, solo lasciare quella ricerca senza voce di log.
    console.error('[route-build/step/log] Errore (non bloccante):', e)
    return NextResponse.json({ ok: false })
  }
}
