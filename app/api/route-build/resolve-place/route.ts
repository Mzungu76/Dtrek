import { NextRequest, NextResponse } from 'next/server'
import { resolvePlaceName } from '@/lib/routeBuilder/resolvePlace'
import { getUserFromRequestDetailed } from '@/lib/supabaseAuth'
import { resolveApiKeyAndSettings } from '@/app/lib/guide/resolveApiKeyAndSettings'

export const dynamic = 'force-dynamic'

// I primi due livelli di resolvePlaceName (Nominatim, Overpass per nome) restano anonimi, stesso
// trattamento di app/api/geocode/route.ts (un thin proxy di lookup, nessun costo/dato per-utente) —
// a differenza degli altri endpoint di route-build, che leggono profilo/storico e richiedono
// un'identità. Il terzo livello (AI + ricerca web, useAi=true) richiede invece un utente autenticato
// con una chiave Claude PERSONALE: mai la chiave condivisa di emergenza (resolveEmergencySharedKey)
// — scelta esplicita dell'utente, per non rendere un uso AI a consumo disponibile a chiunque senza
// nemmeno una chiave propria. Se l'utente non è identificabile o non ha una chiave, l'AI viene
// semplicemente saltata: i primi due livelli restano comunque disponibili.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q) return NextResponse.json({ place: null })

  const useAi = req.nextUrl.searchParams.get('useAi') === 'true'
  let ai: { apiKey: string; model: string } | undefined
  if (useAi) {
    try {
      const { user } = await getUserFromRequestDetailed(req)
      if (user) {
        const { apiKey, claudeModel } = await resolveApiKeyAndSettings(user.id, 'routeBuildPlaceSearch')
        if (apiKey) ai = { apiKey, model: claudeModel }
      }
    } catch (e) {
      console.error('[route-build/resolve-place] AI key lookup failed:', e)
    }
  }

  try {
    const place = await resolvePlaceName(q, ai)
    return NextResponse.json({ place })
  } catch (e) {
    console.error('[route-build/resolve-place] resolvePlaceName failed:', e)
    return NextResponse.json({ place: null })
  }
}
