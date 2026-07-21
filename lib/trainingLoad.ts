// ATL/CTL/TSB training load model
// ATL (Acute Training Load) τ = 7 days  → "fatigue"
// CTL (Chronic Training Load) τ = 42 days → "fitness"
// TSB (Training Stress Balance) = CTL - ATL → "form"

export interface DailyLoad {
  date: string  // YYYY-MM-DD
  stress: number
  atl: number
  ctl: number
  tsb: number
}

export interface FormStatus {
  label: string
  color: string
  description: string
}

// Simplified Training Stress Score based on available data
export function activityStress(
  distanceMeters: number,
  elevationGain: number,
  durationSeconds?: number,
): number {
  const distKm = distanceMeters / 1000
  const elevK  = elevationGain / 1000
  // Base: ~50 TSS for 10km flat, scaled up for elevation
  const base = distKm * 5
  const eleBonus = elevK * 30
  const durationBonus = durationSeconds ? (durationSeconds / 3600) * 8 : 0
  return Math.round(base + eleBonus + durationBonus)
}

export function computeTrainingLoad(
  events: { date: string; stress: number }[],
  windowDays = 90,
): DailyLoad[] {
  if (events.length === 0) return []

  // Build a daily stress map
  const stressMap: Record<string, number> = {}
  for (const e of events) stressMap[e.date] = (stressMap[e.date] ?? 0) + e.stress

  // Date range: last windowDays days up to today
  const today = new Date()
  const days: DailyLoad[] = []
  let atl = 0
  let ctl = 0

  // exponential moving average decay constants
  const kAtl = 1 - Math.exp(-1 / 7)
  const kCtl = 1 - Math.exp(-1 / 42)

  for (let i = windowDays - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().slice(0, 10)
    const stress = stressMap[dateStr] ?? 0

    atl = atl + kAtl * (stress - atl)
    ctl = ctl + kCtl * (stress - ctl)
    const tsb = ctl - atl

    days.push({ date: dateStr, stress, atl: +atl.toFixed(1), ctl: +ctl.toFixed(1), tsb: +tsb.toFixed(1) })
  }

  return days
}

// Etichette deliberatamente distinte da quelle del Recovery Score (lib/bioMetrics.ts,
// computeRecoveryScore) anche se entrambe partono dallo stesso TSB — le due card di Bacheca
// raccontano due cose diverse (prontezza del giorno vs bilancio dell'allenamento nel tempo) e
// condividere le stesse parole ("Neutro", "Affaticato"...) le faceva sembrare duplicate.
export function currentForm(tsb: number): FormStatus {
  if (tsb >= 15)  return { label: 'In Slancio',    color: '#16a34a', description: 'Forma ottima, pronto per uno sforzo importante' }
  if (tsb >= 5)   return { label: 'In Crescita',   color: '#65a30d', description: 'Buon equilibrio tra carico e recupero' }
  if (tsb >= -5)  return { label: 'In Equilibrio', color: '#ca8a04', description: 'Carico bilanciato, mantieni il ritmo' }
  if (tsb >= -15) return { label: 'In Calo',       color: '#ea580c', description: 'Accumulo di fatica, considera un giorno di recupero' }
  return { label: 'In Debito', color: '#dc2626', description: 'Fatica elevata — riposo consigliato prima di impegni intensi' }
}
