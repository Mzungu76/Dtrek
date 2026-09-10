'use client'

import { getBrowserSupabase } from './supabaseBrowser'

const BUCKET = 'dtrek-reports'

export async function uploadReportPdf(userId: string, activityId: string, blob: Blob): Promise<string> {
  const supabase = getBrowserSupabase()
  const path = `${userId}/${activityId}-report.pdf`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'application/pdf',
    upsert: true,
  })
  if (error) throw error
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}

// diaryId presente = uno dei Diari multipli dell'utente (docs/diario-fulcro-piano.md Fase 4):
// percorso separato per non far collidere il PDF di un Diario con quello di un altro sullo stesso
// bucket. Assente = il vecchio Diario singolo per utente (app/diario/page.tsx), invariato.
export async function uploadDiaryPdf(userId: string, blob: Blob, diaryId?: string): Promise<string> {
  const supabase = getBrowserSupabase()
  const path = diaryId ? `${userId}/diaries/${diaryId}/diary.pdf` : `${userId}/diary.pdf`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'application/pdf',
    upsert: true,
  })
  if (error) throw error
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  // Cache-bust: the storage path is fixed (upsert), so the public URL never
  // changes across republishes — browsers/CDN would keep serving the stale
  // PDF without a fresh query string forcing revalidation.
  return `${data.publicUrl}?v=${Date.now()}`
}
