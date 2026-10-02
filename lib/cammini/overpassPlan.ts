// Logica pura del client Overpass: blocchi, rotazione degli endpoint, attese con jitter.

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** Id ancora da scaricare (senza duplicati, ordine conservato). */
export function missingIds(ids: number[], has: (id: number) => boolean): number[] {
  return Array.from(new Set(ids)).filter(id => !has(id))
}

/** Rotazione: ogni giro parte da un endpoint diverso, così uno lento non è sempre il primo. */
export function endpointOrder<T>(endpoints: T[], round: number, startOffset = 0): T[] {
  const n = endpoints.length
  const shift = (((round - 1) + startOffset) % n + n) % n
  return [...endpoints.slice(shift), ...endpoints.slice(0, shift)]
}

/** Attesa prima del giro successivo: cresce col giro (60 s, 120 s, …) fino a un tetto, con ±25% di jitter (rand in [0,1)). */
export function backoffMs(round: number, rand: number, baseMs = 60_000, capMs = 300_000): number {
  return Math.round(Math.min(baseMs * round, capMs) * (0.75 + rand * 0.5))
}
