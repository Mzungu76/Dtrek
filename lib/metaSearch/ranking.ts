import { haversineM } from '../geoUtils'
import type { BorgoInterest, MetaSearchOrigin } from './types'

// Ranking deterministico (piano §21: "L'AI NON deve decidere quali Mete esistono... pipeline:
// database → candidati → ranking deterministico → AI opzionale"). Ogni fattore qui sotto ha una
// definizione esplicita e cita da dove viene il segnale (piano §48.8, "non introdurre nuovi score
// senza definizione") — nessun fattore del piano §22/§23 privo di un dato reale dietro viene
// inventato: numero_poi/densità_poi/tempo_visita/accessibilità restano fuori dal punteggio finché
// dtrek_place_relations (Blocco D) o nuove fonti non li rendono disponibili, vedi commenti sotto.

export interface RankingFactor {
  factor: string
  score: number   // sempre 0..1
  weight: number
}

export interface RankingResult {
  score: number
  breakdown: Record<string, number>
}

function combine(factors: RankingFactor[]): RankingResult {
  const totalWeight = factors.reduce((s, f) => s + f.weight, 0)
  const score = totalWeight === 0 ? 0 : factors.reduce((s, f) => s + f.score * f.weight, 0) / totalWeight
  const breakdown: Record<string, number> = {}
  for (const f of factors) breakdown[f.factor] = f.score
  return { score, breakdown }
}

// Distanza: 1.0 a 0km, decade linearmente a 0 oltre maxDistanceKm. Nessun punteggio (fattore
// omesso) se manca l'origine — una Meta non deve essere penalizzata per una ricerca senza punto di
// partenza, che è un caso d'uso legittimo (piano §19 "Dove?" è la prima domanda ma non obbligatoria
// per una regione già selezionata).
export function distanceFactor(origin: MetaSearchOrigin | undefined, lat: number, lon: number, maxDistanceKm: number): RankingFactor | null {
  if (!origin) return null
  const distanceKm = haversineM(origin.lat, origin.lon, lat, lon) / 1000
  const score = maxDistanceKm <= 0 ? 0 : Math.max(0, 1 - distanceKm / maxDistanceKm)
  return { factor: 'distanza', score, weight: 0.3 }
}

// Qualità dati (piano §22/§23 "qualità dati"/"qualità fonte"+"completezza dati" — unificati in un
// solo fattore, la distinzione fonte-singola vs multi-fonte e la completezza dei campi sono due
// facce dello stesso segnale "quanto ci si può fidare di questa riga"): più fonti indipendenti che
// confermano la stessa Meta (dtrek_place_sources) + confidence della fonte primaria + quanti campi
// informativi (description/imageUrl/officialUrl/website/address) sono valorizzati.
export function dataQualityFactor(sourceCount: number, confidence: number, populatedFieldsCount: number, totalOptionalFields: number): RankingFactor {
  const sourceScore = Math.min(1, sourceCount / 3) // 3+ fonti indipendenti = punteggio pieno
  const completenessScore = totalOptionalFields === 0 ? 0 : populatedFieldsCount / totalOptionalFields
  const score = (sourceScore * 0.5) + (confidence * 0.3) + (completenessScore * 0.2)
  return { factor: 'qualita_dati', score, weight: 0.15 }
}

// Segnali di interesse derivabili OGGI dai metadata già importati (piano §6/§14) — mapping
// deliberatamente conservativo: solo dove il segnale è esplicito (flag booleano da una fonte
// strutturata), mai indovinato dal nome o dalla descrizione. Molti interessi del piano §19
// (Arte, Gastronomia, Artigianato, Fotografia, Famiglie, Panorami) non hanno ancora nessun segnale
// nei dati importati (ISTAT/PTPR) — restano accettati come parametro di ricerca ma non concorrono
// al punteggio finché una fonte (MiC, OSM, Wikidata) non porta un segnale reale per loro.
export function inferredInterestTags(metadata: Record<string, unknown> | null | undefined): BorgoInterest[] {
  if (!metadata) return []
  const tags: BorgoInterest[] = []
  if (metadata.historicalCenter === true) tags.push('storia', 'architettura')
  if (metadata.ptprBorgoIdentitario === true) tags.push('curiosita', 'storia')
  if (metadata.cityOfFoundation === true) tags.push('storia', 'curiosita')
  return Array.from(new Set(tags))
}

// Nessun punteggio (fattore omesso) se il chiamante non ha chiesto interessi, o se questa Meta non
// ha nessun segnale derivabile — un match parziale/assente non deve abbassare il punteggio di Mete
// per cui semplicemente non esiste ancora il dato, altrimenti penalizzerebbe sistematicamente ogni
// Comune ISTAT "puro" (senza segnale PTPR) rispetto a uno con un flag PTPR, anche quando l'utente
// non ha chiesto nulla di storico.
export function interestMatchFactor(requested: BorgoInterest[] | undefined, available: BorgoInterest[]): RankingFactor | null {
  if (!requested || requested.length === 0 || available.length === 0) return null
  const matched = requested.filter(i => available.includes(i)).length
  return { factor: 'interessi', score: matched / requested.length, weight: 0.15 }
}

export function historicalCenterFactor(metadata: Record<string, unknown> | null | undefined): RankingFactor {
  return { factor: 'centro_storico', score: metadata?.historicalCenter === true ? 1 : 0, weight: 0.25 }
}

export function ptprBorgoIdentitarioFactor(metadata: Record<string, unknown> | null | undefined): RankingFactor {
  return { factor: 'ptpr_borgo_identitario', score: metadata?.ptprBorgoIdentitario === true ? 1 : 0, weight: 0.15 }
}

export function combineFactors(factors: (RankingFactor | null)[]): RankingResult {
  return combine(factors.filter((f): f is RankingFactor => f !== null))
}
