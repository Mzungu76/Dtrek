import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { supabase } from '@/lib/supabase'
import { fetchContainedStops } from '@/lib/metaSearch/placeRelations'
import { generateItinerary } from '@/lib/itinerary'
import { isTimeBudget } from '@/lib/metaSearch/types'

export const dynamic = 'force-dynamic'

// Generazione itinerario per una Meta 'borgo_citta' (piano §25/§26) — tappe = le Mete collegate
// da una relazione 'contains' in dtrek_place_relations (fetchContainedStops), punto di partenza =
// il punto stesso della Meta. Nessun itinerario Sito separato: un Sito è una singola tappa da
// visitare, non una sequenza (piano §26, "Visite Siti" — il flusso è la Meta stessa, non questo
// endpoint).
export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  const placeId = req.nextUrl.searchParams.get('placeId')
  if (!placeId) return NextResponse.json({ error: 'placeId mancante' }, { status: 400 })

  const timeAvailableParam = req.nextUrl.searchParams.get('timeAvailable')
  const timeAvailable = isTimeBudget(timeAvailableParam) ? timeAvailableParam : undefined

  const { data: place, error: placeError } = await supabase
    .from('dtrek_places')
    .select('id, latitude, longitude, meta_type')
    .eq('id', placeId)
    .maybeSingle()

  if (placeError) {
    console.error('[meta-itinerary]', placeError)
    return NextResponse.json({ error: 'Errore interno' }, { status: 500 })
  }
  if (!place) return NextResponse.json({ error: 'Meta non trovata' }, { status: 404 })
  if (place.meta_type !== 'borgo_citta') {
    return NextResponse.json({ error: 'Itinerario disponibile solo per Borghi/Città' }, { status: 400 })
  }

  try {
    const stops = await fetchContainedStops(supabase, placeId)
    const itinerary = generateItinerary({
      start: { latitude: place.latitude, longitude: place.longitude },
      stops,
      timeAvailable,
    })
    return NextResponse.json(itinerary)
  } catch (e) {
    console.error('[meta-itinerary]', e)
    return NextResponse.json({ error: 'Errore interno' }, { status: 500 })
  }
}
