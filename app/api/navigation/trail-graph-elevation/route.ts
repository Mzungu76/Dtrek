// Fase 7 di docs/navigator-orizzonti-roadmap.md — chiamata una sola volta, al download del
// pacchetto offline (lib/offline/packageManager.ts), mai durante la navigazione live: arricchisce
// i nodi del trail graph con la quota reale (lib/dtm/graphElevation.ts), lato server perché il
// DTM richiede la chiave OpenTopography e il client service-role, entrambi non disponibili nel
// browser.
import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequestDetailed } from '@/lib/supabaseAuth'
import { enrichGraphNodesWithElevation, type GraphNodeCoord } from '@/lib/dtm/graphElevation'

export const dynamic = 'force-dynamic'
// Stesso tetto di app/api/route-build/enrich-elevation/route.ts (una singola bbox DTM, non
// l'intera pipeline di pianificazione).
export const maxDuration = 30

export async function POST(req: NextRequest) {
  try {
    const { user, authUnavailable, degraded } = await getUserFromRequestDetailed(req)
    if (!user && !degraded) {
      return NextResponse.json(
        authUnavailable
          ? { error: 'auth_unavailable', message: 'Supabase non raggiungibile — riprova tra poco.' }
          : { error: 'Non autenticato' },
        { status: authUnavailable ? 503 : 401 },
      )
    }

    const { nodes } = (await req.json()) as { nodes?: GraphNodeCoord[] }
    if (!Array.isArray(nodes) || nodes.length === 0) {
      return NextResponse.json({ error: 'nodes mancante o vuoto' }, { status: 400 })
    }

    const elevations = await enrichGraphNodesWithElevation(nodes)
    // JSON non ha chiavi numeriche native — il chiamante (packageManager.ts) le riconverte a
    // number quando le riapplica ai nodi del grafo persistito.
    return NextResponse.json({ elevations: Object.fromEntries(elevations) })
  } catch (e) {
    console.error('[api/navigation/trail-graph-elevation] Errore imprevisto:', e)
    return NextResponse.json({ error: 'Errore interno' }, { status: 500 })
  }
}
