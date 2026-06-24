// Ground stability signal collector — PSInSAR radar deformation velocity (mm/anno)
// near the trail. 7° segnale SI, bucket TTL dedicato (180gg, vedi computeSI.ts) perché
// la densità del prodotto cambia su scala annuale/pluriennale, non settimanale come il
// satellite. Soglie di velocità/raggio sono stime iniziali (Rischio #3 del piano di
// integrazione) — costanti esplicite qui sotto, da tarare quando un endpoint reale
// sarà disponibile.
import { fetchPsinsarPointsCached } from '@/lib/psinsar/psinsarCache'
import { PsinsarUnavailableError, type PsinsarPoint } from '@/lib/psinsar/psinsarClient'
import { nearestWithinThreshold } from '@/lib/geo/nearestPoint'
import type { GroundStabilitySignal, GroundStabilityClass, SignalContext, UnavailableReason } from '@/lib/si/types'

// <=100m dal tracciato: coerenza radar generalmente buona. 100-250m: ancora
// utilizzabile ma la coerenza scende sotto vegetazione fitta — confidenza bassa.
const HIGH_CONFIDENCE_RADIUS_M = 100
const LOW_CONFIDENCE_RADIUS_M = 250

// mm/anno, valore assoluto. Soglie indicative da letteratura InSAR generica, non
// ancora confrontate con la documentazione del prodotto MASE reale.
const STABLE_MAX_MM_YEAR = 2
const SLOW_MAX_MM_YEAR = 5
const MODERATE_MAX_MM_YEAR = 10

const PENALTY_BY_CLASS: Record<GroundStabilityClass, number> = {
  stable: 0,
  slow: -10,
  moderate: -25,
  rapid: -45,
  unknown: 0,
}

function classify(absVelocityMmYear: number): GroundStabilityClass {
  if (absVelocityMmYear < STABLE_MAX_MM_YEAR) return 'stable'
  if (absVelocityMmYear < SLOW_MAX_MM_YEAR) return 'slow'
  if (absVelocityMmYear < MODERATE_MAX_MM_YEAR) return 'moderate'
  return 'rapid'
}

// "s,w,n,e" — stessa convenzione di geoUtils.ts's computeBbox / lib/geo/wfsClient.ts.
function toPsinsarBbox(bbox: SignalContext['bbox']): string {
  return `${bbox.minLat},${bbox.minLon},${bbox.maxLat},${bbox.maxLon}`
}

const NO_DATA_SIGNAL: GroundStabilitySignal = {
  available: false,
  pointCount: 0,
  maxVelocityMmYear: null,
  classification: 'unknown',
  confidence: 'none',
  penalty: 0,
  reason: 'no_data',
}

export async function collectGroundStabilitySignal(_osmRelationId: number, ctx: SignalContext): Promise<GroundStabilitySignal> {
  let points: PsinsarPoint[]
  try {
    points = await fetchPsinsarPointsCached(toPsinsarBbox(ctx.bbox))
  } catch (err) {
    if (!(err instanceof PsinsarUnavailableError)) console.error('[si] PSInSAR fetch failed', err)
    const reason: UnavailableReason = err instanceof PsinsarUnavailableError ? 'no_data' : 'api_error'
    return { ...NO_DATA_SIGNAL, reason }
  }

  if (points.length === 0) return NO_DATA_SIGNAL

  // Assenza di un match entro 250m da OGNI vertice del tracciato ≠ terreno stabile —
  // significa solo che questo bbox non ha copertura PSInSAR vicino al sentiero;
  // available resta false in quel caso (vedi piano di integrazione, Fase 2).
  let worstAbsVelocity = 0
  let worstVelocity: number | null = null
  let worstConfidence: 'high' | 'low' = 'high'

  for (const [lat, lon] of ctx.geometry) {
    const match = nearestWithinThreshold({ lat, lon }, points, LOW_CONFIDENCE_RADIUS_M)
    if (!match) continue
    const absVelocity = Math.abs(match.candidate.velocityMmYear)
    if (absVelocity > worstAbsVelocity) {
      worstAbsVelocity = absVelocity
      worstVelocity = match.candidate.velocityMmYear
      worstConfidence = match.distM <= HIGH_CONFIDENCE_RADIUS_M ? 'high' : 'low'
    }
  }

  if (worstVelocity == null) return { ...NO_DATA_SIGNAL, pointCount: points.length }

  const classification = classify(worstAbsVelocity)
  const basePenalty = PENALTY_BY_CLASS[classification]
  // Confidenza bassa (100-250m, coerenza radar tipicamente più debole) → penalità
  // attenuata della metà, non azzerata: il segnale resta comunque informativo.
  const penalty = worstConfidence === 'low' ? Math.round(basePenalty / 2) : basePenalty

  return {
    available: true,
    pointCount: points.length,
    maxVelocityMmYear: worstVelocity,
    classification,
    confidence: worstConfidence,
    penalty,
  }
}
