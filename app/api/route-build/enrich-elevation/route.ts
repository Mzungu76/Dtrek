// Arricchisce con la quota REALE (DTM) un singolo candidato "Su misura" già scelto dall'utente —
// mai chiamato durante la ricerca stessa (vedi lib/routeBuilder/scoreCandidates.ts's
// scoreAndEnrichCandidates, che oggi usa solo una stima geometrica per non consumare la quota
// rate-limited di OpenTopography su candidati che potrebbero non essere mai scelti). Chiamato una
// sola volta, per un solo candidato, dal wizard (components/upload/RouteBuilder.tsx's handleSave)
// e da Percorsi per te (app/percorsi-per-te/page.tsx's handleOpen) subito prima del salvataggio.
import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequestDetailed } from '@/lib/supabaseAuth'
import { enrichBuiltCandidateWithRealElevation, type ScoredCandidate } from '@/lib/routeBuilder/scoreCandidates'

export const dynamic = 'force-dynamic'
// Una singola chiamata DTM (un candidato, non l'intera lista) — ben sotto il tetto di 60s usato
// per l'intera ricerca in app/api/route-build/route.ts, ma comunque dichiarato esplicitamente
// (stessa lezione già imparata con resolve-place: senza dichiarazione la piattaforma applica il
// tetto di default del piano).
export const maxDuration = 30
// Tetto morbido con margine, stesso principio già stabilito altrove in questa famiglia di
// endpoint: se il DTM è insolitamente lento, rispondiamo comunque prima del kill della
// piattaforma — con il candidato invariato (quota stimata), non con un errore. L'utente vede
// comunque il proprio percorso salvato, solo senza l'affinamento del punteggio in questo giro.
const SOFT_DEADLINE_MS = 20_000

export async function POST(req: NextRequest) {
  try {
    return await handlePost(req)
  } catch (e) {
    console.error('[route-build/enrich-elevation] Errore imprevisto:', e)
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

  let candidate: ScoredCandidate
  try {
    const body = await req.json()
    candidate = body.candidate
    if (!candidate?.routePolyline || !Array.isArray(candidate.routePolyline)) {
      return NextResponse.json({ error: 'candidate.routePolyline mancante o non valido' }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  }

  const outcome = await Promise.race([
    enrichBuiltCandidateWithRealElevation(candidate).then(enriched => ({ kind: 'done' as const, enriched })),
    new Promise<{ kind: 'timeout' }>(resolve => setTimeout(() => resolve({ kind: 'timeout' }), SOFT_DEADLINE_MS)),
  ])
  // Timeout: il candidato originale (quota stimata) resta comunque salvabile — meglio un percorso
  // con dislivello provvisorio che nessun percorso salvato.
  const result = outcome.kind === 'timeout' ? candidate : outcome.enriched
  return NextResponse.json({ candidate: result })
}
