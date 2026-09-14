// Anteprima autenticata di tutte le Raccolte marcate "pubblica" (marked_for_publish) di un utente
// — per la pagina di pre-pubblicazione (/raccolte/pubblica). Stessa logica di
// lib/sharePublicCollection.ts (fetchPublicCollection), riusata invece che duplicata: gli stessi
// Reportage esclusi e le stesse sezioni "mostra sul sito" che finirebbero online una volta
// pubblicata, qui risolti per id+utente autenticato invece che per share_token pubblico — una
// Raccolta marcata ma non ancora pubblicata non ha un token da cui risolverla.
import { supabase } from '../supabase'
import { normalizeDiaryConfig, type DiaryPublicSections } from '../diaryConfig'
import { normalizeRaccoltaConfig } from '../raccolteConfig'
import { fetchDiaryContent, type PublicPrivacyPrefs } from '../sharePublicDiary'

export interface PreviewEntry {
  id: string
  title: string
  startTime: string
  distanceMeters: number
}

export interface PreviewVolume {
  diaryId: string
  title: string
  /** Le 5 sezioni "mostra sul sito" effettive per questo Diario — quelle della Raccolta se
   *  impostate (vincono), altrimenti quelle proprie del Diario. Stesso principio di
   *  fetchPublicCollection: sola lettura qui, si cambiano dal menù del Diario in /raccolte. */
  show: DiaryPublicSections
  entries: PreviewEntry[]
  totalKm: number
}

export interface MarkedCollectionPreview {
  id: string
  title: string
  isPublished: boolean
  shareToken: string | null
  volumes: PreviewVolume[]
  totalKm: number
  totalEntries: number
}

export async function fetchMarkedCollectionsPreview(userId: string): Promise<MarkedCollectionPreview[]> {
  const { data: collections, error: collectionsErr } = await supabase
    .from('collections')
    .select('id, title, share_token, config, position')
    .eq('user_id', userId)
    .eq('marked_for_publish', true)
    .order('position', { ascending: true })
  if (collectionsErr) throw collectionsErr
  if (!collections || collections.length === 0) return []

  // Globali per utente, una sola volta per tutte le Raccolte marcate — stesse preferenze lette da
  // fetchPublicCollection per ciascuna raccolta pubblicata singolarmente.
  const { data: ownerSettings } = await supabase
    .from('user_settings')
    .select('starting_lat, starting_lon, publish_hide_home_starts, publish_hide_exact_dates')
    .eq('user_id', userId)
    .maybeSingle()
  const privacy: PublicPrivacyPrefs = {
    home: (ownerSettings?.starting_lat != null && ownerSettings?.starting_lon != null)
      ? { lat: ownerSettings.starting_lat as number, lon: ownerSettings.starting_lon as number }
      : null,
    hideHomeStarts: (ownerSettings?.publish_hide_home_starts as boolean | null) ?? true,
    hideExactDates: (ownerSettings?.publish_hide_exact_dates as boolean | null) ?? false,
  }

  const result: MarkedCollectionPreview[] = []
  for (const c of collections) {
    const raccoltaConfig = normalizeRaccoltaConfig(c.config)

    const { data: links } = await supabase
      .from('collection_diaries')
      .select('diary_id, position')
      .eq('collection_id', c.id as string)
      .order('position', { ascending: true })
    const diaryIds = (links ?? []).map(l => l.diary_id as string)

    const volumes: PreviewVolume[] = []
    if (diaryIds.length > 0) {
      const { data: diaries } = await supabase
        .from('diaries')
        .select('id, title, subtitle, author, cover_url, footer_text, config')
        .eq('user_id', userId)
        .in('id', diaryIds)
      const diaryById = new Map((diaries ?? []).map((d: Record<string, unknown>) => [d.id as string, d]))

      for (const diaryId of diaryIds) {
        const d = diaryById.get(diaryId)
        if (!d) continue
        const config = normalizeDiaryConfig({
          ...(d.config as object),
          title: d.title, subtitle: d.subtitle, author: d.author,
          coverUrl: d.cover_url, footerText: d.footer_text,
        })
        const content = await fetchDiaryContent(
          userId, diaryId, new Set(config.excludedActivityIds), config.photoIdsByActivity, privacy, config,
        )
        volumes.push({
          diaryId,
          title: config.title,
          show: raccoltaConfig?.publicSections ?? config.publicSections,
          entries: content.entries.map(e => ({ id: e.id, title: e.title, startTime: e.startTime, distanceMeters: e.distanceMeters })),
          totalKm: content.totalKm,
        })
      }
    }

    result.push({
      id: c.id as string,
      title: c.title as string,
      isPublished: c.share_token !== null,
      shareToken: (c.share_token as string) ?? null,
      volumes,
      totalKm: volumes.reduce((s, v) => s + v.totalKm, 0),
      totalEntries: volumes.reduce((s, v) => s + v.entries.length, 0),
    })
  }
  return result
}
