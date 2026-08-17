export interface WildlifeRisk {
  animal: string
  encounterProbability: 'bassa' | 'media' | 'alta'
  dangerLevel: 'basso' | 'moderato' | 'alto'
  tip: string
}

export interface SafetyRiskItem {
  type: 'danger' | 'warning' | 'info'
  text: string
}

export interface SafetyCategory {
  name: string
  score: number
  items: SafetyRiskItem[]
}

export interface SafetyScore {
  overall: number
  label: string
  color: string
  categories: {
    altitude: SafetyCategory
    terrain: SafetyCategory
    exposure: SafetyCategory
    wildlife: SafetyCategory
    logistics: SafetyCategory
  }
  wildlifeRisks: WildlifeRisk[]
  allRisks: SafetyRiskItem[]
  generatedAt: string
}

// Infer geographic region from route polyline center
function inferRegion(polyline?: [number, number][]): string {
  if (!polyline || polyline.length === 0) return 'unknown'

  const mid = Math.floor(polyline.length / 2)
  const [lat, lon] = polyline[mid]

  // Trentino/South Tyrol - brown bear
  if (lat >= 46 && lat <= 47 && lon >= 10 && lon <= 12) return 'trentino'
  // Alps
  if (lat >= 45 && lat <= 47 && lon >= 6 && lon <= 14) return 'alps'
  // Central Apennines - Marsican bear
  if (lat >= 41 && lat <= 43 && lon >= 13 && lon <= 15) return 'apennino-centrale'
  // Tuscany/Emilia Apennines
  if (lat >= 43 && lat <= 44.5 && lon >= 10 && lon <= 13) return 'apennino-nord'
  // Default to generic hills/forest
  return 'colline'
}

// Get wildlife risks based on region, altitude, and season
function getWildlifeRisks(region: string, altitudeMax: number, month: number): WildlifeRisk[] {
  const risks: WildlifeRisk[] = []
  const isSpringOrFall = month >= 3 && month <= 5 || month >= 9 && month <= 11
  const isSummer = month >= 6 && month <= 8
  const isWinter = month >= 12 || month <= 2

  if (region === 'trentino') {
    // Brown bear - rare but very dangerous
    risks.push({
      animal: 'Orso bruno',
      encounterProbability: isSummer ? 'media' : 'bassa',
      dangerLevel: 'alto',
      tip: 'Fai rumore mentre cammini, non avvicinarti se ne vedi uno, porta campanelli',
    })
    // Wolves
    risks.push({
      animal: 'Lupo',
      encounterProbability: 'bassa',
      dangerLevel: 'moderato',
      tip: 'Molto raro incontrare lupi; non approcciare se ne vedi uno',
    })
  }

  if (region === 'alps') {
    // Vipers (common)
    if (altitudeMax < 2500) {
      risks.push({
        animal: 'Vipera',
        encounterProbability: isSummer ? 'media' : 'bassa',
        dangerLevel: 'moderato',
        tip: 'Stai attento dove metti i piedi e le mani; indossa stivali robusti',
      })
    }
    // Eagle (beautiful but not aggressive)
    risks.push({
      animal: 'Aquila reale',
      encounterProbability: 'bassa',
      dangerLevel: 'basso',
      tip: 'Non una minaccia; non disturbare nidi o giovani',
    })
    // Chamois, ibex (not dangerous, just wildlife)
    risks.push({
      animal: 'Camoscio / Stambecco',
      encounterProbability: 'media',
      dangerLevel: 'basso',
      tip: 'Animali schivi; mantieni distanza per fotografie',
    })
  }

  if (region === 'apennino-centrale') {
    // Marsican bear (rarest)
    risks.push({
      animal: 'Orso marsicano',
      encounterProbability: 'bassa',
      dangerLevel: 'alto',
      tip: 'Estremamente raro; fai rumore, non approcciare',
    })
    // Wolves
    risks.push({
      animal: 'Lupo appenninico',
      encounterProbability: 'bassa',
      dangerLevel: 'moderato',
      tip: 'Evita di lasciare cibo, non approcciare',
    })
    // Vipers
    if (altitudeMax < 2000) {
      risks.push({
        animal: 'Vipera',
        encounterProbability: isSummer ? 'media' : 'bassa',
        dangerLevel: 'moderato',
        tip: 'Stai attento, indossa stivali robusti in aree basse',
      })
    }
  }

  if (region === 'apennino-nord') {
    // Wolves
    risks.push({
      animal: 'Lupo',
      encounterProbability: 'bassa',
      dangerLevel: 'moderato',
      tip: 'Raro incontrare lupi; non approcciare se ne vedi uno',
    })
    // Wild boar
    if (!isWinter) {
      risks.push({
        animal: 'Cinghiale',
        encounterProbability: isSummer ? 'media' : 'bassa',
        dangerLevel: 'moderato',
        tip: 'Se vedi una femmina con piccoli, allontanati lentamente senza correre',
      })
    }
  }

  if (region === 'colline') {
    // Wild boar (common in foothills/forests)
    if (!isWinter) {
      risks.push({
        animal: 'Cinghiale',
        encounterProbability: isSummer || isSpringOrFall ? 'media' : 'bassa',
        dangerLevel: 'moderato',
        tip: 'Se vedi una femmina con piccoli, allontanati lentamente',
      })
    }
    // Vipers
    if (isSummer) {
      risks.push({
        animal: 'Vipera',
        encounterProbability: 'bassa',
        dangerLevel: 'moderato',
        tip: 'Stai attento, indossa stivali; morso raro ma serio',
      })
    }
    // Roe deer, foxes (not dangerous)
    risks.push({
      animal: 'Capriolo / Volpe',
      encounterProbability: 'media',
      dangerLevel: 'basso',
      tip: 'Animali schivi; non una minaccia',
    })
  }

  // Ticks (universal in warm season)
  if (isSummer || isSpringOrFall) {
    risks.push({
      animal: 'Zecche',
      encounterProbability: 'media',
      dangerLevel: 'basso',
      tip: 'Controlla la pelle; rimuovi con pinzetta, non schiacciare; rischio Lyme',
    })
  }

  return risks
}

