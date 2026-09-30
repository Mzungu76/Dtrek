import { metaHasHikingMetrics, SITE_TYPE_CONFIG, type MetaType, type SiteType } from './metaTypes'
import { formatDuration } from './tcxParser'

// Un solo posto per "quali cifre e quali parole di un Reportage dipendono dalla tipologia" — prima
// ogni schermata (reportage privato, pagina pubblica, anteprima social, elenchi) scriveva per conto
// suo km/D+/durata/calorie e "Escursione", giusti per un Sentiero e vuoti o fuorvianti per un
// Borgo/Città (nessuna distanza da raccontare, solo tappe) o un Sito (nessuna traccia, un solo punto).

export interface ReportFact {
  value: string
  label: string
}

export interface ReportFactsInput {
  metaType?: MetaType
  siteType?: SiteType
  distanceMeters?: number
  elevationGain?: number
  totalTimeSeconds?: number
  calories?: number | null
  avgHeartRate?: number | null
  /** Numero di tappe/luoghi visitati (Borgo/Città: activity.borgoStops). */
  stopsCount?: number
  /** Falso solo per una visita registrata senza check-in GPS valido (lib/visitCompletion.ts). */
  verified?: boolean
}

/** Le cifre della striscia del Reportage, già nell'ordine in cui mostrarle. Vuoto ⇒ il chiamante
 *  nasconde la striscia invece di mostrare una riga di zeri o trattini. */
export function reportFacts(input: ReportFactsInput): ReportFact[] {
  const { metaType, siteType } = input
  const duration = input.totalTimeSeconds && input.totalTimeSeconds > 0 ? formatDuration(input.totalTimeSeconds) : null

  if (metaHasHikingMetrics(metaType)) {
    const facts: ReportFact[] = [
      { value: `${((input.distanceMeters ?? 0) / 1000).toFixed(1)} km`, label: 'Distanza' },
      { value: `+${Math.round(input.elevationGain ?? 0)} m`, label: 'Dislivello' },
      { value: duration ?? '—', label: 'Durata' },
    ]
    if ((input.calories ?? 0) > 0) facts.push({ value: `${input.calories} kcal`, label: 'Calorie' })
    else if ((input.avgHeartRate ?? 0) > 0) facts.push({ value: `${input.avgHeartRate} bpm`, label: 'FC media' })
    return facts
  }

  const facts: ReportFact[] = []
  if (metaType === 'borgo_citta') {
    if ((input.stopsCount ?? 0) > 0) facts.push({ value: String(input.stopsCount), label: input.stopsCount === 1 ? 'Luogo visitato' : 'Luoghi visitati' })
    if (duration) facts.push({ value: duration, label: 'Durata' })
  } else {
    if (siteType) facts.push({ value: SITE_TYPE_CONFIG[siteType].label, label: 'Tipo' })
    if (duration) facts.push({ value: duration, label: 'Durata' })
    if (input.verified !== undefined) facts.push({ value: input.verified ? 'Verificata' : 'Non verificata', label: 'Visita' })
  }
  return facts
}

/** "Escursione" per un Sentiero, "Visita" per Borgo/Città e Sito — solo per le etichette dove la
 *  parola compare da sola (titolo di ripiego, "Cronaca · … #n"). */
export function reportNoun(metaType: MetaType | undefined): string {
  return metaHasHikingMetrics(metaType) ? 'Escursione' : 'Visita'
}

/** Riga testuale per le anteprime (condivisione social, meta description): mai "0.0 km · 0 m". */
export function reportSummaryLine(input: ReportFactsInput): string {
  if (metaHasHikingMetrics(input.metaType)) {
    return `${((input.distanceMeters ?? 0) / 1000).toFixed(1)} km · ${Math.round(input.elevationGain ?? 0)} m di dislivello`
  }
  const parts = reportFacts(input)
    .filter(f => f.label !== 'Visita')
    .map(f => f.label === 'Tipo' ? f.value : `${f.value} ${f.label.toLowerCase()}`.trim())
  return parts.length > 0 ? parts.join(' · ') : (input.metaType === 'borgo_citta' ? 'Visita a un borgo' : 'Visita')
}
