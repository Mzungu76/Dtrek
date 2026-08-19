'use client'

import { getBrowserSupabase } from './supabaseBrowser'
import { lsGet, lsSet, LS_KEYS, obEnqueue } from './localStore'
import { registerEntityFlusher, scheduleFlush, flushRows, getPendingRecordIds } from './sync/syncEngine'
import { revalidateListInBackground } from './sync/pullEngine'
import { isStaleSwResponse } from './apiFetch'

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
  /** DTREK-AUDIT.md P3 #35 — copia piccola (vedi THUMB_PHOTO_SIDE) per le viste a griglia/pin,
   *  che oggi scaricavano l'intera foto da MAX_PHOTO_SIDE solo per ritagliarla a poche decine di
   *  px. Assente sulle foto caricate prima di questa fix — i chiamanti devono ricadere su `url`. */
  thumbUrl?: string
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
  // getSession() (unlike getUser()) proactively refreshes an expired/near-expiry access token
  // before returning. Without this, a tab left open for a while — autoRefreshToken's timer gets
  // throttled/paused by the browser while backgrounded, common when switching apps on mobile —
  // can still pass the getUser() check below with a stale token (Supabase's Auth server still
  // accepts it for that one read), yet the *separate* network call right after this (the Storage
  // upload in uploadPhotoBlob) sends that same stale token and gets silently rejected by
  // Storage's RLS check, surfacing as a generic upload/connection error instead of an auth one.
  await supabase.auth.getSession()
  const { data } = await supabase.auth.getUser()
  if (!data.user) throw new Error('Utente non autenticato')
  return data.user.id
}

/**
 * Tetto alle foto per escursione.
 *
 * Uguale per tutte le uscite, non proporzionale ai chilometri: nei dati reali la correlazione è
 * **inversa** — le passeggiate brevi hanno più foto al km (7,4 km e 17 foto) e le lunghe molte meno
 * (17,5 km e 1 foto). Un limite legato alla distanza penalizzerebbe proprio le uscite fotografiche.
 */
export const MAX_PHOTOS_PER_ACTIVITY = 15

/** Lato lungo massimo di una foto archiviata. */
const MAX_PHOTO_SIDE = 1600
const PHOTO_JPEG_QUALITY = 0.82

// DTREK-AUDIT.md P3 #35 — lato lungo per la copia "miniatura": le viste a griglia/pin la
// mostrano ritagliata a quadrato o poco più (w-36/w-16/w-14 Tailwind, cioè 144/64/56 px CSS),
// 320 px copre anche uno schermo retina 2x senza avvicinarsi al peso della copia intera.
const THUMB_PHOTO_SIDE = 320
const THUMB_JPEG_QUALITY = 0.75

/** Ridimensiona (se serve) e ricomprime un'immagine già decodificata al lato lungo massimo dato. */
async function resizeDecodedImage(img: HTMLImageElement, dataUrl: string, maxSide: number, quality: number): Promise<Blob> {
  const longSide = Math.max(img.naturalWidth, img.naturalHeight)
  if (longSide <= maxSide) return dataUrlToBlob(dataUrl)

  const k = maxSide / longSide
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.naturalWidth * k)
  canvas.height = Math.round(img.naturalHeight * k)
  const ctx = canvas.getContext('2d')
  if (!ctx) return dataUrlToBlob(dataUrl)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

  const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', quality))
  canvas.width = 0; canvas.height = 0
  // Se il browser non produce il blob (quota di memoria, canvas contaminato) si carica l'originale:
  // meglio una foto pesante che una foto persa.
  return blob ?? dataUrlToBlob(dataUrl)
}

