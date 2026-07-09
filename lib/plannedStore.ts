import type { TrackPoint } from './tcxParser'
import type { HikeAssessment } from './hikeAssessment'
import { lsGet, lsSet, lsDel, LS_KEYS } from './localStore'
import type { BeautyScore } from './beautyScore'
import type { CtsConfidence } from './trailScore'
import type { SafetyScore } from './safetyScore'
import type { ClassifiedDifficultyMarker } from './difficultyMarkers'
import type { HikeNote } from './blobStore'
import type { TrailRiddle } from './riddles'
import type { EpochPoi } from './epochPois'

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

// ── Public API ────────────────────────────────────────────────────────────────

/** Stale-while-revalidate: local cache → Supabase refresh in background. */
export async function getAllPlanned(onRefresh?: (data: PlannedHikeMeta[]) => void): Promise<PlannedHikeMeta[]> {
  const local = await lsGet<PlannedHikeMeta[]>(LS_KEYS.plannedList)

  const netFetch = apiFetch<PlannedHikeMeta[]>('/api/planned')
    .then((data) => { lsSet(LS_KEYS.plannedList, data).catch(() => {}); onRefresh?.(data); return data })
    .catch((): PlannedHikeMeta[] => [])

  if (local && local.length > 0) {
    netFetch.catch(() => {})
    return local
  }
  return netFetch
}

/** Returns cached full planned hike immediately; refreshes from API in background. */
export async function getPlannedById(id: string): Promise<PlannedHike | null> {
  const local = await lsGet<PlannedHike>(LS_KEYS.planned(id))

  const netFetch = apiFetch<PlannedHike>(`/api/planned?id=${encodeURIComponent(id)}`)
    .then((data) => { lsSet(LS_KEYS.planned(id), data).catch(() => {}); return data })
    .catch((): null => null)

  if (local) {
    netFetch.catch(() => {})
    return local
  }
  return netFetch
}

/** Saves to Supabase, then updates local cache. */
export async function savePlanned(hike: PlannedHike): Promise<{ assessment?: HikeAssessment }> {
  const result = await apiFetch<{ ok: boolean; assessment?: HikeAssessment }>('/api/planned', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(hike),
  })
  // Update local cache — merge in the server-computed assessment so the cache
  // isn't stale on the very first read (cache-first getPlannedById would
  // otherwise return the assessment-less object sent to the API).
  const cached = result.assessment ? { ...hike, assessment: result.assessment } : hike
  lsSet(LS_KEYS.planned(hike.id), cached).catch(() => {})
  lsGet<PlannedHikeMeta[]>(LS_KEYS.plannedList).then((list) => {
    const meta    = toPlannedMeta(cached)
    const updated = [meta, ...(list ?? []).filter((h) => h.id !== hike.id)]
    lsSet(LS_KEYS.plannedList, updated).catch(() => {})
  }).catch(() => {})
  return result
}

/** Patches Supabase, then applies same patch to local cached copies. */
export async function updatePlannedMeta(
  id: string,
  meta: Partial<Pick<PlannedHike, 'title' | 'userNotes' | 'hikeNotes' | 'tags' | 'plannedDate' | 'cachedPois' | 'cachedPoiWiki' | 'cachedGuide' | 'cachedGuideSubtitle' | 'cachedGuideNotices' | 'guideTier' | 'guideGeneratedAt' | 'cachedRiddles' | 'cachedEpochPois' | 'cachedBeautyScore' | 'cachedTrailScore' | 'cachedTrailScoreConfidence' | 'cachedScoresComputedAt' | 'cachedSafetyScore' | 'cachedSafetyComputedAt' | 'cachedTsTotal' | 'cachedDrivingDistanceMeters' | 'cachedDrivingDurationSeconds' | 'cachedDrivingOriginLat' | 'cachedDrivingOriginLon' | 'pendingExpiresAt' | 'archivedAt'>>,
): Promise<void> {
  // Optimistic IDB update before API call (completes in ~5ms, long before API returns)
  lsGet<PlannedHike>(LS_KEYS.planned(id)).then((local) => {
    if (local) lsSet(LS_KEYS.planned(id), { ...local, ...meta }).catch(() => {})
  }).catch(() => {})
  lsGet<PlannedHikeMeta[]>(LS_KEYS.plannedList).then((list) => {
    if (!list) return
    lsSet(LS_KEYS.plannedList,
      list.map((h) => h.id === id ? { ...h, ...meta } : h)
    ).catch(() => {})
  }).catch(() => {})
  await apiFetch('/api/planned', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...meta }),
  })
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('cts-updated'))
}

/** Deletes from Supabase, then removes from local cache. */
export async function deletePlanned(id: string): Promise<void> {
  await apiFetch(`/api/planned?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
  lsDel(LS_KEYS.planned(id)).catch(() => {})
  lsGet<PlannedHikeMeta[]>(LS_KEYS.plannedList).then((list) => {
    if (!list) return
    lsSet(LS_KEYS.plannedList, list.filter((h) => h.id !== id)).catch(() => {})
  }).catch(() => {})
}
