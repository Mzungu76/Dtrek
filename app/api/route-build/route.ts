import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequestDetailed } from '@/lib/supabaseAuth'
import { padBbox } from '@/lib/overpassTrails'
import { haversineM } from '@/lib/geoUtils'
import { fetchWalkNetwork, nearestGraphNode } from '@/lib/routeBuilder/osmGraph'
import { generateLoopCandidates, generateOutAndBackCandidates, generateOneWayCandidates, generateOutAndBackToPoint, type RouteType } from '@/lib/routeBuilder/loopBuilder'
import { scoreAndEnrichCandidates, type ScoredCandidate } from '@/lib/routeBuilder/scoreCandidates'
import { fetchHikerProfile, fetchActivitySummary } from '@/lib/hikerContext'
import { sanitizeHikerConcerns, sanitizeHikerEnvironmentPrefs } from '@/lib/hikerProfile'
import { POI_META, type PoiType } from '@/lib/overpass'
import { logRouteBuildEvent } from '@/lib/routeBuilder/operationsLog'

const VALID_POI_TYPES = new Set(Object.keys(POI_META))

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MIN_TARGET_DISTANCE_KM = 1
// Abbassato da 20 a 15: un target più alto allarga il bbox interrogato via Overpass (vedi
// bboxRadiusKm sotto) fino a superare, in aree con rete fitta, il tempo disponibile prima che la
// funzione venga terminata dalla piattaforma (504 osservato in produzione) — vedi anche il
// restringimento dei tag highway in lib/routeBuilder/osmGraph.ts, la causa principale dello stesso problema.
const MAX_TARGET_DISTANCE_KM = 15
// Un punto di partenza a più di questa distanza da qualunque nodo della rete percorribile non ha
// abbastanza rete nei dintorni per costruire un percorso — meglio un errore chiaro che un anello
// costruito su un frammento isolato di strada.
const START_SNAP_THRESHOLD_M = 500
// Tagli ammessi per il filtro "raggio di ricerca" del wizard (visibile in mappa, condiviso da
// ricerca base e avanzata — vedi components/upload/RouteBuilder.tsx). Qui in route-build ha effetto
// SOLO in modalità 'dintorni' (allarga l'aggancio alla rete e il bbox, clampato a
// BUILD_DINTORNI_MAX_KM) — in modalità 'esatto' non restringe più il bbox (vedi bboxRadiusKm): resta
// solo il tetto fisso di sicurezza di 10 km, per non reintrodurre il rischio di query Overpass
// troppo pesanti che ha già causato dei 504 in passato.
const ALLOWED_RADIUS_KM = [5, 10, 20, 50, 100]
const DEFAULT_RADIUS_KM = 20
// Tetto per la modalità "dintorni" (vedi BuildRequestBody.startMode): il raggio scelto dall'utente
// può arrivare a 100 km, ma qui va clampato allo stesso tetto di sicurezza del bbox (10 km) — oltre,
// sia la ricerca del punto d'aggancio sia il bbox interrogato via Overpass rischierebbero lo stesso
// tipo di query pesante che ha già causato dei 504/timeout in passato.
const BUILD_DINTORNI_MAX_KM = 8

