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

export interface SignalContext {
  bbox: { minLat: number; maxLat: number; minLon: number; maxLon: number }
  geometry: [number, number][]
  centroid: { lat: number; lon: number }
  distanceKm: number | null
  elevationGain: number | null
  elevationLoss: number | null
  osmTags: Record<string, string>
}
