'use client'
// Una pagina del Reportage "a libro" — Fase 3 di docs/diario-a-libro-piano.md. Indice numerico
// 1-based (i capitoli narrativi non hanno uno slug stabile come le sezioni della Guida — vedi
// components/libro/ReportBookPage.tsx). Clamp/redirect esplicito quando `n` è fuori dall'intervallo
// valido (link salvato da prima di una rigenerazione che ha cambiato il numero di capitoli): mai
// una pagina bianca in silenzio.
import { Suspense } from 'react'
import { useParams, useRouter } from 'next/navigation'
import ReportBookPage from '@/components/libro/ReportBookPage'
import { useDiarioTitle } from '@/lib/diario/useDiarioTitle'

function SezionePageInner() {
  const params = useParams<{ id: string; percorsoId: string; activityId: string; n: string }>()
  const router = useRouter()
  const diarioId = decodeURIComponent(params.id)
  const percorsoId = decodeURIComponent(params.percorsoId)
  const activityId = decodeURIComponent(params.activityId)
  const diarioTitle = useDiarioTitle(diarioId)

  const parsedN = Number(params.n)
  const pageIndex = Number.isInteger(parsedN) && parsedN >= 1 ? parsedN : 1

  const percorsoPath = `/diari/${encodeURIComponent(diarioId)}/percorsi/${encodeURIComponent(percorsoId)}`
  const basePath = `${percorsoPath}/reportage/${encodeURIComponent(activityId)}`

  return (
    <ReportBookPage
      basePath={basePath}
      diarioTitle={diarioTitle}
      activityId={activityId}
      pageIndex={pageIndex}
      onInvalidPageIndex={(presentCount) => {
        router.replace(presentCount > 0 ? `${basePath}/sezione/1` : `/resoconto/${encodeURIComponent(activityId)}`)
      }}
    />
  )
}

export default function SezionePage() {
  return (
    <Suspense>
      <SezionePageInner />
    </Suspense>
  )
}
