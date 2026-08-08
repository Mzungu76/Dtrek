/**
 * Distribuisce le foto tra i capitoli narrativi in base alla loro progressione lungo il percorso
 * (0–1): ogni capitolo riceve le foto scattate durante la sua "fetta" di cammino.
 *
 * Era una funzione privata dentro `components/resoconto/ReportReader.tsx`. È stata estratta qui
 * quando è servita anche alla pagina pubblica del Diario: la stessa logica riscritta due volte è
 * esattamente il tipo di duplicazione che in questo progetto ha già prodotto divergenze silenziose
 * (vedi §4.4 del piano).
 *
 * Generica sul tipo di foto perché i due chiamanti hanno forme diverse: `RoutePhoto` porta
 * `progress: number`, mentre la lettura pubblica lo espone come `number | null` (una foto senza
 * coordinate GPS né riferimento temporale non ha una posizione lungo la traccia). Le foto senza
 * progressione finiscono in coda, non a caso nel primo capitolo.
 */
export function bucketPhotosByChapter<T extends { progress?: number | null }>(
  photos: T[],
  chapterCount: number,
): T[][] {
  if (chapterCount <= 0) return []
  const buckets: T[][] = Array.from({ length: chapterCount }, () => [])
  const sorted = [...photos].sort((a, b) => (a.progress ?? 1) - (b.progress ?? 1))
  for (const p of sorted) {
    const prog = p.progress ?? 1
    const idx = Math.min(chapterCount - 1, Math.max(0, Math.floor(prog * chapterCount)))
    buckets[idx].push(p)
  }
  return buckets
}
