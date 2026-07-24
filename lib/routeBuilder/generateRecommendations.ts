// Genera il batch "Percorsi per te" (5 card, cadenza ibrida gestita dal cron
// app/api/cron/refresh-recommendations/route.ts) — nessuna chiamata AI, stesso motore non-AI del
// wizard "Costruisci o trova un percorso" (components/upload/RouteBuilder.tsx), solo orchestrato
// automaticamente invece che su richiesta esplicita dell'utente.
//
// Le card "Su misura" riusano executeBuild (app/api/route-build/route.ts) tal quale — nessuna
// duplicazione della pipeline pathfinding+arricchimento. Le card "Esistenti" vengono prima cercate
// nella cache `trails` (lib/trailsCache.ts, popolata lazy dalla navigazione normale dell'app) per
// prossimità al centroide, e solo se la cache non basta si ricade su una ricerca Overpass live
// (queryHikingRelationsInBbox, gratuita/non-AI) — ogni candidato risolto dal fallback live viene
// anche scritto nella cache, così il generatore stesso aiuta a popolarla per i cicli futuri (per
// questo utente o altri vicini), non solo l'apertura manuale di un sentiero altrove nell'app.
//
// IMPORTANTE: nessun punteggio (Trail Score/Sicurezza) viene calcolato qui — computeCtsCore/
// computeSafetyCore fanno fetch a URL relativi, funzionano solo lato browser. Si genera e salva
// solo il percorso (con quota STIMATA per le card "Su misura", vedi scoreCandidates.ts); il
// doppio anello si calcola solo dopo che l'utente sceglie/importa una card (vedi
// enrichBuiltCandidateForImport in lib/routeBuilder/buildHikeFromCandidate.ts) — mai per l'intera
// lista di 5 card mostrate, che oggi restano senza punteggio finché non importate.
import { supabase } from '@/lib/supabase'
import { fetchHikerProfile, fetchActivitySummary } from '@/lib/hikerContext'
import { sanitizeHikerEnvironmentPrefs } from '@/lib/hikerProfile'
import {
  executeBuild, candidateSignature, MIN_TARGET_DISTANCE_KM, MAX_TARGET_DISTANCE_KM, DEFAULT_RADIUS_KM,
  type BuildRequestBody, type LogBuildFn,
} from '@/app/api/route-build/route'
import { logRouteBuildEvent } from '@/lib/routeBuilder/operationsLog'
import { findCachedTrailsNearPoint, upsertTrailCache, type TrailCacheRow } from '@/lib/trailsCache'
import { queryHikingRelationsInBbox, padBbox, type HikingRouteCandidate } from '@/lib/overpassTrails'
import { resolveTrackForCandidate } from '@/lib/routeBuilder/resolveTrack'
import { enrichGeometryWithElevation } from '@/lib/dtm/elevationEnrich'
import { downsamplePolyline } from '@/lib/downsamplePolyline'
import { classifyTrackShape, haversineM } from '@/lib/geoUtils'
import type { ScoredCandidate } from '@/lib/routeBuilder/scoreCandidates'
import type { FoundRouteItem, ResolvedTrack } from '@/lib/routeBuilder/foundRoute'

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

// Su 5 card totali: fino a 3 "su misura" + fino a 2 "esistenti". Se il lato "su misura" è corto,
// "esistenti" compensa fino al totale (il verso opposto — esistenti corto compensato da più
// costruiti — non è implementato: un secondo giro di executeBuild costerebbe quanto l'intera
// generazione per un guadagno marginale in un caso già accettato come "risultati scarsi", non un
// errore). Nessun dedup incrociato tra un "costruito" e un "esistente" che tracciano lo stesso
// percorso fisico — forme diverse, nessuna chiave di identità condivisa, probabilità bassa.
const TARGET_BUILT_CARDS = 3
const TOTAL_CARDS = 5
const MIN_FOUND_TARGET = 2
// Lunghezza target per un utente senza storico attività — lo stesso identico caso già gestito nel
// wizard (nessun default salvato, si assume una gita "media" invece di rifiutare la generazione).
const DEFAULT_NEW_USER_DISTANCE_KM = 6