// Sotto questa soglia di percorsi costruiti algoritmicamente (senza destinazione), l'app ritenta
// con lunghezze leggermente diverse (vedi RETRY_DISTANCE_FACTORS): in una rete di sentieri rada
// attorno al punto di partenza, un'unica lunghezza target può lasciare sopravvivere pochi
// candidati realmente distinti (troppe direzioni finiscono per ripercorrere lo stesso tratto),
// mentre lunghezze leggermente diverse seguono spesso percorsi geometricamente diversi.
const MIN_BUILT_RESULTS = 8
// Fattori di lunghezza alternativi provati in caso di scarsità (es. per un obiettivo di 8 km:
// un tentativo a ~6 km e uno a ~10 km) — comunque clampati entro MIN/MAX_TARGET_DISTANCE_KM.
const RETRY_DISTANCE_FACTORS = [0.75, 1.25]
const MAX_BUILT_RESULTS = 14
// Quanti candidati grezzi arricchire davvero (DTM + POI) per passata — i generatori li restituiscono
// già ordinati dal più vicino al target di lunghezza (vedi loopBuilder.ts), quindi tagliare qui
// tiene i migliori. Arricchire tutti e 14 in una volta (fino a poco fa) significava fino a 14
// chiamate DTM concorrenti più altrettante POI — un fattore concreto nei timeout di produzione
// osservati in aree con rete rada (dove ogni candidato aggiunto pesa, senza aumentare di molto le
// probabilità di successo). Il ritentativo esiste apposta per recuperare se questi non bastano.
const ENRICH_CAP = 8
// Se il primo tentativo (fetch rete + arricchimento) ha già consumato più di questo, il
// ritentativo viene saltato — meglio pochi risultati garantiti entro il tetto di 60s della
// funzione (maxDuration sopra) che rischiare un kill della piattaforma a metà ritentativo, che non
// lascia scrivere né una risposta né una riga di log (vedi commento sul ritentativo sotto).
const BUILD_TIME_BUDGET_MS = 40_000
// Tetto morbido sull'intera richiesta (fetch rete + arricchimento + eventuale ritentativo),
// deciso da noi con margine rispetto al tetto duro di 60s della piattaforma (maxDuration sopra):
// un kill della piattaforma non è un'eccezione JS, nessun try/catch può intercettarlo, quindi non
// lascia scrivere né una risposta né una riga di log — osservato in produzione (Vercel Runtime
// Errors: "Task timed out after 60 seconds" su questo stesso endpoint). Rispondere noi prima,
// anche con un esito vuoto ma spiegato, è sempre meglio di un silenzio totale.
const SOFT_DEADLINE_MS = 45_000

// ── GET: valori suggeriti per precompilare il wizard (storico attività + profilo) ───────────────
// Nessun costo AI qui — solo letture Supabase già esistenti (lib/hikerContext.ts, stesse usate da
// app/api/route-search/route.ts). In modalità degradata risponde con suggerimenti vuoti invece di
// un errore, il wizard resta comunque utilizzabile con valori di default fissi.

export async function GET(req: NextRequest) {
  const { user, authUnavailable, degraded } = await getUserFromRequestDetailed(req)
  if (!user && !degraded) {
    return NextResponse.json(
      authUnavailable
        ? { error: 'auth_unavailable', message: 'Supabase non raggiungibile — riprova tra poco.' }
        : { error: 'Non autenticato' },
      { status: authUnavailable ? 503 : 401 },
    )
  }

  if (!user) {
    return NextResponse.json({
      suggestedDistanceKm: null, suggestedElevationM: null, environmentPrefs: [], concerns: [],
      routeBuildAiPlaceSearch: true,
    })
  }

  const [profile, history] = await Promise.all([fetchHikerProfile(user.id), fetchActivitySummary(user.id)])
  return NextResponse.json({
    suggestedDistanceKm: history.count > 0 ? Math.round(history.avgDistanceKm * 10) / 10 : null,
    suggestedElevationM: history.count > 0 ? Math.round(history.avgElevationM) : null,
    environmentPrefs: sanitizeHikerEnvironmentPrefs(profile.environmentPrefs),
    concerns: sanitizeHikerConcerns(profile.concerns),
    routeBuildAiPlaceSearch: profile.routeBuildAiPlaceSearch,
  })
}

// ── POST: genera i candidati ─────────────────────────────────────────────────────────────────
// Puro calcolo (Overpass + grafo + pathfinding + arricchimento DTM/POI): a differenza di
// route-search, nessuna chiamata Anthropic, quindi nessuna chiave AI richiesta all'utente.

