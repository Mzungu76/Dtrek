/** Thrown by streamFetchText on a non-2xx response — carries the raw parsed JSON body (if any)
 *  so callers can build their own display message (message vs error code) and branch on status
 *  (e.g. 402 "add your API key") exactly like before this was extracted, instead of this module
 *  picking one fallback message for every caller. */
export class StreamFetchError extends Error {
  status: number
  body: unknown
  constructor(status: number, body: unknown) {
    super(`HTTP ${status}`)
    this.name = 'StreamFetchError'
    this.status = status
    this.body = body
  }
}

/**
 * POSTs `body` as JSON to `url` and reads back a streamed text response chunk by chunk —
 * the fetch/read-loop mechanics shared by every AI-streaming call in this app (guide
 * generation/section-refresh, resoconto generation). Calls `onChunk` with the cumulative
 * decoded text so far after each chunk (for a live preview), if provided, and resolves with the
 * final accumulated text once the stream ends.
 */
export async function streamFetchText(url: string, body: unknown, onChunk?: (acc: string) => void): Promise<string> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const j = await res.json().catch(() => ({}))
    throw new StreamFetchError(res.status, j)
  }

  const reader  = res.body!.getReader()
  const decoder = new TextDecoder()
  let acc = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    acc += decoder.decode(value, { stream: true })
    onChunk?.(acc)
  }
  return acc
}
