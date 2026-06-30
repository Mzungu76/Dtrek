// Best-effort danger classification for Italian wildlife encountered via GBIF
// occurrence search. Matched against GBIF's `family`/`order`/`class` and
// `scientificName` fields — coarse but enough to flag the handful of taxa
// that actually matter for hiker safety (large carnivores, vipers).
export type DangerLevel = 'alto' | 'moderato' | 'basso'

interface TaxonRule {
  level: DangerLevel
  // matches if any of these appear (case-insensitive) in family/order/class/scientificName
  match: string[]
}

const RULES: TaxonRule[] = [
  { level: 'alto', match: ['Ursidae', 'Ursus arctos'] }, // orso
  { level: 'moderato', match: ['Canis lupus'] }, // lupo
  { level: 'moderato', match: ['Vipera'] }, // vipere
  { level: 'moderato', match: ['Sus scrofa'] }, // cinghiale
  { level: 'basso', match: ['Bovidae', 'Cervidae', 'Aquila', 'Vulpes vulpes'] },
]

export function classifyDanger(fields: {
  scientificName?: string | null
  family?: string | null
  order?: string | null
  class?: string | null
}): DangerLevel | null {
  const haystack = [fields.scientificName, fields.family, fields.order, fields.class]
    .filter(Boolean)
    .join(' ')
  if (!haystack) return null

  for (const rule of RULES) {
    if (rule.match.some(m => haystack.toLowerCase().includes(m.toLowerCase()))) {
      return rule.level
    }
  }
  return null
}
