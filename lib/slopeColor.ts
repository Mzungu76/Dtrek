import { haversineM } from './geoUtils'

interface SlopeSamplePoint {
  lat?: number
  lon?: number
  altitudeMeters?: number
}

/** Pendenza segnata (%) in ciascun punto della traccia, calcolata su una finestra di `windowM`
 *  metri centrata sul punto invece che tra due punti grezzi adiacenti — un altimetro GPS/
 *  barometrico è rumoroso da un campione al successivo, quindi il calcolo punto-a-punto produceva
 *  un tratteggio di colori "sparpagliati" sulla mappa che non corrispondeva alle bande più pulite
 *  disegnate sul grafico altimetrico (che già mediava su più campioni). Usata da entrambi così
 *  producono esattamente gli stessi colori per lo stesso tratto. */
export function computeSignedSlopeSeries(points: SlopeSamplePoint[], windowM = 80): number[] {
  const n = points.length
  const out = new Array<number>(n).fill(0)
  if (n < 2) return out

  const cum = new Array<number>(n).fill(0)
  for (let i = 1; i < n; i++) {
    const a = points[i - 1], b = points[i]
    cum[i] = cum[i - 1] + (a.lat != null && a.lon != null && b.lat != null && b.lon != null
      ? haversineM(a.lat, a.lon, b.lat, b.lon) : 0)
  }

  let lo = 0, hi = 0
  for (let i = 0; i < n; i++) {
    const target = cum[i]
    while (lo < i && target - cum[lo] > windowM / 2) lo++
    while (hi < n - 1 && cum[hi + 1] - target <= windowM / 2) hi++
    const distM = cum[hi] - cum[lo]
    const altLo = points[lo].altitudeMeters, altHi = points[hi].altitudeMeters
    if (distM > 0 && altLo != null && altHi != null) out[i] = ((altHi - altLo) / distM) * 100
  }
  return out
}

/** Colore per un tratto in base alla pendenza SEGNATA (percento, positiva = salita, negativa =
 *  discesa) — condiviso da profilo altimetrico (sempre visibile) e overlay pendenza transitorio
 *  sulla mappa "Il percorso" (solo durante l'interazione), così i due si leggono allo stesso
 *  modo: salita su scala calda, discesa su scala fredda, quasi piano in grigio neutro. Distinta
 *  dal toggle persistente Pendenza/Esposizione di ScoresWidget (quello resta un'altra cosa: usa
 *  la pendenza del terreno da DTM, non la direzione di marcia). */
export function slopeColorSigned(pct: number): string {
  const a = Math.abs(pct)
  if (a < 3) return '#a8a29e' // quasi piano — stone neutro
  if (pct > 0) {
    // salita — giallo pallido → rosso acceso
    if (a < 8)  return '#fbbf24'
    if (a < 15) return '#f97316'
    if (a < 25) return '#ef4444'
    return '#b91c1c'
  }
  // discesa — verde acqua → blu intenso
  if (a < 8)  return '#5eead4'
  if (a < 15) return '#22d3ee'
  if (a < 25) return '#0ea5e9'
  return '#1d4ed8'
}

export const SLOPE_LEGEND = [
  { color: '#b91c1c', label: 'Salita ripida' },
  { color: '#f97316', label: 'Salita' },
  { color: '#fbbf24', label: 'Salita lieve' },
  { color: '#a8a29e', label: 'Pianeggiante' },
  { color: '#5eead4', label: 'Discesa lieve' },
  { color: '#22d3ee', label: 'Discesa' },
  { color: '#1d4ed8', label: 'Discesa ripida' },
] as const
