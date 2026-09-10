'use client'
// Titolo del Diario per la running head delle pagine "a libro" (components/libro/BookPage.tsx) —
// le pagine di sezione (Guida/Reportage) conoscono solo l'id del Diario dall'URL, non il suo
// titolo: un fetch minimo separato invece di richiederlo ai loader magri di Fase 1
// (useGuidaBookData/useReportageBookData), che riguardano il Percorso/Reportage, non il Diario che
// li contiene.
import { useEffect, useState } from 'react'
import type { DiarioDetail } from '@/app/api/diaries/[id]/route'

export function useDiarioTitle(diarioId: string | undefined): string {
  const [title, setTitle] = useState('Diario')

  useEffect(() => {
    if (!diarioId) return
    fetch(`/api/diaries/${encodeURIComponent(diarioId)}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((d: DiarioDetail) => { if (d?.title) setTitle(d.title) })
      .catch(() => {})
  }, [diarioId])

  return title
}
