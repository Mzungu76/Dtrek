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

/**
 * Sceglie al massimo `max` foto distribuite lungo il percorso.
 *
 * Una escursione può avere venti foto; nel Diario ognuna occupa ~284 px di colonna, cioè quanto
 * diciassette righe di testo. Venti foto sono più di due pagine intere di sole immagini, e sono la
 * ragione per cui i resoconti sforavano. Qui se ne tengono poche, ma **distribuite**: prendere le
 * prime N racconterebbe solo l'inizio del cammino.
 *
 * La selezione è per posizione lungo la traccia, non per ordine di caricamento: si divide il
 * percorso in `max` fasce uguali e da ognuna si prende la foto più vicina al centro della fascia.
 * Prima e ultima sono sempre incluse quando possibile — sono la partenza e l'arrivo.
 */
export function selectSpreadPhotos<T extends { progress?: number | null }>(photos: T[], max: number): T[] {
  if (max <= 0) return []
  if (photos.length <= max) return photos

  const sorted = [...photos].sort((a, b) => (a.progress ?? 1) - (b.progress ?? 1))
  const picked: T[] = []
  const used = new Set<number>()

  for (let slot = 0; slot < max; slot++) {
    // Centro della fascia, in progressione 0–1.
    const target = (slot + 0.5) / max
    let bestIdx = -1
    let bestDist = Infinity
    sorted.forEach((p, i) => {
      if (used.has(i)) return
      const d = Math.abs((p.progress ?? i / sorted.length) - target)
      if (d < bestDist) { bestDist = d; bestIdx = i }
    })
    if (bestIdx >= 0) { used.add(bestIdx); picked.push(sorted[bestIdx]) }
  }
  return picked.sort((a, b) => (a.progress ?? 1) - (b.progress ?? 1))
}
