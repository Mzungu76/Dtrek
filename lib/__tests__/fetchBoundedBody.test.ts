import { describe, it, expect } from 'vitest'
import { textBounded, bufferBounded, ResponseTooLargeError, MAX_IMPORT_FILE_BYTES } from '@/lib/fetchBoundedBody'

// DTREK-AUDIT.md P1 #14 — prima di questo fix, ogni fetch di un file/URL scelto dall'utente
// (GPX/KML/KMZ/GeoJSON) leggeva il body per intero senza alcun limite: un URL che punta a un file
// enorme (o a un server che continua a inviare dati) poteva far leggere in memoria un payload
// arbitrariamente grande a ogni richiesta.
describe('textBounded', () => {
  it('legge normalmente un body sotto il limite', async () => {
    const res = new Response('contenuto piccolo')
    expect(await textBounded(res, 1000)).toBe('contenuto piccolo')
  })

  it('rifiuta subito in base a Content-Length dichiarato, senza leggere il body', async () => {
    const res = new Response('x'.repeat(10), { headers: { 'content-length': '999999999' } })
    await expect(textBounded(res, 1000)).rejects.toBeInstanceOf(ResponseTooLargeError)
  })

  it('interrompe la lettura a stream quando il body reale supera il limite (nessun Content-Length dichiarato)', async () => {
    const bigChunk = 'a'.repeat(2000)
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(bigChunk))
        controller.close()
      },
    })
    const res = new Response(stream)
    await expect(textBounded(res, 1000)).rejects.toBeInstanceOf(ResponseTooLargeError)
  })

  it('accetta un body a stream esattamente al limite o sotto, distribuito su più chunk', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('a'.repeat(500)))
        controller.enqueue(new TextEncoder().encode('b'.repeat(500)))
        controller.close()
      },
    })
    const res = new Response(stream)
    const text = await textBounded(res, 1000)
    expect(text).toHaveLength(1000)
  })
})

describe('bufferBounded', () => {
  it('rifiuta un buffer oltre il limite', async () => {
    const res = new Response(new Uint8Array(2000))
    await expect(bufferBounded(res, 1000)).rejects.toBeInstanceOf(ResponseTooLargeError)
  })

  it('legge normalmente un buffer sotto il limite', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4])
    const res = new Response(bytes)
    const out = await bufferBounded(res, 1000)
    expect(Array.from(out)).toEqual([1, 2, 3, 4])
  })
})

describe('MAX_IMPORT_FILE_BYTES', () => {
  it('è un limite ragionevole per una traccia escursionistica (decine di MB, non centinaia)', () => {
    expect(MAX_IMPORT_FILE_BYTES).toBeGreaterThan(1 * 1024 * 1024)
    expect(MAX_IMPORT_FILE_BYTES).toBeLessThanOrEqual(50 * 1024 * 1024)
  })
})
