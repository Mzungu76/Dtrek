'use client'

import { getBrowserSupabase } from './supabaseBrowser'
import { lsGet, lsSet, LS_KEYS, obEnqueue } from './localStore'
import { registerEntityFlusher, scheduleFlush, flushRows } from './sync/syncEngine'
import { revalidateListInBackground } from './sync/pullEngine'

const BUCKET = 'dtrek-photos'
const LEGACY_PREFIX = 'dtrek_vp_'
const ENTITY_TYPE = 'activity_photo'

export interface RoutePhoto {
  id: string
  url: string
  progress: number
  caption: string
  hasExifGps: boolean
  lat?: number
  lon?: number
  /** Server-side last-modified timestamp — see lib/sync/pullEngine.ts. */
  updatedAt?: string
}

/** Copertina "intelligente" quando l'utente non ne ha scelta una a mano (vedi
 *  app/resoconto/ResocontoHub.tsx e components/resoconto/ReportReader.tsx): preferisce la foto
 *  con la didascalia più descrittiva (più lunga) invece della prima per progressione lungo il
 *  percorso — di solito quella con più da raccontare è anche la più rappresentativa. A parità di
 *  didascalia (es. tutte vuote) resta l'ordine per progressione già garantito dal caller. */
export function pickBestCoverPhoto(photos: RoutePhoto[]): RoutePhoto | undefined {
  if (photos.length === 0) return undefined
  return [...photos].sort((a, b) => (b.caption?.trim().length ?? 0) - (a.caption?.trim().length ?? 0))[0]
}

interface LegacyPhoto {
  id: string
  dataUrl: string
  progress: number
  caption: string
  hasExifGps: boolean
  lat?: number
  lon?: number
}

async function getUserId(): Promise<string> {
  const supabase = getBrowserSupabase()
  const { data } = await supabase.auth.getUser()
  if (!data.user) throw new Error('Utente non autenticato')
  return data.user.id
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, b64] = dataUrl.split(',')
  const mime = header.match(/data:(.*?);base64/)?.[1] ?? 'image/jpeg'
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

async function uploadPhotoBlob(
  userId: string, activityId: string, photoId: string, blob: Blob
): Promise<{ url: string; storagePath: string }> {
  const supabase = getBrowserSupabase()
  const storagePath = `${userId}/${activityId}/${photoId}.jpg`
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, blob, {
    contentType: blob.type || 'image/jpeg',
    upsert: true,
  })
  if (error) throw error
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath)
  return { url: data.publicUrl, storagePath }
}

