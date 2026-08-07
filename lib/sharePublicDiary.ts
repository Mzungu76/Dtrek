// Lettura pubblica (non autenticata) del Diario, dietro token opaco — stesso principio di
// lib/sharePublic.ts per le singole attività: usa il client service-role, che scavalca la RLS,
// ma l'accesso è comunque delimitato dal solo `diary_token` indovinabile-mai (UUID). Restituisce
// un sottoinsieme curato: niente contenuto narrativo dei resoconti, solo i dati che servono a una
// pagina di presentazione (titolo, date, distanze) — il racconto completo resta nel PDF.

import { supabase } from './supabase'
import { normalizeDiaryConfig, type DiaryConfig } from './diaryConfig'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface PublicDiaryEntry {
  id:              string
  title:           string
  startTime:       string
  distanceMeters:  number
  elevationGain:   number
}

export interface PublicDiary {
  ownerName:          string
  pdfUrl:             string
  config:             DiaryConfig
  entries:            PublicDiaryEntry[]
  totalKm:            number
  totalElevationGain: number
  dateRangeLabel?:    string
}

export async function fetchPublicDiary(token: string): Promise<PublicDiary | null> {
  if (!UUID_RE.test(token)) return null

  const { data: settings, error } = await supabase
    .from('user_settings')
    .select('user_id, display_name, diary_pdf_url, diary_config')
    .eq('diary_token', token)
    .not('diary_pdf_url', 'is', null)
    .maybeSingle()

  if (error || !settings?.diary_pdf_url) return null

  const config = normalizeDiaryConfig(settings.diary_config)
  const excluded = new Set(config.excludedActivityIds)

  const { data: reports } = await supabase
    .from('hike_reports')
    .select('id, activity_id, title, created_at')
    .eq('user_id', settings.user_id as string)

  const activityIds = (reports ?? []).map(r => r.activity_id as string).filter(Boolean)
  const { data: activities } = activityIds.length
    ? await supabase.from('activities').select('id, start_time, distance_meters, elevation_gain').in('id', activityIds)
    : { data: [] }

  const actMap = new Map((activities ?? []).map((a: Record<string, unknown>) => [a.id as string, a]))

  const entries: PublicDiaryEntry[] = (reports ?? [])
    .filter(r => !excluded.has(r.activity_id as string))
    .map(r => {
      const act = actMap.get(r.activity_id as string)
      return {
        id:             r.id as string,
        title:          (r.title as string) || 'Escursione',
        startTime:      (act?.start_time as string) ?? (r.created_at as string),
        distanceMeters: (act?.distance_meters as number) ?? 0,
        elevationGain:  (act?.elevation_gain as number) ?? 0,
      }
    })
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())

  const totalKm = entries.reduce((s, e) => s + e.distanceMeters, 0) / 1000
  const totalElevationGain = entries.reduce((s, e) => s + e.elevationGain, 0)

  let dateRangeLabel: string | undefined
  if (entries.length > 0) {
    const firstYear = new Date(entries[0].startTime).getFullYear()
    const lastYear  = new Date(entries[entries.length - 1].startTime).getFullYear()
    dateRangeLabel = firstYear === lastYear ? String(firstYear) : `${firstYear}–${lastYear}`
  }

  return {
    ownerName: (settings.display_name as string) || 'Escursionista',
    pdfUrl: settings.diary_pdf_url as string,
    config,
    entries,
    totalKm,
    totalElevationGain,
    dateRangeLabel,
  }
}
