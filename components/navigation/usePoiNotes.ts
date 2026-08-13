'use client'
import { useEffect, useState } from 'react'
import { loadOfflinePoiNotes } from '@/lib/offline/poiNotesStore'

/**
 * Legge la cache condivisa per-POI (lib/poiNotes.ts, /api/poi-notes) — testo più ricco della sola
 * descrizione Wikipedia, riusato tra sentieri diversi che passano dallo stesso POI (decisione 2,
 * artifact "La Guida IA"). Prova prima la copia bundlata offline (lib/offline/poiNotesStore.ts,
 * scritta al momento dello scarico del pacchetto) — funziona quindi anche senza rete sul sentiero;
 * solo se quella manca (pacchetto mai scaricato, o scaricato prima che questa cache esistesse) fa
 * un fetch dal vivo. Un fallimento in entrambi i casi lascia semplicemente la mappa vuota: i
 * chiamanti tornano al comportamento di sempre (estratto Wikipedia).
 */
export function usePoiNotes(hikeId: string, poiIds: (string | number)[], enabled: boolean): Map<number, string> {
  const [notesById, setNotesById] = useState<Map<number, string>>(new Map())

  useEffect(() => {
    if (!enabled || poiIds.length === 0) { setNotesById(new Map()); return }
    let cancelled = false
    const ids = poiIds.map((id) => Number(id)).filter((n) => Number.isFinite(n))
    if (ids.length === 0) return

    ;(async () => {
      const offline = await loadOfflinePoiNotes(hikeId).catch(() => null)
      if (offline && offline.size > 0) { if (!cancelled) setNotesById(offline); return }

      try {
        const res = await fetch(`/api/poi-notes?ids=${ids.join(',')}`)
        const data = res.ok ? await res.json() as Record<string, { text: string }> : {}
        if (!cancelled) setNotesById(new Map(Object.entries(data).map(([id, v]) => [Number(id), v.text])))
      } catch {
        // offline e senza pacchetto scaricato: nessun testo arricchito, i chiamanti ricadono su Wikipedia
      }
    })()

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, hikeId, poiIds.join(',')])

  return notesById
}