async function saveMetadata(params: {
  id: string
  activityId: string
  url: string
  storagePath: string
  caption: string
  progress: number
  hasExifGps: boolean
  lat?: number
  lon?: number
}): Promise<void> {
  const res = await fetch('/api/activity-photos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!res.ok) throw new Error('Salvataggio foto non riuscito')
}

async function fetchFromServer(activityId: string): Promise<RoutePhoto[]> {
  const res = await fetch(`/api/activity-photos?activityId=${encodeURIComponent(activityId)}`)
  if (!res.ok) throw new Error('Impossibile caricare le foto')
  const rows = await res.json() as Array<{
    id: string; url: string; caption: string; progress: number
    hasExifGps: boolean; lat?: number; lon?: number; updatedAt?: string
  }>
  return rows
    .map(r => ({ id: r.id, url: r.url, caption: r.caption, progress: r.progress, hasExifGps: r.hasExifGps, lat: r.lat, lon: r.lon, updatedAt: r.updatedAt }))
    .sort((a, b) => a.progress - b.progress)
}

// Le foto caricate prima di questa fix vivono solo in localStorage (dtrek_vp_${id}, base64).
// Se il server non ha ancora nulla per questa escursione, le migriamo una volta sul backend;
// la chiave locale viene rimossa solo se TUTTE le foto sono state migrate con successo, così
// un fallimento a metà lascia i dati intatti per un nuovo tentativo al prossimo accesso.
async function migrateLegacyPhotos(activityId: string): Promise<RoutePhoto[] | null> {
  if (typeof window === 'undefined') return null
  const key = `${LEGACY_PREFIX}${activityId}`
  const raw = localStorage.getItem(key)
  if (!raw) return null

  let legacy: LegacyPhoto[]
  try {
    legacy = JSON.parse(raw)
  } catch {
    localStorage.removeItem(key)
    return null
  }
  if (!Array.isArray(legacy) || legacy.length === 0) {
    localStorage.removeItem(key)
    return null
  }

  const userId = await getUserId()
  const migrated: RoutePhoto[] = []
  for (const photo of legacy) {
    const blob = dataUrlToBlob(photo.dataUrl)
    const { url, storagePath } = await uploadPhotoBlob(userId, activityId, photo.id, blob)
    await saveMetadata({
      id: photo.id,
      activityId,
      url,
      storagePath,
      caption: photo.caption,
      progress: photo.progress,
      hasExifGps: photo.hasExifGps,
      lat: photo.lat,
      lon: photo.lon,
    })
    migrated.push({ id: photo.id, url, progress: photo.progress, caption: photo.caption, hasExifGps: photo.hasExifGps, lat: photo.lat, lon: photo.lon })
  }

  localStorage.removeItem(key)
  return migrated.sort((a, b) => a.progress - b.progress)
}

/**
 * Returns the local copy if present; only hits Supabase (and the legacy
 * localStorage migration) when there's no local copy yet. Metadata edits
 * (caption/position) applied while this activity's photo list isn't
 * currently cached won't be reflected here until the next full refetch —
 * an accepted limitation since every editor already keeps its own React
 * state in sync for the duration of the session (see updateActivityPhoto).
 */
export async function fetchActivityPhotos(activityId: string): Promise<RoutePhoto[]> {
  const local = await lsGet<RoutePhoto[]>(LS_KEYS.activityPhotos(activityId))
  if (local) {
    revalidateListInBackground(LS_KEYS.activityPhotos(activityId), local, () => fetchFromServer(activityId))
    return local
  }

  const serverPhotos = await fetchFromServer(activityId)
  if (serverPhotos.length > 0) {
    await lsSet(LS_KEYS.activityPhotos(activityId), serverPhotos)
    return serverPhotos
  }

  const migrated = await migrateLegacyPhotos(activityId)
  const result = migrated ?? []
  await lsSet(LS_KEYS.activityPhotos(activityId), result)
  return result
}

// The binary upload itself always requires the network (a multi-MB blob queued in IndexedDB
// would fight the same storage-quota/eviction risk this migration is trying to reduce, not
// help it) — addActivityPhoto stays direct-network, unlike every other write in this file.
export async function addActivityPhoto(activityId: string, photo: {
  id: string
  dataUrl: string
  progress: number
  caption: string
  hasExifGps: boolean
  lat?: number
  lon?: number
}): Promise<RoutePhoto> {
  const userId = await getUserId()
  const blob = dataUrlToBlob(photo.dataUrl)
  const { url, storagePath } = await uploadPhotoBlob(userId, activityId, photo.id, blob)
  await saveMetadata({
    id: photo.id,
    activityId,
    url,
    storagePath,
    caption: photo.caption,
    progress: photo.progress,
    hasExifGps: photo.hasExifGps,
    lat: photo.lat,
    lon: photo.lon,
  })
  const result = { id: photo.id, url, progress: photo.progress, caption: photo.caption, hasExifGps: photo.hasExifGps, lat: photo.lat, lon: photo.lon }
  const local = await lsGet<RoutePhoto[]>(LS_KEYS.activityPhotos(activityId))
  await lsSet(LS_KEYS.activityPhotos(activityId), [...(local ?? []), result].sort((a, b) => a.progress - b.progress))
  return result
}

/** Queues the metadata patch for background sync — never blocks on the network (callers already keep their own optimistic UI state, see components/RouteMap3D.tsx). */
export async function updateActivityPhoto(id: string, patch: {
  caption?: string
  progress?: number
  lat?: number
  lon?: number
}): Promise<void> {
  await obEnqueue(ENTITY_TYPE, id, 'patch', { id, ...patch })
  scheduleFlush()
}

/** Queues the deletion for background sync. */
export async function removeActivityPhoto(id: string): Promise<void> {
  await obEnqueue(ENTITY_TYPE, id, 'delete')
  scheduleFlush()
}

registerEntityFlusher(ENTITY_TYPE, (rows) => flushRows(rows, async (row) => {
  if (row.op === 'delete') {
    const res = await fetch(`/api/activity-photos?id=${encodeURIComponent(row.recordId)}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(`${res.status}`)
  } else {
    const res = await fetch('/api/activity-photos', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(row.payload),
    })
    if (!res.ok) throw new Error(`${res.status}`)
  }
}))
