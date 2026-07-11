import type { TrackPoint } from './tcxParser'
import type { HikeAssessment } from './hikeAssessment'
import { lsGet, lsSet, lsDel, LS_KEYS, obEnqueue } from './localStore'
import { registerEntityFlusher, scheduleFlush } from './sync/syncEngine'
import type { BeautyScore } from './beautyScore'
import type { CtsConfidence } from './trailScore'
import type { SafetyScore } from './safetyScore'
import type { ClassifiedDifficultyMarker } from './difficultyMarkers'
import type { HikeNote } from './blobStore'
import type { TrailRiddle } from './riddles'
import type { EpochPoi } from './epochPois'
import type { TrailDtmProfile } from './dtm/trailDtmProfile'
import type { TrailTerrainProfile } from './terrain/trailTerrainProfile'
import type { CLSignals } from './cl/types'
import type { FloraResult } from './floraTypes'

export type { HikeAssessment, AssessmentItem } from './hikeAssessment'
export type { HikeNote } from './blobStore'

export interface PlannedHike {
  id: string
  title: string
  plannedDate?: string
  fileName?: string
  userNotes?: string
  hikeNotes?: HikeNote[]
  tags?: string[]
  createdAt: string
  distanceMeters:       number
  elevationGain:        number
  elevationLoss:        number
  altitudeMax:          number
  altitudeMin:          number
  estimatedTimeSeconds: number
  routePolyline?:       [number, number][]
  osmId?:               number
  trackPoints?:         TrackPoint[]
  assessment?:          HikeAssessment
  cachedPois?:          unknown[]
  cachedPoiWiki?:       unknown[]
  cachedGuide?:         string
  // Sottotitolo da copertina scritto dall'AI al momento della generazione (vedi
  // lib/coverSubtitle.ts, tag [sottotitolo] in app/api/guide/route.ts) — non presente sulle
  // guide generate prima di questo campo.
  cachedGuideSubtitle?: string
  // Avvisi sullo stato aggiornato del percorso (chiusure, deviazioni, lavori) trovati dalla
  // ricerca web di Giulia al momento della generazione (tag [avviso], vedi lib/guideNotices.ts) —
  // vuoto/assente se nessuna criticità nota o su guide generate prima di questo campo.
  cachedGuideNotices?: string[]
  // Fonti web citate da Giulia durante la generazione (tag [fonti], vedi lib/guideSources.ts) —
  // vuoto/assente se la ricerca web non ha prodotto citazioni o su guide generate prima di questo campo.
  cachedGuideSources?: { url: string; title: string }[]
  // Livello dell'ultima generazione: 'breve' (auto, testo AI solo su guideBreveSections) o
  // 'approfondita' (via "Approfondisci", testo AI su tutte le sezioni). Undefined con
  // cachedGuide già valorizzato ⇒ guida generata prima di questa colonna (formato legacy).
  guideTier?:                    'breve' | 'approfondita'
  guideGeneratedAt?:             string
  cachedBeautyScore?:            BeautyScore
  cachedTrailScore?:             number
  cachedTrailScoreConfidence?:   CtsConfidence
  // When cachedBeautyScore+cachedTrailScore were last computed — see lib/scoreFreshness.ts.
  // Beauty is never tracked as its own independent score (it's just CTS's input), so the two
  // share one timestamp instead of each needing their own.
  cachedScoresComputedAt?:       string
  cachedSafetyScore?:            SafetyScore
  cachedSafetyComputedAt?:       string
  // Full Trail Score aggregate (CL + Sicurezza + Comfort TrailScore + Ombra e acqua, see
  // components/ScoreRing.tsx) — computed once live while the hike is open, then persisted so
  // list/gallery views can read it back instantly instead of recomputing a partial version.
  cachedTsTotal?:                number
  cachedRiddles?:                TrailRiddle[]
  cachedEpochPois?:              EpochPoi[]
  // Distanza/tempo di guida (auto) dal punto di partenza dell'utente, con le coordinate
  // di origine usate per il calcolo — permette di invalidare la cache se l'utente
  // cambia il proprio indirizzo di partenza senza dover ricalcolare ad ogni apertura.
  cachedDrivingDistanceMeters?:  number
  cachedDrivingDurationSeconds?: number
  cachedDrivingOriginLat?:       number
  cachedDrivingOriginLon?:       number
  // Tratti difficili estratti dai waypoint/commenti del GPX importato
  // (Komoot/AllTrails) — vedi lib/difficultyMarkers.ts. Persistiti su
  // trail_difficulty_markers, non su questa riga.
  difficultyMarkers?:            ClassifiedDifficultyMarker[]
  // Scadenza del percorso "in attesa" nel tab Guida (calcolata all'import da
  // guide_pending_days) e stato di archiviazione manuale post-scadenza.
  pendingExpiresAt?:             string
  archivedAt?:                   string
  // Preferito nella galleria Guida — vedi components/routehub/BottomGallery.tsx (stella sulla
  // scheda chiusa) e app/guida/GuidaHub.tsx (filtro "Preferiti", additivo rispetto all'ordinamento).
  favorite?:                     boolean
  // Profilo DTM (pendenza/esposizione) — calcolato dalla sola traccia GPS, che non cambia mai
  // dopo l'import: dtmTrackHash (lib/geoUtils.ts hashTrack) invalida la cache se la traccia
  // dovesse comunque cambiare, al posto di una scadenza temporale. Vedi app/guida/useDtmProfile.ts.
  dtmProfile?:                   TrailDtmProfile
  dtmTrackHash?:                 string
  dtmComputedAt?:                string
  // Stesso pattern di dtmProfile — vedi app/guida/useTerrainProfile.ts.
  terrainProfile?:               TrailTerrainProfile
  terrainTrackHash?:             string
  terrainComputedAt?:            string
  // Stesso pattern di dtmProfile — vedi app/guida/useProtectedAreaCheck.ts.
  cachedInProtectedArea?:        boolean
  cachedProtectedAreaTrackHash?: string
  cachedProtectedAreaComputedAt?: string
  // Punteggio CL/SI — a differenza dei campi sopra questi sono già scritti da
  // lib/cl/computeCL.ts (computeCLForPlannedHike) con TTL a 3 livelli (statico/dinamico/
  // satellite, lib/cl/label.ts), non tramite updatePlannedMeta: qui vengono solo letti, per
  // permettere a lib/cl/useCL.ts di saltare del tutto la chiamata a /api/trails/cl quando tutti
  // e tre i livelli sono già freschi.
  siScore?:                      number
  siSignals?:                    CLSignals
  siStaticComputedAt?:           string
  siDynamicComputedAt?:          string
  siSatelliteComputedAt?:        string
  isGhostTrail?:                 boolean
  dominantWarning?:              string
  // Stesso pattern di dtmProfile — vedi lib/useFlora.ts.
  floraResult?:                  FloraResult
  floraTrackHash?:                string
  floraComputedAt?:              string
}

