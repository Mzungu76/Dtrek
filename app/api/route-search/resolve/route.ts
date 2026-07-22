import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequestDetailed } from '@/lib/supabaseAuth'
import { resolveTrackForCandidate } from '@/lib/routeBuilder/resolveTrack'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Chiamato solo per il SINGOLO candidato che l'utente ha scelto di importare (schermata di
// conferma import) — deliberatamente non fatto per ogni candidato nei risultati di
// app/api/route-search/route.ts, per non sprecare chiamate Overpass/DTM/GPX su percorsi che
// l'utente non sceglierà mai. Non legge/scrive nessuna riga per-utente (solo Overpass, il DTM
// pubblico e — se presente — la pagina fonte stessa) — a differenza degli altri endpoint quindi
// basta un'identità "plausibile ma non verificabile" durante un blackout (stesso `degraded` di
// lib/supabaseAuth.ts) per proseguire comunque, non serve nemmeno la chiave AI di emergenza.
// Thin wrapper: la logica vera è in lib/routeBuilder/resolveTrack.ts, riusata anche dal nuovo
// endpoint di ricerca a livelli (app/api/route-build/search/route.ts) per risolvere più candidati
// lato server senza un self-call HTTP.
export async function POST(req: NextRequest) {
  const { user, authUnavailable, degraded } = await getUserFromRequestDetailed(req)
  if (!user && !degraded) {
    return NextResponse.json(
      authUnavailable
        ? { error: 'auth_unavailable', message: 'Supabase non raggiungibile — riprova tra poco.' }
        : { error: 'Non autenticato' },
      { status: authUnavailable ? 503 : 401 },
    )
  }

  let osmId: number | null
  let gpxUrl: string | null
  try {
    const body = await req.json()
    osmId = Number.isFinite(Number(body.osmId)) ? Number(body.osmId) : null
    gpxUrl = typeof body.gpxUrl === 'string' && body.gpxUrl ? body.gpxUrl : null
    if (osmId == null && !gpxUrl) throw new Error('né osmId né gpxUrl presenti')
  } catch {
    return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  }

  const result = await resolveTrackForCandidate({ osmId, gpxUrl })
  return NextResponse.json(result)
}
