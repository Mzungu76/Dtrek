import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { deleteAccountAndData } from '@/lib/accountDeletion'
import { resolveDtrekEntitlement } from '@/lib/dtrekEntitlement'

export const dynamic = 'force-dynamic'

// Elimina l'account CHIAMANTE e tutti i suoi dati personali (docs/navigator-dtrek-boundary.md) —
// mai un userId passato dal client: solo la sessione autenticata decide chi viene cancellato.
export async function DELETE(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // L'account owner (is_owner in user_settings) è protetto da autocancellazione — questa funzione
  // esiste per liberare rapidamente email di TEST, non per poter distruggere per errore l'unico
  // account reale del prodotto. Se un giorno serve davvero, resta possibile a mano su Supabase.
  const entitlement = await resolveDtrekEntitlement(user.id)
  if (entitlement.isOwner) {
    return NextResponse.json(
      { error: 'owner_protected', message: 'Questo account è protetto come account owner e non può eliminarsi da solo.' },
      { status: 403 },
    )
  }

  try {
    await deleteAccountAndData(user.id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/account/delete:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore imprevisto durante l\'eliminazione dell\'account' },
      { status: 500 },
    )
  }
}