function clampDistanceKm(km: number): number {
  return Math.min(MAX_TARGET_DISTANCE_KM, Math.max(MIN_TARGET_DISTANCE_KM, km))
}

// Centro di un'area "nota" per l'utente — media dei punti di partenza delle ultime attività
// completate, o l'indirizzo di partenza salvato in profilo se non ha ancora attività, o null se
// nessuno dei due è disponibile (stato "empty_no_location", non un errore).
async function deriveCentroid(userId: string): Promise<{ lat: number; lon: number } | null> {
  const { data } = await supabase
    .from('activities')
    .select('route_polyline')
    .eq('user_id', userId)
    .order('start_time', { ascending: false })
    .limit(5)

  const starts = (data ?? [])
    .map(row => (row.route_polyline as [number, number][] | null)?.[0])
    .filter((p): p is [number, number] => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))

  if (starts.length > 0) {
    const lat = starts.reduce((s, p) => s + p[0], 0) / starts.length
    const lon = starts.reduce((s, p) => s + p[1], 0) / starts.length
    return { lat, lon }
  }

  const { data: settings } = await supabase
    .from('user_settings')
    .select('starting_lat, starting_lon')
    .eq('user_id', userId)
    .maybeSingle()
  const lat = settings?.starting_lat as number | null | undefined
  const lon = settings?.starting_lon as number | null | undefined
  if (lat != null && lon != null) return { lat, lon }

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

