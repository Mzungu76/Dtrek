// Lithology code → rockfall risk is a real geological-domain gap, not an integration gap:
// unlike PAI's R1-R4/P1-P4 (a documented national standard, see lib/pai/paiAttributeMap.ts),
// CARG lithology sigle (e.g. "FLY", "MACS"…) are per-map-sheet abbreviations defined in each
// sheet's own legend, not a single national table. Inventing thresholds here would silently
// fabricate a safety signal — this stays 'unknown' until someone with the real ISPRA legend
// populates it. The function is wired into lib/geologia/geologiaClient.ts and the rockfall SI
// signal now so that swap is a single change here, not a new integration.

export type RockfallRisk = 'low' | 'medium' | 'high' | 'unknown'

export function lithologyCodeToRockfallRisk(_lithologyCode: string | null): RockfallRisk {
  return 'unknown'
}
