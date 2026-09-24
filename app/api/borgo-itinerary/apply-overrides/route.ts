import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import {
  personalizedTappaMinutes, resolveDurationSignalMinutes, MAX_STOPS_PER_TAPPA,
  type BorgoItineraryOverrides, type BorgoStopOverride,
} from '@/lib/metaSearch/borgoItinerary'
import { readOrBackfillHistoryStats } from '@/lib/hikerHistory'
import { computePersonalizedTappe } from '@/lib/routeBuilder/borgoTappePersonalization'
import type { BorgoItinerary } from '../route'

export const dynamic = 'force-dynamic'
// Stesso tetto di app/api/borgo-itinerary/route.ts — il caso costoso qui (uno spostamento manuale
// confermato) rifà Dijkstra per un bucket alla volta sulla rete pedonale, ma quasi sempre su un
// hit di cache bbox (fetchWalkNetworkForPoints), mai una nuova query Overpass per lo stesso borgo.
export const maxDuration = 120

const WALK_NETWORK_TIMEOUT_MS = 45_000

function isValidOverride(v: unknown): v is BorgoStopOverride {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  if (o.visitMinutes !== undefined && (typeof o.visitMinutes !== 'number' || o.visitMinutes < 0)) return false
  if (o.disabled !== undefined && typeof o.disabled !== 'boolean') return false
  if (o.tappaIndex !== undefined && (typeof o.tappaIndex !== 'number' || o.tappaIndex < 0)) return false
  return true
}

function isValidOverrides(v: unknown): v is BorgoItineraryOverrides {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false
  return Object.values(v as Record<string, unknown>).every(isValidOverride)
}

/**
 * POST /api/borgo-itinerary/apply-overrides — ricalcolo REALE delle tappe di un Borgo/Città dopo
 * che l'utente ha confermato una personalizzazione (piano guide-eccellenza Fase 2, verifica
 * utente: "ricalcolo reale al server quando l'utente conferma" — mai una linea d'aria istantanea
 * lato client per uno spostamento manuale tra tappe). Il tempo di visita per slider e lo
 * spegnimento di un punto restano invece gratuiti e istantanei lato client (lib/metaSearch/
 * borgoItinerary.ts's effectiveVisitMinutesFor/spliceLegsForRemovedStops) — arrivano qui solo
 * quando l'utente preme "Conferma" insieme a un eventuale spostamento manuale, per persistere
 * l'intero insieme di personalizzazioni in un solo posto (planned_hikes.borgo_itinerary_overrides).
 *
 * A differenza di POST /api/borgo-itinerary (che genera l'itinerario BASE condiviso da zero), qui
 * si riparte SEMPRE dalla cache già presente su dtrek_places — questo endpoint non fa mai una
 * nuova geosearch archivio/Wikipedia, solo un nuovo raggruppamento/ricalcolo tragitti sulle stesse
 * tappe già mostrate all'utente.
 */
export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  let placeId: string
  let hikeId: string
  let overrides: BorgoItineraryOverrides
  try {
    const body = await req.json()
    placeId = body.placeId
    hikeId = body.hikeId
    if (!placeId || typeof placeId !== 'string') throw new Error()
    if (!hikeId || typeof hikeId !== 'string') throw new Error()
    if (!isValidOverrides(body.overrides)) throw new Error()
    overrides = body.overrides
  } catch {
    return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  }

  const { data: hike, error: hikeError } = await supabase
    .from('planned_hikes')
    .select('id')
    .eq('id', hikeId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (hikeError) {
    console.error('[apply-overrides]', hikeError)
    return NextResponse.json({ error: 'Errore interno' }, { status: 500 })
  }
  if (!hike) return NextResponse.json({ error: 'Meta pianificata non trovata' }, { status: 404 })

  const { data: borgo, error: borgoError } = await supabase
    .from('dtrek_places')
    .select('latitude, longitude, itinerary_cache')
    .eq('id', placeId)
    .eq('meta_type', 'borgo_citta')
    .maybeSingle()
  if (borgoError) {
    console.error('[apply-overrides]', borgoError)
    return NextResponse.json({ error: 'Errore interno' }, { status: 500 })
  }
  // Nessuna cache ancora calcolata per questo Borgo — l'utente non può aver visto/personalizzato
  // un itinerario che non esiste: il client deve prima caricare POST /api/borgo-itinerary.
  if (!borgo || !borgo.itinerary_cache) {
    return NextResponse.json({ error: 'Itinerario non ancora disponibile per questo Borgo/Città' }, { status: 409 })
  }

  const center = { lat: borgo.latitude as number, lon: borgo.longitude as number }
  const cached = borgo.itinerary_cache as BorgoItinerary

  const [prefDurata, history] = await Promise.all([
    Promise.resolve(supabase.from('user_settings').select('pref_durata').eq('user_id', user.id).maybeSingle())
      .then(({ data }) => data?.pref_durata as number | undefined)
      .catch(() => undefined),
    readOrBackfillHistoryStats(user.id).catch(() => undefined),
  ])
  const durationSignal = resolveDurationSignalMinutes(history, prefDurata)

  const tappe = await computePersonalizedTappe(
    center, cached.stops, cached.legs, overrides, MAX_STOPS_PER_TAPPA, personalizedTappaMinutes(durationSignal), WALK_NETWORK_TIMEOUT_MS,
  )

  // Persistito PRIMA di rispondere (a differenza della cache condivisa in POST /api/borgo-itinerary,
  // fire-and-forget lì solo per non allungare l'apertura della guida): qui è l'azione esplicita di
  // "Conferma" dell'utente, la risposta deve garantire che la personalizzazione sia salvata.
  const { error: saveError } = await supabase
    .from('planned_hikes')
    .update({ borgo_itinerary_overrides: overrides })
    .eq('id', hikeId)
    .eq('user_id', user.id)
  if (saveError) {
    console.error('[apply-overrides] salvataggio overrides fallito', saveError)
    return NextResponse.json({ error: 'Errore nel salvataggio delle personalizzazioni' }, { status: 500 })
  }

  return NextResponse.json({ tappe })
}