/**
 * Ridimensiona la foto prima di caricarla.
 *
 * È la leva che conta davvero sullo spazio, molto più del numero di foto: uno scatto da telefono
 * pesa 2-4 MB, a 1600 px di lato lungo scende a ~300 KB. Con 15 foto per escursione si passa da
 * ~45 MB a ~4,5 MB per uscita — la differenza fra riempire il primo gigabyte in una ventina di
 * escursioni e in un paio di centinaia.
 *
 * 1600 px non è una perdita visibile: la foto più grande stampata nel PDF è larga 341 px, e sulla
 * pagina pubblica arriva al massimo alla larghezza dello schermo.
 */
async function shrinkForUpload(dataUrl: string): Promise<Blob> {
  const img = new Image()
  img.src = dataUrl
  await img.decode()
  return resizeDecodedImage(img, dataUrl, MAX_PHOTO_SIDE, PHOTO_JPEG_QUALITY)
}

/**
 * Seconda copia, piccola, per le viste a griglia/pin (DTREK-AUDIT.md P3 #35) — quelle scaricavano
 * l'intera foto da MAX_PHOTO_SIDE solo per mostrarne un ritaglio di poche decine di px. Ridotta e
 * ricompressa a THUMB_JPEG_QUALITY; se lo scatto originale è già più piccolo di THUMB_PHOTO_SIDE
 * (raro coi telefoni reali) resta quello, come già fa shrinkForUpload per lo stesso caso.
 */
async function shrinkForThumbnail(dataUrl: string): Promise<Blob> {
  const img = new Image()
  img.src = dataUrl
  await img.decode()
  return resizeDecodedImage(img, dataUrl, THUMB_PHOTO_SIDE, THUMB_JPEG_QUALITY)
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
  thumbUrl?: string
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
  // See lib/apiFetch.ts's isStaleSwResponse — revalidateListInBackground has no timestamp to
  // compare for photos, so a stale response served from the service worker's offline fallback
  // cache would otherwise look just as valid as a fresh one and silently overwrite a newer local
  // list (or seed a first-ever load) with old data.
  if (isStaleSwResponse(res)) throw new Error('served from a stale offline cache')
  const rows = await res.json() as Array<{
    id: string; url: string; caption: string; progress: number
    hasExifGps: boolean; lat?: number; lon?: number; updatedAt?: string; thumbUrl?: string
  }>
  return rows
    .map(r => ({ id: r.id, url: r.url, caption: r.caption, progress: r.progress, hasExifGps: r.hasExifGps, lat: r.lat, lon: r.lon, updatedAt: r.updatedAt, thumbUrl: r.thumbUrl }))
    .sort((a, b) => a.progress - b.progress)
}

/**
 * La lista del server, ma con le scritture locali non ancora sincronizzate che continuano a
 * vincere — quello che registerListReconciler (lib/sync/pullEngine.ts) fa già per gli altri
 * store, e che la più semplice revalidateListInBackground da sola non fa.
 *
 * Senza questa riconciliazione una foto eliminata offline (o solo un attimo prima che l'outbox
 * riuscisse a svuotarsi) tornava a comparire alla riapertura successiva: la rivalidazione in
 * background chiedeva l'elenco al server, che la DELETE non l'aveva ancora ricevuta, e
 * sovrascriveva con quella risposta la cache locale da cui la foto era già stata tolta. Stessa
 * cosa per una didascalia riscritta o una foto riposizionata.
 */
async function fetchReconciled(activityId: string): Promise<RoutePhoto[]> {
  const [server, pendingIds] = await Promise.all([
    fetchFromServer(activityId),
    getPendingRecordIds(ENTITY_TYPE).catch(() => new Set<string>()),
  ])
  if (pendingIds.size === 0) return server

  const local = (await lsGet<RoutePhoto[]>(LS_KEYS.activityPhotos(activityId))) ?? []
  const localById = new Map(local.map(p => [p.id, p]))
  return server
    // In sospeso e sparita dalla copia locale ⇒ eliminata qui, il server non lo sa ancora.
    .filter(p => !pendingIds.has(p.id) || localById.has(p.id))
    // In sospeso e ancora presente ⇒ modificata qui, la versione locale è la più recente.
    .map(p => pendingIds.has(p.id) ? localById.get(p.id)! : p)
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
 * localStorage migration) when there's no local copy yet. Ogni scrittura
 * (aggiunta, modifica, eliminazione) aggiorna la cache prima di accodare la
 * chiamata remota, quindi questa lettura cache-first non può più restituire
 * una foto già eliminata o una didascalia già riscritta.
 */
