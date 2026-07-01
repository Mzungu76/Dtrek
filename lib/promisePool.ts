// Runs `worker` over `items` with at most `concurrency` in flight at once —
// used to progressively enrich a large area-search result list (30-50+
// pendingCandidates) via per-trail detail fetches without firing them all in
// parallel. A single item's failure doesn't stop the rest.
export async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
  onResult: (item: T, result: R) => void,
): Promise<void> {
  let index = 0

  async function next(): Promise<void> {
    const i = index++
    if (i >= items.length) return
    try {
      const result = await worker(items[i])
      onResult(items[i], result)
    } catch {
      // swallow — one failed enrichment shouldn't stop the others
    }
    return next()
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, next))
}