// Index entry — no trackPoints (kept lightweight for the list)
export type PlannedHikeMeta = Omit<PlannedHike, 'trackPoints'>

// ── helpers ───────────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API ${url} → ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

function toPlannedMeta(h: PlannedHike): PlannedHikeMeta {
  const { trackPoints: _, ...meta } = h
  return meta
}

const ENTITY_TYPE = 'planned_hike'

// ── Public API ────────────────────────────────────────────────────────────────
// Cache-first reads, same pattern as lib/blobStore.ts's activities. Writes are
// queued through the outbox EXCEPT savePlanned's creation path (see below).

/** Returns the local list if present; only hits Supabase when there's no local copy yet. */
export async function getAllPlanned(onRefresh?: (data: PlannedHikeMeta[]) => void): Promise<PlannedHikeMeta[]> {
  const local = await lsGet<PlannedHikeMeta[]>(LS_KEYS.plannedList)
  if (local) return local
  try {
    const data = await apiFetch<PlannedHikeMeta[]>('/api/planned')
    await lsSet(LS_KEYS.plannedList, data)
    onRefresh?.(data)
    return data
  } catch {
    return []
  }
}

/** Returns the local copy if present; only hits Supabase when there's no local copy yet. */
export async function getPlannedById(id: string): Promise<PlannedHike | null> {
  const local = await lsGet<PlannedHike>(LS_KEYS.planned(id))
  // Self-heal a known bad cache shape from before savePlanned's response included
  // routePolyline (see app/api/planned/route.ts POST): a cached hike with no routePolyline and
  // no osmId can never fetch its CL/shade-water scores (lib/cl/useCL.ts's queryFor needs one of
  // the two), so it would otherwise be stuck like that forever under a pure cache-first read.
  const needsRepair = !!local && !local.routePolyline?.length && local.osmId == null && (local.trackPoints?.length ?? 0) > 0
  if (local && !needsRepair) return local
  if (local && needsRepair) {
    // The local copy is already fully usable for display (title, trackPoints, guide text…) — only
    // the CL/shade-water fetch needs routePolyline/osmId, and that hasn't even run yet at this
    // point. Repair in the background instead of blocking on the network: awaiting the fetch here
    // used to leave the caller stuck showing "Caricamento" for as long as the request took to
    // fail, which during a Supabase outage could be a long time instead of the instant fallback a
    // cache-first read is supposed to give.
    apiFetch<PlannedHike>(`/api/planned?id=${encodeURIComponent(id)}`)
      .then(data => lsSet(LS_KEYS.planned(id), data))
      .catch(() => {})
    return local
  }
  try {
    const data = await apiFetch<PlannedHike>(`/api/planned?id=${encodeURIComponent(id)}`)
    await lsSet(LS_KEYS.planned(id), data)
    return data
  } catch {
    return local ?? null
  }
}

