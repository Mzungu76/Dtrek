// Scoperta dei cammini (docs/piano-cammini.md, Fase 2 → "tutti i cammini d'Italia"): da un elenco
// di relazioni OSM a piedi di rete nazionale/internazionale, decide quali sono davvero cammini.
// Logica pura (nessuna rete), testata su fixture — come la scoperta dei sentieri è automatica, ma
// qui con una soglia di ammissione: un cammino è raro e importante, un sentiero locale no.

export interface DiscoveryRelation {
  id: number
  tags: Record<string, string>
  /** Numero di membri che sono way (tracciato diretto). */
  wayMembers: number
  /** Id delle sotto-relazioni (tappe o varianti) di cui questa è madre. */
  childIds: number[]
}

export type DiscoveryVerdict = 'ammesso' | 'da_rivedere' | 'scartato'
export type DiscoveryKind = 'cammino' | 'tappa_o_figlio' | 'variante' | 'locale' | 'senza_nome'

export interface DiscoveryResult {
  id: number
  name: string
  ref?: string
  network?: string
  operator?: string
  wikidata?: string
  declaredKm: number | null
  wayMembers: number
  childCount: number
  /** Id della relazione madre ammessa/candidata, se questa è una tappa o una sua parte. */
  parentId?: number
  score: number
  kind: DiscoveryKind
  verdict: DiscoveryVerdict
  reasons: string[]
}

export interface DiscoveryOverrides {
  include?: number[]
  exclude?: number[]
}

export const ADMIT_SCORE = 60
export const REVIEW_SCORE = 35

const NAME_KEYWORDS = /cammin|via francigena|francigena|sentiero italia|alta via|romea|appia|lauretana|\bvia\s+(?:degli|dei|di|della|del)\b|\bvia\s+[a-z]/i
const STAGE_NAME = /\btappa\b|\bstage\b|\bt\d{1,2}\b|\bgiorno\s+\d+/i
const VARIANT_NAME = /variant|variante|alternativ|deviazione|bypass/i

/** "123", "123 km", "850 m" → km; null se assente o non interpretabile. */
export function parseDeclaredKm(raw: string | undefined): number | null {
  if (!raw) return null
  const n = parseFloat(raw.replace(',', '.'))
  if (!Number.isFinite(n)) return null
  if (/\bm\b$/.test(raw.trim()) && !/km/i.test(raw)) return n / 1000
  // Un valore senza unità sopra 1000 è quasi certamente in metri (nessun cammino è lungo 1000+ km
  // dichiarati senza unità in OSM, e il Sentiero Italia vale ~7000 km: lo si legge "7000 km").
  if (!/km/i.test(raw) && n > 1500) return n / 1000
  return n
}

export function evaluateRelation(rel: DiscoveryRelation, overrides: DiscoveryOverrides = {}): DiscoveryResult {
  const tags = rel.tags
  const name = (tags['name:it'] ?? tags.name ?? '').trim()
  const declaredKm = parseDeclaredKm(tags.distance)
  const base = {
    id: rel.id, name, ref: tags.ref, network: tags.network, operator: tags.operator,
    wikidata: tags.wikidata, declaredKm, wayMembers: rel.wayMembers, childCount: rel.childIds.length,
  }
  const reasons: string[] = []

  if (overrides.exclude?.includes(rel.id)) {
    return { ...base, score: 0, kind: 'locale', verdict: 'scartato', reasons: ['escluso a mano (overrides)'] }
  }
  if (overrides.include?.includes(rel.id)) {
    return { ...base, score: 100, kind: 'cammino', verdict: 'ammesso', reasons: ['incluso a mano (overrides)'] }
  }
  if (!name) {
    return { ...base, name: `(senza nome) relation/${rel.id}`, score: 0, kind: 'senza_nome', verdict: 'scartato', reasons: ['nessun nome: un cammino ha sempre un nome'] }
  }

  let score = 0
  if (tags.network === 'iwn') { score += 40; reasons.push('rete internazionale (iwn) +40') }
  else if (tags.network === 'nwn') { score += 30; reasons.push('rete nazionale (nwn) +30') }
  else if (tags.network === 'rwn') { score += 10; reasons.push('rete regionale (rwn) +10') }

  if (declaredKm != null) {
    if (declaredKm >= 100) { score += 30; reasons.push(`lunghezza dichiarata ${Math.round(declaredKm)} km +30`) }
    else if (declaredKm >= 50) { score += 20; reasons.push(`lunghezza dichiarata ${Math.round(declaredKm)} km +20`) }
    else if (declaredKm >= 25) { score += 8; reasons.push(`lunghezza dichiarata ${Math.round(declaredKm)} km +8`) }
    else if (declaredKm < 15) { score -= 30; reasons.push(`solo ${declaredKm.toFixed(1)} km dichiarati -30`) }
  } else {
    reasons.push('lunghezza non dichiarata (0)')
  }

  if (NAME_KEYWORDS.test(name)) { score += 15; reasons.push('nome da cammino +15') }
  if (rel.childIds.length >= 3) { score += 20; reasons.push(`${rel.childIds.length} sotto-relazioni (tappe) +20`) }
  if (tags.wikidata) { score += 10; reasons.push('ha scheda Wikidata +10') }

  let kind: DiscoveryKind = 'cammino'
  let verdict: DiscoveryVerdict = score >= ADMIT_SCORE ? 'ammesso' : score >= REVIEW_SCORE ? 'da_rivedere' : 'scartato'

  if (STAGE_NAME.test(name) && rel.childIds.length === 0) {
    kind = 'tappa_o_figlio'; verdict = 'scartato'; reasons.push('nome da tappa, senza figli: parte di un cammino più grande')
  } else if (VARIANT_NAME.test(name)) {
    kind = 'variante'; if (verdict === 'ammesso') verdict = 'da_rivedere'
    reasons.push('variante: da collegare al cammino principale, non un cammino a sé')
  } else if (verdict === 'scartato') {
    kind = 'locale'
  }
  return { ...base, score, kind, verdict, reasons }
}

/**
 * Valuta l'intero elenco. Una relazione che è figlia di un'altra candidata (compare tra i suoi
 * `childIds`) è una tappa o una parte di quella: non è un cammino a sé, a meno che sia a sua volta
 * una madre con più tappe (es. un cammino nazionale composto da cammini regionali) — in quel caso
 * resta valutata col proprio punteggio ma riporta comunque `parentId`.
 */
export function evaluateAll(relations: DiscoveryRelation[], overrides: DiscoveryOverrides = {}): DiscoveryResult[] {
  const results = relations.map(r => evaluateRelation(r, overrides))
  const byId = new Map(results.map(r => [r.id, r]))
  const forced = new Set([...(overrides.include ?? []), ...(overrides.exclude ?? [])])
  for (const parent of relations) {
    for (const childId of parent.childIds) {
      const child = byId.get(childId)
      const parentResult = byId.get(parent.id)
      if (!child || !parentResult || child.parentId != null || forced.has(childId)) continue
      if (parentResult.verdict === 'scartato') continue
      child.parentId = parent.id
      if (child.childCount < 3 && child.verdict !== 'scartato') {
        child.verdict = 'scartato'
        child.kind = 'tappa_o_figlio'
        child.reasons.push(`figlia di relation/${parent.id} (${parentResult.name}): non è un cammino a sé`)
      }
    }
  }
  return results.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
}

export function summarize(results: DiscoveryResult[]): Record<DiscoveryVerdict, number> {
  const out: Record<DiscoveryVerdict, number> = { ammesso: 0, da_rivedere: 0, scartato: 0 }
  for (const r of results) out[r.verdict]++
  return out
}