// Pesi delle 5 categorie nella media pesata di overall — esportati (non più una costante privata
// dentro computeSafetyScore) così refineSafetyWithTerrainSignals può ricalcolare l'overall con lo
// stesso identico criterio quando corregge solo il Terreno, invece di duplicare i numeri altrove.
export const SAFETY_CATEGORY_WEIGHTS = {
  altitude: 0.25,
  terrain: 0.2,
  exposure: 0.2,
  wildlife: 0.15,
  logistics: 0.2,
}

// 10 fasce da 10 punti l'una per la Sicurezza Oggettiva — a differenza del Trail Score, qui il
// linguaggio resta impersonale/neutro (non "per te"): questo numero non sa nulla dell'utente,
// vedi lib/personalSafetyFit.ts per la parte "Idoneità per te" che lo personalizza.
export function objectiveSafetyLabel(score: number): { label: string; color: string } {
  if (score >= 90) return { label: 'Pericolo pressoché nullo', color: '#059669' }
  if (score >= 80) return { label: 'Rischio molto basso',      color: '#10b981' }
  if (score >= 70) return { label: 'Rischio basso',             color: '#22c55e' }
  if (score >= 60) return { label: 'Rischio contenuto',         color: '#84cc16' }
  if (score >= 50) return { label: 'Rischio moderato',          color: '#eab308' }
  if (score >= 40) return { label: 'Rischio considerevole',     color: '#f59e0b' }
  if (score >= 30) return { label: 'Rischio elevato',           color: '#f97316' }
  if (score >= 20) return { label: 'Rischio alto',              color: '#ef4444' }
  if (score >= 10) return { label: 'Rischio molto alto',        color: '#dc2626' }
  return               { label: 'Rischio estremo',              color: '#991b1b' }
}

// Severità stimata dalla pendenza reale DTM (Horn) — dal picco (maxSlopeDeg), non dalla media:
// un tratto corto e verticale annegato in un profilo altrimenti dolce sposta a malapena la media,
// ma il picco lo rivela. Stesse soglie fisiche di lib/trailScore.ts's slopeTerrainMult, lette qui
// come pericolo tecnico/esposizione invece che come moltiplicatore di fatica — un tratto molto
// ripido è anche quello dove più probabilmente serve mettere le mani, non solo il fiato.
function slopeHazardScore(maxSlopeDeg: number): number {
  if (maxSlopeDeg >= 40) return 20
  if (maxSlopeDeg >= 30) return 40
  if (maxSlopeDeg >= 20) return 60
  if (maxSlopeDeg >= 10) return 80
  return 90
}