/**
 * Creates/overwrites a planned hike. Unlike every other write in this module,
 * this one still attempts the network call synchronously — the server
 * computes a personalized `assessment` (lib/hikeAssessment.ts) that the
 * detail page the caller navigates to right after saving needs immediately,
 * so it can't be left for a background flush the way a routine edit can.
 * If the network call fails (offline, transient error) the hike is queued
 * instead, so the record isn't lost — the assessment simply arrives later,
 * merged in by the registered flusher below once the flush succeeds.
 */
export async function savePlanned(hike: PlannedHike): Promise<{ assessment?: HikeAssessment }> {
  await lsSet(LS_KEYS.planned(hike.id), hike)
  const list = await lsGet<PlannedHikeMeta[]>(LS_KEYS.plannedList)
  await lsSet(LS_KEYS.plannedList, [toPlannedMeta(hike), ...(list ?? []).filter((h) => h.id !== hike.id)])

  try {
    const result = await apiFetch<{ ok: boolean; assessment?: HikeAssessment; routePolyline?: [number, number][] }>('/api/planned', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(hike),
    })
    // Merge in the server-computed assessment and routePolyline (derived from trackPoints
    // server-side when the client didn't send one, e.g. a fresh GPX import) so the cache isn't
    // stale on the very first read — cache-first getPlannedById would otherwise return an object
    // permanently missing routePolyline, which useCL/useSentinel2 (lib/cl/useCL.ts) need to even
    // attempt fetching the CL/shade-water scores.
    const cached = {
      ...hike,
      ...(result.assessment    ? { assessment: result.assessment } : {}),
      ...(result.routePolyline ? { routePolyline: result.routePolyline } : {}),
    }
    await lsSet(LS_KEYS.planned(hike.id), cached)
    const list2 = await lsGet<PlannedHikeMeta[]>(LS_KEYS.plannedList)
    if (list2) await lsSet(LS_KEYS.plannedList, list2.map((h) => h.id === hike.id ? toPlannedMeta(cached) : h))
    return result
  } catch {
    await obEnqueue(ENTITY_TYPE, hike.id, 'upsert', hike)
    scheduleFlush()
    return {}
  }
}

