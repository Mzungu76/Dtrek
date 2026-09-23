import { describe, it, expect } from 'vitest'
import { upscaleWikiThumbnail } from '../wikipedia'

describe('upscaleWikiThumbnail', () => {
  it('sostituisce la larghezza nel path di un thumbnail MediaWiki', () => {
    expect(upscaleWikiThumbnail(
      'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Foto.jpg/320px-Foto.jpg',
      1200,
    )).toBe('https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Foto.jpg/1200px-Foto.jpg')
  })

  it('gestisce un nome file con caratteri speciali/spazi codificati', () => {
    expect(upscaleWikiThumbnail(
      'https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/Palazzo%20Farnese.png/220px-Palazzo%20Farnese.png',
      1200,
    )).toBe('https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/Palazzo%20Farnese.png/1200px-Palazzo%20Farnese.png')
  })

  it('un url che non è un thumbnail MediaWiki (nessuna larghezza nel path) resta invariato', () => {
    const url = 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Foto.jpg'
    expect(upscaleWikiThumbnail(url, 1200)).toBe(url)
  })
})
