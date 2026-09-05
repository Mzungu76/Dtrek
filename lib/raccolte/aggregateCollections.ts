// Aggregazione pura per GET /api/collections — stesso principio di lib/diari/aggregateDiaries.ts:
// separata dalla route per essere testabile senza un database. docs/raccolte-pubblicazione-piano.md,
// Fase 3c.
import type { DiarySummary } from '../diari/aggregateDiaries'

export interface CollectionRow {
  id: string
  title: string
  subtitle: string
  cover_url: string | null
  share_token: string | null
}

export interface CollectionDiaryLinkRow {
  collection_id: string
  diary_id: string
  position: number
}

export interface CollectionSummary {
  id: string
  title: string
  subtitle: string
  coverUrl: string | null
  /** `share_token IS NOT NULL` — vero dal primo "pubblica" in poi e per sempre dopo: come su
   *  `diaries`, revocare un link RUOTA il token a uno nuovo invece di azzerarlo (vedi
   *  DELETE /api/collections/[id]/token), quindi questo campo dice "pubblicata almeno una volta",
   *  non "il link che qualcuno ha in mano funziona ancora". */
  isPublished: boolean
  volumeCount: number
  reportageCount: number
  distanceMeters: number
  elevationGain: number
  /** Id dei Diari contenuti (solo quelli ancora esistenti) — usati da /diari per mostrare su ogni
   *  riga di registro a quale/i raccolta appartiene, senza un'altra chiamata dedicata. */
  diaryIds: string[]
}

export function aggregateCollections(
  collections: CollectionRow[],
  links: CollectionDiaryLinkRow[],
  diarySummaries: DiarySummary[],
): CollectionSummary[] {
  const diaryById = new Map(diarySummaries.map(d => [d.id, d]))
  const linksByCollection = new Map<string, CollectionDiaryLinkRow[]>()
  for (const l of links) {
    const list = linksByCollection.get(l.collection_id) ?? []
    list.push(l)
    linksByCollection.set(l.collection_id, list)
  }

  return collections.map(c => {
    const myLinks = linksByCollection.get(c.id) ?? []
    let volumeCount = 0, reportageCount = 0, distanceMeters = 0, elevationGain = 0
    const diaryIds: string[] = []
    for (const l of myLinks) {
      const d = diaryById.get(l.diary_id)
      if (!d) continue // Diario eliminato nel frattempo (ON DELETE CASCADE) — non conta più, non è un errore
      volumeCount++
      reportageCount += d.reportageCount
      distanceMeters += d.distanceMeters
      elevationGain += d.elevationGain
      diaryIds.push(d.id)
    }
    return {
      id: c.id, title: c.title, subtitle: c.subtitle, coverUrl: c.cover_url,
      isPublished: c.share_token !== null,
      volumeCount, reportageCount, distanceMeters, elevationGain, diaryIds,
    }
  })
}
