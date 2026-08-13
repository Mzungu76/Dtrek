import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

function paddleApiBase(): string {
  return process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT === 'production'
    ? 'https://api.paddle.com'
    : 'https://sandbox-api.paddle.com'
}

// Link al Customer Portal Paddle ospitato (docs/navigator-dtrek-boundary.md) — dove chi ha un
// abbonamento ricorrente lo gestisce/cancella da solo. Nessun portale per chi ha sbloccato Dtrek
// con BYOK o come owner: non hanno un paddle_customer_id, 404 volutamente.
export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: settings } = await supabase
    .from('user_settings')
    .select('paddle_customer_id')
    .eq('user_id', user.id)
    .maybeSingle()

  const customerId = settings?.paddle_customer_id as string | null | undefined
  if (!customerId) return NextResponse.json({ error: 'no_paddle_customer' }, { status: 404 })

  const apiKey = process.env.PADDLE_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Non configurato' }, { status: 503 })

  try {
    const res = await fetch(`${paddleApiBase()}/customers/${encodeURIComponent(customerId)}/portal-sessions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    if (!res.ok) return NextResponse.json({ error: 'Errore Paddle' }, { status: 502 })
    const json = await res.json()
    const url = json?.data?.urls?.general?.overview as string | undefined
    if (!url) return NextResponse.json({ error: 'URL non disponibile' }, { status: 502 })
    return NextResponse.json({ url })
  } catch (e) {
    console.error('[api/paddle/portal] errore:', e)
    return NextResponse.json({ error: 'Errore imprevisto' }, { status: 500 })
  }
}
