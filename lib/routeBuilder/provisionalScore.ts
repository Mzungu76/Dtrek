// Stima leggera di Trail Score/Sicurezza mostrata su ogni card dei risultati di ricerca ("Su
// misura", "Esistenti", "Percorsi per te") — riusa SOLO dati già raccolti durante l'arricchimento
// (POI vicini, quota stimata via lib/dtm/elevationEnrich.ts, mai il DTM reale in questa fase),
// senza NESSUNA chiamata di rete aggiuntiva: niente OSM/DTM/profilo terreno/area protetta/fauna
// GBIF (tutti campi opzionali di computeTEI/computeSafetyScore, che degradano correttamente in
// loro assenza — computeTEI segna da sé confidence:'estimated'). Imprecisa ma istantanea su ogni
// card, sempre mostrata con l'etichetta "Provvisorio" in UI (vedi components/RouteResultCard.tsx):
// il calcolo preciso resta quello esistente (lib/computeCtsForHike.ts/lib/computeSafetyForHike.ts),
// eseguito una sola volta quando l'utente sceglie/importa un percorso specifico.
import { computeTEI, teiToBeautyScore } from '@/lib/tei'
import { computeTrailScore } from '@/lib/trailScore'
import { computeSafetyScore, type SafetyScore } from '@/lib/safetyScore'
import type { PoiItem } from '@/lib/overpass'
import type { TrackPoint } from '@/lib/tcxParser'

export interface ProvisionalScoreInput {
  routePolyline: [number, number][]
  trackPoints: TrackPoint[]
  distanceMeters: number
  elevationGain: number
  elevationLoss: number
  altitudeMax: number
  altitudeMin: number
  estimatedTimeSeconds: number
  pois: PoiItem[]
  // Durata preferita (minuti) contro cui confrontare la stima Naismith di QUESTO candidato — se
  // il chiamante ha già un target esplicito per la ricerca in corso (es. la lunghezza richiesta in
  // "Su misura", vedi lib/routeBuilder/scoreCandidates.ts), va preferito al default neutro di
  // computeTrailScore: altrimenti ogni candidato verrebbe giudicato "troppo lungo/corto" contro
  // una preferenza generica (270 min) invece che contro quello che l'utente ha davvero chiesto in
  // questa ricerca. Omesso ⇒ fallback al default neutro di computeTrailScore.
  prefDurata?: number
}

export interface ProvisionalScore {
  ts: number
  safety: SafetyScore
}

export function computeProvisionalScore(input: ProvisionalScoreInput): ProvisionalScore {
  const elevProfile = input.trackPoints.map(p => p.altitudeMeters ?? 0)

  const tei = computeTEI({
    track: input.routePolyline,
    elevGain: input.elevationGain,
    distanceMeters: input.distanceMeters,
    altitudeMax: input.altitudeMax,
    elevProfile,
    pois: input.pois,
    // osmData/dtmProfile/terrainProfile/inProtectedArea assenti di proposito — niente chiamate di
    // rete qui, computeTEI degrada da sé (confidence 'estimated').
  })
  const beautyScore = teiToBeautyScore(tei)

  let { ts } = computeTrailScore(beautyScore, {
    distanceMeters: input.distanceMeters,
    elevationGain: input.elevationGain,
    elevationLoss: input.elevationLoss,
    altitudeMax: input.altitudeMax,
    // avgHeartRate/prefSforzo/hrRest/hrMax/avgSlopeDeg assenti: leggere il profilo dell'utente qui
    // costerebbe un'altra chiamata Supabase per candidato, in contrasto con l'obiettivo "nessuna
    // chiamata aggiuntiva" di questa stima — i default neutri di computeTrailScore bastano per un
    // ordine di grandezza provvisorio. prefDurata invece arriva dal chiamante quando disponibile
    // (vedi il commento su ProvisionalScoreInput.prefDurata sopra), zero costo aggiuntivo.
    prefDurata: input.prefDurata,
  })
  // Stessa cautela già applicata da lib/computeCtsForHike.ts quando la confidenza è bassa.
  if (tei.confidence === 'estimated') ts = Math.round(ts * 0.95)

  const safety = computeSafetyScore({
    distanceMeters: input.distanceMeters,
    elevationGain: input.elevationGain,
    elevationLoss: input.elevationLoss,
    altitudeMax: input.altitudeMax,
    altitudeMin: input.altitudeMin,
    estimatedTimeSeconds: input.estimatedTimeSeconds,
    routePolyline: input.routePolyline,
    // gbifWildlifeRisks/guardianDogRisk assenti: nessuna chiamata di rete qui — il rischio fauna
    // reale arriva solo nel calcolo preciso post-import.
  })

  return { ts, safety }
}
