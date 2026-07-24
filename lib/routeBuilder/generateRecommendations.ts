// Genera il batch "Percorsi per te" (5 card, cadenza ibrida gestita dal cron
// app/api/cron/refresh-recommendations/route.ts) — nessuna chiamata AI, stesso motore non-AI del
// wizard "Costruisci o trova un percorso" (components/upload/RouteBuilder.tsx), solo orchestrato
// automaticamente invece che su richiesta esplicita dell'utente.
//
// Solo card "Esistenti" — niente "Su misura" (executeBuild/pathfinding, rimosso interamente da
// questo file). Due tentativi successivi di far convivere le due cose (raggiera su entrambe, poi
// raggiera solo su "Esistenti" con "Su misura" tentato una volta sola) hanno comunque riprodotto
// il timeout di 60s della piattaforma in produzione — la pipeline "Su misura" (grafo dell'intera
// rete percorribile + Dijkstra + propri ritentativi interni) resta troppo pesante/fragile per
// un'esecuzione automatica e silenziosa su un punto arbitrario, a differenza della ricerca
// interattiva del wizard dove l'utente stesso può aggiustare punto/parametri se va storta. Le card
// vengono quindi cercate SOLO nella cache `trails` (lib/trailsCache.ts, popolata lazy dalla
// navigazione normale dell'app) per prossimità al punto di partenza reale dell'utente (vedi
// deriveOrigin), e solo se la cache non basta si ricade su una ricerca Overpass live
// (queryHikingRelationsInBbox, gratuita/non-AI, la stessa identica procedura già collaudata dalla
// ricerca "Cerca esistenti" del wizard) — ogni candidato risolto dal fallback live viene anche
// scritto nella cache, così il generatore stesso aiuta a popolarla per i cicli futuri (per questo
// utente o altri vicini). La ricerca è "a raggiera" (vedi SEARCH_RADII_KM): si parte vicino a casa
// e ci si allarga solo finché non bastano 5 card in totale.
//
// IMPORTANTE: nessun punteggio (Trail Score/Sicurezza) viene calcolato qui — computeCtsCore/
// computeSafetyCore fanno fetch a URL relativi, funzionano solo lato browser; si calcola pigro,
// lato client, ad ogni apertura di /percorsi-per-te.
//
// IMPORTANTE (2): nessuna chiamata DTM reale viene fatta qui — causa concreta osservata in
// produzione di ricerche che restituivano "0 trovati" anche in zone con percorsi noti (Vetralla:
// 8 percorsi trovati dalla ricerca interattiva, 0 dalla raggiera automatica), perché il tetto
// morbido per raggio scadeva prima che il DTM (fino a 30s per candidato) finisse. Le card cache-hit
// usano i valori già calcolati al momento in cui la riga è stata cachata; le card dal fallback
// Overpass live usano una stima geometrica (estimateOnly, vedi resolveTrackForCandidate). La quota
// reale arriva solo quando l'utente apre/salva proprio quella card (app/percorsi-per-te/page.tsx's
// handleOpen) — stesso principio già applicato a "Su misura" (lib/routeBuilder/scoreCandidates.ts).
import { supabase } from '@/lib/supabase'
import { fetchActivitySummary } from '@/lib/hikerContext'
import { MIN_TARGET_DISTANCE_KM, MAX_TARGET_DISTANCE_KM } from '@/lib/routeBuilder/buildConstants'
import { logRouteBuildEvent } from '@/lib/routeBuilder/operationsLog'
import { findCachedTrailsNearPoint, upsertTrailCache, type TrailCacheRow } from '@/lib/trailsCache'
import { queryHikingRelationsInBbox, padBbox, type HikingRouteCandidate } from '@/lib/overpassTrails'
import { resolveTrackForCandidate } from '@/lib/routeBuilder/resolveTrack'
import { classifyTrackShape, haversineM } from '@/lib/geoUtils'
import type { ScoredCandidate } from '@/lib/routeBuilder/scoreCandidates'
import type { FoundRouteItem, ResolvedTrack } from '@/lib/routeBuilder/foundRoute'

// Il tipo unione resta (invece di restringerlo a solo 'found') perché descrive anche le righe già
// salvate da generazioni precedenti, che possono ancora contenere card 'built' finché il prossimo
// giro del cron non le sovrascrive — non più prodotto da generateRecommendationsForUser sotto.
export interface RecommendationCard {
  id: string
  kind: 'built' | 'found'
  data: ScoredCandidate | FoundRouteItem
}

