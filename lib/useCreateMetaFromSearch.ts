import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { savePlanned } from './plannedStore'
import { metaSearchResultToPlannedHike } from './metaToPlannedHike'
import type { MetaSearchResultItem } from './metaSearch/types'

/**
 * Crea una Meta da un risultato di /api/meta-search e apre la sua Guida — stessa azione al tocco
 * di un risultato sia in app/percorsi/cerca/luoghi/page.tsx sia nel campo unico dell'hub
 * (app/percorsi/cerca/page.tsx, Fase 2 di docs/piano-ricerca-mete.md). Estratto qui perché ora ha
 * due chiamanti: prima viveva solo dentro la pagina "luoghi".
 */
export function useCreateMetaFromSearch() {
  const router = useRouter()
  const [creatingId, setCreatingId] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)

  async function createAndOpen(item: MetaSearchResultItem) {
    if (creatingId) return
    setCreatingId(item.id)
    setCreateError(null)
    try {
      const hike = metaSearchResultToPlannedHike(item)
      await savePlanned(hike)
      router.push(`/guida/${encodeURIComponent(hike.id)}/prima_di_partire`)
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Impossibile creare la Meta — riprova.')
      setCreatingId(null)
    }
  }

  return { creatingId, createError, createAndOpen }
}