async function gatherFoundCandidates(
  centroid: { lat: number; lon: number }, targetDistanceKm: number, bboxRadiusKm: number, wanted: number,
): Promise<FoundRouteItem[]> {
  const items: FoundRouteItem[] = []

  // 1) Cache `trails` — economica, nessuna chiamata di rete oltre Supabase.
  try {
    const cached = await findCachedTrailsNearPoint(centroid.lat, centroid.lon, bboxRadiusKm, 20)
    const candidates = cached
      .filter(row => row.distanceKm != null && Math.abs(row.distanceKm - targetDistanceKm) <= targetDistanceKm * 0.5)
      .map(row => ({
        row,
        d: haversineM(centroid.lat, centroid.lon, (row.bbox.minLat + row.bbox.maxLat) / 2, (row.bbox.minLon + row.bbox.maxLon) / 2),
      }))
      .sort((a, b) => a.d - b.d)

    for (const { row } of candidates) {
      if (items.length >= wanted) break
      const enriched = await enrichGeometryOrSkip(row.geometrySimplified)
      if (!enriched) continue
      items.push({
        name: row.name,
        difficulty: row.difficulty ?? undefined,
        description: foundReason(enriched.distanceMeters / 1000, targetDistanceKm),
        sourceUrl: `https://www.openstreetmap.org/relation/${row.osmRelationId}`,
        osmId: row.osmRelationId,
        track: enriched,
      })
    }
  } catch (e) {
    console.error('[generateRecommendations] lettura cache trails fallita:', e)
  }

  // 2) Fallback Overpass live (gratuito, non-AI) solo se la cache non ha bastato — ogni candidato
  // risolto viene anche cachato per i cicli futuri.
  if (items.length < wanted) {
    try {
      const [minLat, minLon, maxLat, maxLon] = padBbox([centroid.lat, centroid.lon, centroid.lat, centroid.lon], bboxRadiusKm)
      const relations = await queryHikingRelationsInBbox(minLat, minLon, maxLat, maxLon, 20)
      for (const candidate of relations) {
        if (items.length >= wanted) break
        const resolved = await resolveTrackForCandidate({ osmId: candidate.id, gpxUrl: null })
        if (!resolved.ok) continue
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

// Wrapper minimo attorno a enrichGeometryWithElevation per uniformare il tipo di ritorno a
// ResolvedTrack (routePolyline + hasElevation, non presenti in EnrichedTrack).
async function enrichGeometryOrSkip(geometry: [number, number][]): Promise<ResolvedTrack | null> {
  const enriched = await enrichGeometryWithElevation(geometry)
  if (!enriched) return null
  return { ...enriched, routePolyline: downsamplePolyline(enriched.trackPoints), hasElevation: true }
}

// Tetto morbido SOLO per questa singola chiamata a executeBuild — a differenza dell'endpoint
// interattivo (app/api/route-build/route.ts's handlePost), che avvolge executeBuild nel proprio
// Promise.race, qui la funzione viene chiamata direttamente (nessun giro HTTP, vedi commento in
// testa al file), quindi non eredita automaticamente quella protezione. Senza un tetto proprio, un
// singolo utente lento potrebbe da solo esaurire il budget dell'intero giro del cron (che ha il suo
// proprio tetto morbido tra un utente e l'altro, non dentro la chiamata stessa) o quello di
// app/api/percorsi-per-te/route.ts al primo accesso — stesso principio già stabilito altrove in
// questo route builder: mai lasciare che una singola chiamata di rete/calcolo diventi l'unico punto
// senza un limite esplicito.
const BUILT_CANDIDATE_SOFT_DEADLINE_MS = 25_000

async function gatherBuiltCandidates(
  userId: string, centroid: { lat: number; lon: number }, targetDistanceKm: number, targetElevationM: number | null,
  environmentPrefs: string[], logBuild: LogBuildFn,
): Promise<ScoredCandidate[]> {
  const params: BuildRequestBody = {
    lat: centroid.lat, lon: centroid.lon, routeType: 'anello', targetDistanceKm,
    targetElevationM, destinationLat: null, destinationLon: null,
    environmentPrefs: sanitizeHikerEnvironmentPrefs(environmentPrefs), desiredPoiTypes: [],
    radiusKm: DEFAULT_RADIUS_KM, startMode: 'dintorni',
  }
  try {
    const outcome = await Promise.race([
      executeBuild({ id: userId }, params, logBuild, Date.now()).then(res => ({ kind: 'done' as const, res })),
      new Promise<{ kind: 'timeout' }>(resolve => setTimeout(() => resolve({ kind: 'timeout' }), BUILT_CANDIDATE_SOFT_DEADLINE_MS)),
    ])
    if (outcome.kind === 'timeout') {
      console.error(`[generateRecommendations] executeBuild oltre ${BUILT_CANDIDATE_SOFT_DEADLINE_MS}ms per l'utente ${userId}, proseguo senza candidati "su misura" per questo giro`)
      return []
    }
    const body = (await outcome.res.json()) as { candidates?: ScoredCandidate[] }
    return (body.candidates ?? []).slice(0, TARGET_BUILT_CARDS)
  } catch (e) {
    console.error('[generateRecommendations] executeBuild fallito:', e)
    return []
  }
}

export async function generateRecommendationsForUser(userId: string): Promise<GenerateRecommendationsResult> {
  const centroid = await deriveCentroid(userId)
  if (!centroid) return { status: 'empty_no_location', cards: [], centroid: null }

  const [profile, history] = await Promise.all([fetchHikerProfile(userId), fetchActivitySummary(userId)])
  const targetDistanceKm = clampDistanceKm(history.count > 0 ? history.avgDistanceKm : DEFAULT_NEW_USER_DISTANCE_KM)
  const targetElevationM = history.count > 0 ? Math.round(history.avgElevationM) : null
  const bboxRadiusKm = Math.min(Math.max(targetDistanceKm * 0.6, 2), 10)

  const logBuild: LogBuildFn = async fields => {
    await logRouteBuildEvent({
      userId, kind: 'build', routeType: 'anello', targetDistanceKm, useAi: false, durationMs: 0,
      ...fields,
      details: { ...(fields.details ?? {}), source: 'recommendations_cron' },
    })
  }

  const builtCandidates = await gatherBuiltCandidates(userId, centroid, targetDistanceKm, targetElevationM, profile.environmentPrefs, logBuild)
  const foundWanted = Math.max(MIN_FOUND_TARGET, TOTAL_CARDS - builtCandidates.length)
  const foundItems = await gatherFoundCandidates(centroid, targetDistanceKm, bboxRadiusKm, foundWanted)

  const cards: RecommendationCard[] = [
    ...builtCandidates.map(c => ({ id: `built:${candidateSignature(c)}`, kind: 'built' as const, data: c })),
    ...foundItems.map(f => ({ id: `found:${f.osmId}`, kind: 'found' as const, data: f })),
  ].slice(0, TOTAL_CARDS)

  return { status: 'ok', cards, centroid }
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
