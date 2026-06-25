// Land-cover class code -> TEI surface category. USO_SUOLO_DATASET is confirmed to serve
// raw Corine Land Cover level-3 codes (lc:clc18_it_4258, CLC 2018) — a public, documented
// EEA standard (44 classes, codes 111-523, grouped by first digit), so this mapping is safe
// to hard-code regardless of the still-unconfirmed real property name (that only affects
// how usoSuoloClient.ts extracts the code, not what the code means once extracted).
// 1xx = superfici artificiali, 2xx = aree agricole, 3xx = foreste e ambienti seminaturali,
// 4xx = zone umide, 5xx = corpi idrici. Never fabricates a category for an out-of-range or
// null code — falls back to 'unknown', same "never invent a classification" discipline as
// lithologyRiskMap.ts/natura2000Client.ts's extractDesignation.

export type LandCoverSurface = 'paved' | 'natural' | 'water' | 'unknown'

export function landCoverCodeToSurface(classCode: number | null): LandCoverSurface {
  if (classCode == null) return 'unknown'
  const firstDigit = Math.floor(classCode / 100)
  switch (firstDigit) {
    case 1: return 'paved'
    case 2: return 'natural'
    case 3: return 'natural'
    case 4: return 'natural'
    case 5: return 'water'
    default: return 'unknown'
  }
}
