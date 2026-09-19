// Orchestratore client-side della pipeline "Su misura" a step (step/network → step/candidates →
// step/enrich, con ritentativo a lunghezze alternative) — estratto da components/upload/
// RouteBuilder.tsx (era una funzione locale del wizard) perché ora serve un secondo chiamante:
// components/upload/SentieroGenerationPanel.tsx, la generazione scoped al viewport della mappa di
// ricerca unificata (components/upload/CreaGuidaMapSearch.tsx). Nessuna logica nuova rispetto
// all'originale — stessa identica sequenza/soglie di ritentativo, solo senza più dipendere dallo
// stato React del wizard (searchRadiusKm era letto per closure, ora è un campo esplicito di
// BuildParamsCommon).
import type { RouteType } from './loopBuilder'
import type { RouteCandidate } from './loopBuilder'
import type { ScoredCandidate as BuiltCandidate } from './scoreCandidates'
import type { HikerEnvironmentPrefKey } from '../hikerProfile'
import type { PoiType } from '../overpass'
import {
  MIN_TARGET_DISTANCE_KM, MAX_TARGET_DISTANCE_KM, MIN_BUILT_RESULTS, RETRY_DISTANCE_FACTORS,
  MAX_BUILT_RESULTS, candidateSignature,
} from './buildConstants'

export interface BuildParamsCommon {
  lat: number
  lon: number
  targetDistanceKm: number
  targetElevationM: number | null
  environmentPrefs: HikerEnvironmentPrefKey[]
  desiredPoiTypes: PoiType[]
  startMode: 'esatto' | 'dintorni'
  destinationLat: number | null
  destinationLon: number | null
  radiusKm: number
}

export async function postJSON(url: string, body: unknown): Promise<{ ok: boolean; data: any }> {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json()
    return { ok: res.ok, data }
  } catch {
    return { ok: false, data: { message: 'Errore di rete, riprova.' } }
  }
}

/**
 * Genera i percorsi "Su misura" per UN tipo di percorso, in tre chiamate HTTP brevi invece di
 * un'unica richiesta lunga (rete + pathfinding + arricchimento, fino a 45-83s osservati in
 * produzione — vedi /profilo/log-ricerche): ogni step ha il proprio tetto di 60s "fresco", così
 * nessuna singola invocazione della funzione serverless si avvicina più al limite duro della
 * piattaforma (piano Hobby, non alzabile lato codice). Stessa identica logica/soglie della
 * pipeline monolitica invariata (app/api/route-build/route.ts), solo spezzata in
 * step/network → step/candidates → step/enrich, con lo stesso ritentativo a lunghezze
 * alternative (RETRY_DISTANCE_FACTORS) orchestrato qui invece che dentro un'unica richiesta.
 */
