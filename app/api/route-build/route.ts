import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequestDetailed } from '@/lib/supabaseAuth'
import { scoreAndEnrichCandidates, type ScoredCandidate } from '@/lib/routeBuilder/scoreCandidates'
import { fetchHikerProfile, fetchActivitySummary } from '@/lib/hikerContext'
import { sanitizeHikerConcerns, sanitizeHikerEnvironmentPrefs } from '@/lib/hikerProfile'
import { logRouteBuildEvent } from '@/lib/routeBuilder/operationsLog'
import {
  MIN_TARGET_DISTANCE_KM, MAX_TARGET_DISTANCE_KM, ENRICH_CAP,
  MIN_BUILT_RESULTS, RETRY_DISTANCE_FACTORS, MAX_BUILT_RESULTS, candidateSignature,
} from '@/lib/routeBuilder/buildConstants'
import {
  prepareNetworkStep, generateRawCandidatesForLength, parseBuildRequestBody,
  type BuildRequestBody,
} from '@/lib/routeBuilder/buildSteps'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Se il primo tentativo (fetch rete + arricchimento) ha già consumato più di questo, il
// ritentativo viene saltato — meglio pochi risultati garantiti entro il tetto di 60s della
// funzione (maxDuration sopra) che rischiare un kill della piattaforma a metà ritentativo, che non
// lascia scrivere né una risposta né una riga di log (vedi commento sul ritentativo sotto).
const BUILD_TIME_BUDGET_MS = 40_000
// Tetto morbido sull'intera richiesta (fetch rete + arricchimento + eventuale ritentativo),
// deciso da noi con margine rispetto al tetto duro di 60s della piattaforma (maxDuration sopra):
// un kill della piattaforma non è un'eccezione JS, nessun try/catch può intercettarlo, quindi non
// lascia scrivere né una risposta né una riga di log — osservato in produzione (Vercel Runtime
// Errors: "Task timed out after 60 seconds" su questo stesso endpoint). Rispondere noi prima,
// anche con un esito vuoto ma spiegato, è sempre meglio di un silenzio totale.
const SOFT_DEADLINE_MS = 45_000

// ── GET: valori suggeriti per precompilare il wizard (storico attività + profilo) ───────────────
// Nessun costo AI qui — solo letture Supabase già esistenti (lib/hikerContext.ts, stesse usate da
// app/api/route-search/route.ts). In modalità degradata risponde con suggerimenti vuoti invece di
// un errore, il wizard resta comunque utilizzabile con valori di default fissi.

export async function GET(req: NextRequest) {
  const { user, authUnavailable, degraded } = await getUserFromRequestDetailed(req)
  if (!user && !degraded) {
    return NextResponse.json(
      authUnavailable
        ? { error: 'auth_unavailable', message: 'Supabase non raggiungibile — riprova tra poco.' }
        : { error: 'Non autenticato' },
      { status: authUnavailable ? 503 : 401 },
    )
  }

  if (!user) {
    return NextResponse.json({
      suggestedDistanceKm: null, suggestedElevationM: null, environmentPrefs: [], concerns: [],
      routeBuildAiPlaceSearch: true,
    })
  }

  const [profile, history] = await Promise.all([fetchHikerProfile(user.id), fetchActivitySummary(user.id)])
  return NextResponse.json({
    suggestedDistanceKm: history.count > 0 ? Math.round(history.avgDistanceKm * 10) / 10 : null,
    suggestedElevationM: history.count > 0 ? Math.round(history.avgElevationM) : null,
    environmentPrefs: sanitizeHikerEnvironmentPrefs(profile.environmentPrefs),
    concerns: sanitizeHikerConcerns(profile.concerns),
    routeBuildAiPlaceSearch: profile.routeBuildAiPlaceSearch,
  })
}

// ── POST: genera i candidati ─────────────────────────────────────────────────────────────────
// Puro calcolo (Overpass + grafo + pathfinding + arricchimento DTM/POI): a differenza di
// route-search, nessuna chiamata Anthropic, quindi nessuna chiave AI richiesta all'utente.

