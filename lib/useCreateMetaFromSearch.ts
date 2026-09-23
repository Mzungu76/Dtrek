import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { savePlanned, updatePlannedMeta } from './plannedStore'
import { metaSearchResultToPlannedHike } from './metaToPlannedHike'
import type { MetaSearchResultItem } from './metaSearch/types'
import type { BorgoItinerary } from '@/app/api/borgo-itinerary/route'
import { computeBorgoWalkFields } from './borgoWalkPolyline'

// piano guide-eccellenza — verifica post-piano: "l'algoritmo deve partire sia se... clicca su
// 'Genera automatico' sia se clicca su 'Crea Guida'". Prima, un itinerario già calcolato nel
// popup di ricerca (components/upload/CreaGuidaMapSearch.tsx, tab "Itinerario") veniva scartato
// al momento di "Crea guida" — la Guida lo ricalcolava da sola alla prima apertura (component
// guida/GuideReader.tsx), ma solo allora, e da zero. Qui invece parte SEMPRE, sia riusando un
// itinerario già calcolato nel popup (evita una seconda chiamata identica) sia calcolandolo
// per la prima volta se l'utente non ha mai toccato "Genera automatico" — così alla prima
// apertura la Guida trova borgoWalkPolyline già pronto, invece di aspettare il proprio
// ricalcolo lato client. Fire-and-forget: non blocca l'apertura della Guida (la rete pedonale
// OSM può metterci diversi secondi al primo giro su una zona mai cercata), e un fallimento qui
// non impedisce comunque il ricalcolo lazy già esistente in GuideReader.tsx.
async function persistBorgoWalkItinerary(hikeId: string, placeId: string, prefetched: BorgoItinerary | null | undefined): Promise<void> {
  try {
    const itinerary = prefetched ?? await fetch('/api/borgo-itinerary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ placeId }),
    }).then(res => res.ok ? res.json() : null) as BorgoItinerary | null
    if (!itinerary) return
    const walkFields = computeBorgoWalkFields(itinerary)
    if (walkFields) await updatePlannedMeta(hikeId, walkFields)
  } catch {
    // Silenzioso — GuideReader.tsx ricalcola comunque alla prima apertura, questo è solo
    // un'ottimizzazione per trovarlo già pronto.
  }
}

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

  // borgoItinerary: se il chiamante l'ha già calcolato (bottone "Genera automatico" nel popup di
  // ricerca), lo riusa invece di rifare la stessa chiamata — undefined quando non è mai stato
  // calcolato, null quando è stato tentato e non ha trovato nulla (nessun retry in quel caso, la
  // richiesta è già stata fatta una volta).
  async function createAndOpen(item: MetaSearchResultItem, borgoItinerary?: BorgoItinerary | null) {
    if (creatingId) return
    setCreatingId(item.id)
    setCreateError(null)
    try {
      const hike = metaSearchResultToPlannedHike(item)
      await savePlanned(hike)
      if (item.metaType === 'borgo_citta') {
        persistBorgoWalkItinerary(hike.id, item.id, borgoItinerary).catch(() => {})
      }
      // Verifica utente: `/prima_di_partire` non è mai stata una route reale sotto app/guida/[id]/
      // (solo page.tsx/naviga/flora/animali esistono lì) — portava a una pagina inesistente invece
      // della Guida appena creata. Ogni altro punto dell'app che apre una Guida (RouteBuilder,
      // GpxUploader, CreaGuidaMapSearch stesso poco più sotto, ...) usa questa stessa forma piana.
      router.push(`/guida/${encodeURIComponent(hike.id)}`)
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Impossibile creare la Meta — riprova.')
      setCreatingId(null)
    }
  }

  return { creatingId, createError, createAndOpen }
}
