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
  // Etichetta breve del motivo per cui questo percorso è stato proposto (es. "Vicino a te",
  // "Stessa lunghezza delle tue uscite") — solo per le card di "Percorsi per te"
  // (lib/routeBuilder/generateRecommendations.ts), assente per un risultato di ricerca normale
  // (wizard, AI, ricerche salvate), dove non ha senso: lì il percorso è stato cercato esplicitamente
  // dall'utente, non proposto sulla base di un suo profilo.
  reasonTag?: string
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
  // DTREK-AUDIT.md P2 #23 — i numeri (distanceKm/elevationGainM) su cui l'LLM ha basato
  // comfortVerdict/comfortNote, stimati dal web PRIMA della risoluzione OSM/DTM reale in `track`
  // — mai ri-verificati contro i dati reali una volta risolti. Preservati qui solo per calcolare
  // isComfortVerdictStale sotto, mai mostrati direttamente all'utente.
  estimatedDistanceKm?: number | null
  estimatedElevationGainM?: number | null
  // Vero solo per una card di "Percorsi per te" ripescata tra i preferiti dell'utente perché la
  // raggiera di percorsi freschi non bastava a riempire il batch (vedi generateRecommendations.ts's
  // gatherRevisitCandidates) — mai per un risultato di ricerca normale (wizard, AI).
  isRevisit?: boolean
}

// Sopra questa soglia relativa, il verdetto/nota dell'LLM (basato sui numeri stimati dal web) è
// considerato non più affidabile: i numeri reali risolti dopo (OSM/DTM) sono cambiati abbastanza
// da rendere plausibile che anche il giudizio "adatto"/"sconsigliato" e la nota che lo spiega
// (es. "dislivello superiore alla tua media recente") si basino ormai su un dato superato. Soglia
// prudente (non minima): un piccolo scarto è normale anche per una stima web ragionevole, qui si
// vuole intercettare solo un disallineamento sostanziale.
const STALE_THRESHOLD = 0.4

function relativeDiff(estimated: number, resolved: number): number {
  if (resolved <= 0) return estimated > 0 ? Infinity : 0
  return Math.abs(estimated - resolved) / resolved
}

/**
 * Vero se i numeri reali risolti (OSM/DTM) sono cambiati abbastanza rispetto alla stima su cui
 * l'LLM aveva basato comfortVerdict/comfortNote da rendere quel giudizio non più affidabile.
 * Confronta solo le grandezze per cui esiste sia una stima sia un dato reale — nessun controllo
 * possibile (mai null/null) torna sempre false, mai un falso "obsoleto" per assenza di dati.
 */
export function isComfortVerdictStale(
  estimated: { distanceKm?: number | null; elevationGainM?: number | null },
  resolved: { distanceMeters: number; elevationGain: number; hasElevation: boolean },
): boolean {
  if (estimated.distanceKm != null && relativeDiff(estimated.distanceKm, resolved.distanceMeters / 1000) > STALE_THRESHOLD) {
    return true
  }
  if (resolved.hasElevation && estimated.elevationGainM != null && relativeDiff(estimated.elevationGainM, resolved.elevationGain) > STALE_THRESHOLD) {
    return true
  }
  return false
}
