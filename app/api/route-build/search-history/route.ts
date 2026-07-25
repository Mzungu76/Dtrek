// Elenco/salvataggio delle ricerche complete del route builder (vedi lib/routeBuilder/searchHistory.ts
// e supabase/migrations/add_route_search_history_table.sql) — consultabile su
// /profilo/ricerche-salvate. POST è chiamato dal client (components/upload/RouteBuilder.tsx) a fine
// ricerca riuscita, best-effort (non blocca mai la ricerca stessa). GET restituisce solo le proprie
// righe (filtro esplicito, oltre alla RLS owner-based).
import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest, getUserFromRequestDetailed } from '@/lib/supabaseAuth'
import { supabase } from '@/lib/supabase'
import { saveSearchHistoryEntry } from '@/lib/routeBuilder/searchHistory'

export const dynamic = 'force-dynamic'
export const maxDuration = 10

const MAX_ROWS = 100

export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

    const { data, error } = await supabase
      .from('route_search_history')
      .select('id, created_at, mode, query, place_name, result_count')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(MAX_ROWS)

    if (error) {
      console.error('[route-build/search-history] lettura fallita:', error.message)
      return NextResponse.json({ error: 'Lettura ricerche salvate non riuscita — la tabella route_search_history esiste su Supabase?' }, { status: 502 })
    }

    return NextResponse.json({ searches: data ?? [] })
  } catch (e) {
    console.error('[route-build/search-history] Errore imprevisto (GET):', e)
    return NextResponse.json({ error: 'Errore interno' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await getUserFromRequestDetailed(req)
    // Modalità degradata/non autenticato: nessuna riga da associare, nessun errore da mostrare —
    // la ricerca stessa non deve fallire per questo.
    if (!user) return NextResponse.json({ ok: true })

    const body = await req.json().catch(() => null)
    const mode = body?.mode === 'su_misura' ? 'su_misura' : body?.mode === 'esistenti' ? 'esistenti' : null
    const results = Array.isArray(body?.results) ? body.results : []
    if (!mode || results.length === 0) return NextResponse.json({ ok: true })

    await saveSearchHistoryEntry({
      userId: user.id,
      mode,
      query: typeof body.query === 'string' ? body.query : null,
      placeName: typeof body.placeName === 'string' ? body.placeName : null,
      params: body.params && typeof body.params === 'object' ? body.params : {},
      results,
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[route-build/search-history] Errore imprevisto (POST):', e)
    return NextResponse.json({ ok: false })
  }
}
