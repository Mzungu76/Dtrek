import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { fetchWalkNetworkCached } from '@/lib/routeBuilder/walkNetworkCache'
import { buildMultiStopRoute, type MultiStopMode } from '@/lib/routeBuilder/multiStopRoute'
import { scoreAndEnrichCandidates } from '@/lib/routeBuilder/scoreCandidates'
import { padBbox } from '@/lib/overpassTrails'
import { haversineM } from '@/lib/geoUtils'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Un margine fisso (0.4km, il valore precedente — mutuato da app/api/borgo-itinerary/route.ts,
// pensato per tappe auto-scoperte entro 2.5km dal Borgo) tagliava fuori dalla rete scaricata
// esattamente le vie che un cammino reale fra tappe più distanti (scelte liberamente dall'utente,
// spesso paesi diversi separati da una valle) deve percorrere per aggirare il terreno — il
// collegamento non falliva perché irraggiungibile, ma perché la parte di rete che lo conteneva non
// era mai stata scaricata. Il margine ora scala con quanto sono effettivamente distanti le tappe
// scelte (la diagonale del loro rettangolo), con un pavimento e un tetto di sicurezza per il costo
// della query Overpass.
const NETWORK_PADDING_MIN_KM = 1.5
const NETWORK_PADDING_MAX_KM = 5
const NETWORK_PADDING_FACTOR = 0.6
// Più alto del default (18s, lib/routeBuilder/osmGraph.ts) — stessa ragione già documentata per
// app/api/borgo-itinerary/route.ts: un bbox più ampio (tappe distanti + il margine proporzionale
// sopra) rende un fetch a freddo più lento, e senza margine il fallimento più comune non è "nessuna
// via trovata" ma "Overpass non ha risposto in tempo" — un problema diverso, mascherato dallo
// stesso identico messaggio se non si allarga anche il tetto del fetch.
const WALK_NETWORK_TIMEOUT_MS = 25_000

interface StopInput { lat: number; lon: number }

/**
 * POST /api/route-build/multi-stop — itinerario a piedi che deve toccare TUTTE le tappe scelte a
 * mano dall'utente (personalizzazione di un Borgo/Città, components/upload/CreaGuidaMapSearch.tsx),
 * nell'ordine di selezione. Restituisce sempre un percorso — mai un fallimento totale: un tratto
 * irraggiungibile ripiega su una linea d'aria SOLO per quella tratta (`legs[].real === false`,
 * vedi lib/routeBuilder/multiStopRoute.ts), segnalata esplicitamente al client, non nascosta.
 * Richiesta singola (non a step come app/api/route-build/route.ts): il bbox è quello di poche
 * tappe scelte a mano intorno a un solo Borgo/Città, stessa scala di costo di
 * /api/borgo-itinerary, mai quella di un'intera zona esplorata da un punto di partenza libero.
 */
export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  let stops: StopInput[]
  let mode: MultiStopMode
  let targetDistanceKm: number | null
  let targetElevationM: number | null
  try {
    const body = await req.json()
    if (!Array.isArray(body.stops) || body.stops.length < 2) throw new Error('stops mancanti')
    stops = body.stops.map((s: unknown) => {
      const p = s as Record<string, unknown>
      const lat = Number(p.lat)
      const lon = Number(p.lon)
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('tappa non valida')
      return { lat, lon }
    })
    mode = body.mode === 'urbano' ? 'urbano' : 'misto'
    const distRaw = Number(body.targetDistanceKm)
    targetDistanceKm = body.targetDistanceKm != null && Number.isFinite(distRaw) ? distRaw : null
    const elevRaw = Number(body.targetElevationM)
    targetElevationM = body.targetElevationM != null && Number.isFinite(elevRaw) ? elevRaw : null
  } catch {
    return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  }

  // Bbox di tutte le tappe scelte, con un margine proporzionale a quanto sono effettivamente
  // distanti (vedi commento sulle costanti sopra) — le vie che collegano due tappe spesso escono
  // dal rettangolo stretto che le contiene entrambe, tanto più quanto più le tappe sono lontane.
  const rawBbox: [number, number, number, number] = [
    Math.min(...stops.map(s => s.lat)),
    Math.min(...stops.map(s => s.lon)),
    Math.max(...stops.map(s => s.lat)),
    Math.max(...stops.map(s => s.lon)),
  ]
  const diagonalKm = haversineM(rawBbox[0], rawBbox[1], rawBbox[2], rawBbox[3]) / 1000
  const paddingKm = Math.min(NETWORK_PADDING_MAX_KM, Math.max(NETWORK_PADDING_MIN_KM, diagonalKm * NETWORK_PADDING_FACTOR))
  const networkBbox = padBbox(rawBbox, paddingKm)

  let network
  try {
    network = await fetchWalkNetworkCached(networkBbox, false, WALK_NETWORK_TIMEOUT_MS)
  } catch (e) {
    console.error('[route-build/multi-stop] rete pedonale non disponibile:', e)
    return NextResponse.json({ error: 'network_unavailable', message: 'Rete pedonale non disponibile in questo momento, riprova.' }, { status: 502 })
  }

  // targetDistanceKm*1000: cerca il cammino più vicino a questa distanza tratta per tratta (non
  // semplicemente il più breve) quando è più lungo della somma dei cammini minimi — vedi
  // lib/routeBuilder/multiStopRoute.ts. Sempre un risultato: un tratto irraggiungibile ripiega su
  // una linea d'aria SOLO per quella tratta (leg.real === false), mai un fallimento totale.
  const outcome = buildMultiStopRoute(network, stops, mode, targetDistanceKm != null ? targetDistanceKm * 1000 : null)

  // Concatena i tratti in un'unica polyline — scarta il primo punto di ogni tratto dopo il primo,
  // che reconstructPath ripete identico all'ultimo punto del tratto precedente (entrambi partono
  // esattamente dal nodo di aggancio condiviso). Una linea d'aria di ripiego ha comunque solo 2
  // punti (i due estremi), lo stesso schema si applica senza distinzioni.
  const routePolyline: [number, number][] = []
  let totalDistanceM = 0
  outcome.legs.forEach((leg, i) => {
    routePolyline.push(...(i === 0 ? leg.polyline : leg.polyline.slice(1)))
    totalDistanceM += leg.distanceM
  })

  // Un'unica candidata sintetica attraverso lo scorer esistente — solo per la stima di
  // quota/tempo/POI dell'anteprima (nessun ranking: non esiste un'alternativa da confrontare).
  const [scored] = await scoreAndEnrichCandidates(
    [{ type: 'solo_andata', polyline: routePolyline, distanceM: totalDistanceM, bearingDeg: 0, hasSteps: false, hazardMarkers: [] }],
    {
      targetDistanceM: (targetDistanceKm ?? totalDistanceM / 1000) * 1000,
      targetElevationM,
      environmentPrefs: [],
      concerns: [],
      desiredPoiTypes: [],
      bbox: networkBbox,
    },
    1,
  )

  // scoreAndEnrichCandidates scarta solo un candidato con polyline < 2 punti (due tappe scelte
  // così vicine da agganciarsi allo stesso nodo della rete) — un caso raro ma non impossibile, da
  // non far crashare: si risponde comunque con i dati grezzi già calcolati (nessuna stima
  // quota/POI, coerente con "mai inventare un dato" — meglio assente che falso).
  if (!scored) {
    return NextResponse.json({
      ok: true,
      legs: outcome.legs,
      routePolyline,
      trackPoints: [],
      distanceMeters: totalDistanceM,
      elevationGain: 0,
      elevationLoss: 0,
      altitudeMax: 0,
      altitudeMin: 0,
      estimatedTimeSeconds: Math.round(totalDistanceM / 1.2),
      hasElevation: false,
      pois: [],
    })
  }

  return NextResponse.json({
    ok: true,
    legs: outcome.legs,
    routePolyline: scored.routePolyline,
    trackPoints: scored.trackPoints,
    distanceMeters: scored.distanceMeters,
    elevationGain: scored.elevationGain,
    elevationLoss: scored.elevationLoss,
    altitudeMax: scored.altitudeMax,
    altitudeMin: scored.altitudeMin,
    estimatedTimeSeconds: scored.estimatedTimeSeconds,
    hasElevation: scored.hasElevation,
    pois: scored.pois,
  })
}
