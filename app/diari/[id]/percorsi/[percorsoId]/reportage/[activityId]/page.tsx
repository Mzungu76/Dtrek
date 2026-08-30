'use client'
/**
 * Questa pagina non esiste più — stesso principio del riepilogo del Percorso
 * (.../percorsi/[percorsoId]/page.tsx, Fase 15 di docs/diario-a-libro-piano.md): il Reportage si
 * allinea allo stile "a libro" già usato per la Guida, richiesta esplicita dell'utente —
 * generazione AI, editor testuale assistito e racconto guidato a domande vivono ora nel drawer
 * "Strumenti" della lettura a pagine (ReportageToolsDrawer, raggiungibile da ogni pagina di
 * .../sezione/[n]), non in una pagina di riepilogo a sé. Un link vecchio (bookmark, storico del
 * browser) rimanda quindi dritto alla prima pagina del libro invece di mostrare una pagina ormai
 * vuota.
 */
import { Suspense, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

function ReportageRedirectInner() {
  const router = useRouter()
  const params = useParams<{ id: string; percorsoId: string; activityId: string }>()
  const diarioId = decodeURIComponent(params.id)
  const percorsoId = decodeURIComponent(params.percorsoId)
  const activityId = decodeURIComponent(params.activityId)
  const basePath = `/diari/${encodeURIComponent(diarioId)}/percorsi/${encodeURIComponent(percorsoId)}/reportage/${encodeURIComponent(activityId)}`

  useEffect(() => {
    router.replace(`${basePath}/sezione/1`)
  }, [basePath, router])

  return (
    <div className="flex items-center justify-center py-24 text-stone-400">
      <Loader2 className="w-6 h-6 animate-spin" />
    </div>
  )
}

export default function ReportageSummaryPage() {
  return (
    <Suspense>
      <ReportageRedirectInner />
    </Suspense>
  )
}
