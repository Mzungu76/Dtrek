import { describe, it, expect, afterEach, vi } from 'vitest'
import { fetchPageThumbnail, fetchNearbyWiki } from '../wikipedia'

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
    const requestOptions = fetchMock.mock.calls[0][1] as RequestInit
    expect((requestOptions.headers as Record<string, string>)['User-Agent']).toBe('DtrekApp/1.0')
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

describe('fetchNearbyWiki', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('invia lo User-Agent sulla geosearch e Api-User-Agent sulle summary, restituendo i risultati parsati', async () => {
    const geosearchResponse = {
      ok: true,
      json: async () => ({
        query: {
          geosearch: [
            { pageid: 1, title: 'Duomo di Cefalù', dist: 120 },
            { pageid: 2, title: 'Rocca di Cefalù', dist: 340 },
          ],
        },
      }),
    }
    const summaryResponse = (title: string) => ({
      ok: true,
      json: async () => ({
        title,
        description: 'Monumento storico',
        extract: 'Un estratto sufficientemente lungo da superare la soglia minima di trenta caratteri.',
        thumbnail: { source: 'https://upload.wikimedia.org/thumb.jpg' },
        content_urls: { desktop: { page: `https://it.wikipedia.org/wiki/${encodeURIComponent(title)}` } },
        coordinates: { lat: 38.04, lon: 14.02 },
      }),
    })

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(geosearchResponse)
      .mockResolvedValueOnce(summaryResponse('Duomo di Cefalù'))
      .mockResolvedValueOnce(summaryResponse('Rocca di Cefalù'))
    vi.stubGlobal('fetch', fetchMock)

    const pages = await fetchNearbyWiki(38.04, 14.02, 8000, 6, 'it')

    expect(pages).toHaveLength(2)
    expect(pages[0].title).toBe('Duomo di Cefalù')
    expect(pages[0].dist).toBe(120)

    const geosearchOptions = fetchMock.mock.calls[0][1] as RequestInit
    expect((geosearchOptions.headers as Record<string, string>)['User-Agent']).toBe('DtrekApp/1.0')

    const summaryOptions = fetchMock.mock.calls[1][1] as RequestInit
    expect((summaryOptions.headers as Record<string, string>)['Api-User-Agent']).toBe('DtrekApp/1.0')
  })

  it('geosearch HTTP non ok → array vuoto, mai un\'eccezione propagata', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))

    expect(await fetchNearbyWiki(38.04, 14.02)).toEqual([])
  })

  it('geosearch senza risultati → array vuoto', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ query: { geosearch: [] } }),
    }))

    expect(await fetchNearbyWiki(38.04, 14.02)).toEqual([])
  })

  it('summary con extract troppo corto viene scartata', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ query: { geosearch: [{ pageid: 1, title: 'Pagina Breve', dist: 50 }] } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ title: 'Pagina Breve', extract: 'Troppo corto' }),
      })
    vi.stubGlobal('fetch', fetchMock)

    expect(await fetchNearbyWiki(38.04, 14.02)).toEqual([])
  })
})
