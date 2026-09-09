import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'

export const dynamic = 'force-dynamic'

export interface ShelfSummary {
  id: string
  name: string
  position: number
}

// GET /api/shelves → gli scaffali dell'utente, in ordine — docs/libreria-atlante-piano.md,
// Fase 0. I Diari di ciascuno scaffale non sono qui: arrivano già da GET /api/diaries
// (shelfId/shelfPosition su ogni riga), niente seconda query pesante duplicata.
export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('shelves')
      .select('id, name, position')
      .eq('user_id', user.id)
      .order('position', { ascending: true })
    if (error) throw error

    return NextResponse.json((data ?? []).map(s => ({
      id: s.id as string, name: s.name as string, position: s.position as number,
    } satisfies ShelfSummary)))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

// POST /api/shelves → nuovo scaffale, nome segnaposto se non passato — l'utente lo rinomina
// subito, l'app non propone mai un nome (stesso principio già in vigore per i Diari).
export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({})) as { name?: unknown }
    const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : 'Nuovo scaffale'

    const { count, error: countErr } = await supabase
      .from('shelves')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
    if (countErr) throw countErr

    const { data, error } = await supabase
      .from('shelves')
      .insert({ user_id: user.id, name, position: count ?? 0 })
      .select('id, name, position')
      .single()
    if (error) throw error

    return NextResponse.json({
      id: data.id as string, name: data.name as string, position: data.position as number,
    } satisfies ShelfSummary)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
