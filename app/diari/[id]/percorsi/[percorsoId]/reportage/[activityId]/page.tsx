'use client'
/**
 * Questa pagina non esiste più — stesso principio del riepilogo del Percorso
 * (.../percorsi/[percorsoId]/page.tsx, Fase 15 di docs/diario-a-libro-piano.md): il Reportage si
 * allinea allo stile "a libro" già usato per la Guida, richiesta esplicita dell'utente —
 * generazione AI, editor testuale assistito e racconto guidato a domande vivono ora nel drawer
 * "Strumenti" della lettura a pagine (ReportageToolsDrawer, raggiungibile da ogni pagina di
 * .../sezione/[n]), non in una pagina di riepilogo a sé. Un link vecchio (bookmark, storico del
 * browser) rimanda quindi dritto alla prima pagina del libro invece di mostrare una pagina ormai
 * vuota. Elenco completo delle 8 pagine-lapide in docs/diario-valutazione-ux-piano.md §5.4.
 */
import { Suspense } from 'react'
import { useParams } from 'next/navigation'
import RedirectTo from '@/app/components/RedirectTo'

function ReportageRedirectInner() {
  const params = useParams<{ id: string; percorsoId: string; activityId: string }>()
  const diarioId = decodeURIComponent(params.id)
  const percorsoId = decodeURIComponent(params.percorsoId)
  const activityId = decodeURIComponent(params.activityId)
  const basePath = `/diari/${encodeURIComponent(diarioId)}/percorsi/${encodeURIComponent(percorsoId)}/reportage/${encodeURIComponent(activityId)}`
  return <RedirectTo href={`${basePath}/sezione/1`} />
}

export default function ReportageSummaryPage() {
  return (
    <Suspense>
      <ReportageRedirectInner />
    </Suspense>
  )
}
