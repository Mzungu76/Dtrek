'use client'
// Una pagina della Guida "a libro" — Fase 3 di docs/diario-a-libro-piano.md. Slug stabile
// (GuideSectionKey): monta GuideBookPage.tsx (Fase 2), che si occupa di caricamento dati, gate di
// presenza e dispatch del widget giusto per la sezione.
import { Suspense } from 'react'
import { useParams, notFound } from 'next/navigation'
import GuideBookPage from '@/components/libro/GuideBookPage'
import { isGuideSectionKey } from '@/lib/guideSections'
import { useDiarioTitle } from '@/lib/diario/useDiarioTitle'

function GuideSectionPageInner() {
  const params = useParams<{ id: string; percorsoId: string; sectionKey: string }>()
  const diarioId = decodeURIComponent(params.id)
  const percorsoId = decodeURIComponent(params.percorsoId)
  const sectionKey = decodeURIComponent(params.sectionKey)
  const diarioTitle = useDiarioTitle(diarioId)

  if (!isGuideSectionKey(sectionKey)) notFound()

  const basePath = `/diari/${encodeURIComponent(diarioId)}/percorsi/${encodeURIComponent(percorsoId)}`

  return (
    <GuideBookPage
      basePath={basePath}
      diarioTitle={diarioTitle}
      percorsoId={percorsoId}
      sectionKey={sectionKey}
    />
  )
}

export default function GuideSectionPage() {
  return (
    <Suspense>
      <GuideSectionPageInner />
    </Suspense>
  )
}
