import type { SentieriSearchParams, MetaSearchResult, MetaSearchResultItem } from './types'

// Forma minima di un candidato prodotto dal sistema esistente (ScoredCandidate di
// lib/routeBuilder/scoreCandidates.ts, o un FoundRouteItem — piano §18, "mantenere il sistema
// attuale") — solo i campi che questa funzione legge, non l'intera forma reale.
export interface ExistingHikeCandidate {
  id?: string
  name?: string
  title?: string
  latitude?: number
  longitude?: number
  startLat?: number
  startLon?: number
  distanceMeters?: number
  elevationGain?: number
  estimatedTimeSeconds?: number
  trailScore?: number
  safetyScore?: number
}

// searchSentieri() NON chiama app/api/route-build da sola. Quell'endpoint fa calcolo pesante
// (grafo OSM, DTM, budget di tempo 40-60s — vedi app/api/route-build/route.ts) dietro un route.ts
// che deliberatamente NON esporta la propria logica come funzione importabile (commento in quel
// file: un export extra "viene flaggato da Next come non un campo Route valido"). Hairpin-chiamarlo
// via HTTP da qui aggiungerebbe un giro di rete e la gestione di cookie/auth senza nessun
// precedente nel repository (verificato: nessun altro route.ts chiama un altro route.ts per logica
// applicativa) — un rischio non necessario per un sistema che il piano vieta esplicitamente di
// alterare (§18: "non alterare il ranking attuale se non necessario").
//
// Il chiamante (oggi: gli stessi componenti client che già chiamano /api/route-build o
// /api/percorsi-per-te) inietta invece i candidati già ottenuti tramite `fetchCandidates` — questa
// funzione fa SOLO la normalizzazione nel modello comune di searchMeta() (piano §17: la UI non
// deve conoscere i dettagli delle fonti — qui vale per l'OUTPUT, dato che l'INPUT resta
// deliberatamente quello del sistema esistente, invariato).
export function normalizeHikeCandidates(candidates: ExistingHikeCandidate[]): MetaSearchResult {
  const items: MetaSearchResultItem[] = candidates.map((c, i): MetaSearchResultItem => ({
    id: c.id ?? String(i),
    metaType: 'sentiero',
    name: c.name ?? c.title ?? 'Percorso',
    latitude: c.latitude ?? c.startLat ?? 0,
    longitude: c.longitude ?? c.startLon ?? 0,
    hikeStats: {
      distanceMeters: c.distanceMeters,
      elevationGain: c.elevationGain,
      estimatedTimeSeconds: c.estimatedTimeSeconds,
      trailScore: c.trailScore,
      safetyScore: c.safetyScore,
    },
    // Il ranking dei Sentieri resta quello del sistema esistente (piano §18) — l'ordine di arrivo
    // di `candidates` è già quello deciso da scoreAndEnrichCandidates/generateRecommendations,
    // questa funzione lo preserva invece di ricalcolarlo (un punteggio decrescente per posizione,
    // solo per rispettare il contratto MetaSearchResultItem.rankingScore, mai usato per riordinare).
    rankingScore: candidates.length - i,
    sourceCount: 1,
    confidence: 1,
  }))
  return { metaType: 'sentiero', items, total: items.length }
}

export type FetchHikeCandidates = (buildParams: Record<string, unknown>) => Promise<ExistingHikeCandidate[]>

export async function searchSentieri(params: SentieriSearchParams, fetchCandidates: FetchHikeCandidates): Promise<MetaSearchResult> {
  const candidates = await fetchCandidates(params.buildParams)
  return normalizeHikeCandidates(candidates)
}
