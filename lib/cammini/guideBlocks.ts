import type { CamminoPlan } from './plan'

// Testo del piano di un Cammino per il prompt di Giulia (docs/piano-cammini.md, Fase 5). Solo dati
// del piano: tappe, giornate, km, e il dislivello quando è già calcolato — mai valori inventati.
// Logica pura.

const WALK_KMH = 4

export function planTotals(plan: CamminoPlan): { lengthM: number; tappe: number; days: number; seconds: number } {
  const lengthM = plan.tappe.reduce((s, t) => s + t.lengthM, 0)
  return { lengthM, tappe: plan.tappe.length, days: plan.days.length, seconds: Math.round((lengthM / 1000 / WALK_KMH) * 3600) }
}

function km(m: number): string { return `${(m / 1000).toFixed(1)} km` }

export function camminoMetricsBlock(plan: CamminoPlan): string {
  const t = planTotals(plan)
  const reverse = plan.direction === 'reverse' ? ' (percorso al contrario rispetto al catalogo)' : ''
  return `CAMMINO: ${plan.camminoName}${reverse}
LUNGHEZZA DEL TRATTO SCELTO: ${km(t.lengthM)} in ${t.tappe} ${t.tappe === 1 ? 'tappa' : 'tappe'} e ${t.days} ${t.days === 1 ? 'giornata' : 'giornate'}
${plan.startDate ? `PARTENZA: ${plan.startDate}\n` : ''}Il dislivello è indicato solo per le tappe in cui è noto: non stimarlo mai per le altre.
`
}

export function camminoTappeBlock(plan: CamminoPlan): string {
  const byOrdinal = new Map(plan.tappe.map(t => [t.ordinal, t]))
  const lines: string[] = []
  let n = 0
  plan.days.forEach((day, di) => {
    const ts = day.tappe.map(o => byOrdinal.get(o)).filter((x): x is NonNullable<typeof x> => !!x)
    ts.forEach(t => {
      n += 1
      const elev = t.elevationGainM != null ? `, dislivello +${Math.round(t.elevationGainM)} m` : ''
      lines.push(`TAPPA ${n} (giornata ${di + 1}): ${t.fromName ?? 'partenza'} → ${t.toName ?? 'arrivo'}, ${km(t.lengthM)}${elev}${t.endsAtAnchor === false ? ' — la tappa si chiude in aperta campagna' : ''}`)
    })
  })
  return lines.join('\n')
}
