// Tratti difficili segnalati nei file GPX importati (Komoot/AllTrails) —
// estrazione e classificazione di waypoint/commenti del tracciato che
// menzionano un pericolo o una criticità. Nessun ML: solo matching su una
// lista di parole chiave estendibile, in linea con il resto del codice SI
// (regole esplicite, non modelli).

export type DifficultySeverity = 'info' | 'warning' | 'danger'

export interface DifficultyMarkerCandidate {
  lat: number
  lon: number
  text: string
  source: 'gpx_waypoint' | 'gpx_track_cmt'
}

export interface ClassifiedDifficultyMarker extends DifficultyMarkerCandidate {
  severity: DifficultySeverity
  keywords: string[]
}

interface KeywordRule {
  pattern: RegExp
  severity: DifficultySeverity
}

const KEYWORD_RULES: KeywordRule[] = [
  // danger — tratti potenzialmente pericolosi o impraticabili
  { pattern: /\b(frana|crollo|crollat[oa]|smottamento|landslide|rockfall|caduta\s*sassi)\b/i, severity: 'danger' },
  { pattern: /\b(esposto|esposizione|exposed|exposure|precipizio|strapiombo|cliff)\b/i, severity: 'danger' },
  { pattern: /\b(ghiacci[oa]t[oa]|ghiaccio|icy|ice|crepacci[oa]|crevasse)\b/i, severity: 'danger' },
  { pattern: /\b(pericolos[oa]|pericolo|danger(ous)?|hazard(ous)?)\b/i, severity: 'danger' },
  { pattern: /\b(alluvionat[oa]|inondat[oa]|flood(ed)?)\b/i, severity: 'danger' },
  // warning — criticità da affrontare con attenzione
  { pattern: /\b(attenzione|caution|warning|cautela)\b/i, severity: 'warning' },
  { pattern: /\b(sentiero\s*interrotto|tratto\s*interrotto|trail\s*closed|closed\s*trail)\b/i, severity: 'warning' },
  { pattern: /\b(scivolos[oa]|slippery|fangos[oa]|muddy|fango|mud)\b/i, severity: 'warning' },
  { pattern: /\b(segnaletica\s*(assente|scarsa|mancante)|poorly\s*marked|unmarked)\b/i, severity: 'warning' },
  { pattern: /\b(esposto\s*al\s*vento|ventos[oa]|windy)\b/i, severity: 'warning' },
  { pattern: /\b(guado|river\s*crossing|attraversamento\s*(fiume|torrente))\b/i, severity: 'warning' },
  // info — note utili ma non critiche
  { pattern: /\b(vista|panoram[ai]c[oa]|viewpoint|panorama)\b/i, severity: 'info' },
]

/**
 * Classifica un testo di waypoint/commento GPX. Restituisce null se non
 * contiene nessuna parola chiave nota — la maggior parte dei waypoint
 * Komoot/AllTrails sono punti di interesse neutri (parcheggio, fontana...)
 * e non devono diventare segnalazioni.
 */
export function classifyDifficultyText(text: string): { severity: DifficultySeverity; keywords: string[] } | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  const matched: string[] = []
  let worst: DifficultySeverity | null = null
  const rank: Record<DifficultySeverity, number> = { info: 0, warning: 1, danger: 2 }

  for (const rule of KEYWORD_RULES) {
    const m = trimmed.match(rule.pattern)
    if (!m) continue
    matched.push(m[0])
    if (worst === null || rank[rule.severity] > rank[worst]) worst = rule.severity
  }

  if (worst === null) return null
  return { severity: worst, keywords: matched }
}

export function classifyMarkers(candidates: DifficultyMarkerCandidate[]): ClassifiedDifficultyMarker[] {
  const out: ClassifiedDifficultyMarker[] = []
  for (const c of candidates) {
    const classified = classifyDifficultyText(c.text)
    if (!classified) continue
    out.push({ ...c, ...classified })
  }
  return out
}
