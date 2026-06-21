'use client'

import { getBrowserSupabase } from './supabaseBrowser'

const BUCKET = 'dtrek-photos'
const LEGACY_PREFIX = 'dtrek_vp_'

export interface RoutePhoto {
  id: string
  url: string
  progress: number
  caption: string
  hasExifGps: boolean
  lat?: number
  lon?: number
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
    hasExifGps: boolean; lat?: number; lon?: number
  }>
  return rows
    .map(r => ({ id: r.id, url: r.url, caption: r.caption, progress: r.progress, hasExifGps: r.hasExifGps, lat: r.lat, lon: r.lon }))
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

export async function fetchActivityPhotos(activityId: string): Promise<RoutePhoto[]> {
  const serverPhotos = await fetchFromServer(activityId)
  if (serverPhotos.length > 0) return serverPhotos

  const migrated = await migrateLegacyPhotos(activityId)
  return migrated ?? []
}

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
  return { id: photo.id, url, progress: photo.progress, caption: photo.caption, hasExifGps: photo.hasExifGps, lat: photo.lat, lon: photo.lon }
}

export async function updateActivityPhoto(id: string, patch: {
  caption?: string
  progress?: number
  lat?: number
  lon?: number
}): Promise<void> {
  const res = await fetch('/api/activity-photos', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...patch }),
  })
  if (!res.ok) throw new Error('Aggiornamento foto non riuscito')
}

export async function removeActivityPhoto(id: string): Promise<void> {
  const res = await fetch(`/api/activity-photos?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Eliminazione foto non riuscita')
}
