// Profilo altimetrico di una tappa (docs/piano-cammini.md, Fase 5): la polilinea di catalogo è
// semplificata (vertici radi), quindi prima si infittisce a passo fisso, poi si campionano le quote
// dal DTM e si lisciano per togliere il rumore del modello prima di sommare salite e discese.
// Logica pura — il campionamento del DTM sta nell'endpoint.

const R = 6371000

function haversineM(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b[0] - a[0]), dLon = toRad(b[1] - a[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Punti [lat, lon, distanza cumulata in m] a passo ~stepM lungo la polilinea (estremi inclusi). */
export function densifyPolyline(line: [number, number][], stepM = 100): [number, number, number][] {
  if (line.length === 0) return []
  const out: [number, number, number][] = [[line[0][0], line[0][1], 0]]
  let cum = 0
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i]
    const seg = haversineM(a, b)
    const n = Math.max(1, Math.round(seg / stepM))
    for (let k = 1; k <= n; k++) {
      const t = k / n
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, cum + seg * t])
    }
    cum += seg
  }
  return out
}

/** Media mobile centrata su `window` punti (dispari). */
export function smooth(values: number[], window = 5): number[] {
  const half = Math.floor(window / 2)
  return values.map((_, i) => {
    let sum = 0, n = 0
    for (let j = Math.max(0, i - half); j <= Math.min(values.length - 1, i + half); j++) { sum += values[j]; n++ }
    return sum / n
  })
}

export function gainLoss(alts: number[]): { gainM: number; lossM: number; maxM: number; minM: number } {
  let gain = 0, loss = 0
  for (let i = 1; i < alts.length; i++) {
    const d = alts[i] - alts[i - 1]
    if (d > 0) gain += d; else loss -= d
  }
  return { gainM: Math.round(gain), lossM: Math.round(loss), maxM: Math.round(Math.max(...alts)), minM: Math.round(Math.min(...alts)) }
}

/** Al massimo `max` punti, a intervalli regolari, ultimo incluso (per il grafico). */
export function downsample<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items
  const step = (items.length - 1) / (max - 1)
  return Array.from({ length: max }, (_, i) => items[Math.round(i * step)])
}