export interface GenerateRecommendationsResult {
  status: 'ok' | 'empty_no_location'
  cards: RecommendationCard[]
  centroid: { lat: number; lon: number } | null
}

const TOTAL_CARDS = 5
// Lunghezza target per un utente senza storico attività — lo stesso identico caso già gestito nel
// wizard (nessun default salvato, si assume una gita "media" invece di rifiutare la generazione).
const DEFAULT_NEW_USER_DISTANCE_KM = 6

// Ricerca a raggiera: si parte vicino a casa e ci si allarga SOLO se il raggio precedente non ha
// già raggiunto TOTAL_CARDS — mai il contrario, un risultato più vicino è sempre preferibile a uno
// più lontano. Valori scelti per coprire sia chi vive già in montagna (5km spesso bastano) sia chi
// deve allontanarsi parecchio dalla città per trovare sentieri (40km).
const SEARCH_RADII_KM = [5, 10, 20, 40]
// Tetto complessivo di riserva sull'intera raggiera (tutti i raggi messi insieme) — ridondante nel
// caso normale, dato che ogni singolo raggio ha già il proprio tetto morbido più stretto
// (PER_RADIUS_SOFT_DEADLINE_MS, vedi sotto: 4 raggi × 15s = 60s nel caso peggiore), ma resta come
// seconda rete di sicurezza che interrompe la raggiera TRA un raggio e l'altro, prima ancora di
// iniziarne uno nuovo. Con margine reale sotto il tetto morbido di 45s del bootstrap di
// app/api/percorsi-per-te/route.ts (e sotto il budget per-utente del cron).
const TOTAL_RING_BUDGET_MS = 35_000

function clampDistanceKm(km: number): number {
  return Math.min(MAX_TARGET_DISTANCE_KM, Math.max(MIN_TARGET_DISTANCE_KM, km))
}

// Punto di partenza REALE da cui centrare la ricerca a raggiera — mai una media di più escursioni:
// una media di punti di partenza in zone diverse (es. due versanti di una valle) può cadere in un
// punto mai visitato e non collegato a nessuna rete percorribile — causa concreta osservata in
// produzione di un batch quasi vuoto (un punto sintetico finito su un frammento isolato di soli 56
// nodi raggiungibili su 33.134). Priorità: indirizzo di partenza salvato in profilo (un luogo vero,
// scelto esplicitamente dall'utente), poi il punto di partenza della SINGOLA escursione più
// recente (anch'esso un luogo vero, non una media), poi null (stato "empty_no_location").
async function deriveOrigin(userId: string): Promise<{ lat: number; lon: number } | null> {
  const { data: settings } = await supabase
    .from('user_settings')
    .select('starting_lat, starting_lon')
    .eq('user_id', userId)
    .maybeSingle()
  const settingsLat = settings?.starting_lat as number | null | undefined
  const settingsLon = settings?.starting_lon as number | null | undefined
  if (settingsLat != null && settingsLon != null) return { lat: settingsLat, lon: settingsLon }

  const { data: activity } = await supabase
    .from('activities')
    .select('route_polyline')
    .eq('user_id', userId)
    .order('start_time', { ascending: false })
    .limit(1)
    .maybeSingle()
  const start = (activity?.route_polyline as [number, number][] | null)?.[0]
  if (Array.isArray(start) && start.length === 2 && Number.isFinite(start[0]) && Number.isFinite(start[1])) {
    return { lat: start[0], lon: start[1] }
  }

  return null
}

function bboxFromPolyline(polyline: [number, number][]): { minLat: number; maxLat: number; minLon: number; maxLon: number } {
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity
  for (const [lat, lon] of polyline) {
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
    if (lon < minLon) minLon = lon
    if (lon > maxLon) maxLon = lon
  }
  return { minLat, maxLat, minLon, maxLon }
}

function foundReason(distanceKm: number, targetDistanceKm: number): string {
  return Math.abs(distanceKm - targetDistanceKm) <= targetDistanceKm * 0.3
    ? 'Lunghezza vicina alle tue ultime uscite, nella zona che conosci.'
    : 'Percorso già documentato vicino alla tua zona abituale.'
}

