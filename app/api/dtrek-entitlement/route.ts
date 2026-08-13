import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { resolveDtrekEntitlement } from '@/lib/dtrekEntitlement'

export const dynamic = 'force-dynamic'

// Stato del gate/trial per l'utente corrente (docs/navigator-dtrek-boundary.md) — usato dalle hub
// (components/dtrek/TrialStatusBanner.tsx) per mostrare quanto resta della prova, senza duplicare
// la logica di lib/dtrekEntitlement.ts lato client.
export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const entitlement = await resolveDtrekEntitlement(user.id)
  return NextResponse.json(entitlement)
}
