// Albero completo Raccolta → Diario → Reportage per la pagina /raccolte (centro di controllo) —
// stesse query di GET /api/collections, con l'aggiunta dei singoli Reportage (id/titolo/data/km)
// invece dei soli totali aggregati: qui servono le RIGHE, non le somme, per renderle una a una
// nell'albero. Pura e testabile come aggregateCollections.ts/aggregateDiaries.ts, di cui riusa i
// tipi Row via composizione invece di duplicarli.
import type { CollectionRow, CollectionDiaryLinkRow } from './aggregateCollections'
import type { DiaryRow, PlannedDiaryLinkRow } from '../diari/aggregateDiaries'

export interface ActivityTreeRow {
  id: string
  title: string
  start_time: string
  distance_meters: number | null
  linked_planned_id: string | null
}

/** Riga di `hike_reports` — solo per sapere quali Reportage hanno già un proprio share_token
 *  (icona pubblicato/bozza nell'albero). Un Reportage senza racconto scritto non ha nessuna riga
 *  qui, ed è quindi sempre "bozza": non pubblicabile finché non esiste un resoconto da mostrare. */
export interface HikeReportTokenRow {
  activity_id: string
  share_token: string | null
}

export interface ReportageTreeNode {
  id: string
  title: string
  startTime: string
  distanceMeters: number
  /** planned_hikes.id della Meta collegata — serve a chi vuole spostare questo Reportage in un
   *  altro Diario (PATCH /api/planned {id, diaryId}, lo stesso meccanismo di
   *  app/resoconto/ResocontoHub.tsx): l'appartenenza passa da lì, non da una colonna propria. */
  linkedPlannedId: string | null
  isPublished: boolean
  /** Ha una riga in `hike_reports` (un racconto scritto, anche vuoto) — senza, non c'è nulla da
   *  pubblicare: il pulsante di pubblicazione resta disattivato finché non lo si scrive. */
  hasReport: boolean
}

export interface DiarioTreeNode {
  id: string
  title: string
  coverUrl: string | null
  isPublished: boolean
  reportage: ReportageTreeNode[]
}

export interface RaccoltaTreeNode {
  id: string
  title: string
  coverUrl: string | null
  isPublished: boolean
  /** "Pronta per la pubblicazione", ma non ancora online — vedi CollectionRow.marked_for_publish. */
  markedForPublish: boolean
  position: number
  diari: DiarioTreeNode[]
}

export function buildRaccolteTree(
  collections: CollectionRow[],
  links: CollectionDiaryLinkRow[],
  diaries: DiaryRow[],
  planned: PlannedDiaryLinkRow[],
  activities: ActivityTreeRow[],
  hikeReports: HikeReportTokenRow[] = [],
): RaccoltaTreeNode[] {
  const diaryIdByPlannedId = new Map(planned.map(p => [p.id, p.diary_id]))
  const reportTokenByActivityId = new Map(hikeReports.map(r => [r.activity_id, r.share_token]))
  const reportageByDiaryId = new Map<string, ReportageTreeNode[]>()
  for (const a of activities) {
    const diaryId = a.linked_planned_id ? diaryIdByPlannedId.get(a.linked_planned_id) : null
    if (!diaryId) continue
    const list = reportageByDiaryId.get(diaryId) ?? []
    list.push({
      id: a.id, title: a.title, startTime: a.start_time, distanceMeters: a.distance_meters ?? 0,
      linkedPlannedId: a.linked_planned_id,
      isPublished: (reportTokenByActivityId.get(a.id) ?? null) !== null,
      hasReport: reportTokenByActivityId.has(a.id),
    })
    reportageByDiaryId.set(diaryId, list)
  }
  // Più recente prima — stesso ordine di GET /api/diaries/[id] (reportage di un Diario), non ha
  // senso mostrarli qui in un ordine diverso da quello che si vede aprendo il Diario stesso.
  for (const list of Array.from(reportageByDiaryId.values())) list.sort((a, b) => b.startTime.localeCompare(a.startTime))

  const diaryById = new Map(diaries.map(d => [d.id, d]))
  const linksByCollection = new Map<string, CollectionDiaryLinkRow[]>()
  for (const l of links) {
    const list = linksByCollection.get(l.collection_id) ?? []
    list.push(l)
    linksByCollection.set(l.collection_id, list)
  }
  for (const list of Array.from(linksByCollection.values())) list.sort((a, b) => a.position - b.position)

  return collections
    .slice()
    .sort((a, b) => a.position - b.position)
    .map(c => {
      const myLinks = linksByCollection.get(c.id) ?? []
      const diari: DiarioTreeNode[] = []
      for (const l of myLinks) {
        const d = diaryById.get(l.diary_id)
        if (!d) continue // Diario eliminato nel frattempo (ON DELETE CASCADE) — semplicemente non compare
        diari.push({
          id: d.id, title: d.title, coverUrl: d.cover_url,
          isPublished: (d.share_token ?? null) !== null,
          reportage: reportageByDiaryId.get(d.id) ?? [],
        })
      }
      return {
        id: c.id, title: c.title, coverUrl: c.cover_url,
        isPublished: c.share_token !== null, markedForPublish: c.marked_for_publish, position: c.position,
        diari,
      }
    })
}
