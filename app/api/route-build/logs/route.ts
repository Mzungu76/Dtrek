import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Log privato delle operazioni di ricerca/costruzione percorsi (vedi lib/routeBuilder/operationsLog.ts),
// consultabile su /profilo/log-ricerche — solo le proprie righe (filtro esplicito per user.id, oltre
// alla RLS owner-based sulla tabella stessa: doppia garanzia, non solo RLS).
const MAX_ROWS = 100

export async function GET(req: NextRequest) {
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
    return NextResponse.json({ error: 'Lettura log non riuscita' }, { status: 502 })
  }

  return NextResponse.json({ logs: data ?? [] })
}
