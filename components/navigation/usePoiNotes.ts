'use client'
import { useEffect, useState } from 'react'

/**
 * Legge la cache condivisa per-POI (lib/poiNotes.ts, /api/poi-notes) — testo più ricco della sola
 * descrizione Wikipedia, riusato tra sentieri diversi che passano dallo stesso POI (decisione 2,
 * artifact "La Guida IA"). Online-only per ora: nessun fallback offline-bundled ancora (prossimo
 * incremento — vedi lib/offline/packageManager.ts), quindi un fallimento qui lascia semplicemente
 * la mappa vuota e i chiamanti tornano al comportamento di sempre (estratto Wikipedia).
 */
export function usePoiNotes(poiIds: (string | number)[], enabled: boolean): Map<number, string> {
  const [notesById, setNotesById] = useState<Map<number, string>>(new Map())

  useEffect(() => {
    if (!enabled || poiIds.length === 0) { setNotesById(new Map()); return }
    let cancelled = false
    const ids = poiIds.map((id) => Number(id)).filter((n) => Number.isFinite(n))
    if (ids.length === 0) return
    fetch(`/api/poi-notes?ids=${ids.join(',')}`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((data: Record<string, { text: string }>) => {
        if (cancelled) return
        setNotesById(new Map(Object.entries(data).map(([id, v]) => [Number(id), v.text])))
      })
      .catch(() => {})
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, poiIds.join(',')])

  return notesById
}
