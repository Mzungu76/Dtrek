import { haversineM } from '../../lib/geoUtils'
import type { ExistingPlace, PlaceCandidate } from './types'
import { nameTokenSimilarity, sameMunicipality } from './normalize'

// Entity matching multi-fattore (piano §14) — la stessa attrazione può arrivare da MiC, OSM,
// Wikidata, PTPR: questo modulo decide se un nuovo PlaceCandidate è "lo stesso posto" di una riga
// già in dtrek_places, prima che import.ts scriva qualunque cosa.
//
// Sopra AUTO_MERGE_THRESHOLD: il candidato viene collegato alla Meta esistente (una nuova riga in
// dtrek_place_sources), nessuna nuova dtrek_places.
// Tra REVIEW_THRESHOLD e AUTO_MERGE_THRESHOLD: "match probabile" — il piano vieta esplicitamente
// la fusione automatica dei match incerti ("I match incerti NON devono essere automaticamente
// fusi"), quindi il candidato entra come una NUOVA dtrek_places, ma import.ts lo marca
// metadata.needsReview così un passaggio umano può fonderlo manualmente in seguito.
// Sotto REVIEW_THRESHOLD: nessun collegamento, nessun avviso — sono chiaramente due posti diversi.
export const AUTO_MERGE_THRESHOLD = 0.9
export const REVIEW_THRESHOLD = 0.6

// Oltre questa distanza due punti non vengono nemmeno considerati per il confronto — evita di far
// pesare in modo assurdo un nome quasi identico ("Chiesa di San Pietro") su due lati opposti della
// regione. 2km copre comodamente l'errore di centroide di un poligono/area PTPR (piano §5) e
// l'incertezza di digitazione delle coordinate di una fonte manuale.
const MAX_MATCH_DISTANCE_M = 2000

export interface MatchResult {
  place: ExistingPlace
  confidence: number
  // Fattori nell'ordine del piano §14 — utile per audit/debug, mai usato per decisioni a valle.
  reasons: { factor: string; score: number; weight: number }[]
}

function distanceScore(distanceM: number): number {
  if (distanceM > MAX_MATCH_DISTANCE_M) return 0
  // 1.0 fino a 30m (rumore GPS/centroide tipico), decade linearmente fino a 0 a MAX_MATCH_DISTANCE_M.
  if (distanceM <= 30) return 1
  return 1 - (distanceM - 30) / (MAX_MATCH_DISTANCE_M - 30)
}

// Punteggio di confidenza [0,1] tra un candidato e UNA riga esistente — piano §14, fattori
// 1-6 nell'ordine indicato (coordinate/distanza sono lo stesso fattore geografico qui).
export function scoreCandidateAgainstPlace(candidate: PlaceCandidate, existing: ExistingPlace): MatchResult {
  const reasons: MatchResult['reasons'] = []

  // Match certo indipendente dal punteggio pesato: stesso identificativo Wikidata (piano §11).
  if (candidate.wikidataId && existing.wikidataId && candidate.wikidataId === existing.wikidataId) {
    return { place: existing, confidence: 1, reasons: [{ factor: 'wikidata_id', score: 1, weight: 1 }] }
  }

  const distM = haversineM(candidate.latitude, candidate.longitude, existing.latitude, existing.longitude)
  const distScore = distanceScore(distM)
  reasons.push({ factor: 'distance', score: distScore, weight: 0.5 })
  // Corto-circuito: oltre la distanza massima non ha senso continuare a confrontare nome/tipo —
  // due posti diversi con lo stesso nome ("Chiesa di San Pietro") non devono mai essere fusi solo
  // perché il nome combacia.
  if (distScore === 0) return { place: existing, confidence: 0, reasons }

  const nameScore = nameTokenSimilarity(candidate.name, existing.name)
  reasons.push({ factor: 'name', score: nameScore, weight: 0.3 })

  const municipalityScore = sameMunicipality(candidate.municipality, existing.municipality) ? 1 : 0
  reasons.push({ factor: 'municipality', score: municipalityScore, weight: 0.1 })

  const typeScore = candidate.metaType === existing.metaType
    && (!candidate.subtype || !existing.subtype || candidate.subtype === existing.subtype)
    ? 1 : 0
  reasons.push({ factor: 'type', score: typeScore, weight: 0.1 })

  const confidence = reasons.reduce((sum, r) => sum + r.score * r.weight, 0)
  return { place: existing, confidence, reasons }
}

// Trova il miglior candidato tra le righe esistenti già filtrate per vicinanza geografica (un
// bbox largo attorno al candidato — il chiamante, es. import.ts, fa quella query su Supabase
// prima di chiamare questa funzione, così qui non serve accesso alla rete/DB).
export function findBestMatch(candidate: PlaceCandidate, nearbyExisting: ExistingPlace[]): MatchResult | null {
  let best: MatchResult | null = null
  for (const existing of nearbyExisting) {
    const result = scoreCandidateAgainstPlace(candidate, existing)
    if (!best || result.confidence > best.confidence) best = result
  }
  return best
}
