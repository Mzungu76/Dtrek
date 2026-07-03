'use client'

// Sentinella civica: client-side upload for user-submitted photo+GPS reports. Same
// upload-then-save-metadata shape as lib/activityPhotos.ts's addActivityPhoto, reusing the
// same Storage bucket under a separate path prefix (civic-reports/ instead of ${activityId}/).
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

export interface CivicReportInput {
  dataUrl: string
  lat: number
  lon: number
  note?: string
  plannedHikeId?: string
}

/** Uploads the photo to Storage, then saves its metadata via /api/civic-reports. */
export async function submitCivicReport(report: CivicReportInput): Promise<void> {
  const userId = await getUserId()
  const id = `civic-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const storagePath = `${userId}/civic-reports/${id}.jpg`
  const blob = dataUrlToBlob(report.dataUrl)

  const supabase = getBrowserSupabase()
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, blob, {
    contentType: blob.type || 'image/jpeg',
    upsert: true,
  })
  if (uploadError) throw uploadError

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath)

  const res = await fetch('/api/civic-reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id,
      plannedHikeId: report.plannedHikeId,
      url: data.publicUrl,
      storagePath,
      note: report.note ?? '',
      lat: report.lat,
      lon: report.lon,
    }),
  })
  if (!res.ok) throw new Error('Invio segnalazione non riuscito')
}
