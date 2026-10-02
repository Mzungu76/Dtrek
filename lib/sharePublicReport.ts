// Lettura pubblica (non autenticata) di UN Reportage, dietro token opaco — Fase 2 del piano di
// pubblicazione (docs/raccolte-pubblicazione-piano.md): stesso stile editoriale del Diario/della
// Raccolta invece del solo PDF incorporato che il link pubblico di un Reportage mostrava finora
// (app/leggi/p/[token]/page.tsx). Riusa lo stesso core (buildContentFromReports) di
// lib/sharePublicDiary.ts — un Reportage pubblicato da solo è lo stesso identico contenuto di UNA
// voce dentro un Diario pubblicato, solo senza il Diario intorno.
import { supabase } from './supabase'
import { loadCamminoGroups } from './cammini/diaryEntriesServer'
import { withCamminoReports } from './sharePublicDiary'
import { buildContentFromReports, type PublicDiaryEntry, type PublicPrivacyPrefs, type RawHikeReport } from './sharePublicDiary'
import { DEFAULT_DIARY_CONFIG } from './diaryConfig'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface PublicReport {
  ownerName:      string
  /** `null` finché l'utente non genera e allega un PDF — la pagina funziona lo stesso, il PDF è
   *  un allegato in più (stessa scelta già fatta per Diario e Raccolta). */
  pdfUrl:         string | null
  entry:          PublicDiaryEntry
  hideExactDates: boolean
}

export async function fetchPublicReport(token: string): Promise<PublicReport | null> {
  if (!UUID_RE.test(token)) return null

  const { data: report } = await supabase
    .from('hike_reports')
    .select('id, activity_id, title, content, created_at, user_id, share_pdf_url')
    .eq('share_token', token)
    .maybeSingle()
  if (!report) return fetchPublicCamminoReport(token)

  const userId = report.user_id as string

  const { data: ownerSettings } = await supabase
    .from('user_settings')
    .select('display_name, starting_lat, starting_lon, publish_hide_home_starts, publish_hide_exact_dates')
    .eq('user_id', userId)
    .maybeSingle()

  const privacy: PublicPrivacyPrefs = {
    home: (ownerSettings?.starting_lat != null && ownerSettings?.starting_lon != null)
      ? { lat: ownerSettings.starting_lat as number, lon: ownerSettings.starting_lon as number }
      : null,
    hideHomeStarts: (ownerSettings?.publish_hide_home_starts as boolean | null) ?? true,
    hideExactDates: (ownerSettings?.publish_hide_exact_dates as boolean | null) ?? false,
  }

  const rawReport: RawHikeReport = {
    id: report.id as string,
    activity_id: report.activity_id as string,
    title: report.title as string,
    content: report.content as string,
    created_at: report.created_at as string,
  }
  // Nessuna esclusione né selezione foto: un Reportage pubblicato da solo non ha un Diario/una
  // Raccolta a monte che ne curi la scelta — mostra tutto quello che ha, con gli extra di default
  // (mappa/grafici) perché non ha nemmeno un `DiaryConfig` proprio da cui leggere un'eccezione.
  const content = await buildContentFromReports([rawReport], new Set(), {}, privacy, DEFAULT_DIARY_CONFIG)
  const entry = content.entries[0]
  if (!entry) return null

  return {
    ownerName: (ownerSettings?.display_name as string) || 'Escursionista',
    pdfUrl: (report.share_pdf_url as string) ?? null,
    entry,
    hideExactDates: content.hideExactDates,
  }
}

/** Reportage condiviso di un cammino: il token sta nel suo piano (planned_hikes.cammino_plan.report.shareToken). */
async function fetchPublicCamminoReport(token: string): Promise<PublicReport | null> {
  const { data: hike } = await supabase
    .from('planned_hikes').select('id, user_id')
    .eq('cammino_plan->report->>shareToken', token)
    .maybeSingle()
  if (!hike) return null
  const userId = hike.user_id as string
  const groups = await loadCamminoGroups(userId, [hike.id as string])
  const reports = withCamminoReports([], groups)
  if (reports.length === 0) return null

  const { data: ownerSettings } = await supabase
    .from('user_settings')
    .select('display_name, starting_lat, starting_lon, publish_hide_home_starts, publish_hide_exact_dates')
    .eq('user_id', userId)
    .maybeSingle()
  const privacy: PublicPrivacyPrefs = {
    home: (ownerSettings?.starting_lat != null && ownerSettings?.starting_lon != null)
      ? { lat: ownerSettings.starting_lat as number, lon: ownerSettings.starting_lon as number }
      : null,
    hideHomeStarts: (ownerSettings?.publish_hide_home_starts as boolean | null) ?? true,
    hideExactDates: (ownerSettings?.publish_hide_exact_dates as boolean | null) ?? false,
  }
  const content = await buildContentFromReports(reports, new Set(), {}, privacy, DEFAULT_DIARY_CONFIG, groups)
  const entry = content.entries[0]
  if (!entry) return null
  return {
    ownerName: (ownerSettings?.display_name as string) || 'Escursionista',
    pdfUrl: null,
    entry,
    hideExactDates: content.hideExactDates,
  }
}
