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
  // Cache-bust: the storage path is fixed (upsert), so the public URL never
  // changes across republishes — browsers/CDN would keep serving the stale
  // PDF without a fresh query string forcing revalidation.
  return `${data.publicUrl}?v=${Date.now()}`
}

/**
 * Trasforma un URL pubblico dello Storage in modo che il browser lo scarichi invece di navigarci
 * sopra. L'attributo HTML `download` da solo non basta: i browser recenti (Chrome in primis) lo
 * ignorano sulle risorse cross-origin per motivi di sicurezza, e questi URL sono su
 * `*.supabase.co`, un'origine diversa da quella dell'app — il pulsante "Scarica PDF" si limitava
 * quindi ad aprire il file in una nuova scheda invece di salvarlo. Il parametro `download` di
 * Supabase Storage imposta `Content-Disposition: attachment` lato server, che i browser
 * rispettano sempre perché arriva con la risposta, non dal markup del link.
 */
export function withForcedDownload(url: string, filename?: string): string {
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}download${filename ? `=${encodeURIComponent(filename)}` : ''}`
}
