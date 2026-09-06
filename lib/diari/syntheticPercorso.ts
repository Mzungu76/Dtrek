/**
 * Un Reportage ha SEMPRE un Percorso (una Meta) genitore, e appartiene a un Diario solo
 * indirettamente attraverso di esso: `activities.linked_planned_id → planned_hikes.diary_id`
 * (vedi il commento in app/api/diaries/[id]/route.ts). Un'escursione salvata senza
 * `linkedPlannedId` non compare quindi in NESSUN Diario e in NESSUN elenco di Mete: resta
 * raggiungibile solo da un link diretto a /resoconto/[id] — che è esattamente il buco in cui
 * finiva ogni traccia registrata dal Navigator (app/navigatore/traccia/page.tsx), l'unico flusso
 * di salvataggio che non passava da qui.
 *
 * Questo è lo stesso "Percorso sintetico" che components/upload/ActivityUploader.tsx crea nella
 * corsia "Già fatta" del composer, estratto qui perché i due flussi non divergano: una Meta
 * costruita dalla traccia appena camminata, già segnata come vissuta (firstCompletedAt).
 *
 * `sourceApp` NON viene mai valorizzato, nemmeno quando chi chiama è il Navigator: lo slot del
 * Navigator (lib/navigatorSlot.ts) conta le righe `sourceApp: 'navigator'`, e la Meta creata come
 * conseguenza di un salvataggio è una Meta di Dtrek a tutti gli effetti — marcarla farebbe
 * consumare due slot a un'unica registrazione.
 */

import { downsamplePolyline } from '@/lib/downsamplePolyline'
import { savePlanned, type PlannedHike } from '@/lib/plannedStore'
import { apiFetch } from '@/lib/apiFetch'
import type { TcxActivity } from '@/lib/tcxParser'
import type { DiarySummary } from '@/lib/diari/aggregateDiaries'

export interface SyntheticPercorsoOptions {
  title?: string
  /** Diario a cui agganciare la Meta. Assente = Meta senza Diario: compare comunque fra le Mete
   *  (app/percorsi/page.tsx, trasversale ai Diari) ma non dentro un Diario — meglio di un
   *  Reportage orfano, mai un Diario inventato. */
  diaryId?: string
}

/** Crea e salva la Meta sintetica per un'escursione appena conclusa. Restituisce la riga salvata,
 *  il cui `id` va passato come `linkedPlannedId` al salvataggio dell'attività. */
export async function createSyntheticPercorso(
  activity: TcxActivity,
  opts: SyntheticPercorsoOptions = {},
): Promise<PlannedHike> {
  const synthetic: PlannedHike = {
    id: 'synth_' + Date.now().toString(36),
    title: opts.title?.trim() || activity.notes || 'Percorso',
    createdAt: new Date().toISOString(),
    distanceMeters: activity.distanceMeters,
    elevationGain: activity.elevationGain,
    elevationLoss: activity.elevationLoss,
    altitudeMax: activity.altitudeMax,
    altitudeMin: activity.altitudeMin,
    estimatedTimeSeconds: activity.totalTimeSeconds,
    trackPoints: activity.trackPoints,
    routePolyline: activity.trackPoints?.length ? downsamplePolyline(activity.trackPoints) : undefined,
    diaryId: opts.diaryId,
    firstCompletedAt: activity.startTime || new Date().toISOString(),
  }
  await savePlanned(synthetic)
  return synthetic
}

/** Il minimo che serve a scegliere un Diario in un elenco — l'intero DiarySummary porta con sé
 *  metriche e copertine che nessun selettore usa. */
export interface DiaryChoice {
  id: string
  title: string
  isDefault: boolean
}

/**
 * I Diari fra cui si può scegliere una destinazione, quello di default per primo (lo stesso
 * ordine con cui li restituisce /api/diaries). Esclude gli archiviati: sono fuori dal giro, non
 * una destinazione per un'uscita appena camminata.
 *
 * Best-effort: offline, o con la sessione non ancora ristabilita, torna un elenco vuoto e chi
 * chiama prosegue senza Diario invece di far fallire il salvataggio di una traccia.
 */
export async function listSelectableDiaries(): Promise<DiaryChoice[]> {
  try {
    const diaries = await apiFetch<DiarySummary[]>('/api/diaries')
    return diaries
      .filter(d => !d.archivedAt)
      .map(d => ({ id: d.id, title: d.title, isDefault: d.isDefault }))
  } catch {
    return []
  }
}

/**
 * Id del Diario di default ("Il mio Diario", `is_default` — esiste per ogni utente dal backfill).
 * Il ripiego di ogni flusso che salva senza chiedere niente all'utente; dove invece la
 * destinazione è una scelta esplicita (il salvataggio di una traccia in Navigator) si passa
 * dall'elenco qui sopra. Best-effort allo stesso modo: undefined se non lo si è potuto leggere.
 */
export async function getDefaultDiaryId(): Promise<string | undefined> {
  const diaries = await listSelectableDiaries()
  return (diaries.find(d => d.isDefault) ?? diaries[0])?.id
}
