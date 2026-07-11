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
