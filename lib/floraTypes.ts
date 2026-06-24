export interface FloraResult {
  available: boolean
  leafTypeDominant: 'broadleaved' | 'needleleaved' | 'mixed' | null
  speciesFound: string[]
  forestCoveragePct: number | null
}
