import type { VegetationBeltEstimate } from './vegetationBelt'

export interface FloraResult {
  available: boolean
  leafTypeDominant: 'broadleaved' | 'needleleaved' | 'mixed' | null
  speciesFound: string[]
  forestCoveragePct: number | null
  estimatedBelt: VegetationBeltEstimate | null
}
