// Normalizzazione dell'elenco ordinato di Diari di una Raccolta — PUT /api/collections/[id]/diari,
// docs/raccolte-pubblicazione-piano.md Fase 3c. La sola parte non banale che non richiede un
// database (la verifica che ogni id appartenga davvero all'utente resta nella route): niente id
// vuoti, niente doppioni (il primo vince — l'utente non può mettere lo stesso volume in due punti
// della collana), fino a un tetto oltre il quale la pagina pubblica smette di avere senso come
// "collana", non un limite tecnico.
export const MAX_VOLUMES_PER_COLLECTION = 20

export function normalizeDiaryOrder(diaryIds: unknown[]): string[] {
  const strings = diaryIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
  return Array.from(new Set(strings)).slice(0, MAX_VOLUMES_PER_COLLECTION)
}