// Scrive nella cache `trails` un candidato risolto dal fallback Overpass live — best-effort, un
// fallimento qui non deve mai far fallire la card già risolta per l'utente corrente.
async function cacheResolvedTrail(candidate: HikingRouteCandidate, track: ResolvedTrack): Promise<void> {
  try {
    const shape = classifyTrackShape(track.routePolyline)
    const row: TrailCacheRow = {
      osmRelationId: candidate.id,
      name: candidate.name,
      distanceKm: track.distanceMeters / 1000,
      elevationGain: track.elevationGain,
      elevationLoss: track.elevationLoss,
      estimatedTimeMin: Math.round(track.estimatedTimeSeconds / 60),
      routeType: shape === 'linear' ? 'point_to_point' : shape,
      network: candidate.network ?? null,
      bbox: bboxFromPolyline(track.routePolyline),
      geometrySimplified: track.routePolyline,
      dataQuality: track.hasElevation ? 'calculated' : 'estimated',
      ref: candidate.ref ?? null,
    }
    await upsertTrailCache(row)
  } catch (e) {
    console.error('[generateRecommendations] scrittura cache trails fallita (non bloccante):', e)
  }
}

// `seen` traccia gli osmId già raccolti nei raggi precedenti di QUESTA generazione — senza questo,
// allargare il raggio da 5 a 10km ripresenterebbe (e ri-arricchirebbe inutilmente) gli stessi
// percorsi già trovati al raggio più stretto, dato che un bbox più grande include sempre quello
// più piccolo.
async function gatherFoundCandidates(
  origin: { lat: number; lon: number }, targetDistanceKm: number, radiusKm: number, wanted: number, seen: Set<number>,
): Promise<FoundRouteItem[]> {
  const items: FoundRouteItem[] = []

  // 1) Cache `trails` — davvero economica: nessuna chiamata di rete, DTM incluso. Le righe cachate
  // hanno già distanza/dislivello/tempo stimato calcolati al momento in cui sono state scritte
  // (upsertTrailCache, sotto) — richiamare di nuovo il DTM qui su geometria già nota era un secondo
  // costo pesante e inutile (causa concreta osservata in produzione dei "0 trovati": il tetto
  // morbido per raggio scadeva prima che questa ri-elaborazione finisse, anche con la cache piena).
  try {
    const cached = await findCachedTrailsNearPoint(origin.lat, origin.lon, radiusKm, 20)
    const candidates = cached
      .filter(row => row.distanceKm != null && Math.abs(row.distanceKm - targetDistanceKm) <= targetDistanceKm * 0.5)
      .filter(row => !seen.has(row.osmRelationId))
      .map(row => ({
        row,
        d: haversineM(origin.lat, origin.lon, (row.bbox.minLat + row.bbox.maxLat) / 2, (row.bbox.minLon + row.bbox.maxLon) / 2),
      }))
      .sort((a, b) => a.d - b.d)

    for (const { row } of candidates) {
      if (items.length >= wanted) break
      seen.add(row.osmRelationId)
      const distanceKm = row.distanceKm as number
      const track: ResolvedTrack = {
        trackPoints: [],
        routePolyline: row.geometrySimplified,
        distanceMeters: Math.round(distanceKm * 1000),
        elevationGain: row.elevationGain ?? 0,
        elevationLoss: row.elevationLoss ?? 0,
        altitudeMax: 0,
        altitudeMin: 0,
        estimatedTimeSeconds: (row.estimatedTimeMin ?? Math.round((distanceKm / 4) * 60)) * 60,
        hasElevation: row.dataQuality === 'calculated',
      }
      items.push({
        name: row.name,
        difficulty: row.difficulty ?? undefined,
        description: foundReason(distanceKm, targetDistanceKm),
        sourceUrl: `https://www.openstreetmap.org/relation/${row.osmRelationId}`,
        osmId: row.osmRelationId,
        track,
      })
    }
  } catch (e) {
    console.error('[generateRecommendations] lettura cache trails fallita:', e)
  }

  // 2) Fallback Overpass live (gratuito, non-AI) solo se la cache non ha bastato — traccia risolta
  // con quota STIMATA (estimateOnly: mai il DTM reale in questo giro, vedi resolveTrackForCandidate
  // — la quota vera arriva solo se l'utente apre proprio questa card, app/percorsi-per-te/page.tsx's
  // handleOpen). Ogni candidato risolto viene comunque cachato per i cicli futuri (per questo utente
  // o altri vicini), coi campi stimati: si affina da solo quando qualcuno lo apre davvero.
  if (items.length < wanted) {
    try {
      const [minLat, minLon, maxLat, maxLon] = padBbox([origin.lat, origin.lon, origin.lat, origin.lon], radiusKm)
      const relations = await queryHikingRelationsInBbox(minLat, minLon, maxLat, maxLon, 20)
      for (const candidate of relations) {
        if (items.length >= wanted) break
        if (seen.has(candidate.id)) continue
        const resolved = await resolveTrackForCandidate({ osmId: candidate.id, gpxUrl: null }, { estimateOnly: true })
        if (!resolved.ok) continue
        seen.add(candidate.id)
        const track: ResolvedTrack = {
          trackPoints: resolved.trackPoints, routePolyline: resolved.routePolyline, distanceMeters: resolved.distanceMeters,
          elevationGain: resolved.elevationGain, elevationLoss: resolved.elevationLoss, altitudeMax: resolved.altitudeMax,
          altitudeMin: resolved.altitudeMin, estimatedTimeSeconds: resolved.estimatedTimeSeconds, hasElevation: resolved.hasElevation,
        }
        items.push({
          name: candidate.name,
          description: foundReason(track.distanceMeters / 1000, targetDistanceKm),
          sourceUrl: `https://www.openstreetmap.org/relation/${candidate.id}`,
          osmId: candidate.id,
          track,
        })
        cacheResolvedTrail(candidate, track).catch(() => {})
      }
    } catch (e) {
      console.error('[generateRecommendations] fallback Overpass live fallito:', e)
    }
  }

  return items
}

