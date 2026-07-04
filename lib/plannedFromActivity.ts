import type { StoredActivity } from './blobStore'
import type { PlannedHike } from './plannedStore'

/**
 * Clona il tracciato e le statistiche di un'attività già conclusa in una
 * nuova Guida "in attesa" — l'ingresso "da diario esistente" del tab Guida,
 * per rifare un percorso già fatto. Stesso schema dati di un import GPX,
 * sorgente diversa (un'attività salvata invece di un file).
 */
export function plannedFromActivity(activity: StoredActivity, pendingExpiresAt?: string): PlannedHike {
  const id = 'guida_' + Date.now().toString(36) + '_' + Math.floor(activity.distanceMeters)
  return {
    id,
    title: activity.title ?? activity.notes ?? 'Percorso da rifare',
    createdAt: new Date().toISOString(),
    distanceMeters: activity.distanceMeters,
    elevationGain: activity.elevationGain,
    elevationLoss: activity.elevationLoss,
    altitudeMax: activity.altitudeMax,
    altitudeMin: activity.altitudeMin,
    estimatedTimeSeconds: activity.totalTimeSeconds,
    trackPoints: activity.trackPoints,
    pendingExpiresAt,
  }
}
