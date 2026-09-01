import { metaHasHikingMetrics } from './metaTypes'
import { updatePlannedMeta, type PlannedHike } from './plannedStore'

// "Activity" generica per una Meta senza traccia GPS (piano Blocco D §27, "Attività generica") —
// un Borgo/Città o un Sito si segna come visitato con un tocco, non con un caricamento GPX (per
// cui non ha senso: nessuna traccia da camminare, piano §48.6 "mai richiedere GPS"). Un sentiero
// NON passa mai da qui: la sua unica strada per diventare "completato" resta l'upload/registrazione
// di un'attività reale (lib/activitySave.ts), mai bypassata da questo shortcut.
export function canCompleteWithoutTrack(metaType: PlannedHike['metaType']): boolean {
  return !metaHasHikingMetrics(metaType)
}

// Riusa firstCompletedAt (lib/plannedStore.ts) — lo stesso campo che un sentiero valorizza al
// primo collegamento con un'attività reale: nessun nuovo concetto di "visitato", solo un secondo
// modo di valorizzare un campo già esistente. Idempotente: richiamarla non azzera una data già
// presente (coerente con "mai più cancellato" del commento su firstCompletedAt).
export async function markMetaVisited(hike: Pick<PlannedHike, 'id' | 'metaType' | 'firstCompletedAt'>): Promise<void> {
  if (!canCompleteWithoutTrack(hike.metaType)) {
    throw new Error('markMetaVisited: un sentiero si completa solo tramite un\'attività reale, non con questo shortcut')
  }
  if (hike.firstCompletedAt) return
  await updatePlannedMeta(hike.id, { firstCompletedAt: new Date().toISOString() })
}
