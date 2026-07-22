import { NextRequest, NextResponse } from 'next/server'
import { resolvePlaceName } from '@/lib/routeBuilder/resolvePlace'

export const dynamic = 'force-dynamic'

// Nessun controllo di autenticazione, stesso trattamento di app/api/geocode/route.ts (un thin
// proxy di lookup, nessun costo/dato per-utente) — a differenza degli altri endpoint di
// route-build, che leggono profilo/storico e quindi richiedono un'identità.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q) return NextResponse.json({ place: null })

  try {
    const place = await resolvePlaceName(q)
    return NextResponse.json({ place })
  } catch (e) {
    console.error('[route-build/resolve-place] resolvePlaceName failed:', e)
    return NextResponse.json({ place: null })
  }
}