/** Applies a partial update to the local cache immediately and queues it for background sync. */
export async function updatePlannedMeta(
  id: string,
  meta: Partial<Pick<PlannedHike, 'title' | 'userNotes' | 'hikeNotes' | 'tags' | 'plannedDate' | 'cachedPois' | 'cachedPoiWiki' | 'cachedGuide' | 'cachedGuideSubtitle' | 'cachedGuideNotices' | 'cachedGuideSources' | 'guideTier' | 'guideGeneratedAt' | 'cachedRiddles' | 'cachedEpochPois' | 'cachedBeautyScore' | 'cachedTrailScore' | 'cachedTrailScoreConfidence' | 'cachedScoresComputedAt' | 'cachedSafetyScore' | 'cachedSafetyComputedAt' | 'cachedTsTotal' | 'cachedDrivingDistanceMeters' | 'cachedDrivingDurationSeconds' | 'cachedDrivingOriginLat' | 'cachedDrivingOriginLon' | 'pendingExpiresAt' | 'archivedAt' | 'favorite' | 'dtmProfile' | 'dtmTrackHash' | 'dtmComputedAt' | 'terrainProfile' | 'terrainTrackHash' | 'terrainComputedAt' | 'cachedInProtectedArea' | 'cachedProtectedAreaTrackHash' | 'cachedProtectedAreaComputedAt' | 'floraResult' | 'floraTrackHash' | 'floraComputedAt'>>,
): Promise<void> {
  const local = await lsGet<PlannedHike>(LS_KEYS.planned(id))
  if (local) await lsSet(LS_KEYS.planned(id), { ...local, ...meta })
  const list = await lsGet<PlannedHikeMeta[]>(LS_KEYS.plannedList)
  if (list) await lsSet(LS_KEYS.plannedList, list.map((h) => h.id === id ? { ...h, ...meta } : h))
  await obEnqueue(ENTITY_TYPE, id, 'patch', meta)
  scheduleFlush()
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('cts-updated'))
}

/** Removes from the local cache immediately and queues the deletion for background sync. */
export async function deletePlanned(id: string): Promise<void> {
  await lsDel(LS_KEYS.planned(id))
  const list = await lsGet<PlannedHikeMeta[]>(LS_KEYS.plannedList)
  if (list) await lsSet(LS_KEYS.plannedList, list.filter((h) => h.id !== id))
  await obEnqueue(ENTITY_TYPE, id, 'delete')
  scheduleFlush()
}

registerEntityFlusher(ENTITY_TYPE, async (rows) => {
  const succeededIds: number[] = []
  for (const row of rows) {
    try {
      if (row.op === 'delete') {
        await apiFetch(`/api/planned?id=${encodeURIComponent(row.recordId)}`, { method: 'DELETE' })
      } else if (row.op === 'upsert') {
        const result = await apiFetch<{ ok: boolean; assessment?: HikeAssessment; routePolyline?: [number, number][] }>('/api/planned', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(row.payload),
        })
        if (result.assessment || result.routePolyline) {
          const patch = {
            ...(result.assessment    ? { assessment: result.assessment } : {}),
            ...(result.routePolyline ? { routePolyline: result.routePolyline } : {}),
          }
          const local = await lsGet<PlannedHike>(LS_KEYS.planned(row.recordId))
          if (local) await lsSet(LS_KEYS.planned(row.recordId), { ...local, ...patch })
          const list = await lsGet<PlannedHikeMeta[]>(LS_KEYS.plannedList)
          if (list) await lsSet(LS_KEYS.plannedList, list.map((h) => h.id === row.recordId ? { ...h, ...patch } : h))
        }
      } else {
        await apiFetch('/api/planned', {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ id: row.recordId, ...(row.payload as object ?? {}) }),
        })
      }
      succeededIds.push(row.outboxId!)
    } catch {
      // Leave this row pending — retried on the next flush trigger.
    }
  }
  return { succeededIds }
})