// Tetto morbido PER SINGOLO RAGGIO — senza questo, un solo raggio poteva da solo superare i 60s:
// fetchOverpass (lib/overpassTrails.ts) corre tutti e 3 i mirror in parallelo ma con un intero
// ritentativo se falliscono tutti (fino a ~2×20s+1.2s ≈ 41s per una sola query). Il DTM reale NON è
// più in gioco qui (cache-hit usa i valori già calcolati nella riga cachata, il fallback Overpass
// live risolve solo con quota STIMATA — vedi resolveTrackForCandidate con estimateOnly): un raggio
// costa ormai al più una query Overpass (bbox o per-relazione), non anche fino a 30s di DTM PER
// CANDIDATO come prima. 15s restano comunque un tetto, non una garanzia — un raggio insolitamente
// lento (mirror Overpass tutti lenti) viene comunque abbandonato invece di rischiare il tetto duro
// della piattaforma, con 0 risultati per quel raggio piuttosto che nessuna risposta.
const PER_RADIUS_SOFT_DEADLINE_MS = 15_000

async function gatherFoundCandidatesWithDeadline(
  origin: { lat: number; lon: number }, targetDistanceKm: number, radiusKm: number, wanted: number, seen: Set<number>,
): Promise<FoundRouteItem[]> {
  const outcome = await Promise.race([
    gatherFoundCandidates(origin, targetDistanceKm, radiusKm, wanted, seen).then(res => ({ kind: 'done' as const, res })),
    new Promise<{ kind: 'timeout' }>(resolve => setTimeout(() => resolve({ kind: 'timeout' }), PER_RADIUS_SOFT_DEADLINE_MS)),
  ])
  if (outcome.kind === 'timeout') {
    console.error(`[generateRecommendations] raggio ${radiusKm}km oltre ${PER_RADIUS_SOFT_DEADLINE_MS}ms, salto al raggio successivo senza i suoi risultati`)
    return []
  }
  return outcome.res
}