// `relaxed`: true solo dopo che l'utente ha esplicitamente confermato di voler "rompere" il
// vincolo di lunghezza/dislivello a fronte di un primo tentativo senza risultati (vedi
// SentieroGenerationPanel.tsx) — il pathfinding (lib/routeBuilder/loopBuilder.ts) non scarta più i
// candidati fuori da LENGTH_TOLERANCE, restituisce il più vicino possibile al target invece di
// niente. In questo caso il ritentativo con lunghezze alternative (0.75x/1.25x, sotto) non serve
// più: la ricerca è già andata oltre ogni tolleranza sulla lunghezza originale, provare altre
// lunghezze non aggiungerebbe candidati più vicini al target reale dell'utente.
export async function runStepBuild(
  routeType: RouteType, common: BuildParamsCommon, onStage: (stage: string) => void, relaxed = false,
): Promise<{ candidates: BuiltCandidate[]; message: string | null; reason?: 'no_results' | 'error' }> {
  const startedAt = Date.now()
  const noResultsMessage = 'Nessun percorso trovato con questi vincoli nella zona scelta — prova una lunghezza diversa o un punto di partenza differente.'
  const noResultsMessageRelaxed = 'Anche allargando la ricerca oltre i parametri richiesti non ho trovato nessun percorso in questa zona — la rete pedonale qui è troppo rada o isolata.'

  function logResult(tierReached: string, builtCount: number, retried: boolean, message: string | null) {
    postJSON('/api/route-build/step/log', {
      routeType, targetDistanceKm: common.targetDistanceKm, tierReached, builtCount, retried, message,
      durationMs: Date.now() - startedAt,
    })
  }

  onStage('Cerco i sentieri della zona…')
  const net = await postJSON('/api/route-build/step/network', {
    lat: common.lat, lon: common.lon, routeType,
    targetDistanceKm: common.targetDistanceKm, targetElevationM: common.targetElevationM,
    destinationLat: common.destinationLat, destinationLon: common.destinationLon,
    environmentPrefs: common.environmentPrefs, desiredPoiTypes: common.desiredPoiTypes,
    radiusKm: common.radiusKm, startMode: common.startMode,
  })
  if (!net.ok) {
    const message = net.data.message || net.data.error || 'Generazione non riuscita, riprova.'
    logResult(net.data.error ?? 'error', 0, false, message)
    return { candidates: [], message, reason: 'error' }
  }

  const { bbox, startNodeIds, targetDistanceM, hasDestination, rawCandidates: destRawCandidates, concerns, environmentPrefs: resolvedEnvPrefs } = net.data

  // `silent`: true per i ritentativi con lunghezza alternativa (un fallimento lì è un ripiego che
  // non deve interrompere gli altri, esattamente come nella pipeline monolitica originale, che li
  // catturava e tornava [] senza propagare l'errore) — false per il tentativo primario, dove un
  // fallimento di rete deve restare visibile invece di confondersi con un generico "nessun
  // percorso trovato".
  async function candidatesAndEnrich(distanceM: number, silent: boolean, relaxedAttempt = false): Promise<{ candidates: BuiltCandidate[]; errorMessage: string | null }> {
    let raw: RouteCandidate[]
    if (hasDestination) {
      raw = destRawCandidates ?? []
    } else {
      const cRes = await postJSON('/api/route-build/step/candidates', { bbox, startNodeIds, routeType, targetDistanceM: distanceM, concerns, relaxed: relaxedAttempt })
      if (!cRes.ok) return { candidates: [], errorMessage: silent ? null : (cRes.data.message || cRes.data.error) }
      raw = cRes.data.rawCandidates ?? []
    }
    if (raw.length === 0) return { candidates: [], errorMessage: null }
    const eRes = await postJSON('/api/route-build/step/enrich', {
      rawCandidates: raw, targetDistanceM, targetElevationM: common.targetElevationM,
      environmentPrefs: resolvedEnvPrefs, concerns, desiredPoiTypes: common.desiredPoiTypes, bbox,
    })
    if (!eRes.ok) return { candidates: [], errorMessage: silent ? null : (eRes.data.message || eRes.data.error) }
    return { candidates: (eRes.data.candidates ?? []) as BuiltCandidate[], errorMessage: null }
  }

  onStage(relaxed ? 'Cerco il percorso più vicino possibile…' : 'Genero i percorsi…')
  const primary = await candidatesAndEnrich(targetDistanceM, false, relaxed)
  if (primary.errorMessage) {
    logResult('error', 0, false, primary.errorMessage)
    return { candidates: [], message: primary.errorMessage, reason: 'error' }
  }
  let candidates = primary.candidates

  let retried = false
  if (!relaxed && !hasDestination && candidates.length < MIN_BUILT_RESULTS) {
    retried = true
    onStage('Provo lunghezze alternative…')
    const seen = new Set(candidates.map(candidateSignature))
    const altBatches = await Promise.all(RETRY_DISTANCE_FACTORS.map(async factor => {
      const altDistanceM = Math.min(Math.max(targetDistanceM * factor, MIN_TARGET_DISTANCE_KM * 1000), MAX_TARGET_DISTANCE_KM * 1000)
      return (await candidatesAndEnrich(altDistanceM, true)).candidates
    }))
    for (const altCandidates of altBatches) {
      for (const c of altCandidates) {
        const sig = candidateSignature(c)
        if (seen.has(sig)) continue
        seen.add(sig)
        candidates.push(c)
      }
    }
    candidates = candidates
      .sort((a, b) => Math.abs(a.distanceMeters - targetDistanceM) - Math.abs(b.distanceMeters - targetDistanceM))
      .slice(0, MAX_BUILT_RESULTS)
  }

  if (candidates.length === 0) {
    const message = relaxed ? noResultsMessageRelaxed : noResultsMessage
    logResult(retried ? 'no_dtm_coverage' : (relaxed ? 'no_raw_candidates_relaxed' : 'no_raw_candidates'), 0, retried, message)
    return { candidates: [], message, reason: 'no_results' }
  }

  logResult(retried ? 'retry_built' : (relaxed ? 'relaxed_built' : 'built'), candidates.length, retried, null)
  return { candidates, message: null }
}
