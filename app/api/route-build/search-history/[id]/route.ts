// Dettaglio (e cancellazione) di una singola ricerca salvata (vedi ../route.ts per l'elenco) — GET
// restituisce `results` per intero così /profilo/ricerche-salvate/[id] la ri-mostra con le stesse
// card della ricerca originale, senza ricalcolare nulla. Ownership verificata sia dal filtro
// esplicito `.eq('user_id', user.id)` sia dalla RLS owner-based sulla tabella.
import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

    const { id } = await params
    const { data, error } = await supabase
      .from('route_search_history')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) {
      console.error('[route-build/search-history/[id]] lettura fallita:', error.message)
      return NextResponse.json({ error: 'Lettura non riuscita' }, { status: 502 })
    }
    if (!data) return NextResponse.json({ error: 'Ricerca non trovata' }, { status: 404 })

    return NextResponse.json({ search: data })
  } catch (e) {
    console.error('[route-build/search-history/[id]] Errore imprevisto:', e)
    return NextResponse.json({ error: 'Errore interno' }, { status: 500 })
  }
}

// Cancellazione manuale (vedi app/profilo/ricerche-salvate/page.tsx) — oltre al pruning FIFO
// automatico in lib/routeBuilder/searchHistory.ts, l'utente può liberare una ricerca specifica in
// qualunque momento, non solo lasciarla scadere per anzianità.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

    const { id } = await params
    const { error } = await supabase
      .from('route_search_history')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      console.error('[route-build/search-history/[id]] cancellazione fallita:', error.message)
      return NextResponse.json({ error: 'Cancellazione non riuscita' }, { status: 502 })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[route-build/search-history/[id]] Errore imprevisto (DELETE):', e)
    return NextResponse.json({ error: 'Errore interno' }, { status: 500 })
  }
}