export async function fetchActivityPhotos(activityId: string): Promise<RoutePhoto[]> {
  const local = await lsGet<RoutePhoto[]>(LS_KEYS.activityPhotos(activityId))
  if (local) {
    revalidateListInBackground(LS_KEYS.activityPhotos(activityId), local, () => fetchReconciled(activityId))
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
  const [blob, thumbBlob] = await Promise.all([
    shrinkForUpload(photo.dataUrl),
    shrinkForThumbnail(photo.dataUrl),
  ])
  const [{ url, storagePath }, thumbUpload] = await Promise.all([
    uploadPhotoBlob(userId, activityId, photo.id, blob),
    // DTREK-AUDIT.md P3 #35 — stesso bucket/cartella della foto principale, solo un suffisso nel
    // nome file: nessun bucket separato da configurare, nessuna nuova policy RLS da scrivere.
    uploadPhotoBlob(userId, activityId, `${photo.id}-thumb`, thumbBlob),
  ])
  const thumbUrl = thumbUpload.url
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
    thumbUrl,
  })
  const result = { id: photo.id, url, progress: photo.progress, caption: photo.caption, hasExifGps: photo.hasExifGps, lat: photo.lat, lon: photo.lon, thumbUrl }
  const local = await lsGet<RoutePhoto[]>(LS_KEYS.activityPhotos(activityId))
  await lsSet(LS_KEYS.activityPhotos(activityId), [...(local ?? []), result].sort((a, b) => a.progress - b.progress))
  return result
}

/**
 * Applies the metadata patch to the local cache immediately and queues it for background sync —
 * never blocks on the network.
 *
 * `activityId` esiste per poter scrivere anche nella cache locale, non solo in outbox: senza,
 * una didascalia riscritta o una foto riposizionata sopravviveva solo nello stato React del
 * chiamante e spariva alla riapertura della scheda, perché fetchActivityPhotos legge prima la
 * cache (che era rimasta a com'era) e solo dopo, in background, il server.
 */
export async function updateActivityPhoto(activityId: string, id: string, patch: {
  caption?: string
  progress?: number
  lat?: number
  lon?: number
}): Promise<void> {
  const local = await lsGet<RoutePhoto[]>(LS_KEYS.activityPhotos(activityId))
  if (local) {
    await lsSet(
      LS_KEYS.activityPhotos(activityId),
      local.map(p => p.id === id ? { ...p, ...patch } : p).sort((a, b) => a.progress - b.progress),
    )
  }
  await obEnqueue(ENTITY_TYPE, id, 'patch', { id, ...patch })
  scheduleFlush()
}

/**
 * Removes the photo from the local cache immediately and queues the deletion for background sync.
 *
 * La rimozione dalla cache è la metà che mancava: prima si accodava solo la DELETE remota, quindi
 * riaprendo la scheda la foto "eliminata" tornava a comparire — servita dalla cache locale, che non
 * aveva mai saputo nulla. E anche a sincronizzazione avvenuta la cache restava sbagliata finché non
 * vinceva la rivalidazione in background, cioè in un momento non prevedibile dall'utente.
 */
export async function removeActivityPhoto(activityId: string, id: string): Promise<void> {
  const local = await lsGet<RoutePhoto[]>(LS_KEYS.activityPhotos(activityId))
  if (local) await lsSet(LS_KEYS.activityPhotos(activityId), local.filter(p => p.id !== id))
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
