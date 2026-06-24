// Land-cover class code -> TEI surface category. Unlike lithologyRiskMap.ts (a genuine
// geological-domain gap), Corine Land Cover / Copernicus HRL nomenclatures ARE public,
// documented standards — the mapping itself is safe to write once it's clear which table
// applies. What's unconfirmed today is *which* of several plausible nomenclatures
// USO_SUOLO_DATASET will actually serve (raw CLC level-3 codes 111-523, a national reclass,
// or Copernicus HRL 0-100 classes) — populating a code table against the wrong nomenclature
// would silently mislabel every land-cover lookup. Stays 'unknown' until
// scripts/probe-usosuolo.ts confirms the real coverage's code table; the function is wired
// into computeVfond now so that swap is a single change here.

export type LandCoverSurface = 'paved' | 'natural' | 'water' | 'unknown'

export function landCoverCodeToSurface(_classCode: number | null): LandCoverSurface {
  return 'unknown'
}