export type LogBuildFn = (fields: {
  tierReached: string
  message?: string | null
  builtCount?: number | null
  retried?: boolean
  details?: Record<string, unknown> | null
}) => Promise<void>

// Rete di sicurezza: un'eccezione imprevista nel calcolo (es. il grafo, il pathfinding) senza
// questo wrapper può risultare in una risposta non-JSON che il client legge come "errore di rete"
// generico, mascherando la causa reale — stesso principio già applicato a route-build/search.
export async function POST(req: NextRequest) {
  try {
    return await handlePost(req)
  } catch (e) {
    console.error('[route-build] Errore imprevisto:', e)
    return NextResponse.json(
      { error: 'Errore interno', message: 'Generazione non riuscita per un errore interno, riprova.' },
      { status: 500 },
    )
  }
}

async function handlePost(req: NextRequest): Promise<NextResponse> {
  const { user, authUnavailable, degraded } = await getUserFromRequestDetailed(req)
  if (!user && !degraded) {
    return NextResponse.json(
      authUnavailable
        ? { error: 'auth_unavailable', message: 'Supabase non raggiungibile — riprova tra poco.' }
        : { error: 'Non autenticato' },
      { status: authUnavailable ? 503 : 401 },
    )
  }

  let params: BuildRequestBody
  try {
    params = parseBuildRequestBody(await req.json())
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Richiesta non valida' }, { status: 400 })
  }

  const startedAt = Date.now()
  // Diventa true quando il tetto morbido scatta (vedi Promise.race sotto) — `executeBuild` non
  // viene davvero interrotto a quel punto (Promise.race abbandona la promessa perdente, non la
  // cancella: fetchWalkNetwork/scoreAndEnrichCandidates continuano a girare in background, consumando
  // comunque budget Overpass/DTM/POI per un risultato che non verrà mai consegnato) — se in seguito
  // completa comunque e chiama logBuild, la riga di log verrebbe letta come un successo puntuale,
  // indistinguibile da una richiesta mai andata in timeout. Confermato in log di produzione: una riga
  // "timeout" e una "built" per la stessa identica richiesta (stesso tipo/lunghezza), 60s dopo. Questo
  // flag marca quella seconda riga come tale invece di lasciarla ambigua — non risolve lo spreco di
  // calcolo, che richiederebbe una vera cancellazione (AbortSignal) nelle chiamate di rete sottostanti.
  let timedOut = false
  // Riepilogo comune a ogni possibile esito di questa richiesta, per il log privato consultabile
  // su /profilo/log-ricerche — ogni return da qui in poi chiama logBuild prima di uscire, così
  // anche gli esiti "pochi/nessun risultato" restano visibili senza dover leggere i log Vercel.
  const logBuild: LogBuildFn = async fields => {
    await logRouteBuildEvent({
      userId: user?.id ?? null,
      kind: 'build',
      routeType: params.routeType,
      targetDistanceKm: params.targetDistanceKm,
      useAi: false,
      durationMs: Date.now() - startedAt,
      ...fields,
      tierReached: timedOut && fields.tierReached !== 'timeout' ? `${fields.tierReached}_after_deadline` : fields.tierReached,
    })
  }

  // Tutto il resto gira in executeBuild, con questo try/catch a fare da rete di sicurezza: senza
  // di esso, un'eccezione imprevista in un punto NON già coperto da un try/catch specifico (es.
  // fetchHikerProfile prima di questa correzione) veniva comunque intercettata dal wrapper esterno
  // di POST, ma senza mai scrivere una riga di log — un fallimento reale restava invisibile su
  // /profilo/log-ricerche, visibile solo nei log Vercel.
  //
  // In produzione (vedi Vercel Runtime Errors) executeBuild colpisce a volte il tetto DURO di 60s
  // della piattaforma — tipicamente in zone con rete sentieri rada (es. Blera), dove il
  // ritentativo scatta quasi sempre. Un kill della piattaforma non è un'eccezione JS: nessun
  // try/catch (né qui né altrove) può intercettarlo, quindi non veniva mai scritta né una
  // risposta né una riga di log — esattamente il sintomo "nessuna Costruzione nel log, mai".
  // Il Promise.race sotto impone un tetto MORBIDO, deciso da noi con margine, così rispondiamo
  // (e logghiamo) sempre prima che la piattaforma tolga la parola alla funzione.
  try {
    const outcome = await Promise.race([
      executeBuild(user, params, logBuild, startedAt).then(response => ({ kind: 'done' as const, response })),
      new Promise<{ kind: 'timeout' }>(resolve => setTimeout(() => resolve({ kind: 'timeout' }), SOFT_DEADLINE_MS)),
    ])
    if (outcome.kind === 'timeout') {
      timedOut = true
      console.error(`[route-build] tetto morbido di ${SOFT_DEADLINE_MS}ms superato, rispondo prima del kill della piattaforma`)
      await logBuild({ tierReached: 'timeout', builtCount: 0, message: 'generazione troppo lenta in questa zona' })
      return NextResponse.json({
        candidates: [],
        message: 'La generazione ha impiegato troppo tempo in questa zona — prova un raggio di ricerca più piccolo o un punto di partenza diverso.',
      })
    }
    return outcome.response
  } catch (e) {
    console.error('[route-build] Errore interno imprevisto in executeBuild:', e)
    await logBuild({ tierReached: 'error', message: 'errore interno imprevisto' })
    return NextResponse.json(
      { error: 'Errore interno', message: 'Generazione non riuscita per un errore interno, riprova.' },
      { status: 500 },
    )
  }
}

