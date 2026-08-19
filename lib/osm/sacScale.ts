// DTREK-AUDIT.md P0 #10 — fonte di verità condivisa per mappare il tag OSM sac_scale (scala di
// difficoltà escursionistica SAC) alle sigle T1-T6 usate altrove nel codebase (SAFETY_CATEGORY_
// WEIGHTS, refineSafetyWithTerrainSignals in lib/safetyScore.ts). I valori REALMENTE scritti nel
// tag OSM sono le stringhe lunghe standard (vedi https://wiki.openstreetmap.org/wiki/Key:sac_scale),
// mai le sigle T1-T6 direttamente — un confronto diretto contro 'T1'..'T6' (come faceva
// lib/overpass.ts::fetchTerrainContext prima di questo fix) non riconosce mai un dato OSM reale.
export const OSM_SAC_SCALE_MAP: Record<string, string> = {
  hiking: 'T1',
  mountain_hiking: 'T2',
  demanding_mountain_hiking: 'T3',
  alpine_hiking: 'T4',
  demanding_alpine_hiking: 'T5',
  difficult_alpine_hiking: 'T6',
}

export function mapOsmSacScale(raw: string | undefined): string | null {
  if (!raw) return null
  return OSM_SAC_SCALE_MAP[raw] ?? null
}
