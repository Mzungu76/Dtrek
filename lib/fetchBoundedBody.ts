// DTREK-AUDIT.md P1 #14 — ogni fetch di un file esterno scelto dall'utente (GPX/KML/KMZ/GeoJSON
// da URL, o la pagina HTML che li linka) leggeva il body per intero senza alcun limite di
// dimensione: un URL che punta a un file enorme (o a un server che risponde in streaming senza
// mai chiudere) poteva far leggere in memoria un payload arbitrariamente grande a ogni richiesta.
// Legge il body a stream, interrompe la lettura (e chiude la connessione) appena supera maxBytes
// — più robusto di un controllo solo su Content-Length, che il server può omettere o dichiarare
// in modo scorretto.
export class ResponseTooLargeError extends Error {}

// Una traccia GPX/KML/GeoJSON per una singola escursione, anche molto densa (migliaia di
// trackpoint), resta tipicamente sotto qualche MB — 20MB lascia ampio margine senza permettere un
// download effettivamente illimitato.
export const MAX_IMPORT_FILE_BYTES = 20 * 1024 * 1024
// La pagina HTML che linka una traccia (findGpxLinkOnPage e affini) va letta solo per trovare un
// href — nessuna pagina web legittima di questo tipo dovrebbe avvicinarsi a questa soglia.
export const MAX_HTML_PAGE_BYTES = 5 * 1024 * 1024

async function readBodyBounded(res: Response, maxBytes: number): Promise<Uint8Array> {
  const contentLength = res.headers.get('content-length')
  if (contentLength && Number(contentLength) > maxBytes) {
    throw new ResponseTooLargeError(`Content-Length ${contentLength} supera il limite di ${maxBytes} byte`)
  }

  if (!res.body) {
    // Fallback per un ambiente senza streaming body (non atteso sul runtime Node di Vercel, ma
    // più sicuro non assumerlo) — legge tutto e controlla dopo, meglio di nessun controllo.
    const buf = new Uint8Array(await res.arrayBuffer())
    if (buf.byteLength > maxBytes) throw new ResponseTooLargeError(`Risposta di ${buf.byteLength} byte supera il limite di ${maxBytes} byte`)
    return buf
  }

  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        throw new ResponseTooLargeError(`Risposta oltre ${maxBytes} byte — lettura interrotta`)
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

/** Come `res.text()`, ma interrompe la lettura (e lancia ResponseTooLargeError) oltre maxBytes. */
export async function textBounded(res: Response, maxBytes: number): Promise<string> {
  const bytes = await readBodyBounded(res, maxBytes)
  return new TextDecoder('utf-8').decode(bytes)
}

/** Come `res.arrayBuffer()` restituito come Uint8Array, con lo stesso limite di textBounded. */
export async function bufferBounded(res: Response, maxBytes: number): Promise<Uint8Array> {
  return readBodyBounded(res, maxBytes)
}
