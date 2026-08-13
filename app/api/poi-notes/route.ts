import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'

export const dynamic = 'force-dynamic'

const MAX_IDS = 200 // ben oltre i POI di un singolo percorso — solo un tetto di sicurezza sulla query

/**
 * GET /api/poi-notes?ids=123,456,789 — legge dalla cache condivisa per-POI (lib/poiNotes.ts,
 * scritta da app/api/guide/route.ts quando la sezione "luoghi" viene generata). Nessuna generazione
 * qui: solo lettura, {} per gli id senza nota ancora cachata. Richiede sessione valida come il
 * resto delle API dati (nessun dato sensibile in poi_notes, ma coerenza col resto dell'app).
 */
export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  const idsParam = req.nextUrl.searchParams.get('ids') ?? ''
  const ids = Array.from(new Set(
    idsParam.split(',').map((s) => Number.parseInt(s.trim(), 10)).filter((n) => Number.isFinite(n)),
  )).slice(0, MAX_IDS)
  if (ids.length === 0) return NextResponse.json({})

  const { data, error } = await supabase.from('poi_notes').select('poi_id, text').eq('lang', 'it').in('poi_id', ids)
  if (error) {
    console.error('[poi-notes] read failed:', error.message)
    return NextResponse.json({})
  }

  const byId: Record<string, { text: string }> = {}
  for (const row of data ?? []) byId[String(row.poi_id)] = { text: row.text as string }
  return NextResponse.json(byId)
}
