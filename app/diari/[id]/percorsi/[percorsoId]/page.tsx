'use client'
import { Suspense, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

/**
 * Questa pagina non esiste più (Fase 15 di docs/diario-a-libro-piano.md; flag `diarioLibroEnabled`
 * rimosso — redesign menù globale, fase 1): l'elenco Reportage e gli altri strumenti del Percorso
 * vivono ora nel drawer "Strumenti" di GuideBookPage.tsx, raggiungibile da ogni pagina di Guida.
 * Un link vecchio (bookmark, storico del browser) rimanda quindi dritto lì invece di mostrare una
 * pagina ormai vuota.
 */
function PercorsoPageInner() {
  const params = useParams<{ id: string; percorsoId: string }>()
  const router = useRouter()
  const diarioId = decodeURIComponent(params.id)
  const percorsoId = decodeURIComponent(params.percorsoId)
  const basePath = `/diari/${encodeURIComponent(diarioId)}/percorsi/${encodeURIComponent(percorsoId)}`

  useEffect(() => {
    router.replace(`${basePath}/guida/prima_di_partire`)
  }, [basePath, router])

  return (
    <div className="flex items-center justify-center py-24 text-stone-400">
      <Loader2 className="w-6 h-6 animate-spin" />
    </div>
  )
}

export default function PercorsoPage() {
  return (
    <Suspense>
      <PercorsoPageInner />
    </Suspense>
  )
}
