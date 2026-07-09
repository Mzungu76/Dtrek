// Pure helpers shared between the server-side orchestrator (lib/cl/computeCL.ts, which pulls in
// the service-role Supabase client and must never be imported client-side) and the client hook
// (lib/cl/useCL.ts, which needs the same TTLs and score→label mapping to decide whether a cached
// planned_hikes.si_* row is still fresh enough to skip the live /api/trails/cl round trip).
import type { CLLabel } from './types'

export const SI_STATIC_TTL_MS = 30 * 24 * 60 * 60 * 1000
export const SI_DYNAMIC_TTL_MS = 1 * 24 * 60 * 60 * 1000
export const SI_SATELLITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

export function labelForSiScore(score: number): CLLabel {
  if (score >= 80) return { text: 'Alta affidabilità', color: 'green', tailwind: 'bg-forest-700' }
  if (score >= 60) return { text: 'Affidabile', color: 'lime', tailwind: 'bg-lime-600' }
  if (score >= 40) return { text: 'Da verificare', color: 'amber', tailwind: 'bg-amber-500' }
  if (score >= 20) return { text: 'Dati incerti', color: 'red', tailwind: 'bg-red-600' }
  return { text: 'Dati inaffidabili', color: 'black', tailwind: 'bg-gray-800' }
}
