// Friendlier difficulty filter than the raw SAC scale (T1-T6), which is
// Alps-alpinism-specific jargon. SAC stays visible as detail-level info in
// trail cards/modal — this tier is only the filter-facing grouping.

export type DifficultyTier = 'facile' | 'moderato' | 'impegnativo'

export const DIFFICULTY_TIER_LABEL: Record<DifficultyTier, string> = {
  facile: 'Facile',
  moderato: 'Moderato',
  impegnativo: 'Impegnativo',
}

export const DIFFICULTY_TIER_SAC: Record<DifficultyTier, string[]> = {
  facile: ['T1'],
  moderato: ['T2', 'T3'],
  impegnativo: ['T4', 'T5', 'T6'],
}

export function sacCodesForTiers(tiers: DifficultyTier[]): string[] {
  return tiers.flatMap(tier => DIFFICULTY_TIER_SAC[tier])
}

export function tierForSac(sac?: string | null): DifficultyTier | null {
  if (!sac) return null
  return (Object.keys(DIFFICULTY_TIER_SAC) as DifficultyTier[])
    .find(tier => DIFFICULTY_TIER_SAC[tier].includes(sac)) ?? null
}
