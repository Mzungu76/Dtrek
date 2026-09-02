'use client'
// Lettura "a libro" di una Meta senza Diario — richiesta esplicita dell'utente: il click su una
// Meta nell'elenco (app/percorsi/page.tsx) deve aprire lo stesso layout "a libro" già usato per un
// Percorso dentro un Diario (.../percorsi/[percorsoId]/guida/[groupKey]/page.tsx, GuideBookPage),
// non più GuidaHub (/guida/[id], la vecchia galleria a stage — resta "vista estesa", raggiungibile
// dal drawer "Strumenti" di questa lettura). Variante diary-agnostic della stessa rotta: una Meta
// non ha un Diario finché non viene camminata (ristrutturazione Diario/Mete), quindi qui non c'è
// un diarioId da cui costruire `/diari/[id]/percorsi/[percorsoId]/guida/[groupKey]` — la stessa
// GuideBookPage.tsx viene montata con `basePath`/`groupPath` senza segmento Diario e `diarioHref`
// verso l'elenco Mete invece che verso un Sommario.
import { Suspense } from 'react'
import { useParams, notFound } from 'next/navigation'
import GuideBookPage from '@/components/libro/GuideBookPage'
import { isGuideNavGroupKey } from '@/lib/guideSections'

function GuideGroupPageInner() {
  const params = useParams<{ id: string; groupKey: string }>()
  const percorsoId = decodeURIComponent(params.id)
  const groupKey = decodeURIComponent(params.groupKey)

  if (!isGuideNavGroupKey(groupKey)) notFound()

  return (
    <GuideBookPage
      basePath={`/guida/${encodeURIComponent(percorsoId)}`}
      // Senza questo, GuideBookPage ricade sul default `${basePath}/guida` (pensato per il
      // Percorso annidato in un Diario, dove la rotta vera è .../percorsi/{id}/guida/{groupKey})
      // — qui la rotta è già sotto /guida, un segmento "/guida" in più produceva un link 404 per
      // le pillole "Percorso"/"Luoghi e Natura" (mai esercitato finché nessuna Meta arrivava qui
      // senza passare da un Diario).
      groupPath={`/guida/${encodeURIComponent(percorsoId)}`}
      diarioHref="/percorsi"
      diarioTitle="Mete"
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
