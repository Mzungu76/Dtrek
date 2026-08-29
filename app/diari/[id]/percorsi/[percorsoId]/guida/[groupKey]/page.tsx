'use client'
// Una pagina della Guida "a libro" — Fase 3 di docs/diario-a-libro-piano.md. Slug stabile
// (GuideNavGroupKey, Fase 40 — prima GuideSectionKey, 9 slug possibili: docs/
// taccuino-botanico-piano.md ha raggruppato la navigazione in 3): monta GuideBookPage.tsx
// (Fase 2), che si occupa di caricamento dati, gate di presenza e dispatch dei widget delle
// sotto-sezioni del gruppo.
import { Suspense } from 'react'
import { useParams, notFound } from 'next/navigation'
import GuideBookPage from '@/components/libro/GuideBookPage'
import { isGuideNavGroupKey } from '@/lib/guideSections'
import { useDiarioTitle } from '@/lib/diario/useDiarioTitle'

function GuideGroupPageInner() {
  const params = useParams<{ id: string; percorsoId: string; groupKey: string }>()
  const diarioId = decodeURIComponent(params.id)
  const percorsoId = decodeURIComponent(params.percorsoId)
  const groupKey = decodeURIComponent(params.groupKey)
  const diarioTitle = useDiarioTitle(diarioId)

  if (!isGuideNavGroupKey(groupKey)) notFound()

  const basePath = `/diari/${encodeURIComponent(diarioId)}/percorsi/${encodeURIComponent(percorsoId)}`

  return (
    <GuideBookPage
      basePath={basePath}
      diarioHref={`/diari/${encodeURIComponent(diarioId)}`}
      diarioTitle={diarioTitle}
      percorsoId={percorsoId}
      groupKey={groupKey}
    />
  )
}

export default function GuideGroupPage() {
  return (
    <Suspense>
      <GuideGroupPageInner />
    </Suspense>
  )
}
