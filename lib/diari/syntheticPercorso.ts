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

/**
 * Id del Diario di default ("Il mio Diario", `is_default` — esiste per ogni utente dal backfill).
 * Best-effort: offline, o con la sessione non ancora ristabilita, torna undefined e chi chiama
 * prosegue senza Diario invece di far fallire il salvataggio di un'escursione appena camminata.
 */
export async function getDefaultDiaryId(): Promise<string | undefined> {
  try {
    const diaries = await apiFetch<DiarySummary[]>('/api/diaries')
    return (diaries.find(d => d.isDefault) ?? diaries[0])?.id
  } catch {
    return undefined
  }
}
