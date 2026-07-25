// Tipi di un percorso "trovato" (già documentato altrove — ricerca non-AI/AI, o cache `trails`) —
// estratti da components/upload/RouteBuilder.tsx perché anche lib/routeBuilder/generateRecommendations.ts
// e components/RouteResultCard.tsx ne hanno bisogno, senza importare l'uno dall'altro.
import type { TrackPoint } from '@/lib/tcxParser'
import type { SearchResultCandidate } from '@/app/api/route-search/route'
import type { PoiItem } from '@/lib/overpass'
import type { ProvisionalScore } from './provisionalScore'

// Traccia reale garantita di un percorso "trovato" — mai mostrata finché non risolta. Stessa forma
// dei campi restituiti da /api/route-search/resolve (lib/routeBuilder/resolveTrack.ts), letta qui
// via JSON e non importata come tipo server (quel modulo importa librerie server-only).
export interface ResolvedTrack {
  trackPoints: TrackPoint[]
  routePolyline: [number, number][]
  distanceMeters: number
  elevationGain: number
  elevationLoss: number
  altitudeMax: number
  altitudeMin: number
  estimatedTimeSeconds: number
  hasElevation: boolean
}

// Un percorso "trovato" normalizzato — sia che venga dalla ricerca non-AI (Livello 0/1,
// app/api/route-build/search/route.ts), dalla chat AI di Giulia (Livello 2), o dalla cache `trails`
// (lib/routeBuilder/generateRecommendations.ts) — con una traccia reale SEMPRE presente: un
// candidato che non risolve una traccia non diventa mai un FoundRouteItem, quindi questa forma non
// ha bisogno di un ramo "senza traccia".
export interface FoundRouteItem {
  name: string
  zone?: string
  difficulty?: string
  description?: string
  sourceUrl?: string
  comfortVerdict?: SearchResultCandidate['comfortVerdict']
  comfortNote?: string
  osmId?: number
  track: ResolvedTrack
  // POI vicini al tracciato (vedi lib/routeBuilder/nearbyPois.ts) — assente/vuoto per le righe già
  // in cache `trails` da prima di questo campo (non ri-arricchite retroattivamente) o quando la
  // ricerca POI fallisce; mai bloccante per mostrare comunque il percorso.
  pois?: PoiItem[]
  // Stima leggera (vedi lib/routeBuilder/provisionalScore.ts) — assente per lo stesso motivo di
  // `pois` sopra (righe di cache precedenti a questo campo).
  provisionalScore?: ProvisionalScore
}
