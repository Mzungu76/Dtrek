// Arricchisce con la quota REALE (DTM) la traccia di una singola card "Esistenti" già scelta
// dall'utente — mai chiamato durante la generazione stessa (vedi
// lib/routeBuilder/generateRecommendations.ts, che oggi usa solo cache/stima geometrica per non
// consumare la quota rate-limited di OpenTopography su candidati che potrebbero non essere mai
// aperti). Chiamato una sola volta, per una sola traccia, da Percorsi per te
// (app/percorsi-per-te/page.tsx's handleOpen) subito prima del salvataggio — gemello di
// app/api/route-build/enrich-elevation/route.ts, che fa lo stesso per un candidato "Su misura".
import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequestDetailed } from '@/lib/supabaseAuth'
import { enrichTrackWithRealElevation } from '@/lib/routeBuilder/resolveTrack'
import type { ResolvedTrack } from '@/lib/routeBuilder/foundRoute'

export const dynamic = 'force-dynamic'
export const maxDuration = 30
// Stesso principio già stabilito in enrich-elevation/route.ts: se il DTM è insolitamente lento,
// rispondiamo comunque prima del kill della piattaforma, con la traccia invariata (quota stimata).
const SOFT_DEADLINE_MS = 20_000

export async function POST(req: NextRequest) {
  try {
    return await handlePost(req)
  } catch (e) {
    console.error('[route-build/enrich-track-elevation] Errore imprevisto:', e)
    return NextResponse.json({ error: 'Errore interno' }, { status: 500 })
  }
}

async function handlePost(req: NextRequest): Promise<NextResponse> {
  const { user, authUnavailable, degraded } = await getUserFromRequestDetailed(req)
  if (!user && !degraded) {
    return NextResponse.json(
      authUnavailable
        ? { error: 'auth_unavailable', message: 'Supabase non raggiungibile — riprova tra poco.' }
        : { error: 'Non autenticato' },
      { status: authUnavailable ? 503 : 401 },
    )
  }

  let track: ResolvedTrack
  try {
    const body = await req.json()
    track = body.track
    if (!track?.routePolyline || !Array.isArray(track.routePolyline)) {
      return NextResponse.json({ error: 'track.routePolyline mancante o non valido' }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  }

  const outcome = await Promise.race([
    enrichTrackWithRealElevation(track).then(enriched => ({ kind: 'done' as const, enriched })),
    new Promise<{ kind: 'timeout' }>(resolve => setTimeout(() => resolve({ kind: 'timeout' }), SOFT_DEADLINE_MS)),
  ])
  const result = outcome.kind === 'timeout' ? track : outcome.enriched
  return NextResponse.json({ track: result })
}
