import { describe, it, expect } from 'vitest'
import { archiveDescriptionCredit, wikipediaDescriptionCredit, stripEmbeddedAttribution } from '../placeSources'

describe('placeSources', () => {
  it('fonti note dell\'archivio', () => {
    expect(archiveDescriptionCredit('mic')?.label).toMatch(/Ministero della Cultura/)
    expect(archiveDescriptionCredit('lombardia_sirbec')?.label).toMatch(/Lombardia/)
    expect(archiveDescriptionCredit('ptpr_lazio')?.label).toMatch(/PTPR/)
  })

  it('fonte sconosciuta o assente: nessuna attribuzione inventata', () => {
    expect(archiveDescriptionCredit('boh')).toBeNull()
    expect(archiveDescriptionCredit(null)).toBeNull()
  })

  it('Wikipedia con e senza link', () => {
    expect(wikipediaDescriptionCredit('https://it.wikipedia.org/wiki/X')).toEqual({ label: 'Wikipedia (CC BY-SA 4.0)', url: 'https://it.wikipedia.org/wiki/X' })
    expect(wikipediaDescriptionCredit()).toEqual({ label: 'Wikipedia (CC BY-SA 4.0)' })
  })

  it('toglie l\'attribuzione PTPR incorporata nel testo', () => {
    expect(stripEmbeddedAttribution('Tipo: 71 · note · PTPR Regione Lazio — Tavola B (CC BY 4.0)')).toBe('Tipo: 71 · note')
    expect(stripEmbeddedAttribution('Un museo del 1954.')).toBe('Un museo del 1954.')
  })
})
