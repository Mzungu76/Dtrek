import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { savePlanned } from './plannedStore'
import { itineraryStopToNestedSitePlannedHike } from './metaToPlannedHike'
import type { ItineraryStop } from '@/app/api/borgo-itinerary/route'

/**
 * Promuove una tappa d'archivio della Guida di un Borgo/Città alla propria Guida di Sito,
 * annidata in quella da cui nasce (piano §51.3) — stesso pattern di
 * lib/useCreateMetaFromSearch.ts, senza itinerario da ricalcolare (un Sito non ne ha uno).
 * Solo `stop.source === 'archivio'` è promuovibile (vedi itineraryStopToNestedSitePlannedHike);
 * il chiamante nasconde il bottone per una tappa `wikipedia`, qui la chiamata è comunque
 * un no-op per sicurezza.
 */
export function useCreateSiteGuideFromStop(parentMetaId: string) {
  const router = useRouter()
  const [creatingStopId, setCreatingStopId] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)

  async function createAndOpen(stop: ItineraryStop) {
    if (creatingStopId || stop.source !== 'archivio') return
    setCreatingStopId(stop.id)
    setCreateError(null)
    try {
      const hike = itineraryStopToNestedSitePlannedHike(stop, parentMetaId)
      await savePlanned(hike)
      router.push(`/guida/${encodeURIComponent(hike.id)}`)
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Impossibile creare la Guida — riprova.')
      setCreatingStopId(null)
    }
  }

  return { creatingStopId, createError, createAndOpen }
}
