'use client'
import { Suspense } from 'react'
import { useParams } from 'next/navigation'
import RedirectTo from '@/app/components/RedirectTo'

/**
 * Questa pagina non esiste più (Fase 15 di docs/diario-a-libro-piano.md; flag `diarioLibroEnabled`
 * rimosso — redesign menù globale, fase 1): l'elenco Reportage e gli altri strumenti del Percorso
 * vivono ora nel drawer "Strumenti" di GuideBookPage.tsx, raggiungibile da ogni pagina di Guida.
 * Un link vecchio (bookmark, storico del browser) rimanda quindi dritto lì invece di mostrare una
 * pagina ormai vuota. Elenco completo delle 8 pagine-lapide in
 * docs/diario-valutazione-ux-piano.md §5.4.
 */
function PercorsoPageInner() {
  const params = useParams<{ id: string; percorsoId: string }>()
  const diarioId = decodeURIComponent(params.id)
  const percorsoId = decodeURIComponent(params.percorsoId)
  const basePath = `/diari/${encodeURIComponent(diarioId)}/percorsi/${encodeURIComponent(percorsoId)}`
  return <RedirectTo href={`${basePath}/guida/prima_di_partire`} />
}

export default function PercorsoPage() {
  return (
    <Suspense>
      <PercorsoPageInner />
    </Suspense>
  )
}
