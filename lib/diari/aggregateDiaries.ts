// Aggregazione pura per GET /api/diaries — separata dalla route (che resta un thin wrapper sulle
// query Supabase) per essere testabile senza un database: docs/diari-restyling-piano.md, Fase 0.
//
// Una Meta non ha una colonna diary_id "propria" del suo Diario finché non viene camminata (vedi
// app/api/planned/route.ts) — quindi il Diario di ogni Reportage si ricava passando dalla sua Meta
// collegata (planned.diary_id), non da una colonna diretta su activities (che non esiste). Stessa
// indirezione già usata prima di questo file per il solo reportageCount — qui estesa a distanza,
// dislivello e data dell'ultima uscita, che la nuova riga di registro mostra.

export interface DiaryRow {
  id: string
  title: string
  subtitle: string
  author: string
  cover_url: string | null
  footer_text: string
  is_default: boolean
  labels: string[] | null
  archived_at: string | null
  /** Facoltativo: non serve ad aggregateDiaries stessa, solo a chi (lib/raccolte/buildRaccolteTree.ts)
   *  ha bisogno di sapere se il Diario è già pubblicato, riusando la stessa riga già letta. */
  share_token?: string | null
}

export interface PlannedDiaryLinkRow {
  id: string
  diary_id: string | null
}

export interface ActivityMetricsRow {
  linked_planned_id: string | null
  distance_meters: number | null
  elevation_gain: number | null
  start_time: string
  /** Assente/null = 'sentiero' (DEFAULT di colonna). */
  meta_type?: string | null
}

/** Riga di `collection_diaries` — lo scaffale (ora una Raccolta, vedi
 *  supabase/migrations/merge_shelves_into_collections.sql) a cui appartiene un Diario. Genitore
 *  unico: un Diario sta su un solo scaffale, imposto da un UNIQUE(diary_id) sulla tabella — al
 *  più una riga per Diario in questo array. Mancante solo per una riga letta prima del backfill
 *  della migrazione, mai un caso a regime. */
export interface DiaryCollectionLinkRow {
  diary_id: string
  collection_id: string
  position: number
}

export interface DiarySummary {
  id: string
  title: string
  subtitle: string
  author: string
  coverUrl: string | null
  footerText: string
  isDefault: boolean
  /** Numero di Reportage (activities collegate, tramite le Mete di questo Diario) che
   *  appartengono a questo Diario — ristrutturazione Diario/Mete: un Diario contiene solo
   *  Reportage, non più Mete "in programma" ancora senza uscita. */
  reportageCount: number
  /** True se questo Diario ha almeno un Reportage — la regola dei "requisiti minimi": solo un
   *  Diario così può essere pubblicato/condiviso. */
  pubblicabile: boolean
  /** Somma di activities.distance_meters/elevation_gain sui Reportage con metriche di cammino (i
   *  sentieri) del Diario — 0 se nessuno. */
  distanceMeters: number
  elevationGain: number
  /** ISO 8601 dell'uscita più recente, null se il Diario non ne ha ancora nessuna — chiave del
   *  raggruppamento per stagione (lib/diari/raggruppaDiari.ts). */
  lastActivityAt: string | null
  /** Etichette libere scelte dall'utente (Natura, Urbano, una zona...) — mai un enum: un Diario
   *  può averne più di una. */
  labels: string[]
  archivedAt: string | null
  /** Id della raccolta (`collections.id`) che fa da scaffale a questo Diario — ricavato da
   *  `collection_diaries`, non più da una colonna propria di `diaries` (vedi
   *  supabase/migrations/merge_shelves_into_collections.sql). Null solo per una riga letta prima
   *  del backfill, mai un caso a regime. */
  shelfId: string | null
  shelfPosition: number
}

export function aggregateDiaries(
  diaries: DiaryRow[],
  planned: PlannedDiaryLinkRow[],
  activities: ActivityMetricsRow[],
  collectionLinks: DiaryCollectionLinkRow[] = [],
): DiarySummary[] {
  const diaryIdByPlannedId = new Map(planned.map(p => [p.id, p.diary_id]))
  const collectionLinkByDiaryId = new Map(collectionLinks.map(l => [l.diary_id, l]))

  const reportageCountByDiaryId = new Map<string, number>()
  const distanceByDiaryId = new Map<string, number>()
  const elevationByDiaryId = new Map<string, number>()
  const lastActivityByDiaryId = new Map<string, string>()

  for (const a of activities) {
    const diaryId = a.linked_planned_id ? diaryIdByPlannedId.get(a.linked_planned_id) : null
    if (!diaryId) continue
    reportageCountByDiaryId.set(diaryId, (reportageCountByDiaryId.get(diaryId) ?? 0) + 1)
    // Solo i Reportage con metriche di cammino: distanza e dislivello di una visita a un Borgo/
    // Città o a un Sito non sono chilometri da sommare a quelli dei sentieri.
    if (!a.meta_type || a.meta_type === 'sentiero') {
      distanceByDiaryId.set(diaryId, (distanceByDiaryId.get(diaryId) ?? 0) + (a.distance_meters ?? 0))
      elevationByDiaryId.set(diaryId, (elevationByDiaryId.get(diaryId) ?? 0) + (a.elevation_gain ?? 0))
    }
    const prev = lastActivityByDiaryId.get(diaryId)
    if (!prev || a.start_time > prev) lastActivityByDiaryId.set(diaryId, a.start_time)
  }

  return diaries.map(d => {
    const reportageCount = reportageCountByDiaryId.get(d.id) ?? 0
    const collectionLink = collectionLinkByDiaryId.get(d.id)
    return {
      id:             d.id,
      title:          d.title,
      subtitle:       d.subtitle,
      author:         d.author,
      coverUrl:       d.cover_url,
      footerText:     d.footer_text,
      isDefault:      d.is_default,
      reportageCount,
      pubblicabile:   reportageCount > 0,
      distanceMeters: distanceByDiaryId.get(d.id) ?? 0,
      elevationGain:  elevationByDiaryId.get(d.id) ?? 0,
      lastActivityAt: lastActivityByDiaryId.get(d.id) ?? null,
      labels:         d.labels ?? [],
      archivedAt:     d.archived_at,
      shelfId:        collectionLink?.collection_id ?? null,
      shelfPosition:  collectionLink?.position ?? 0,
    }
  })
}
