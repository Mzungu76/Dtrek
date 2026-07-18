import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequestDetailed } from '@/lib/supabaseAuth'
import {
  resolveAreaBbox, searchHikingRoutesByName, queryHikingRelationsInBbox, padBbox,
  type HikingRouteCandidate,
} from '@/lib/overpassTrails'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Raggio del fallback "sentieri nei dintorni" sotto — abbastanza ampio da coprire i sentieri
// reali di una zona (che raramente partono esattamente dentro i confini di un paese/frazione
// risolti da Nominatim), non così ampio da restituire risultati irrilevanti a un'ora di macchina.
const NEARBY_RADIUS_KM = 12

// Ricerca per nome/zona direttamente su OpenStreetMap (Overpass), nessun LLM coinvolto — a
// differenza di app/api/route-search/route.ts non produce descrizioni, verdetti di comfort né
// candidati "inventati": solo ciò che esiste davvero come relazione hiking su OSM. Stessa identità
// "plausibile ma non verificabile" durante un blackout usata da route-search/resolve, per lo
// stesso motivo: nessuna lettura/scrittura per-utente, solo Overpass e Nominatim (pubblici).
export async function POST(req: NextRequest) {
  const { user, authUnavailable, degraded } = await getUserFromRequestDetailed(req)
  if (!user && !degraded) {
    return NextResponse.json(
      authUnavailable
        ? { error: 'auth_unavailable', message: 'Supabase non raggiungibile — riprova tra poco.' }
        : { error: 'Non autenticato' },
      { status: authUnavailable ? 503 : 401 },
    )
  }

  let name: string
  let area: string | undefined
  try {
    const body = await req.json()
    if (typeof body.name !== 'string' || !body.name.trim()) throw new Error('name mancante')
    name = body.name.trim().slice(0, 120)
    area = typeof body.area === 'string' && body.area.trim() ? body.area.trim().slice(0, 120) : undefined
  } catch {
    return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  }

  let candidates: HikingRouteCandidate[] = []
  let matchKind: 'name' | 'nearby' = 'name'
  try {
    const areaBbox = area ? await resolveAreaBbox(area) : null
    candidates = await searchHikingRoutesByName(name, areaBbox, 8)

    // Nessun match sul tag name — non significa "zona senza sentieri", significa più spesso che
    // il sentiero è mappato solo con un ref (es. "CAI 512", senza name) o con un nome diverso da
    // come l'utente conosce la zona (una sorgente, un mulino, un toponimo). Fallback: interpreta
    // il testo come un luogo (prova prima "area" se presente, altrimenti "name" stesso — un utente
    // che cerca "Clitunno" o "Mola di Narni" sta descrivendo una zona, non il nome esatto di un
    // sentiero) e mostra tutti i sentieri hiking mappati nei dintorni, indipendentemente dal nome.
    if (candidates.length === 0) {
      const nearbyBbox = areaBbox ?? await resolveAreaBbox(name)
      if (nearbyBbox) {
        const [minLat, minLon, maxLat, maxLon] = padBbox(nearbyBbox, NEARBY_RADIUS_KM)
        candidates = await queryHikingRelationsInBbox(minLat, minLon, maxLat, maxLon, 12)
        matchKind = 'nearby'
      }
    }
  } catch (e) {
    console.error('[api/route-search-plain] ricerca Overpass fallita:', e)
    return NextResponse.json({ error: 'Ricerca non riuscita, riprova.' }, { status: 502 })
  }

  return NextResponse.json({ candidates, matchKind })
}
