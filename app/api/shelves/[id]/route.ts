import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'

export const dynamic = 'force-dynamic'

// PATCH /api/shelves/[id] → rinomina e/o riordina uno scaffale — docs/libreria-atlante-piano.md,
// Fase 0/1.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({})) as { name?: unknown; position?: unknown }
    const dbPatch: Record<string, unknown> = {}

    if (Object.prototype.hasOwnProperty.call(body, 'name')) {
      if (typeof body.name !== 'string' || !body.name.trim()) {
        return NextResponse.json({ error: 'name deve essere una stringa non vuota' }, { status: 400 })
      }
      dbPatch.name = body.name.trim()
    }

    if (Object.prototype.hasOwnProperty.call(body, 'position')) {
      if (typeof body.position !== 'number' || !Number.isFinite(body.position)) {
        return NextResponse.json({ error: 'position deve essere un numero' }, { status: 400 })
      }
      dbPatch.position = body.position
    }

    if (Object.keys(dbPatch).length === 0) {
      return NextResponse.json({ error: 'Nessun campo da aggiornare' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('shelves')
      .update(dbPatch)
      .eq('id', params.id)
      .eq('user_id', user.id)
      .select('id, name, position')
      .single()
    if (error) throw error
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ id: data.id, name: data.name, position: data.position })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

// DELETE /api/shelves/[id] → solo se vuoto. Un Diario sta sempre su uno scaffale (Fase 0): un
// utente che vuole smontare uno scaffale deve prima trascinare via i suoi Diari, mai un
// eliminazione che li fa cadere in uno stato "senza scaffale" implicito.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { count, error: countErr } = await supabase
      .from('diaries')
      .select('id', { count: 'exact', head: true })
      .eq('shelf_id', params.id)
      .eq('user_id', user.id)
    if (countErr) throw countErr
    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: 'Lo scaffale contiene ancora dei Diari — spostali prima di eliminarlo.' },
        { status: 400 },
      )
    }

    const { error } = await supabase
      .from('shelves')
      .delete()
      .eq('id', params.id)
      .eq('user_id', user.id)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
