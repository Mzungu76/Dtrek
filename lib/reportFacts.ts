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

/** Escursioni (Reportage con metriche di cammino) e visite (Borgo/Città e Sito) di un elenco: nei
 *  totali di un Diario/Raccolta/profilo pubblico le due cose si contano a parte — "12 escursioni ·
 *  3 visite" — perché i chilometri e il dislivello sono solo delle prime. */
export function entryCounts(entries: { metaType?: MetaType }[]): { hikes: number; visits: number } {
  const hikes = entries.filter(e => metaHasHikingMetrics(e.metaType)).length
  return { hikes, visits: entries.length - hikes }
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** "12 escursioni · 3 visite" — senza la parte a zero; "0 escursioni" se l'elenco è vuoto. */
export function entryCountsLabel(counts: { hikes: number; visits: number }): string {
  const parts = [
    counts.hikes > 0 ? plural(counts.hikes, 'escursione', 'escursioni') : null,
    counts.visits > 0 ? plural(counts.visits, 'visita', 'visite') : null,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : '0 escursioni'
}

/** Le cifre di testata di un Diario/Raccolta pubblico: escursioni, visite, chilometri e dislivello —
 *  solo quelle che esistono (un Diario di sole visite non ha chilometri da mostrare). */
export function entryHeadlineStats(
  counts: { hikes: number; visits: number },
  totalKm: number,
  totalElevationGain: number,
  labels: { km: string; elevation: string } = { km: 'percorsi', elevation: 'dislivello+' },
): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = []
  if (counts.hikes > 0 || counts.visits === 0) out.push({ value: String(counts.hikes), label: counts.hikes === 1 ? 'escursione' : 'escursioni' })
  if (counts.visits > 0) out.push({ value: String(counts.visits), label: counts.visits === 1 ? 'visita' : 'visite' })
  if (counts.hikes > 0) {
    out.push({ value: `${totalKm.toFixed(0)} km`, label: labels.km })
    out.push({ value: `${Math.round(totalElevationGain).toLocaleString('it')} m`, label: labels.elevation })
  }
  return out
}