export async function generateRecommendationsForUser(userId: string): Promise<GenerateRecommendationsResult> {
  const origin = await deriveOrigin(userId)
  if (!origin) return { status: 'empty_no_location', cards: [], centroid: null }

  const history = await fetchActivitySummary(userId)
  const targetDistanceKm = clampDistanceKm(history.count > 0 ? history.avgDistanceKm : DEFAULT_NEW_USER_DISTANCE_KM)

  // Stessa identica procedura, economica e già affidabile, della ricerca "Cerca esistenti" del
  // wizard (app/api/route-build/search/route.ts's tier0: queryHikingRelationsInBbox +
  // resolveTrackForCandidate, nessun grafo/pathfinding) — qui applicata a raggiera perché non parte
  // da un nome/luogo digitato dall'utente ma dal suo punto reale (vedi deriveOrigin): si allarga
  // solo finché non completa le 5 card totali (o esaurisce i raggi, o il budget).
  const foundItems: FoundRouteItem[] = []
  const foundSeen = new Set<number>()
  const startedAt = Date.now()
  let lastFoundRadiusKm = SEARCH_RADII_KM[0]

  for (const radiusKm of SEARCH_RADII_KM) {
    lastFoundRadiusKm = radiusKm
    if (foundItems.length >= TOTAL_CARDS) break
    if (Date.now() - startedAt > TOTAL_RING_BUDGET_MS) {
      console.error(`[generateRecommendations] tetto complessivo di ${TOTAL_RING_BUDGET_MS}ms raggiunto a raggio ${radiusKm}km, mi fermo con ${foundItems.length} card`)
      break
    }

    const stillWanted = TOTAL_CARDS - foundItems.length
    const newFound = await gatherFoundCandidatesWithDeadline(origin, targetDistanceKm, radiusKm, stillWanted, foundSeen)
    foundItems.push(...newFound)
  }

  // Stessa convenzione di logging della ricerca interattiva (kind:'search', vedi tier0 in
  // app/api/route-build/search/route.ts) — mancava del tutto per questo percorso: le ricerche di
  // Percorsi per te non comparivano mai in /profilo/log-ricerche. `tierReached` riporta il raggio
  // finale raggiunto, per distinguere a colpo d'occhio "trovato subito vicino" da "servito
  // allargarsi molto".
  await logRouteBuildEvent({
    userId, kind: 'search', useAi: false, tierReached: `ring_${lastFoundRadiusKm}km`,
    // Nessun testo digitato da mostrare (ricerca automatica dal punto dell'utente, non da un nome)
    // — una didascalia descrittiva al posto di una query vuota, per restare leggibile nella stessa
    // pagina di log della ricerca interattiva.
    query: `Percorsi per te (raggio fino a ${lastFoundRadiusKm}km)`,
    foundCount: foundItems.length, durationMs: Date.now() - startedAt,
    details: { source: 'recommendations_cron', radiusKm: lastFoundRadiusKm },
  })

  const cards: RecommendationCard[] = foundItems
    .map(f => ({ id: `found:${f.osmId}`, kind: 'found' as const, data: f }))
    .slice(0, TOTAL_CARDS)

  return { status: 'ok', cards, centroid: origin }
}

// Genera e salva — unico punto che scrive su route_recommendations, usato sia dal cron sia dal
// bootstrap al primo accesso a /percorsi-per-te (app/api/percorsi-per-te/route.ts).
export async function refreshRecommendationsForUser(userId: string): Promise<void> {
  try {
    const result = await generateRecommendationsForUser(userId)

    const { data: existing } = await supabase.from('route_recommendations').select('feedback').eq('user_id', userId).maybeSingle()
    const prevFeedback = (existing?.feedback as Record<string, unknown> | null) ?? {}
    const validIds = new Set(result.cards.map(c => c.id))
    const prunedFeedback = Object.fromEntries(Object.entries(prevFeedback).filter(([id]) => validIds.has(id)))

    await supabase.from('route_recommendations').upsert({
      user_id: userId,
      status: result.status,
      cards: result.cards,
      feedback: prunedFeedback,
      centroid_lat: result.centroid?.lat ?? null,
      centroid_lon: result.centroid?.lon ?? null,
      generated_at: new Date().toISOString(),
      dirty: false,
      dirty_reason: null,
      last_error: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
  } catch (e) {
    console.error('[generateRecommendations] refreshRecommendationsForUser fallito:', e)
    // dirty resta true: il prossimo giro del cron ritenta invece di lasciare l'utente bloccato su
    // un errore permanente. cards/generated_at non toccati (upsert parziale) — un batch precedente
    // valido, se esiste, resta visibile piuttosto che sparire per un fallimento transitorio.
    try {
      await supabase.from('route_recommendations').upsert({
        user_id: userId,
        status: 'error',
        last_error: e instanceof Error ? e.message : String(e),
        dirty: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
    } catch {}
  }
}
