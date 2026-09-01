import type { MetaType, SiteType, PlaceCategory } from '../metaTypes'

// Astrazione di ricerca unificata (piano §17): la UI chiama searchMeta() senza sapere se dietro
// c'è dtrek_places (Borghi/Città, Siti) o il motore di generazione percorsi esistente (Sentieri,
// piano §18 — "mantenere il sistema attuale", mai riscritto qui).

export interface MetaSearchOrigin {
  lat: number
  lon: number
}

// Interessi Borghi/Città (piano §19) — solo quelli per cui esiste un segnale reale nei dati oggi
// (piano §48.8, mai un fattore di ranking "senza definizione"): la lista completa del piano ne
// include altri (Arte, Panorami, Gastronomia, Artigianato, Fotografia, Famiglie, ...) che restano
// accettati come input ma che oggi non influenzano il punteggio — vedi ranking.ts.
export type BorgoInterest =
  | 'storia'
  | 'architettura'
  | 'chiese'
  | 'archeologia'
  | 'curiosita'
  | 'gastronomia'
  | 'artigianato'
  | 'panorami'
  | 'fotografia'
  | 'famiglie'
  | 'arte'

export type ExperienceType = 'essenziale' | 'completa' | 'storica' | 'fotografica' | 'gastronomica' | 'personalizzata'

export type TimeBudget = '30min' | '1h' | '2h' | 'mezza_giornata' | 'giornata'

const TIME_BUDGETS: readonly string[] = ['30min', '1h', '2h', 'mezza_giornata', 'giornata']

export function isTimeBudget(value: unknown): value is TimeBudget {
  return typeof value === 'string' && TIME_BUDGETS.includes(value)
}

export interface BorghiSearchParams {
  metaType: 'borgo_citta'
  region?: string
  province?: string
  origin?: MetaSearchOrigin
  maxDistanceKm?: number
  interests?: BorgoInterest[]
  experienceType?: ExperienceType
  timeAvailable?: TimeBudget
  category?: PlaceCategory[]
  limit?: number
}

export interface SitiSearchParams {
  metaType: 'sito'
  category?: SiteType[]
  region?: string
  province?: string
  origin?: MetaSearchOrigin
  maxDistanceKm?: number
  interests?: BorgoInterest[]
  limit?: number
}

// Sentieri: nessun nuovo parametro — passa attraverso i parametri già accettati dal motore
// esistente (app/api/route-build, lib/routeBuilder/buildSteps.ts's BuildRequestBody). Tipizzato
// qui come "unknown strutturato dal chiamante" perché quel tipo non è (e non deve diventare)
// importabile da lib/ — vive dietro un route.ts (piano §48.3/§18, "non alterare il sistema
// esistente"). Vedi searchSentieri.ts per il perché e come viene comunque normalizzato.
export interface SentieriSearchParams {
  metaType: 'sentiero'
  buildParams: Record<string, unknown>
}

export type MetaSearchParams = BorghiSearchParams | SitiSearchParams | SentieriSearchParams

// Un risultato normalizzato, sufficiente per una card (piano §24) — mai con campi vuoti
// fabbricati: un campo assente resta `undefined`, la UI decide se ometterlo (vedi metaCard.ts).
export interface MetaSearchResultItem {
  id: string
  metaType: MetaType
  siteType?: SiteType
  name: string
  description?: string
  latitude: number
  longitude: number
  region?: string
  province?: string
  municipality?: string
  imageUrl?: string
  distanceKm?: number

  // Punteggio interno di ordinamento (piano §21/§22 — deterministico, MAI generato da un LLM).
  // Deliberatamente non chiamato "Borgo Score"/"Site Score": il piano vieta esplicitamente di
  // introdurre un punteggio pubblico prima di validare l'algoritmo su dati reali (§22) — questo
  // campo è per ordinare i risultati, non per un badge numerico in UI.
  rankingScore: number
  rankingBreakdown?: Record<string, number>

  // Solo per Sentieri — riusa i campi del sistema esistente senza reinventarli (piano §18).
  hikeStats?: {
    distanceMeters?: number
    elevationGain?: number
    estimatedTimeSeconds?: number
    trailScore?: number
    safetyScore?: number
  }

  sourceCount: number
  confidence: number
}

export interface MetaSearchResult {
  metaType: MetaType
  items: MetaSearchResultItem[]
  total: number
}
