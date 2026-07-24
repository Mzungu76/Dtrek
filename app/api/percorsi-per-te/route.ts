import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { supabase } from '@/lib/supabase'
import { refreshRecommendationsForUser } from '@/lib/routeBuilder/generateRecommendations'

export const dynamic = 'force-dynamic'
// Copre il bootstrap al primo accesso (vedi sotto), che chiama la generazione vera e propria
// sincronamente in questa stessa richiesta — stesso ordine di grandezza di app/api/route-build/route.ts.
export const maxDuration = 60
// Tetto morbido sul bootstrap, con margine rispetto al tetto duro della piattaforma (maxDuration
// sopra) — stesso principio già stabilito in app/api/route-build/route.ts: un kill della
// piattaforma a metà non lascia scrivere nessuna risposta, meglio rispondere noi prima con uno
// stato "pending" (l'utente riprova a breve) che un errore generico o un timeout non gestito.
const BOOTSTRAP_SOFT_DEADLINE_MS = 45_000

// Rete di sicurezza: senza questo wrapper, un'eccezione imprevista in una qualunque delle chiamate
// sotto (Supabase, refreshRecommendationsForUser e tutto ciò che chiama — Overpass, DTM, POI...)
// farebbe crashare la funzione invece di restituire una risposta JSON pulita — osservato in
// produzione come un 503 nudo sulla pagina, stesso principio già applicato a ogni altro endpoint di
// questa famiglia (app/api/route-build/route.ts, app/api/route-build/search/route.ts) ma dimenticato
// qui alla prima stesura.
export async function GET(req: NextRequest) {
  try {
    return await handleGet(req)
  } catch (e) {
    console.error('[percorsi-per-te] Errore imprevisto:', e)
    return NextResponse.json(
      { status: 'error', cards: [], feedback: {}, generatedAt: null, message: 'Caricamento non riuscito per un errore interno, riprova.' },
      { status: 500 },
    )
  }
}

// GET: legge il batch corrente di "Percorsi per te" per l'utente. La rigenerazione periodica vive
// solo nel cron (app/api/cron/refresh-recommendations/route.ts) — l'unica eccezione è il primissimo
// accesso di un utente che non ha ancora nessuna riga: qui si genera subito, invece di fargli
// aspettare il prossimo giro notturno, prima di mostrare una pagina vuota.
//
// ?peek=1: salta il bootstrap — usato dalla tile teaser in Bacheca (app/bacheca/page.tsx), che fa
// lo stesso fetch leggero ad ogni apertura della Bacheca solo per un conteggio/badge. Senza questo,
// il primo utente mai arrivato su Percorsi per te avrebbe innescato una generazione completa
// (fino a decine di secondi) semplicemente aprendo la propria Bacheca — un effetto collaterale
// silenzioso e del tutto inatteso per una pagina che non c'entra nulla con la ricerca percorsi.
async function handleGet(req: NextRequest): Promise<NextResponse> {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  const peek = req.nextUrl.searchParams.get('peek') === '1'

  const { data: existing } = await supabase
    .from('route_recommendations')
    .select('status, cards, feedback, generated_at')
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({
      status: existing.status,
      cards: existing.cards ?? [],
      feedback: existing.feedback ?? {},
      generatedAt: existing.generated_at,
    })
  }

  if (peek) {
    return NextResponse.json({ status: 'pending', cards: [], feedback: {}, generatedAt: null })
  }

  // Nessuna riga ancora — calcolo in-request legittimo (stesso pattern di executeBuild, non
  // l'anti-pattern di continuazione in background: la richiesta resta aperta finché il calcolo non
  // è finito, aspetta davvero la risposta prima di uscire). Il Promise.race sotto impone comunque
  // un tetto morbido: se il calcolo va oltre, rispondiamo "pending" invece di rischiare un kill
  // della piattaforma — il calcolo abbandonato prosegue comunque e scriverà la riga quando finisce,
  // pronta per il prossimo caricamento della pagina.
  const outcome = await Promise.race([
    refreshRecommendationsForUser(user.id).then(() => ({ kind: 'done' as const })),
    new Promise<{ kind: 'timeout' }>(resolve => setTimeout(() => resolve({ kind: 'timeout' }), BOOTSTRAP_SOFT_DEADLINE_MS)),
  ])
  if (outcome.kind === 'timeout') {
    return NextResponse.json({ status: 'pending', cards: [], feedback: {}, generatedAt: null })
  }

  const { data: fresh } = await supabase
    .from('route_recommendations')
    .select('status, cards, feedback, generated_at')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!fresh) {
    return NextResponse.json({ status: 'error', cards: [], feedback: {}, generatedAt: null })
  }
  return NextResponse.json({
    status: fresh.status,
    cards: fresh.cards ?? [],
    feedback: fresh.feedback ?? {},
    generatedAt: fresh.generated_at,
  })
}
