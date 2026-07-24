import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { supabase } from '@/lib/supabase'
import { refreshRecommendationsForUser } from '@/lib/routeBuilder/generateRecommendations'

export const dynamic = 'force-dynamic'
// Copre il bootstrap al primo accesso (vedi sotto), che chiama la generazione vera e propria
// sincronamente in questa stessa richiesta — stesso ordine di grandezza di app/api/route-build/route.ts.
export const maxDuration = 60

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
export async function GET(req: NextRequest) {
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
  // è finito, aspetta davvero la risposta prima di uscire).
  await refreshRecommendationsForUser(user.id)

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
