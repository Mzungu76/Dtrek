import { SITE_TYPE_CONFIG, type MetaType, type SiteType } from './metaTypes'

// Punti di ancoraggio del questionario di un Reportage per un Borgo/Città o un Sito — l'analogo di
// buildAltimetryAnchors/buildPoiAnchors (app/api/questionnaire/route.ts) per un Sentiero, che si
// appoggia a una traccia GPS (partenza, punto più alto, salita...) inesistente per una visita.
// `progress` qui è l'ordine nella visita (0 = arrivo, 1 = fine), non una posizione lungo un tracciato.

export interface VisitAnchor {
  type: 'start' | 'poi' | 'end'
  label: string
  progress: number
  detail?: string
  anchorRef?: string
}

export interface VisitStop {
  id: string
  name: string
  description?: string
  siteType?: SiteType
}

const MAX_STOPS = 6
const DETAIL_CHARS = 140

function short(text: string | undefined): string | undefined {
  const t = text?.trim()
  if (!t) return undefined
  return t.length <= DETAIL_CHARS ? t : `${t.slice(0, DETAIL_CHARS).replace(/\s+\S*$/, '')}…`
}

/** Sempre almeno arrivo e chiusura, così una visita senza tappe né foto ha comunque di che
 *  chiedere (mai l'errore "nessun punto di ancoraggio" pensato per un sentiero senza traccia).
 *  Borgo/Città: i veri luoghi visitati (activity.borgoStops) nel mezzo, in ordine di visita.
 *  Sito: un'ancora sul luogo stesso, con il suo tipo. */
export function buildVisitAnchors(input: {
  metaType: MetaType
  title: string
  siteType?: SiteType
  stops?: VisitStop[]
}): VisitAnchor[] {
  const isBorgo = input.metaType === 'borgo_citta'
  const anchors: VisitAnchor[] = [
    { type: 'start', label: isBorgo ? 'L\'arrivo nel borgo' : 'L\'arrivo e la prima impressione', progress: 0 },
  ]

  if (isBorgo) {
    const stops = (input.stops ?? []).slice(0, MAX_STOPS)
    stops.forEach((s, i) => anchors.push({
      type:      'poi',
      label:     s.name,
      progress:  (i + 1) / (stops.length + 1),
      detail:    [s.siteType ? SITE_TYPE_CONFIG[s.siteType].label : null, short(s.description)].filter(Boolean).join(' — ') || undefined,
      anchorRef: s.id,
    }))
  } else {
    anchors.push({
      type:     'poi',
      label:    input.title,
      progress: 0.5,
      detail:   input.siteType ? SITE_TYPE_CONFIG[input.siteType].label : undefined,
    })
  }

  anchors.push({ type: 'end', label: 'Prima di andare via', progress: 1 })
  return anchors
}
