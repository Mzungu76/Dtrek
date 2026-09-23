import { describe, it, expect, afterEach, vi } from 'vitest'
import { fetchPageThumbnail } from '../wikipedia'

describe('fetchPageThumbnail', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('restituisce la thumbnail alla larghezza richiesta tramite pithumbsize', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        query: {
          pages: {
            123: {
              thumbnail: { source: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Foto.jpg/1200px-Foto.jpg' },
            },
          },
        },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const url = await fetchPageThumbnail('Calcata', 'it', 1200)

    expect(url).toBe('https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Foto.jpg/1200px-Foto.jpg')
    const requestedUrl = fetchMock.mock.calls[0][0] as string
    expect(requestedUrl).toContain('it.wikipedia.org')
    expect(requestedUrl).toContain('pithumbsize=1200')
    expect(requestedUrl).toContain(encodeURIComponent('Calcata'))
  })

  it('nessuna thumbnail disponibile per la pagina → null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ query: { pages: { 123: {} } } }),
    }))

    expect(await fetchPageThumbnail('Pagina senza immagine', 'it', 1200)).toBeNull()
  })

  it('risposta HTTP non ok → null, mai un\'eccezione propagata', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))

    expect(await fetchPageThumbnail('Qualcosa', 'it', 1200)).toBeNull()
  })

  it('errore di rete → null, mai un\'eccezione propagata', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

    expect(await fetchPageThumbnail('Qualcosa', 'it', 1200)).toBeNull()
  })
})
