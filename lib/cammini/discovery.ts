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
  /** Centro della relazione (Overpass `out center`), se noto: serve a escludere i cammini esteri. */
  center?: { lat: number; lon: number }
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
  center?: { lat: number; lon: number }
  /** Distanza in km dal comune italiano più vicino al centro: undefined se non verificata. */
  italyDistanceKm?: number
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
// Nomi da tappa: parola esplicita, oppure sigla lettera+numero in coda ("Via Alpina Red R103",
// "Via Alpina Blue D18", "Sentiero Italia T00"). La sigla è maiuscola nei dati OSM: niente flag `i`
// su quella parte, per non scambiare "Alta Via 1" o "Via 2" per una tappa.
const STAGE_NAME = /(?:\btappa\b|\bstage\b|\betap[ep]?\b|\bgiorno\s+\d+)/i
const STAGE_CODE = /\s[A-Z]\d{1,3}$/
// "part Slovenia", "Österreich", "Suisse"…: la parte estera di un cammino europeo non è nostra.
const FOREIGN_PART = /\b(?:part|parte|teil)\s+(?:of\s+)?(?:slovenia|slovenija|france|francia|switzerland|svizzera|schweiz|suisse|austria|osterreich|österreich|croatia|croazia)\b/i
const FOREIGN_WORD = /österreich|osterreich|schweiz|suisse|slovenij|hrvatska|szent|jakobova/i
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
    id: rel.id, name, ref: tags.ref, network: tags.network, operator: tags.operator, center: rel.center,
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
  // Un percorso lungo con nome da cammino (Alta Via, Cammino…) è quasi sempre multi-giorno anche
  // senza sotto-relazioni: dal primo giro reale le Alte Vie delle Dolomiti restavano a 55.
  if (declaredKm != null && declaredKm >= 100 && NAME_KEYWORDS.test(name)) { score += 10; reasons.push('lungo e con nome da cammino +10') }
  if (rel.childIds.length >= 3) { score += 20; reasons.push(`${rel.childIds.length} sotto-relazioni (tappe) +20`) }
  if (tags.wikidata) { score += 10; reasons.push('ha scheda Wikidata +10') }

  if (FOREIGN_PART.test(name)) {
    return { ...base, score, kind: 'locale', verdict: 'scartato', reasons: [...reasons, 'è la parte estera di un cammino europeo'] }
  }
  let kind: DiscoveryKind = 'cammino'
  let verdict: DiscoveryVerdict = score >= ADMIT_SCORE ? 'ammesso' : score >= REVIEW_SCORE ? 'da_rivedere' : 'scartato'

  if (rel.wayMembers === 0 && rel.childIds.length === 0) {
    kind = 'locale'; verdict = 'scartato'; reasons.push('nessun tracciato né sotto-relazioni: niente da importare')
  } else if ((STAGE_NAME.test(name) || STAGE_CODE.test(name)) && rel.childIds.length === 0) {
    kind = 'tappa_o_figlio'; verdict = 'scartato'; reasons.push('nome da tappa (parola o sigla), senza figli: parte di un cammino più grande')
  } else if (VARIANT_NAME.test(name)) {
    kind = 'variante'; if (verdict === 'ammesso') verdict = 'da_rivedere'
    reasons.push('variante: da collegare al cammino principale, non un cammino a sé')
  } else if (verdict === 'scartato') {
    kind = 'locale'
  }
  if (verdict === 'ammesso' && FOREIGN_WORD.test(name)) {
    verdict = 'da_rivedere'; reasons.push('nome in lingua straniera: probabile cammino estero')
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

// ── Cammini fuori dall'Italia ─────────────────────────────────────────────────────────────────
// Le fasce di latitudine della query includono mezza Europa (Francia, Svizzera, Austria, Slovenia):
// un cammino il cui centro è lontano da ogni comune italiano del catalogo non è nostro. Centri
// vicini al confine (cammini transfrontalieri) restano "da rivedere" invece di sparire.
export const ITALY_NEAR_KM = 12
export const ITALY_FAR_KM = 40

export function applyCountryCheck(results: DiscoveryResult[], distanceKm: (lat: number, lon: number) => number): DiscoveryResult[] {
  for (const r of results) {
    if (!r.center) continue
    const d = distanceKm(r.center.lat, r.center.lon)
    r.italyDistanceKm = Math.round(d)
    if (d > ITALY_FAR_KM) {
      r.verdict = 'scartato'
      r.reasons.push(`centro a ${Math.round(d)} km dal comune italiano più vicino: fuori Italia`)
    } else if (d > ITALY_NEAR_KM && r.verdict === 'ammesso') {
      r.verdict = 'da_rivedere'
      r.reasons.push(`centro a ${Math.round(d)} km dal comune italiano più vicino: forse transfrontaliero`)
    }
  }
  return results
}

// ── Famiglie ──────────────────────────────────────────────────────────────────────────────────
// Lo stesso cammino arriva spezzato in più relazioni: per regione ("Via Francigena - 07 Lazio"),
// per tratto ("Via Romea - Tratto Emilia"), per colore e tappa ("Via Alpina Red R103"), o ripetuto
// con lo stesso nome (Sentiero dei tre paesi Julius Kugy, ~30 volte). La famiglia è il cammino
// vero dal punto di vista dell'utente; le relazioni sono i suoi pezzi.
const IT_REGIONS = [
  "valle d'aosta", 'piemonte', 'lombardia', 'liguria', 'trentino-alto adige', 'trentino', 'alto adige',
  'veneto', 'friuli venezia giulia', 'friuli', 'emilia romagna', 'emilia-romagna', 'toscana', 'umbria',
  'marche', 'lazio', 'abruzzo', 'molise', 'campania', 'puglia', 'basilicata', 'calabria', 'sicilia', 'sardegna',
]

export function familyKey(rawName: string): string {
  let n = rawName.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’`]/g, "'").trim()
  // "GTA: Balme - Usseglio": prefisso prima dei due punti, tratto "A - B" dopo.
  const prefixed = /^([^:]{2,30}):\s*[^:]+\s[-–]\s[^:]+$/.exec(n)
  if (prefixed) n = prefixed[1].trim()
  // "Cammino di Assisi, Genova - San Miniato": il tratto "A - B" dopo la virgola non fa parte del nome.
  n = n.replace(/,\s*[^,]+\s[-–]\s[^,]+$/, '')
  n = n.replace(/\s*[-–:,]\s*(?:tratto|variante|alternativa|parte|tappa|etape|etappe|stage|opzione)\b.*$/, '')
  n = n.replace(/\s+(?:tratto|variante|alternativa|opzione)\b.*$/, '')
  n = n.replace(/\s*[-–]\s*\d{1,2}\s+[a-z' ]+$/, '')
  n = n.replace(/\s+(?:red|blue|yellow|purple|green|rosso|blu|giallo|viola|verde)(?:\s+[a-z]\d{1,3})?$/, '')
  // Sigla di tappa generica solo con 2-3 cifre (E00, T00, R103): "E1" ed "E5" sono cammini diversi.
  n = n.replace(/\s+[a-z]\d{2,3}$/, '')
  for (const region of IT_REGIONS) {
    const numbered = new RegExp(`(\\s${region.replace(/[-']/g, m => `\\${m}`)})\\s+\\d{1,2}(?:\\.\\d+)?(?:\\s.*)?$`)
    if (numbered.test(n)) { n = n.replace(numbered, '$1'); break }
  }
  for (const region of IT_REGIONS) {
    const tail = new RegExp(`\\s*[-–]\\s*${region.replace(/[-']/g, m => `\\${m}`)}$`)
    if (tail.test(n)) { n = n.replace(tail, ''); break }
  }
  n = n.replace(/\bd'(?=[a-z])/g, 'di ')
  return n.replace(/\s+/g, ' ').trim()
}

const SMALL_WORDS = new Set(['di', 'del', 'dei', 'delle', 'della', 'degli', 'da', 'e', 'la', 'il', 'lo', 'in', 'de', 'du', 'des', 'al', 'a'])

/** Nome da mostrare per una famiglia: un pezzo che si chiama esattamente come la famiglia, se c'è
 *  (conserva maiuscole e accenti originali), altrimenti la chiave con le maiuscole ricostruite. */
function displayName(key: string, names: string[]): string {
  const exact = names.find(n => familyKey(n) === key && n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim() === key)
  if (exact) return exact.trim()
  return key.split(' ')
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .map(w => w.replace(/'([a-z])/g, (_, c: string) => `'${c.toUpperCase()}`))
    .join(' ')
}

export interface DiscoveryFamily {
  key: string
  /** Nome da mostrare: il più corto tra quelli dei pezzi (di solito il generico). */
  name: string
  verdict: DiscoveryVerdict
  members: number
  networks: string[]
  declaredKm: number | null
  childRelations: number
  /** Id delle relazioni che non sono tappe/figlie: i pezzi da cui ricostruire il cammino. */
  relationIds: number[]
  stageRelations: number
  score: number
  inItaly: 'si' | 'confine' | 'no' | 'non_verificato'
}

export function groupFamilies(results: DiscoveryResult[]): DiscoveryFamily[] {
  const groups = new Map<string, DiscoveryResult[]>()
  for (const r of results) {
    if (r.kind === 'senza_nome') continue
    const key = familyKey(r.name)
    if (!key) continue
    groups.set(key, [...(groups.get(key) ?? []), r])
  }
  const rank: Record<DiscoveryVerdict, number> = { ammesso: 2, da_rivedere: 1, scartato: 0 }
  const families: DiscoveryFamily[] = []
  for (const [key, list] of Array.from(groups.entries())) {
    const pieces = list.filter(r => r.kind !== 'tappa_o_figlio' && r.verdict !== 'scartato')
    const stages = list.filter(r => r.kind === 'tappa_o_figlio')
    // Un cammino fatto solo di tappe (Via Alpina: R103, R104…) è comunque un cammino: i suoi
    // pezzi sono le tappe stesse, e vale la loro valutazione migliore.
    const decisive = pieces.length > 0 ? pieces : list
    const best = decisive.reduce((a, b) => (rank[b.verdict] > rank[a.verdict] || (rank[b.verdict] === rank[a.verdict] && b.score > a.score) ? b : a))
    let verdict = best.verdict
    if (pieces.length === 0 && stages.length > 0) {
      // Solo tappe: ammesso se sono tante e di rete alta, altrimenti da rivedere.
      const highNetwork = stages.some(s => s.network === 'iwn' || s.network === 'nwn')
      // 16 tappe numerate di rete nazionale con nome da cammino (Cammino di San Benedetto) sono
      // esattamente ciò che cerchiamo: tappe ufficiali già pronte.
      verdict = stages.length >= 5 && highNetwork && (NAME_KEYWORDS.test(displayName(key, list.map(r => r.name))) || stages.length >= 10)
        ? 'ammesso'
        : stages.length >= 5 && highNetwork ? 'da_rivedere' : 'scartato'
    }
    const distances = list.map(r => r.italyDistanceKm).filter((d): d is number => d != null)
    const minDist = distances.length ? Math.min(...distances) : null
    const kms = list.map(r => r.declaredKm).filter((k): k is number => k != null)
    families.push({
      key,
      name: displayName(key, list.map(r => r.name)),
      verdict,
      members: list.length,
      networks: Array.from(new Set(list.map(r => r.network).filter((n): n is string => !!n))),
      declaredKm: kms.length ? Math.max(...kms) : null,
      childRelations: list.reduce((s, r) => s + r.childCount, 0),
      relationIds: decisive.map(r => r.id),
      stageRelations: stages.length,
      score: best.score,
      inItaly: minDist == null ? 'non_verificato' : minDist <= ITALY_NEAR_KM ? 'si' : minDist <= ITALY_FAR_KM ? 'confine' : 'no',
    })
  }
  return families.sort((a, b) => rank[b.verdict] - rank[a.verdict] || b.score - a.score || a.name.localeCompare(b.name))
}
