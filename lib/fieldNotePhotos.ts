'use client'

// Photo upload for geolocated field notes taken during navigation — same Storage bucket and
// upload shape as lib/activityPhotos.ts, under its own path prefix. The note itself (text,
// geolocation, this photo URL) is a plain HikeNote appended to the hike's existing hike_notes
// JSONB array (lib/blobStore.ts) — no dedicated table needed, unlike the earlier "sentinella
// civica" design this replaces.
import { getBrowserSupabase } from './supabaseBrowser'

const BUCKET = 'dtrek-photos'

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

export async function uploadFieldNotePhoto(hikeId: string, noteId: string, dataUrl: string): Promise<{ url: string; storagePath: string }> {
  const userId = await getUserId()
  const storagePath = `${userId}/field-notes/${hikeId}/${noteId}.jpg`
  const blob = dataUrlToBlob(dataUrl)

  const supabase = getBrowserSupabase()
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, blob, {
    contentType: blob.type || 'image/jpeg',
    upsert: true,
  })
  if (error) throw error

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath)
  return { url: data.publicUrl, storagePath }
}
