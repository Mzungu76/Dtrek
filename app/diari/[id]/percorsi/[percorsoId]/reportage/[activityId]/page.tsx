'use client'
// Questa pagina di riepilogo non esiste più — richiesta esplicita dell'utente: generazione AI,
// editor testuale assistito e racconto guidato a domande per un Reportage vivono tutti dentro
// /resoconto/[id] (ResocontoHub → ReportReader.tsx), non in una pagina intermedia dentro il
// Diario. La lettura "a libro" a pagine (.../reportage/[activityId]/sezione/[n], invariata) resta
// un modo alternativo di LEGGERE un Reportage già scritto, ma si raggiunge da /resoconto/[id]
// (vedi il link lì), non più da qui. Stesso principio già usato per "Tutti i Reportage"
// (app/reportage/page.tsx) e per il vecchio riepilogo del Percorso: un link vecchio (bookmark,
// storico del browser) rimanda alla destinazione reale invece di mostrare un 404.
import { Suspense, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

function ReportageRedirectInner() {
  const router = useRouter()
  const params = useParams<{ activityId: string }>()
  const activityId = decodeURIComponent(params.activityId)

  useEffect(() => {
    router.replace(`/resoconto/${encodeURIComponent(activityId)}`)
  }, [router, activityId])

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
