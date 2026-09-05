import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { normalizeDiaryOrder } from '@/lib/raccolte/normalizeDiaryOrder'

export const dynamic = 'force-dynamic'

// PUT /api/collections/[id]/diari { diaryIds: string[] } → sostituisce l'intero elenco ordinato
// dei Diari della Raccolta — un solo endpoint invece di add/remove/reorder separati, perché
// l'ordine è già tutto lì (docs/raccolte-pubblicazione-piano.md, Fase 3c). `diaryIds` è il nuovo
// ordine completo: l'indice nell'array diventa `position`.
//
// Cancella e reinserisce (non un diff riga per riga): più semplice, e il caso reale — l'utente
// riordina o aggiunge un volume da un piccolo elenco — non ha bisogno di un merge fine. Un
// fallimento a metà lascia la raccolta con meno volumi, mai con dati incoerenti (nessun vincolo
// figlio dipende da collection_diaries).
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: collection, error: collectionErr } = await supabase
      .from('collections')
      .select('id')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (collectionErr) throw collectionErr
    if (!collection) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const body = await req.json().catch(() => ({})) as { diaryIds?: unknown }
    if (!Array.isArray(body.diaryIds)) {
      return NextResponse.json({ error: 'diaryIds deve essere un array' }, { status: 400 })
    }
    const diaryIds = normalizeDiaryOrder(body.diaryIds)

    if (diaryIds.length > 0) {
      const { data: owned, error: ownedErr } = await supabase
        .from('diaries')
        .select('id')
        .eq('user_id', user.id)
        .in('id', diaryIds)
      if (ownedErr) throw ownedErr
      const ownedIds = new Set((owned ?? []).map(d => d.id as string))
      const missing = diaryIds.filter(id => !ownedIds.has(id))
      if (missing.length > 0) {
        return NextResponse.json({ error: `Diari non trovati: ${missing.join(', ')}` }, { status: 400 })
      }
    }

    const { error: deleteErr } = await supabase
      .from('collection_diaries')
      .delete()
      .eq('collection_id', params.id)
    if (deleteErr) throw deleteErr

    if (diaryIds.length > 0) {
      const rows = diaryIds.map((diary_id, position) => ({
        collection_id: params.id, diary_id, user_id: user.id, position,
      }))
      const { error: insertErr } = await supabase.from('collection_diaries').insert(rows)
      if (insertErr) throw insertErr
    }

    return NextResponse.json({ diaryIds })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