interface BuildRequestBody {
  lat: number
  lon: number
  routeType: RouteType
  targetDistanceKm: number
  targetElevationM: number | null
  // Destinazione esatta (luogo noto risolto per nome, vedi lib/routeBuilder/resolvePlace.ts) —
  // opzionale per andata_ritorno e solo_andata (per un anello non ha senso, si torna comunque al
  // punto di partenza): qui la lunghezza è un risultato del percorso reale verso quel punto, non
  // un vincolo, quindi targetDistanceKm viene ignorato quando presente.
  destinationLat: number | null
  destinationLon: number | null
  // Precompilati dal profilo (GET sopra) ma modificabili per questa singola ricerca — null
  // significa "non inviato dal client", si ricade sul profilo come faceva già il codice originale.
  environmentPrefs: ReturnType<typeof sanitizeHikerEnvironmentPrefs> | null
  desiredPoiTypes: PoiType[]
  // Filtro raggio di ricerca (5/10/20/50/100 km) — qui usato solo per restringere ulteriormente
  // il bbox interrogato, mai per allargarlo oltre il tetto di sicurezza esistente. Con
  // startMode 'dintorni', lo stesso raggio (clampato più stretto, vedi BUILD_DINTORNI_MAX_KM)
  // diventa anche la distanza massima entro cui agganciare il punto di partenza reale.
  radiusKm: number
  // 'esatto' (default): il punto dato deve avere rete percorribile nel raggio fisso
  // START_SNAP_THRESHOLD_M. 'dintorni': il punto è un centro d'interesse (una città, un POI) non
  // necessariamente vicino a un sentiero — si cerca il miglior aggancio alla rete entro radiusKm
  // invece di richiedere che il punto stesso sia già a ridosso di un sentiero.
  startMode: 'esatto' | 'dintorni'
}

function sanitizeRadiusKm(raw: unknown): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return DEFAULT_RADIUS_KM
  return ALLOWED_RADIUS_KM.reduce((best, v) => Math.abs(v - n) < Math.abs(best - n) ? v : best)
}

