import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { resolveDtrekEntitlement } from '@/lib/dtrekEntitlement'

export const dynamic = 'force-dynamic'

// "Passa a Dtrek" — l'unica azione che accende user_settings.dtrek_activated_at
// (docs/navigator-dtrek-boundary.md). Sempre esplicita, mai automatica: chiamata solo dal bottone
// nel menu di Navigator (components/navigation/NavigatorMenu.tsx) dopo conferma dell'utente.
//
// Idempotente e mai regressivo: se la colonna è già valorizzata, la lascia com'è e restituisce lo
// stato attuale — non è pensata per "disattivare" (nessun percorso all'indietro), e ripetere la
// chiamata (doppio tap, retry di rete) non deve spostare la data della prima attivazione.
export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: existing, error: readError } = await supabase
    .from('user_settings')
    .select('dtrek_activated_at')
    .eq('user_id', user.id)
    .maybeSingle()
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 })

  if (!existing?.dtrek_activated_at) {
    const { error: writeError } = await supabase
      .from('user_settings')
      .upsert({ user_id: user.id, dtrek_activated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    if (writeError) return NextResponse.json({ error: writeError.message }, { status: 500 })
  }

  const entitlement = await resolveDtrekEntitlement(user.id)
  return NextResponse.json(entitlement)
}
