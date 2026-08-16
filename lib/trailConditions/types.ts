// Tipi condivisi da "Condizioni attuali" (app/api/trails/conditions) — gli unici collector
// rimasti in questo modulo dopo la rimozione di Affidabilità/CL e Ombra&Acqua, che un tempo
// vivevano nella stessa cartella (lib/cl/).
export interface WeatherSignal {
  precipPenalty: number     // 0 | -8 | -18 | -30 (ultimi 7 giorni)
  soilPenalty: number       // 0 | -5 | -15 | -25
  surfaceMultiplier: number // 0.5 (gravel/rock) | 1.0 (ground/earth) | 1.5 (mud) | 1.2 (sconosciuto)
  slopeMultiplier: number   // 0.8 (<10%) | 1.0 (10-25%) | 1.3 (>25%)
  totalPenalty: number      // clamp((precipPenalty+soilPenalty) * surfaceMultiplier * slopeMultiplier, -35, 0)
}

export interface ClimateSignal {
  tempPenalty: number     // 0 | -10 | -25 | -15 | -30 in base alla temperatura media del mese corrente
  altitudeSeason: number  // -20 | -10 | 0 (alta quota + mesi invernali)
  seasonBonus: number     // +5 (Apr/Mag, Ott/Nov) | 0
}

/**
 * Fase 4 di docs/navigator-orizzonti-roadmap.md — primo segnale con input scritto da utenti
 * reali (weather/climate sopra restano 100% calcolati da dati esterni). A differenza degli
 * altri due, `confidenceWeight` non è un moltiplicatore di penalità ma un peso 0..1 pensato per
 * un futuro blend (Fase 8, Trail Confidence): un segnale rumoroso e volatile nel tempo va
 * attenuato, mai sommato alla pari con Trail Score/connettività/geometria — vedi il commento
 * nella roadmap sul perché.
 */
export interface CommunitySignal {
  completions30d: number
  completionsTotal: number
  /** Già filtrate e limitate — pronte per essere mostrate senza ulteriore elaborazione. */
  notes: string[]
  difficultyMarkerCount: number
  /** Parole chiave più ricorrenti tra i marker di difficoltà vicini (trail_difficulty_markers) — un assaggio, non l'elenco completo. */
  recentDifficultyKeywords: string[]
  confidenceWeight: number
}

export interface SignalContext {
  bbox: { minLat: number; maxLat: number; minLon: number; maxLon: number }
  geometry: [number, number][]
  centroid: { lat: number; lon: number }
  distanceKm: number | null
  elevationGain: number | null
  elevationLoss: number | null
  osmTags: Record<string, string>
}
