// Cancellazione di un singolo preset personale dello Studio Video (vedi ../route.ts per l'elenco
// e il salvataggio) — ownership verificata sia dal filtro esplicito `.eq('user_id', user.id)' sia
// dalla RLS owner-based sulla tabella.
import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

    const { id } = await params
    const { error } = await supabase
      .from('video_custom_presets')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      console.error('[video-presets/[id]] cancellazione fallita:', error.message)
      return NextResponse.json({ error: 'Cancellazione non riuscita' }, { status: 502 })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[video-presets/[id]] Errore imprevisto (DELETE):', e)
    return NextResponse.json({ error: 'Errore interno' }, { status: 500 })
  }
}
