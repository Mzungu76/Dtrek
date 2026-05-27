import type { ActivityMeta } from './blobStore'

export interface AssessmentItem {
  type: 'danger' | 'warning' | 'info'
  text: string
}

export interface HikeAssessment {
  difficulty:       'facile' | 'moderata' | 'impegnativa' | 'estrema'
  suitabilityScore: number   // 0–100
  risks:            AssessmentItem[]
  suggestions:      AssessmentItem[]
  userContext: {
    avgDistanceKm:  number
    avgElevationM:  number
    maxDistanceKm:  number
    maxElevationM:  number
    activityCount:  number
    vsAvgDistPct:   number   // planned / user-avg × 100
    vsAvgElevPct:   number
  }
  generatedAt: string
}

// D = sqrt(2 × elev_m × dist_km) — classic trail difficulty index
function trailScore(distKm: number, elevGain: number): number {
  return Math.sqrt(2 * Math.max(0, elevGain) * Math.max(0, distKm))
}

export function assessHike(
  distanceMeters: number,
  elevationGain: number,
  altitudeMax: number,
  activities: ActivityMeta[],
): HikeAssessment {
  const distKm = distanceMeters / 1000
  const n = activities.length

  const avgDistKm   = n > 0 ? activities.reduce((s, a) => s + a.distanceMeters / 1000, 0) / n : 0
  const avgElevGain = n > 0 ? activities.reduce((s, a) => s + a.elevationGain, 0) / n : 0
  const maxDistKm   = n > 0 ? Math.max(...activities.map(a => a.distanceMeters / 1000)) : 0
  const maxElevGain = n > 0 ? Math.max(...activities.map(a => a.elevationGain)) : 0

  // Difficulty
  const score = trailScore(distKm, elevationGain)
  const difficulty: HikeAssessment['difficulty'] =
    score < 50 ? 'facile' : score < 150 ? 'moderata' : score < 300 ? 'impegnativa' : 'estrema'

  // Suitability 0–100
  let suit = 80
  if (n === 0) {
    suit = 55
  } else {
    const dr = maxDistKm   > 0 ? distKm        / maxDistKm   : 1
    const er = maxElevGain > 0 ? elevationGain  / maxElevGain : 1
    if (dr > 2.0) suit -= 25; else if (dr > 1.5) suit -= 15; else if (dr > 1.2) suit -= 5
    if (er > 2.0) suit -= 25; else if (er > 1.5) suit -= 15; else if (er > 1.2) suit -= 5
    if (altitudeMax > 3500) suit -= 15
    else if (altitudeMax > 3000) suit -= 8
    else if (altitudeMax > 2500) suit -= 3
    if (dr <= 1.1 && er <= 1.1) suit += 10
  }
  const suitabilityScore = Math.max(0, Math.min(100, Math.round(suit)))

  const risks: AssessmentItem[] = []
  const suggestions: AssessmentItem[] = []

  // ── Risks ─────────────────────────────────────────────────────────────────
  if (n === 0) {
    risks.push({ type: 'info', text: 'Nessuna escursione registrata: valutazione basata su parametri assoluti, non sul tuo storico personale' })
  }

  if (altitudeMax >= 3500) {
    risks.push({ type: 'danger', text: `Quota molto alta (${Math.round(altitudeMax)} m slm): acclimatazione necessaria, rischio serio di mal di montagna` })
  } else if (altitudeMax >= 3000) {
    risks.push({ type: 'warning', text: `Quota elevata (${Math.round(altitudeMax)} m slm): possibile mal di montagna, risali gradualmente` })
  } else if (altitudeMax >= 2500) {
    risks.push({ type: 'info', text: `Quota media-alta (${Math.round(altitudeMax)} m slm): monitora eventuali sintomi da quota` })
  }

  if (n > 0 && maxDistKm > 0) {
    const dr = distKm / maxDistKm
    if (dr >= 2) {
      risks.push({ type: 'danger', text: `Distanza ${distKm.toFixed(1)} km — ${Math.round(dr)}× il tuo record personale (${maxDistKm.toFixed(1)} km)` })
    } else if (dr >= 1.3) {
      risks.push({ type: 'warning', text: `Distanza superiore al tuo record personale di ${maxDistKm.toFixed(1)} km` })
    }
  }

  if (n > 0 && maxElevGain > 0) {
    const er = elevationGain / maxElevGain
    if (er >= 2) {
      risks.push({ type: 'danger', text: `Dislivello ${Math.round(elevationGain)} m D+ — ${Math.round(er)}× il tuo record personale (${Math.round(maxElevGain)} m)` })
    } else if (er >= 1.3) {
      risks.push({ type: 'warning', text: `Dislivello superiore al tuo record personale di ${Math.round(maxElevGain)} m D+` })
    }
  }

  if (distKm > 30) {
    risks.push({ type: 'warning', text: 'Percorso lungo: pianifica le soste e porta scorte energetiche sufficienti' })
  }
  if (elevationGain > 1500) {
    risks.push({ type: 'warning', text: `Dislivello elevato (${Math.round(elevationGain)} m D+): ottimizza il peso dello zaino` })
  }

  // ── Suggestions ────────────────────────────────────────────────────────────
  const waterL = Math.max(1.5, Math.round((distKm / 8) * 10) / 10 + (elevationGain > 500 ? 0.5 : 0))
  suggestions.push({ type: 'info', text: `Porta almeno ${waterL.toFixed(1)} L di acqua` })

  if (altitudeMax > 2000) {
    suggestions.push({ type: 'info', text: 'Consulta le previsioni meteo in quota prima di partire: il tempo cambia rapidamente' })
  }
  if (distKm > 15 || elevationGain > 800) {
    suggestions.push({ type: 'info', text: 'Parti al mattino presto per avere un ampio margine di ore di luce' })
  }
  if (n > 0 && (distKm > avgDistKm * 1.5 || elevationGain > avgElevGain * 1.5)) {
    suggestions.push({ type: 'info', text: 'Fai 2–3 uscite preparatorie con distanza/dislivello intermedi nelle settimane precedenti' })
  }
  if (difficulty === 'impegnativa' || difficulty === 'estrema') {
    suggestions.push({ type: 'info', text: 'Scegli calzature con buon grip e supporto alla caviglia (scarponi da trekking)' })
  }
  if (altitudeMax > 2500) {
    suggestions.push({ type: 'info', text: 'Porta strati termici: la temperatura cala di ~6.5 °C ogni 1000 m di quota' })
  }
  if (n > 0 && suitabilityScore < 50) {
    suggestions.push({ type: 'info', text: 'Considera di affrontare prima escursioni intermedie per costruire la forma fisica adeguata' })
  }

  const vsAvgDistPct = avgDistKm  > 0 ? Math.round((distKm       / avgDistKm)  * 100) : 0
  const vsAvgElevPct = avgElevGain > 0 ? Math.round((elevationGain / avgElevGain) * 100) : 0

  return {
    difficulty,
    suitabilityScore,
    risks,
    suggestions,
    userContext: {
      avgDistanceKm:  Math.round(avgDistKm  * 10) / 10,
      avgElevationM:  Math.round(avgElevGain),
      maxDistanceKm:  Math.round(maxDistKm  * 10) / 10,
      maxElevationM:  Math.round(maxElevGain),
      activityCount:  n,
      vsAvgDistPct,
      vsAvgElevPct,
    },
    generatedAt: new Date().toISOString(),
  }
}
