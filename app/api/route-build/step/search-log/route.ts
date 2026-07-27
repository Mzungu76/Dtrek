// Registra l'esito della ricerca "Esistenti" a step (chiamato dal client una sola volta a fine
// flusso — vedi components/upload/RouteBuilder.tsx), stesso schema/tabella già usato dalla pipeline
// monolitica (app/api/route-build/search/route.ts) — nessuna riga sporca a metà percorso,
// /profilo/log-ricerche resta invariato.
import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequestDetailed } from '@/lib/supabaseAuth'
import { logRouteBuildEvent } from '@/lib/routeBuilder/operationsLog'

export const dynamic = 'force-dynamic'
export const maxDuration = 10

export async function POST(req: NextRequest) {
  try {
    const { user } = await getUserFromRequestDetailed(req)
    if (!user) return NextResponse.json({ ok: true })

    const body = await req.json()
    await logRouteBuildEvent({
      userId: user.id,
      kind: 'search',
      query: typeof body.query === 'string' ? body.query : null,
      useAi: body.useAi === true,
      tierReached: typeof body.tierReached === 'string' ? body.tierReached : 'unknown',
      placeName: typeof body.placeName === 'string' ? body.placeName : null,
      foundCount: typeof body.foundCount === 'number' ? body.foundCount : null,
      escalatedToAi: body.escalatedToAi === true,
      durationMs: typeof body.durationMs === 'number' ? body.durationMs : 0,
      details: body.details && typeof body.details === 'object' ? body.details : null,
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[route-build/step/search-log] Errore (non bloccante):', e)
    return NextResponse.json({ ok: false })
  }
}
