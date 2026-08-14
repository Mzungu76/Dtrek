import { uploadFieldNotePhoto } from '@/lib/fieldNotePhotos'
import type { HikeNote } from '@/lib/blobStore'

/**
 * Best-effort retry for field notes whose photo upload failed at capture time (offline or a flaky
 * connection on the trail — see FieldNoteSheet.tsx's fallback) and are still holding the photo as a
 * local data: URL instead of a Supabase Storage one. Never throws and never loses anything: a note
 * that still can't upload just stays pending for the next retry trigger (e.g. the next 'online'
 * event). Returns only the notes that actually changed, so callers can merge them into their own
 * list without diffing the whole thing themselves.
 */
export async function retryFieldNotePhotos(hikeId: string, notes: HikeNote[]): Promise<HikeNote[]> {
  const pending = notes.filter((n) => n.photoPending && n.photoUrl?.startsWith('data:'))
  if (pending.length === 0) return []

  const updated: HikeNote[] = []
  for (const note of pending) {
    try {
      const photo = await uploadFieldNotePhoto(hikeId, note.id, note.photoUrl!)
      updated.push({ ...note, photoUrl: photo.url, photoStoragePath: photo.storagePath, photoPending: false })
    } catch {
      // Still offline, or still failing for some other reason — leave it pending.
    }
  }
  return updated
}