// NON esportata: lib/routeBuilder/generateRecommendations.ts non la richiama più da tempo ("Su
// misura" rimosso da "Percorsi per te", vedi quel file) — un export extra su un file route.ts
// viene comunque flaggato da Next come "non un campo Route valido" in fase di build, quindi va
// tenuta locale a meno che serva di nuovo altrove.
async function executeBuild(
  user: { id: string } | null, params: BuildRequestBody, logBuild: LogBuildFn, startedAt: number,
): Promise<NextResponse> {
  // Step 1 (fetch rete + aggancio + eventuale destinazione) delegato a lib/routeBuilder/buildSteps.ts
  // — stessa identica logica condivisa con app/api/route-build/step/network/route.ts, l'equivalente
  // di questo stesso passo ma come chiamata HTTP a parte per la pipeline "Su misura" a step (vedi
  // quel modulo per il perché). `awaitCacheWrite: false` qui: a differenza dello step separato, non
  // c'è nessuna richiesta successiva che debba rileggere la cache, quindi la scrittura può restare
  // non bloccante come prima di questo refactor.
  const prepOutcome = await prepareNetworkStep(user, params, false)
  if (!prepOutcome.ok) {
    // Stessa mappatura tierReached del codice pre-refactor: un fetch rete fallito restava 'error'
    // (con un messaggio di log dedicato), gli altri due usano il proprio error code come tierReached.
    await logBuild(
      prepOutcome.error === 'network_unavailable'
        ? { tierReached: 'error', message: 'rete sentieri non disponibile' }
        : { tierReached: prepOutcome.error, details: prepOutcome.details },
    )
    return NextResponse.json({ error: prepOutcome.error, message: prepOutcome.message }, { status: prepOutcome.status })
  }
  const { bbox, network, startNodeId, targetDistanceM, hasDestination, concerns, environmentPrefs } = prepOutcome.prep
  let rawCandidates = prepOutcome.prep.rawCandidates

  if (!hasDestination) {
    rawCandidates = generateRawCandidatesForLength(network, startNodeId, params.routeType, targetDistanceM)
  }

  console.log(`[route-build] candidati grezzi entro tolleranza: ${rawCandidates.length}`)

  if (rawCandidates.length === 0) {
    await logBuild({ tierReached: 'no_raw_candidates', builtCount: 0 })
    return NextResponse.json({
      candidates: [],
      message: 'Nessun percorso trovato con questi vincoli nella zona scelta — prova una lunghezza diversa o un punto di partenza differente.',
    })
  }

  let candidates: ScoredCandidate[]
  try {
    candidates = await scoreAndEnrichCandidates(rawCandidates.slice(0, ENRICH_CAP), {
      targetDistanceM,
      targetElevationM: params.targetElevationM,
      environmentPrefs,
      concerns,
      desiredPoiTypes: params.desiredPoiTypes,
      bbox,
    })
  } catch (e) {
    console.error('[route-build] scoreAndEnrichCandidates failed:', e)
    await logBuild({ tierReached: 'error', message: 'arricchimento fallito' })
    return NextResponse.json({ error: 'Arricchimento dei percorsi non riuscito, riprova.' }, { status: 502 })
  }

  let retried = false
  // Ritentativo con lunghezze alternative se, senza destinazione, ne sono sopravvissuti troppo
  // pochi — solo se serve (mai per la destinazione, dove l'unico risultato possibile è già quello)
  // e solo se resta abbastanza budget di tempo: i due tentativi girano in parallelo (non in
  // sequenza, come nella prima versione) proprio per non rischiare di superare il tetto di 60s
  // della funzione — un kill della piattaforma a metà non lascia scrivere né una risposta né una
  // riga di log, un fallimento del tutto invisibile che il ritentativo sequenziale rischiava di
  // causare più spesso proprio nei casi (rete rada) in cui scatta più spesso.
  if (!hasDestination && candidates.length < MIN_BUILT_RESULTS) {
    const elapsedMs = Date.now() - startedAt
    if (elapsedMs > BUILD_TIME_BUDGET_MS) {
      console.log(`[route-build] salto il ritentativo: già ${(elapsedMs / 1000).toFixed(1)}s trascorsi`)
    } else {
      retried = true
      console.log(`[route-build] solo ${candidates.length} candidati validi, ritento con lunghezze alternative (in parallelo)`)
      const seen = new Set(candidates.map(candidateSignature))
      const altBatches = await Promise.all(RETRY_DISTANCE_FACTORS.map(async factor => {
        const altDistanceM = Math.min(Math.max(targetDistanceM * factor, MIN_TARGET_DISTANCE_KM * 1000), MAX_TARGET_DISTANCE_KM * 1000)
        const altRaw = generateRawCandidatesForLength(network, startNodeId, params.routeType, altDistanceM)
        if (altRaw.length === 0) return [] as ScoredCandidate[]
        try {
          // Il punteggio resta ancorato all'obiettivo originale, non alla lunghezza del
          // ritentativo — questi candidati sono un ripiego per avere più opzioni, non una nuova
          // richiesta dell'utente.
          return await scoreAndEnrichCandidates(altRaw.slice(0, ENRICH_CAP), {
            targetDistanceM,
            targetElevationM: params.targetElevationM,
            environmentPrefs,
            concerns,
            desiredPoiTypes: params.desiredPoiTypes,
            bbox,
          })
        } catch (e) {
          console.error('[route-build] ritentativo con lunghezza alternativa fallito:', e)
          return [] as ScoredCandidate[]
        }
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
      console.log(`[route-build] dopo ritentativo: ${candidates.length} candidati totali`)
    }
  }

  if (candidates.length === 0) {
    await logBuild({ tierReached: 'no_dtm_coverage', builtCount: 0, retried, details: { rawCount: rawCandidates.length } })
    return NextResponse.json({
      candidates: [],
      message: 'Ho trovato percorsi possibili ma senza copertura del modello altimetrico in questa zona — prova un punto di partenza differente.',
    })
  }

  await logBuild({
    tierReached: retried ? 'retry_built' : 'built',
    builtCount: candidates.length,
    retried,
    details: { rawCount: rawCandidates.length, hasDestination },
  })

  return NextResponse.json({ candidates })
}