// Scala SAC (Club Alpino Svizzero, T1-T6) — stima informata delle soglie di pericolo per fascia,
// non derivata da uno studio: T1/T2 sono sentiero escursionistico ordinario, T3 introduce
// esposizione/uso occasionale delle mani, T4+ è terreno da ferrata/attrezzato (spesso richiede
// equipaggiamento specifico: imbrago, set da ferrata) — oggettivamente pericoloso per un
// escursionista non attrezzato indipendentemente da quanto sia corto il tratto. Stesso ordine già
// usato per estrarre il valore reale in lib/overpass.ts's fetchTerrainContext.
const SAC_SCALE_ORDER = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6']
const SAC_SCALE_HAZARD: Record<string, number> = { T1: 95, T2: 85, T3: 60, T4: 30, T5: 12, T6: 5 }

function sacScaleHazardScore(sacScale: string): number | null {
  return SAC_SCALE_ORDER.includes(sacScale) ? SAC_SCALE_HAZARD[sacScale] : null
}

export interface TerrainHazardSignals {
  /** Picco di pendenza reale lungo il tracciato (lib/dtm/trailDtmProfile.ts's TrailDtmProfile.maxSlopeDeg). */
  maxSlopeDeg?: number
  /** Scala SAC massima reale rilevata sul tracciato via tag OSM (lib/overpass.ts's fetchTerrainContext, T1-T6). */
  sacScale?: string
}

/**
 * Corregge il punteggio Terreno con segnali di tecnicità reale — pendenza di picco (DTM) e/o
 * scala SAC (OSM) — presi nel peggiore fra tutti quelli disponibili insieme al D-score già
 * calcolato — mai compensabile, come il gate di trailScoreV2. Nessun segnale disponibile ⇒
 * ritorna `safety` invariato.
 *
 * Perché serve: il D-score di Terreno (√(2×dislivello×km)) è in pratica una misura di fatica
 * fisica, non di tecnicità — una ferrata corta ma esposta ha poco dislivello e poca distanza,
 * quindi D-score basso ⇒ "Terreno sicuro al 90%" anche quando il pericolo reale è alto.
 */
export function refineSafetyWithTerrainSignals(safety: SafetyScore, signals: TerrainHazardSignals): SafetyScore {
  const hazards: { value: number; reason: string }[] = []
  if (signals.maxSlopeDeg != null) {
    hazards.push({ value: slopeHazardScore(signals.maxSlopeDeg), reason: `Pendenza massima reale rilevata: ${Math.round(signals.maxSlopeDeg)}° — corretto per tecnicità del terreno` })
  }
  if (signals.sacScale != null) {
    const hazard = sacScaleHazardScore(signals.sacScale)
    if (hazard != null) hazards.push({ value: hazard, reason: `Scala di difficoltà escursionistica (SAC) ${signals.sacScale} rilevata sul tracciato — terreno alpinistico/attrezzato` })
  }
  if (hazards.length === 0) return safety

  const worst = hazards.reduce((a, b) => (b.value < a.value ? b : a))
  const refinedTerrainScore = Math.min(safety.categories.terrain.score, worst.value)
  if (refinedTerrainScore === safety.categories.terrain.score) return safety

  const w = SAFETY_CATEGORY_WEIGHTS
  const overall = Math.round(
    safety.categories.altitude.score * w.altitude +
    refinedTerrainScore * w.terrain +
    safety.categories.exposure.score * w.exposure +
    safety.categories.wildlife.score * w.wildlife +
    safety.categories.logistics.score * w.logistics
  )
  const { label, color } = objectiveSafetyLabel(overall)
  const terrainItem: SafetyRiskItem = { type: 'danger', text: worst.reason }

  return {
    ...safety,
    overall,
    label,
    color,
    categories: {
      ...safety.categories,
      terrain: {
        ...safety.categories.terrain,
        score: refinedTerrainScore,
        items: [...safety.categories.terrain.items, terrainItem],
      },
    },
    allRisks: [...safety.allRisks, terrainItem],
  }
}

