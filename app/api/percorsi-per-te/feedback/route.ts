import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Segnale esplicito "mi piace / non fa per me" per una card di Percorsi per te — solo raccolto qui
// (feedback JSONB su route_recommendations), nessun ranking/apprendimento ancora costruito sopra:
// il prossimo passo (rendere l'app "più brava" nel tempo) userà questi dati, non li produce.
export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  let cardId: string
  let value: 'like' | 'dislike' | null
  try {
    const body = await req.json()
    if (typeof body.cardId !== 'string' || !body.cardId.trim()) throw new Error('cardId mancante')
    if (body.value !== 'like' && body.value !== 'dislike' && body.value !== null) throw new Error('value non valido')
    cardId = body.cardId
    value = body.value
  } catch {
    return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  }

  const { data: existing } = await supabase
    .from('route_recommendations')
    .select('feedback')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!existing) {
    return NextResponse.json({ error: 'Nessun percorso consigliato per questo utente' }, { status: 404 })
  }

  const feedback = { ...((existing.feedback as Record<string, unknown> | null) ?? {}) }
  if (value === null) delete feedback[cardId]
  else feedback[cardId] = { value, at: new Date().toISOString() }

  const { error } = await supabase
    .from('route_recommendations')
    .update({ feedback, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)

  if (error) {
    console.error('[percorsi-per-te/feedback] scrittura fallita:', error.message)
    return NextResponse.json({ error: 'Salvataggio non riuscito, riprova.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, feedback })
}
