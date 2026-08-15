import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'

export const dynamic = 'force-dynamic'

// Navigator (l'app nativa) e il browser di sistema che apre Dtrek sono due contesti di storage
// separati — la sessione di Navigator non è visibile lì, quindi senza questo endpoint l'utente
// si vedrebbe chiedere il login di nuovo ogni volta che tocca "Apri Dtrek"/"Upgrade a Dtrek",
// anche a login appena fatto su Navigator (docs/navigator-dtrek-boundary.md). Genera un magic
// link one-time via l'Admin API di Supabase (già usata altrove, lib/accountDeletion.ts) per
// l'utente della richiesta corrente, e lo confeziona come URL verso la nostra stessa
// app/auth/callback/route.ts — che gestisce già token_hash+type con verifyOtp, un flusso
// pensato apposta per funzionare aprendo il link in un browser/dispositivo diverso da quello
// che l'ha generato (vedi il commento in quel file).
export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.email) return NextResponse.json({ error: 'Account senza email' }, { status: 400 })

  const { path } = await req.json().catch(() => ({ path: '/' }))
  const nextPath = typeof path === 'string' && path.startsWith('/') ? path : '/'

  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: user.email,
  })
  if (error || !data?.properties?.hashed_token) {
    return NextResponse.json({ error: error?.message ?? 'Impossibile generare il link' }, { status: 500 })
  }

  const url = new URL('/auth/callback', req.nextUrl.origin)
  url.searchParams.set('token_hash', data.properties.hashed_token)
  url.searchParams.set('type', 'magiclink')
  url.searchParams.set('next', nextPath)

  return NextResponse.json({ url: url.toString() })
}
