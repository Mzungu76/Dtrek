import { describe, it, expect } from 'vitest'
import { isTrustedMediaUrl } from '../trustedMediaHosts'

describe('isTrustedMediaUrl', () => {
  it('accetta upload.wikimedia.org (Action API di Wikipedia)', () => {
    expect(isTrustedMediaUrl('https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Foto.jpg/1200px-Foto.jpg')).toBe(true)
  })

  it('accetta commons.wikimedia.org (Special:FilePath da Wikidata P18)', () => {
    expect(isTrustedMediaUrl('https://commons.wikimedia.org/wiki/Special:FilePath/Foto.jpg?width=1200')).toBe(true)
  })

  it('rifiuta thumb.wikimedia.org — mai usato da nessuno dei due livelli, visto dal vivo su Viterbo con parametri utm_ di tracciamento', () => {
    expect(isTrustedMediaUrl('https://thumb.wikimedia.org/wikipedia/commons/thumb/0/0b/Vithall.jpg/1200px-Vithall.jpg?utm_source=it.wikipedia.org&utm_campaign=api&utm_content=thumbnail')).toBe(false)
  })

  it('rifiuta un dominio arbitrario', () => {
    expect(isTrustedMediaUrl('https://example.com/foto.jpg')).toBe(false)
  })

  it('rifiuta un URL malformato senza lanciare un\'eccezione', () => {
    expect(isTrustedMediaUrl('non-un-url')).toBe(false)
  })
})