function parseBody(raw: unknown): BuildRequestBody {
  if (!raw || typeof raw !== 'object') throw new Error('Richiesta non valida')
  const body = raw as Record<string, unknown>
  const lat = Number(body.lat)
  const lon = Number(body.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('Coordinate di partenza non valide')
  if (body.routeType !== 'anello' && body.routeType !== 'andata_ritorno' && body.routeType !== 'solo_andata') {
    throw new Error('Tipo di percorso non valido')
  }
  const targetDistanceKm = Number(body.targetDistanceKm)
  if (!Number.isFinite(targetDistanceKm) || targetDistanceKm < MIN_TARGET_DISTANCE_KM || targetDistanceKm > MAX_TARGET_DISTANCE_KM) {
    throw new Error(`Lunghezza target fuori range (${MIN_TARGET_DISTANCE_KM}-${MAX_TARGET_DISTANCE_KM} km)`)
  }
  const targetElevationRaw = Number(body.targetElevationM)
  const targetElevationM = body.targetElevationM != null && Number.isFinite(targetElevationRaw) ? targetElevationRaw : null

  const destLatRaw = Number(body.destinationLat)
  const destLonRaw = Number(body.destinationLon)
  const hasDestination = body.destinationLat != null && body.destinationLon != null && Number.isFinite(destLatRaw) && Number.isFinite(destLonRaw)
  const destinationLat = hasDestination ? destLatRaw : null
  const destinationLon = hasDestination ? destLonRaw : null

  const environmentPrefs = Array.isArray(body.environmentPrefs) ? sanitizeHikerEnvironmentPrefs(body.environmentPrefs) : null
  const desiredPoiTypes = Array.isArray(body.desiredPoiTypes)
    ? body.desiredPoiTypes.filter((t): t is PoiType => typeof t === 'string' && VALID_POI_TYPES.has(t))
    : []

  const radiusKm = sanitizeRadiusKm(body.radiusKm)
  const startMode = body.startMode === 'dintorni' ? 'dintorni' : 'esatto'

  return { lat, lon, routeType: body.routeType, targetDistanceKm, targetElevationM, destinationLat, destinationLon, environmentPrefs, desiredPoiTypes, radiusKm, startMode }
}

// Stessa scelta del ramo anello/andata_ritorno/solo_andata usato per il tentativo principale in
// handlePost — estratta per essere riusabile anche dai ritentativi con lunghezza alternativa.
function generateRawCandidatesForLength(
  network: Awaited<ReturnType<typeof fetchWalkNetwork>>, startNodeId: number, routeType: RouteType, distanceM: number,
) {
  switch (routeType) {
    case 'anello':
      return generateLoopCandidates(network, startNodeId, distanceM)
    case 'solo_andata':
      return generateOneWayCandidates(network, startNodeId, distanceM)
    default:
      return generateOutAndBackCandidates(network, startNodeId, distanceM)
  }
}

// Firma approssimata di un candidato (bucket di lunghezza + punto vicino alla partenza) usata per
// non ripetere nel merge lo stesso tragitto emerso da due tentativi con lunghezza diversa — non
// serve un'identità esatta, solo evitare doppioni palesi.
function candidateSignature(c: { distanceMeters: number; routePolyline: [number, number][] }): string {
  const distBucket = Math.round(c.distanceMeters / 100)
  const p = c.routePolyline[Math.min(3, c.routePolyline.length - 1)]
  const dirKey = p ? `${p[0].toFixed(3)},${p[1].toFixed(3)}` : ''
  return `${distBucket}_${dirKey}`
}

type LogBuildFn = (fields: {
  tierReached: string
  message?: string | null
  builtCount?: number | null
  retried?: boolean
  details?: Record<string, unknown> | null
}) => Promise<void>

// Rete di sicurezza: un'eccezione imprevista nel calcolo (es. il grafo, il pathfinding) senza
// questo wrapper può risultare in una risposta non-JSON che il client legge come "errore di rete"
// generico, mascherando la causa reale — stesso principio già applicato a route-build/search.
export async function POST(req: NextRequest) {
  try {
    return await handlePost(req)
  } catch (e) {
    console.error('[route-build] Errore imprevisto:', e)
    return NextResponse.json(
      { error: 'Errore interno', message: 'Generazione non riuscita per un errore interno, riprova.' },
      { status: 500 },
    )
  }
}

async function handlePost(req: NextRequest): Promise<NextResponse> {
  const { user, authUnavailable, degraded } = await getUserFromRequestDetailed(req)
  if (!user && !degraded) {
    return NextResponse.json(
      authUnavailable
        ? { error: 'auth_unavailable', message: 'Supabase non raggiungibile — riprova tra poco.' }
        : { error: 'Non autenticato' },
      { status: authUnavailable ? 503 : 401 },
    )
  }

  let params: BuildRequestBody
  try {
    params = parseBody(await req.json())
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Richiesta non valida' }, { status: 400 })
  }

  const startedAt = Date.now()
  // Riepilogo comune a ogni possibile esito di questa richiesta, per il log privato consultabile
  // su /profilo/log-ricerche — ogni return da qui in poi chiama logBuild prima di uscire, così
  // anche gli esiti "pochi/nessun risultato" restano visibili senza dover leggere i log Vercel.
  const logBuild: LogBuildFn = async fields => {
    await logRouteBuildEvent({
      userId: user?.id ?? null,
      kind: 'build',
      routeType: params.routeType,
      targetDistanceKm: params.targetDistanceKm,
      useAi: false,
      durationMs: Date.now() - startedAt,
      ...fields,
    })
  }

  // Tutto il resto gira in executeBuild, con questo try/catch a fare da rete di sicurezza: senza
  // di esso, un'eccezione imprevista in un punto NON già coperto da un try/catch specifico (es.
  // fetchHikerProfile prima di questa correzione) veniva comunque intercettata dal wrapper esterno
  // di POST, ma senza mai scrivere una riga di log — un fallimento reale restava invisibile su
  // /profilo/log-ricerche, visibile solo nei log Vercel.
  //
  // In produzione (vedi Vercel Runtime Errors) executeBuild colpisce a volte il tetto DURO di 60s
  // della piattaforma — tipicamente in zone con rete sentieri rada (es. Blera), dove il
  // ritentativo scatta quasi sempre. Un kill della piattaforma non è un'eccezione JS: nessun
  // try/catch (né qui né altrove) può intercettarlo, quindi non veniva mai scritta né una
  // risposta né una riga di log — esattamente il sintomo "nessuna Costruzione nel log, mai".
  // Il Promise.race sotto impone un tetto MORBIDO, deciso da noi con margine, così rispondiamo
  // (e logghiamo) sempre prima che la piattaforma tolga la parola alla funzione.
  try {
    const outcome = await Promise.race([
      executeBuild(user, params, logBuild, startedAt).then(response => ({ kind: 'done' as const, response })),
      new Promise<{ kind: 'timeout' }>(resolve => setTimeout(() => resolve({ kind: 'timeout' }), SOFT_DEADLINE_MS)),
    ])
    if (outcome.kind === 'timeout') {
      console.error(`[route-build] tetto morbido di ${SOFT_DEADLINE_MS}ms superato, rispondo prima del kill della piattaforma`)
      await logBuild({ tierReached: 'timeout', builtCount: 0, message: 'generazione troppo lenta in questa zona' })
      return NextResponse.json({
        candidates: [],
        message: 'La generazione ha impiegato troppo tempo in questa zona — prova un raggio di ricerca più piccolo o un punto di partenza diverso.',
      })
    }
    return outcome.response
  } catch (e) {
    console.error('[route-build] Errore interno imprevisto in executeBuild:', e)
    await logBuild({ tierReached: 'error', message: 'errore interno imprevisto' })
    return NextResponse.json(
      { error: 'Errore interno', message: 'Generazione non riuscita per un errore interno, riprova.' },
      { status: 500 },
    )
  }
}

async function executeBuild(
  user: { id: string } | null, params: BuildRequestBody, logBuild: LogBuildFn, startedAt: number,
): Promise<NextResponse> {
  let concerns: ReturnType<typeof sanitizeHikerConcerns> = []
  let environmentPrefs = params.environmentPrefs ?? []
  if (user) {
    try {
      const profile = await fetchHikerProfile(user.id)
      concerns = sanitizeHikerConcerns(profile.concerns)
      if (params.environmentPrefs == null) environmentPrefs = sanitizeHikerEnvironmentPrefs(profile.environmentPrefs)
    } catch (e) {
      // Un profilo non recuperabile (es. Supabase momentaneamente non raggiungibile) non deve far
      // fallire l'intera costruzione — si prosegue con i valori di default/quelli passati dal
      // client, stessa tolleranza già usata altrove per la modalità degradata.
      console.error('[route-build] fetchHikerProfile fallito, proseguo con i valori di default:', e)
    }
  }

  // La destinazione si applica ad andata_ritorno e solo_andata (per un anello non ha senso, si
  // torna comunque al punto di partenza) — se il client la manda insieme a 'anello' (non dovrebbe
  // succedere con la UI prevista) viene semplicemente ignorata invece di far fallire la richiesta.
  const hasDestination = params.routeType !== 'anello' && params.destinationLat != null && params.destinationLon != null

  // Raggio del bbox attorno al punto di partenza. Senza destinazione: un anello/andata-ritorno di
  // L km non cammina in linea retta, quindi serve margine oltre al semplice L/2 geometrico per la
  // rete effettivamente interrogata — coperto da un fattore emprico (0.6) invece del minimo
  // teorico (0.5). Con destinazione: il raggio deve contenere il punto esatto richiesto, non un
  // target di lunghezza scelto dall'utente (che qui non è più un vincolo) — si usa la distanza in
  // linea d'aria verso la destinazione con lo stesso margine. Tetto a 10 km in entrambi i casi:
  // oltre, il bbox interrogato via Overpass diventa abbastanza grande da rischiare di superare il
  // tempo disponibile prima del kill della funzione lato piattaforma.
  // In modalità 'dintorni' il punto dato è solo un centro d'interesse (un luogo, un POI) — l'aggancio
  // alla rete percorribile può cercarsi entro un raggio più ampio (clampato a BUILD_DINTORNI_MAX_KM)
  // invece del tetto fisso START_SNAP_THRESHOLD_M pensato per un punto di partenza già esatto — e il
  // bbox interrogato deve coprire almeno quel raggio, altrimenti l'aggancio non troverebbe nulla da
  // vedere oltre i pochi km di rete già previsti dalla lunghezza target.
  // In modalità 'esatto' invece params.radiusKm NON viene più usato per restringere questo bbox
  // (bug corretto: prima un raggio piccolo, es. 5 km, scelto dall'utente insieme a una lunghezza
  // target maggiore poteva far collassare il bbox sotto il minimo geometrico necessario, causando
  // "nessun percorso trovato" per una combinazione radius/lunghezza del tutto legittima) — solo il
  // tetto fisso di sicurezza (10 km) resta, coerente col testo mostrato nel wizard che dichiara il
  // raggio "solo un tetto di sicurezza" in questa modalità (vedi components/upload/RouteBuilder.tsx).
  const dintorniRadiusKm = params.startMode === 'dintorni' ? Math.min(params.radiusKm, BUILD_DINTORNI_MAX_KM) : 0
  const bboxRadiusKm = Math.min(
    Math.max(
      hasDestination
        ? Math.min(Math.max(haversineM(params.lat, params.lon, params.destinationLat!, params.destinationLon!) / 1000 * 0.6, 2), 10)
        : Math.min(Math.max(params.targetDistanceKm * 0.6, 2), 10),
      dintorniRadiusKm,
    ),
    10,
  )
  const bbox = padBbox([params.lat, params.lon, params.lat, params.lon], bboxRadiusKm)

  let network
  try {
    network = await fetchWalkNetwork(bbox)
  } catch (e) {
    console.error('[route-build] fetchWalkNetwork failed:', e)
    await logBuild({ tierReached: 'error', message: 'rete sentieri non disponibile' })
    return NextResponse.json({ error: 'Rete sentieri non disponibile in questo momento, riprova.' }, { status: 502 })
  }

  console.log(`[route-build] rete: ${network.nodes.size} nodi, bbox raggio ${bboxRadiusKm.toFixed(1)}km`)

  const startSnapThresholdM = params.startMode === 'dintorni' ? dintorniRadiusKm * 1000 : START_SNAP_THRESHOLD_M
  const startNode = nearestGraphNode(network, params.lat, params.lon, startSnapThresholdM)
  if (!startNode) {
    await logBuild({ tierReached: 'no_network_nearby', details: { networkNodes: network.nodes.size, startMode: params.startMode } })
    return NextResponse.json({
      error: 'no_network_nearby',
      message: params.startMode === 'dintorni'
        ? 'Non ho trovato sentieri o strade percorribili nei dintorni di questo luogo, entro il raggio scelto — prova un raggio più ampio o un luogo diverso.'
        : 'Non ho trovato sentieri o strade percorribili abbastanza vicino al punto scelto — prova un punto di partenza diverso, o la modalità "Nei dintorni".',
    }, { status: 404 })
  }

  let rawCandidates
  let targetDistanceM: number

  if (hasDestination) {
    const destinationCandidate = generateOutAndBackToPoint(
      network, startNode.nodeId, params.destinationLat!, params.destinationLon!,
      undefined, params.routeType === 'solo_andata',
    )
    if (!destinationCandidate) {
      await logBuild({ tierReached: 'destination_unreachable' })
      return NextResponse.json({
        error: 'destination_unreachable',
        message: 'La destinazione indicata non è abbastanza vicina a sentieri o strade percorribili, o non è raggiungibile dal punto di partenza — prova un\'altra destinazione.',
      }, { status: 404 })
    }
    // La lunghezza reale ottenuta diventa il target per il punteggio di affinità — qui non c'è un
    // vincolo di lunghezza da rispettare, quindi non va penalizzato l'unico risultato possibile.
    targetDistanceM = destinationCandidate.distanceM
    rawCandidates = [destinationCandidate]
  } else {
    targetDistanceM = params.targetDistanceKm * 1000
    rawCandidates = generateRawCandidatesForLength(network, startNode.nodeId, params.routeType, targetDistanceM)
  }

  console.log(`[route-build] candidati grezzi entro tolleranza: ${rawCandidates.length}`)

  if (rawCandidates.length === 0) {
    await logBuild({ tierReached: 'no_raw_candidates', builtCount: 0 })
    return NextResponse.json({
      candidates: [],
      message: 'Nessun percorso trovato con questi vincoli nella zona scelta — prova una lunghezza diversa o un punto di partenza differente.',
    })
  }

  let candidates: ScoredCandidate[]
  try {
    candidates = await scoreAndEnrichCandidates(rawCandidates.slice(0, ENRICH_CAP), {
      targetDistanceM,
      targetElevationM: params.targetElevationM,
      environmentPrefs,
      concerns,
      desiredPoiTypes: params.desiredPoiTypes,
      bbox,
    })
  } catch (e) {
    console.error('[route-build] scoreAndEnrichCandidates failed:', e)
    await logBuild({ tierReached: 'error', message: 'arricchimento fallito' })
    return NextResponse.json({ error: 'Arricchimento dei percorsi non riuscito, riprova.' }, { status: 502 })
  }

  let retried = false
  // Ritentativo con lunghezze alternative se, senza destinazione, ne sono sopravvissuti troppo
  // pochi — solo se serve (mai per la destinazione, dove l'unico risultato possibile è già quello)
  // e solo se resta abbastanza budget di tempo: i due tentativi girano in parallelo (non in
  // sequenza, come nella prima versione) proprio per non rischiare di superare il tetto di 60s
  // della funzione — un kill della piattaforma a metà non lascia scrivere né una risposta né una
  // riga di log, un fallimento del tutto invisibile che il ritentativo sequenziale rischiava di
  // causare più spesso proprio nei casi (rete rada) in cui scatta più spesso.
  if (!hasDestination && candidates.length < MIN_BUILT_RESULTS) {
    const elapsedMs = Date.now() - startedAt
    if (elapsedMs > BUILD_TIME_BUDGET_MS) {
      console.log(`[route-build] salto il ritentativo: già ${(elapsedMs / 1000).toFixed(1)}s trascorsi`)
    } else {
      retried = true
      console.log(`[route-build] solo ${candidates.length} candidati validi, ritento con lunghezze alternative (in parallelo)`)
      const seen = new Set(candidates.map(candidateSignature))
      const altBatches = await Promise.all(RETRY_DISTANCE_FACTORS.map(async factor => {
        const altDistanceM = Math.min(Math.max(targetDistanceM * factor, MIN_TARGET_DISTANCE_KM * 1000), MAX_TARGET_DISTANCE_KM * 1000)
        const altRaw = generateRawCandidatesForLength(network, startNode.nodeId, params.routeType, altDistanceM)
        if (altRaw.length === 0) return [] as ScoredCandidate[]
        try {
          // Il punteggio resta ancorato all'obiettivo originale, non alla lunghezza del
          // ritentativo — questi candidati sono un ripiego per avere più opzioni, non una nuova
          // richiesta dell'utente.
          return await scoreAndEnrichCandidates(altRaw.slice(0, ENRICH_CAP), {
            targetDistanceM,
            targetElevationM: params.targetElevationM,
            environmentPrefs,
            concerns,
            desiredPoiTypes: params.desiredPoiTypes,
            bbox,
          })
        } catch (e) {
          console.error('[route-build] ritentativo con lunghezza alternativa fallito:', e)
          return [] as ScoredCandidate[]
        }
      }))
      for (const altCandidates of altBatches) {
        for (const c of altCandidates) {
          const sig = candidateSignature(c)
          if (seen.has(sig)) continue
          seen.add(sig)
          candidates.push(c)
        }
      }
      candidates = candidates
        .sort((a, b) => Math.abs(a.distanceMeters - targetDistanceM) - Math.abs(b.distanceMeters - targetDistanceM))
        .slice(0, MAX_BUILT_RESULTS)
      console.log(`[route-build] dopo ritentativo: ${candidates.length} candidati totali`)
    }
  }

  if (candidates.length === 0) {
    await logBuild({ tierReached: 'no_dtm_coverage', builtCount: 0, retried, details: { rawCount: rawCandidates.length } })
    return NextResponse.json({
      candidates: [],
      message: 'Ho trovato percorsi possibili ma senza copertura del modello altimetrico in questa zona — prova un punto di partenza differente.',
    })
  }

  await logBuild({
    tierReached: retried ? 'retry_built' : 'built',
    builtCount: candidates.length,
    retried,
    details: { rawCount: rawCandidates.length, hasDestination },
  })

  return NextResponse.json({ candidates })
}
