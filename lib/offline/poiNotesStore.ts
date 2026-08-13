/**
 * Persists the per-POI narrative cache (lib/poiNotes.ts, /api/poi-notes) for one hike, keyed by
 * hikeId, in IndexedDB alongside everything else in lib/localStore.ts — same pattern as
 * lib/navigation/trailGraphStore.ts. Closes the "online-first" gap the read-side wiring in
 * ActiveNavigationView.tsx started with: once bundled here at download time, the richer narration
 * survives losing signal on the trail, matching the architecture decided for Guida IA ("Testo →
 * IndexedDB, accanto al grafo sentieri").
 */
import { lsGet, lsSet, lsDel } from '@/lib/localStore'

const POI_NOTES_KEY = (hikeId: string) => `poi-notes:${hikeId}`

interface StoredPoiNotes {
  hikeId: string
  fetchedAt: number
  /** Array, non Map — stessa convenzione di storage JSON-piatto del resto del codebase. */
  entries: [number, string][]
}

export async function savePoiNotes(hikeId: string, notesById: Map<number, string>): Promise<void> {
  await lsSet(POI_NOTES_KEY(hikeId), { hikeId, fetchedAt: Date.now(), entries: Array.from(notesById.entries()) } satisfies StoredPoiNotes)
}

export async function loadOfflinePoiNotes(hikeId: string): Promise<Map<number, string> | null> {
  const stored = await lsGet<StoredPoiNotes>(POI_NOTES_KEY(hikeId))
  return stored ? new Map(stored.entries) : null
}

export async function deletePoiNotes(hikeId: string): Promise<void> {
  await lsDel(POI_NOTES_KEY(hikeId))
}

/** Fetch+save per il download del pacchetto offline (lib/offline/packageManager.ts) — stessa forma
 *  di fetchAndSaveTrailGraph: best-effort, un fallimento non deve mai far fallire un pacchetto tile
 *  altrimenti completo. Ritorna il conteggio di note effettivamente trovate (può essere 0 se nessun
 *  POI del percorso ha ancora una nota cachata — non un errore, solo "non ancora generata da
 *  nessuno").*/
export async function fetchAndSavePoiNotes(hikeId: string, poiIds: number[]): Promise<number> {
  const ids = Array.from(new Set(poiIds))
  if (ids.length === 0) { await savePoiNotes(hikeId, new Map()); return 0 }
  const res = await fetch(`/api/poi-notes?ids=${ids.join(',')}`)
  if (!res.ok) throw new Error(`poi-notes fetch failed: ${res.status}`)
  const data = await res.json() as Record<string, { text: string }>
  const notesById = new Map(Object.entries(data).map(([id, v]) => [Number(id), v.text]))
  await savePoiNotes(hikeId, notesById)
  return notesById.size
}
