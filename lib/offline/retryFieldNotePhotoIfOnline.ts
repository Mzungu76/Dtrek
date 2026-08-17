import { retryFieldNotePhotos } from './retryFieldNotePhotos'
import type { HikeNote } from '@/lib/blobStore'

/**
 * FieldNoteSheet.tsx non aspetta più il caricamento della foto prima di salvare (vedi il suo
 * commento) — se siamo già online in questo momento, tenta subito invece di aspettare il
 * prossimo evento 'online' (che, restando connessi per tutta la sessione, potrebbe non arrivare
 * mai). Stessa infrastruttura di retryFieldNotePhotos.ts, non duplicata: usata sia da
 * ActiveNavigationView.tsx sia da app/navigatore/traccia/page.tsx subito dopo aver ricevuto una
 * nota nuova, oltre che dal loro rispettivo listener 'online' per il caso genuinamente offline.
 */
export function retryFieldNotePhotoIfOnline(
  hikeId: string,
  note: HikeNote,
  allNotes: HikeNote[],
  onMerged: (changed: HikeNote[]) => void,
): void {
  if (!note.photoPending || !navigator.onLine) return
  retryFieldNotePhotos(hikeId, allNotes).then((changed) => {
    if (changed.length > 0) onMerged(changed)
  }).catch(() => {})
}
