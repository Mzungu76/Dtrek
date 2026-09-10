import { metaHasHikingMetrics } from './metaTypes'
import type { PlannedHike } from './plannedStore'
import { saveActivityWithEnrichment } from './activitySave'

// "Activity" generica per una Meta senza traccia GPS (piano Blocco D §27, "Attività generica") —
// un Borgo/Città o un Sito si segna come visitato con un tocco, non con un caricamento GPX (per
// cui non ha senso: nessuna traccia da camminare, piano §48.6 "mai richiedere GPS"). Un sentiero
// NON passa mai da qui: la sua unica strada per diventare "completato" resta l'upload/registrazione
// di un'attività reale (lib/activitySave.ts), mai bypassata da questo shortcut.
export function canCompleteWithoutTrack(metaType: PlannedHike['metaType']): boolean {
  return !metaHasHikingMetrics(metaType)
}

// Crea davvero un'Attività (senza traccia: distanza/dislivello/durata a 0, trackPoints vuoto) —
// non solo un flag — perché un'Attività è anche l'ancora a cui il Reportage si collega
// (activities.linked_planned_id, piano Blocco E §30): senza questo passaggio, una visita
// registrata non avrebbe mai un posto dove generare/leggere un Reportage, esattamente come oggi
// non esiste un sentiero "completato" senza una riga activities. saveActivityWithEnrichment se ne
// occupa già: valorizza firstCompletedAt sulla Meta collegata (se non già presente) e non tenta
// mai calcoli DTM/Overpass/storico escursionistico per una traccia vuota (gps.length < 2, vedi
// lib/activitySave.ts) — nessuna duplicazione di logica qui.
// Idempotente sul lato "non ricompletare": se la Meta ha già una firstCompletedAt, non crea una
// seconda Attività — coerente con "mai più cancellato" del commento su firstCompletedAt in
// lib/plannedStore.ts (più visite alla stessa Meta restano comunque possibili more avanti tramite
// lo stesso flusso "Aggiungi un'uscita" già usato per i sentieri, non da qui).
export async function markMetaVisited(
  hike: Pick<PlannedHike, 'id' | 'title' | 'metaType' | 'siteType' | 'firstCompletedAt'>,
): Promise<void> {
  if (!canCompleteWithoutTrack(hike.metaType)) {
    throw new Error('markMetaVisited: un sentiero si completa solo tramite un\'attività reale, non con questo shortcut')
  }
  if (hike.firstCompletedAt) return

  const now = new Date().toISOString()
  await saveActivityWithEnrichment(
    {
      id: crypto.randomUUID(),
      sport: 'Visita',
      notes: '',
      device: '',
      startTime: now,
      endTime: now,
      totalTimeSeconds: 0,
      distanceMeters: 0,
      calories: 0,
      avgHeartRate: 0,
      maxHeartRate: 0,
      avgSpeedMs: 0,
      maxSpeedMs: 0,
      altitudeMin: 0,
      altitudeMax: 0,
      elevationGain: 0,
      elevationLoss: 0,
      trackPoints: [],
    },
    {
      title: hike.title,
      linkedPlannedId: hike.id,
      metaType: hike.metaType,
      siteType: hike.siteType,
    },
  )
}
