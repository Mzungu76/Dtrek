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

export function computeSafetyScore(params: {
  distanceMeters: number
  elevationGain: number
  elevationLoss: number
  altitudeMax: number
  altitudeMin: number
  estimatedTimeSeconds: number
  routePolyline?: [number, number][]
  plannedDate?: string
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
  const wildlifeRisks = getWildlifeRisks(region, altitudeMax, month)
  let wildlifeScore = 85
  let wildlifeItems: SafetyRiskItem[] = []

  const hasHighDangerWildlife = wildlifeRisks.some(
    w => w.dangerLevel === 'alto' && w.encounterProbability !== 'alta'
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
  const weights = {
    altitude: 0.25,
    terrain: 0.2,
    exposure: 0.2,
    wildlife: 0.15,
    logistics: 0.2,
  }

  const overall = Math.round(
    altScore * weights.altitude +
    terrainScore * weights.terrain +
    exposureScore * weights.exposure +
    wildlifeScore * weights.wildlife +
    logisticsScore * weights.logistics
  )

  // ── Label and color ───────────────────────────────────────────────────────
  let label = 'Sconosciuto'
  let color = '#666666'

  if (overall >= 80) {
    label = 'Sicuro'
    color = '#10b981'
  } else if (overall >= 60) {
    label = 'Basso rischio'
    color = '#22c55e'
  } else if (overall >= 40) {
    label = 'Moderato'
    color = '#f59e0b'
  } else if (overall >= 20) {
    label = 'Elevato'
    color = '#f97316'
  } else {
    label = 'Pericoloso'
    color = '#ef4444'
  }

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
