import type { RecommendationCard } from './generateRecommendations'
import type { ScoredCandidate } from './scoreCandidates'
import type { FoundRouteItem } from './foundRoute'
import { routeTypeLabel } from './loopBuilder'

// Riassunto minimo per una card compatta di "Percorsi per te" — a differenza di
// app/percorsi-per-te/page.tsx (che mostra FoundRouteCard/BuiltRouteCard per intero, con mappa
// interattiva e badge punteggio) qui serve solo titolo/distanza/dislivello/tracciato per una card
// piccola in riga scorrevole. Condiviso tra app/bacheca/page.tsx e components/bacheca/
// RecoSuggestedRow.tsx (quest'ultima usata anche in app/diari/[id]/page.tsx, Fase 5 di
// docs/diario-fulcro-piano.md) — prima era una funzione locale a Bacheca, duplicata qui.
export interface RecoCardSummary {
  title: string
  polyline: [number, number][]
  distanceMeters: number
  elevationGain: number
  hasElevation: boolean
  isRevisit: boolean
  // Perché DTrek propone proprio questo percorso (generateRecommendations.ts) — assente per una
  // card 'built' (mai prodotta da generateRecommendationsForUser, solo righe storiche precedenti
  // alla rimozione di "Su misura" da questa pipeline), ricade sull'etichetta generica nella UI.
  reasonTag?: string
}

export function recoCardSummary(card: RecommendationCard): RecoCardSummary {
  if (card.kind === 'found') {
    const d = card.data as FoundRouteItem
    return {
      title: d.name, polyline: d.track.routePolyline, distanceMeters: d.track.distanceMeters,
      elevationGain: d.track.elevationGain, hasElevation: d.track.hasElevation, isRevisit: !!d.isRevisit,
      reasonTag: d.reasonTag,
    }
  }
  const d = card.data as ScoredCandidate
  return { title: `${routeTypeLabel(d.type)} per te`, polyline: d.routePolyline, distanceMeters: d.distanceMeters, elevationGain: d.elevationGain, hasElevation: d.hasElevation, isRevisit: false }
}
