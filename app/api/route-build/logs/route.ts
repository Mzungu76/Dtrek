import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Log privato delle operazioni di ricerca/costruzione percorsi (vedi lib/routeBuilder/operationsLog.ts),
// consultabile su /profilo/log-ricerche — solo le proprie righe (filtro esplicito per user.id, oltre
// alla RLS owner-based sulla tabella stessa: doppia garanzia, non solo RLS).
const MAX_ROWS = 100

// Rete di sicurezza: senza questo try/catch, un'eccezione imprevista (es. verifica della sessione
// fallita) produce una risposta non-JSON che il client legge come un errore di parsing invece che
// come un messaggio comprensibile — stesso principio già applicato a route-build e route-build/search.
export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

    const { data, error } = await supabase
      .from('route_build_logs')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(MAX_ROWS)

    if (error) {
      console.error('[route-build/logs] lettura fallita:', error.message)
      return NextResponse.json({ error: 'Lettura log non riuscita — la tabella route_build_logs esiste su Supabase?' }, { status: 502 })
    }

    return NextResponse.json({ logs: data ?? [] })
  } catch (e) {
    console.error('[route-build/logs] Errore imprevisto:', e)
    return NextResponse.json({ error: 'Errore interno nella lettura del log' }, { status: 500 })
  }
}
