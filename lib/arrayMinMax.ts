// DTREK-AUDIT.md P1 #16 — Math.max(...arr)/Math.min(...arr) passa un argomento per elemento: su
// una traccia GPS lunga (un'escursione registrata a un punto al secondo arriva tranquillamente a
// decine di migliaia di punti, più ancora per un file multi-giorno) supera il limite di argomenti
// del motore JS e lancia RangeError. Stesso identico bug già trovato e corretto una volta in
// produzione (components/RouteMap3D.tsx's seriesMax/seriesMin, dove finiva nel catch della
// preparazione video come un fuorviante "riprova con meno foto/POI") e mai generalizzato — questo
// modulo condiviso sostituisce lo spread ovunque si opera su un intero array di punti traccia
// grezzi, non su serie già limitate/sub-campionate (dove lo spread resta innocuo).
export function arrayMax(arr: ArrayLike<number>): number {
  let m = -Infinity
  for (let i = 0; i < arr.length; i++) if (arr[i] > m) m = arr[i]
  return m === -Infinity ? 0 : m
}

export function arrayMin(arr: ArrayLike<number>): number {
  let m = Infinity
  for (let i = 0; i < arr.length; i++) if (arr[i] < m) m = arr[i]
  return m === Infinity ? 0 : m
}
