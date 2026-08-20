import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { supabase } from '@/lib/supabase'
import { refreshRecommendationsForUser, STALE_AFTER_DAYS } from '@/lib/routeBuilder/generateRecommendations'

export const dynamic = 'force-dynamic'
// Copre il bootstrap al primo accesso (vedi sotto), che chiama la generazione vera e propria
// sincronamente in questa stessa richiesta — stesso ordine di grandezza di app/api/route-build/route.ts.
export const maxDuration = 60
// Tetto morbido sul bootstrap, con margine rispetto al tetto duro della piattaforma (maxDuration
// sopra) — stesso principio già stabilito in app/api/route-build/route.ts: un kill della
// piattaforma a metà non lascia scrivere nessuna risposta, meglio rispondere noi prima con uno
// stato "pending" (l'utente riprova a breve) che un errore generico o un timeout non gestito.
const BOOTSTRAP_SOFT_DEADLINE_MS = 45_000
// Le due letture Supabase dirette sotto (fuori dal Promise.race del bootstrap) non erano protette
// da nessun tetto — un 504 osservato in produzione su questo endpoint, anche per un utente che ha
// già una riga (quindi non dovrebbe mai toccare il bootstrap), punta a uno stallo di rete su una di
// queste letture non protetta fino al maxDuration/kill della piattaforma. Stesso principio già
// applicato in lib/dtm/dtmCache.ts's CACHE_LOOKUP_TIMEOUT_MS.
const SUPABASE_READ_TIMEOUT_MS = 8_000

function withTimeout<T>(p: PromiseLike<T>, ms: number): Promise<T> {
  return Promise.race([
    Promise.resolve(p),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ])
}

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

// GET: legge il batch corrente di "Percorsi per te" per l'utente. La rigenerazione periodica
// dovrebbe idealmente vivere solo nel cron (app/api/cron/refresh-recommendations/route.ts), ma
// questa route rigenera anche lei, sincronamente, in due casi: il primissimo accesso di un utente
// che non ha ancora nessuna riga, e una riga esistente dirty/stale che il cron non ha ancora
// ripreso (vedi STALE_SELF_HEAL sotto) — invece di fargli aspettare indefinitamente un giro
// notturno che si è osservato non scattare affatto in produzione.
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

  // null qui significa "lettura fallita/scaduta" (distinto da un risultato riuscito con nessuna
  // riga, che ha comunque forma {data:null, error:null}) — non si prosegue mai al bootstrap in
  // questo caso: un Supabase lento non deve poter innescare una generazione forse-duplicata solo
  // perché non siamo riusciti a verificare se una riga esiste già.
  const existingResult = await withTimeout(
    supabase.from('route_recommendations').select('status, cards, feedback, generated_at, dirty').eq('user_id', user.id).maybeSingle(),
    SUPABASE_READ_TIMEOUT_MS,
  ).catch(() => null)

  if (existingResult === null) {
    return NextResponse.json({ status: 'pending', cards: [], feedback: {}, generatedAt: null })
  }
  const { data: existing } = existingResult

  // STALE_SELF_HEAL: una riga esiste ma è `dirty` (nuova escursione, vedi app/api/user-settings/
  // history/route.ts) o più vecchia di STALE_AFTER_DAYS — normalmente compito del cron
  // (app/api/cron/refresh-recommendations/route.ts), ma quel cron si è osservato NON scattare
  // affatto per settimane in produzione (nessuna invocazione nei runtime log pur essendo
  // dichiarato in vercel.json) lasciando l'utente bloccato su un batch vecchio/vuoto a tempo
  // indeterminato. Qui rigeneriamo al volo, sulla stessa identica visita reale che lo scoprirebbe
  // comunque stantio — la freschezza dei dati non può dipendere solo dal cron.
  const staleBefore = Date.now() - STALE_AFTER_DAYS * 24 * 60 * 60 * 1000
  const needsRefresh = !existing || existing.dirty === true
    || (existing.generated_at ? new Date(existing.generated_at).getTime() < staleBefore : true)

  // ?peek=1 non innesca MAI una generazione (vedi il commento sulla funzione) — restituisce quel
  // che c'è, anche se dirty/stale/assente, mai altro.
  if (peek || !needsRefresh) {
    if (!existing) return NextResponse.json({ status: 'pending', cards: [], feedback: {}, generatedAt: null })
    return NextResponse.json({
      status: existing.status,
      cards: existing.cards ?? [],
      feedback: existing.feedback ?? {},
      generatedAt: existing.generated_at,
    })
  }

  // Serve una rigenerazione — calcolo in-request legittimo (stesso pattern di executeBuild, non
  // l'anti-pattern di continuazione in background: la richiesta resta aperta finché il calcolo non
  // è finito, aspetta davvero la risposta prima di uscire). Il Promise.race sotto impone comunque
  // un tetto morbido: se il calcolo va oltre, rispondiamo con quel che avevamo già (se c'era una
  // riga precedente, meglio dati stantii ma reali di un vuoto "pending") invece di rischiare un
  // kill della piattaforma — il calcolo abbandonato prosegue comunque e scriverà la riga quando
  // finisce, pronta per il prossimo caricamento della pagina.
  const outcome = await Promise.race([
    refreshRecommendationsForUser(user.id).then(() => ({ kind: 'done' as const })),
    new Promise<{ kind: 'timeout' }>(resolve => setTimeout(() => resolve({ kind: 'timeout' }), BOOTSTRAP_SOFT_DEADLINE_MS)),
  ])
  if (outcome.kind === 'timeout') {
    if (existing) {
      return NextResponse.json({
        status: existing.status,
        cards: existing.cards ?? [],
        feedback: existing.feedback ?? {},
        generatedAt: existing.generated_at,
      })
    }
    return NextResponse.json({ status: 'pending', cards: [], feedback: {}, generatedAt: null })
  }

  // La generazione è comunque finita (outcome.kind === 'done') — se questa lettura di conferma
  // fallisce/scade, la riga precedente (se c'era) resta la risposta onesta più utile, non 'error'
  // che implicherebbe un fallimento della generazione stessa.
  const freshResult = await withTimeout(
    supabase.from('route_recommendations').select('status, cards, feedback, generated_at').eq('user_id', user.id).maybeSingle(),
    SUPABASE_READ_TIMEOUT_MS,
  ).catch(() => null)

  if (freshResult === null) {
    if (existing) {
      return NextResponse.json({
        status: existing.status,
        cards: existing.cards ?? [],
        feedback: existing.feedback ?? {},
        generatedAt: existing.generated_at,
      })
    }
    return NextResponse.json({ status: 'pending', cards: [], feedback: {}, generatedAt: null })
  }
  const { data: fresh } = freshResult

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
