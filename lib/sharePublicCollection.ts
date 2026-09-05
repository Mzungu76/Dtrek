// Lettura pubblica (non autenticata) di una Raccolta, dietro token opaco — stesso principio di
// lib/sharePublicDiary.ts, di cui questo file è l'estensione naturale (docs/raccolte-pubblicazione-
// piano.md, Fase 3b). Il contenuto di ogni Diario della raccolta viene da `fetchDiaryContent`,
// invariata: l'esclusione dei Reportage e la selezione delle foto di ciascun Diario si applicano
// da sole, "il più restrittivo vince" senza essere riscritto qui.
import { supabase } from './supabase'
import { normalizeDiaryConfig } from './diaryConfig'
import { fetchDiaryContent, type DiaryContent, type PublicDiaryEntry } from './sharePublicDiary'
import { combineDateRangeLabels } from './raccolte/combineDateRangeLabels'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface PublicCollectionVolume extends DiaryContent {
  diaryId:  string
  title:    string
  subtitle: string
}

export interface PublicCollection {
  ownerName:          string
  title:              string
  subtitle:           string
  preface:            string
  coverUrl:           string | null
  volumes:            PublicCollectionVolume[]
  totalKm:            number
  totalElevationGain: number
  totalEntries:       number
  dateRangeLabel?:    string
}

export async function fetchPublicCollection(token: string): Promise<PublicCollection | null> {
  if (!UUID_RE.test(token)) return null

  const { data: collection } = await supabase
    .from('collections')
    .select('id, user_id, title, subtitle, preface, cover_url')
    .eq('share_token', token)
    .maybeSingle()
  if (!collection) return null

  const userId = collection.user_id as string

  const { data: links } = await supabase
    .from('collection_diaries')
    .select('diary_id, position')
    .eq('collection_id', collection.id as string)
    .order('position', { ascending: true })
  const diaryIds = (links ?? []).map(l => l.diary_id as string)

  const volumes: PublicCollectionVolume[] = []
  if (diaryIds.length > 0) {
    const { data: diaries } = await supabase
      .from('diaries')
      .select('id, title, subtitle, author, cover_url, footer_text, config')
      .in('id', diaryIds)
    const diaryById = new Map((diaries ?? []).map((d: Record<string, unknown>) => [d.id as string, d]))

    // Nell'ordine della raccolta (`position`), non nell'ordine in cui `diaries` li restituisce —
    // un Diario eliminato nel frattempo (ON DELETE CASCADE sulla giunzione) semplicemente non è
    // più in `links`, non lascia un buco da saltare a mano.
    for (const diaryId of diaryIds) {
      const d = diaryById.get(diaryId)
      if (!d) continue
      const config = normalizeDiaryConfig({
        ...(d.config as object),
        title: d.title, subtitle: d.subtitle, author: d.author,
        coverUrl: d.cover_url, footerText: d.footer_text,
      })
      const content = await fetchDiaryContent(
        userId, diaryId, new Set(config.excludedActivityIds), config.photoIdsByActivity,
      )
      volumes.push({ diaryId, title: config.title, subtitle: config.subtitle, ...content })
    }
  }

  const { data: settingsForName } = await supabase
    .from('user_settings')
    .select('display_name')
    .eq('user_id', userId)
    .maybeSingle()

  const allEntries: PublicDiaryEntry[] = volumes.flatMap(v => v.entries)

  return {
    ownerName:          (settingsForName?.display_name as string) || 'Escursionista',
    title:              collection.title as string,
    subtitle:           collection.subtitle as string,
    preface:            collection.preface as string,
    coverUrl:           (collection.cover_url as string) ?? null,
    volumes,
    totalKm:            volumes.reduce((s, v) => s + v.totalKm, 0),
    totalElevationGain: volumes.reduce((s, v) => s + v.totalElevationGain, 0),
    totalEntries:       allEntries.length,
    dateRangeLabel:     combineDateRangeLabels(volumes.map(v => v.dateRangeLabel)),
  }
}