export function computeSafetyScore(params: {
  distanceMeters: number
  elevationGain: number
  elevationLoss: number
  altitudeMax: number
  altitudeMin: number
  estimatedTimeSeconds: number
  routePolyline?: [number, number][]
  plannedDate?: string
  /** Extra wildlife risks from real GBIF observations along the route (Galleria Animali data), merged into the static per-region table. */
  gbifWildlifeRisks?: WildlifeRisk[]
  /** Livestock guardian dog risk estimated from OSM pasture/sheepfold tags along the route. */
  guardianDogRisk?: { present: boolean }
}): SafetyScore {
  const {
    distanceMeters,
    elevationGain,
    elevationLoss,
    altitudeMax,
    altitudeMin,
    estimatedTimeSeconds,
    routePolyline,
    plannedDate,
    gbifWildlifeRisks,
    guardianDogRisk,
  } = params

  const distKm = distanceMeters / 1000
  const durationHours = estimatedTimeSeconds / 3600

  // Get month from plannedDate (1-12)
  let month = new Date().getMonth() + 1
  if (plannedDate) {
    const d = new Date(plannedDate)
    if (!isNaN(d.getTime())) {
      month = d.getMonth() + 1
    }
  }

  const region = inferRegion(routePolyline)

  // ── Altitude (25%) ────────────────────────────────────────────────────────
  let altScore = 95
  let altItems: SafetyRiskItem[] = []

  if (altitudeMax >= 3500) {
    altScore = 15
    altItems.push({
      type: 'danger',
      text: `Quota molto alta (${Math.round(altitudeMax)} m): acclimatazione necessaria, mal di montagna grave`,
    })
  } else if (altitudeMax >= 3000) {
    altScore = 35
    altItems.push({
      type: 'danger',
      text: `Quota elevata (${Math.round(altitudeMax)} m): rischio AMS, salita graduale`,
    })
  } else if (altitudeMax >= 2500) {
    altScore = 55
    altItems.push({
      type: 'warning',
      text: `Quota media-alta (${Math.round(altitudeMax)} m): monitora sintomi AMS`,
    })
  } else if (altitudeMax >= 2000) {
    altScore = 70
    altItems.push({
      type: 'info',
      text: `Quota ${Math.round(altitudeMax)} m: tempo meteo variabile, consulta previsioni`,
    })
  } else if (altitudeMax >= 1500) {
    altScore = 85
  }

  // ── Terrain (20%) ─────────────────────────────────────────────────────────
  const dScore = Math.sqrt(2 * Math.max(0, elevationGain) * Math.max(0, distKm))
  let terrainScore = 90
  let terrainItems: SafetyRiskItem[] = []

  if (dScore < 50) {
    terrainScore = 90
  } else if (dScore < 150) {
    terrainScore = 75
    terrainItems.push({
      type: 'info',
      text: `Difficoltà moderata (D=${Math.round(dScore)})`,
    })
  } else if (dScore < 300) {
    terrainScore = 55
    terrainItems.push({
      type: 'warning',
      text: `Difficoltà elevata (D=${Math.round(dScore)}): terreno impegnativo`,
    })
  } else {
    terrainScore = 30
    terrainItems.push({
      type: 'danger',
      text: `Difficoltà estrema (D=${Math.round(dScore)}): alpinismo, attrezzatura necessaria`,
    })
  }

  if (elevationLoss > 1500) {
    terrainScore = Math.max(0, terrainScore - 15)
    terrainItems.push({
      type: 'warning',
      text: `Dislivello discesa elevato (${Math.round(elevationLoss)} m): rischio articolazioni, freni usurati`,
    })
  }

  // ── Exposure (20%) ────────────────────────────────────────────────────────
  let exposureScore = 90
  let exposureItems: SafetyRiskItem[] = []

  if (durationHours < 4) {
    exposureScore = 90
  } else if (durationHours < 8) {
    exposureScore = 75
    exposureItems.push({
      type: 'info',
      text: `Escursione moderata (${durationHours.toFixed(1)}h): partenza al mattino`,
    })
  } else if (durationHours < 12) {
    exposureScore = 55
    exposureItems.push({
      type: 'warning',
      text: `Escursione lunga (${durationHours.toFixed(1)}h): partenza presto, margine di luce`,
    })
  } else {
    exposureScore = 35
    exposureItems.push({
      type: 'danger',
      text: `Escursione molto lunga (${durationHours.toFixed(1)}h): rischio pernottamento imprevisto`,
    })
  }

  // Seasonal adjustments
  if ((month >= 7 && month <= 8) || (month >= 1 && month <= 2)) {
    exposureScore = Math.max(0, exposureScore - 10)
    if (month >= 7 && month <= 8) {
      exposureItems.push({
        type: 'warning',
        text: 'Estate: rischio temporali pomeridiani in montagna',
      })
    } else {
      exposureItems.push({
        type: 'warning',
        text: 'Inverno: poche ore di luce, neve, pericolo valanghe',
      })
    }
  }

  // ── Wildlife (15%) ────────────────────────────────────────────────────────
  const baseWildlifeRisks = getWildlifeRisks(region, altitudeMax, month)

  // Merge real GBIF observations (Galleria Animali) into the static table, dedup by name.
  const wildlifeByName = new Map(baseWildlifeRisks.map(w => [w.animal, w]))
  for (const risk of gbifWildlifeRisks ?? []) {
    const existing = wildlifeByName.get(risk.animal)
    if (!existing || (risk.dangerLevel === 'alto' && existing.dangerLevel !== 'alto')) {
      wildlifeByName.set(risk.animal, risk)
    }
  }

  // Guardian dogs (pastore maremmano-abruzzese) at sheep pastures, estimated from OSM.
  if (guardianDogRisk?.present) {
    wildlifeByName.set('Cane da guardiania (pastore maremmano)', {
      animal: 'Cane da guardiania (pastore maremmano)',
      encounterProbability: 'media',
      dangerLevel: 'moderato',
      tip: 'Non avvicinarti al gregge, non correre, allontanati lateralmente con calma, non guardare il cane negli occhi',
    })
  }

  const wildlifeRisks = Array.from(wildlifeByName.values())
  let wildlifeScore = 85
  let wildlifeItems: SafetyRiskItem[] = []

  // Was `!== 'alta'`, which backwards-excluded the animals most likely to actually be
  // encountered from the high-danger bucket instead of flagging them — only 'bassa'
  // (low encounter probability) should be excluded here.
  const hasHighDangerWildlife = wildlifeRisks.some(
    w => w.dangerLevel === 'alto' && w.encounterProbability !== 'bassa'
  )
  const hasModDangerWildlife = wildlifeRisks.some(
    w => w.dangerLevel === 'moderato' && w.encounterProbability === 'media'
  )

  if (hasHighDangerWildlife) {
    wildlifeScore = 55
    wildlifeItems.push({
      type: 'warning',
      text: 'Zona con fauna pericolosa: fai rumore, porta campanelli',
    })
  } else if (hasModDangerWildlife) {
    wildlifeScore = 70
    wildlifeItems.push({
      type: 'info',
      text: 'Fauna locale presente: mantieni distanza, non avvicinare',
    })
  } else {
    wildlifeScore = 85
  }

  // ── Logistics (20%) ───────────────────────────────────────────────────────
  let logisticsScore = 85
  let logisticsItems: SafetyRiskItem[] = []

  if (altitudeMax > 2500) {
    logisticsScore -= 20
    logisticsItems.push({
      type: 'warning',
      text: `Quota ${Math.round(altitudeMax)} m: soccorso difficile, comunica itinerario`,
    })
  }
  if (distKm > 20) {
    logisticsScore -= 10
    logisticsItems.push({
      type: 'info',
      text: `Percorso lungo (${distKm.toFixed(1)} km): autonomia necessaria, scorte idriche`,
    })
  }
  if (durationHours > 10) {
    logisticsScore -= 15
    logisticsItems.push({
      type: 'warning',
      text: `Percorso > 10h: rischio pernottamento, torcia, sacco emergenza`,
    })
  }
  if (altitudeMax > 2500 && distKm > 15) {
    logisticsScore -= 15
    logisticsItems.push({
      type: 'warning',
      text: 'Alta quota + lunga distanza: GPS, mappa cartacea, PEL emergenza',
    })
  }

  logisticsScore = Math.max(0, Math.min(100, logisticsScore))

  // ── Weighted average ──────────────────────────────────────────────────────
  const overall = Math.round(
    altScore * SAFETY_CATEGORY_WEIGHTS.altitude +
    terrainScore * SAFETY_CATEGORY_WEIGHTS.terrain +
    exposureScore * SAFETY_CATEGORY_WEIGHTS.exposure +
    wildlifeScore * SAFETY_CATEGORY_WEIGHTS.wildlife +
    logisticsScore * SAFETY_CATEGORY_WEIGHTS.logistics
  )

  const { label, color } = objectiveSafetyLabel(overall)

  // ── Compile all risks ─────────────────────────────────────────────────────
  const allRisks: SafetyRiskItem[] = [
    ...altItems,
    ...terrainItems,
    ...exposureItems,
    ...wildlifeItems,
    ...logisticsItems,
  ]

  return {
    overall,
    label,
    color,
    categories: {
      altitude: {
        name: 'Quota',
        score: altScore,
        items: altItems,
      },
      terrain: {
        name: 'Terreno',
        score: terrainScore,
        items: terrainItems,
      },
      exposure: {
        name: 'Esposizione',
        score: exposureScore,
        items: exposureItems,
      },
      wildlife: {
        name: 'Fauna',
        score: wildlifeScore,
        items: wildlifeItems,
      },
      logistics: {
        name: 'Logistica',
        score: logisticsScore,
        items: logisticsItems,
      },
    },
    wildlifeRisks,
    allRisks,
    generatedAt: new Date().toISOString(),
  }
}
