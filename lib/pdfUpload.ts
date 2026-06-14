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

export async function uploadDiaryPdf(userId: string, blob: Blob): Promise<string> {
  const supabase = getBrowserSupabase()
  const path = `${userId}/diary.pdf`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'application/pdf',
    upsert: true,
  })
  if (error) throw error
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}
