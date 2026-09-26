import { useState } from 'react'
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
 *
 * NON naviga più (piano §51.4, opzione B — verifica utente 2026-09-27): la nuova Guida si apre
 * nell'overlay (SiteGuideOverlay) sopra questa stessa Guida di Borgo, mai in una pagina separata
 * — `onCreated` (l'id della nuova Guida) è responsabilità del chiamante, non di questo hook.
 */
export function useCreateSiteGuideFromStop(parentMetaId: string, onCreated: (siteId: string) => void) {
  const [creatingStopId, setCreatingStopId] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)

  async function createAndOpen(stop: ItineraryStop) {
    if (creatingStopId || stop.source !== 'archivio') return
    setCreatingStopId(stop.id)
    setCreateError(null)
    try {
      const hike = itineraryStopToNestedSitePlannedHike(stop, parentMetaId)
      await savePlanned(hike)
      setCreatingStopId(null)
      onCreated(hike.id)
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Impossibile creare la Guida — riprova.')
      setCreatingStopId(null)
    }
  }

  return { creatingStopId, createError, createAndOpen }
}
