import { describe, it, expect } from 'vitest'
import { scaffoldSectionsFor, sectionHintsFor, isUntouchedSentieroScaffold, SCAFFOLD_SECTIONS } from '../reportStore'

describe('scaffoldSectionsFor', () => {
  it('sentiero (o assente): lo scheletro di sempre', () => {
    expect(scaffoldSectionsFor(undefined)).toBe(SCAFFOLD_SECTIONS)
    expect(scaffoldSectionsFor('sentiero')).toBe(SCAFFOLD_SECTIONS)
  })

  it('sito museo: sezioni del museo, mai "Il percorso" né "Natura e storia"', () => {
    const titles = scaffoldSectionsFor('sito', 'museo').map(s => s.title)
    expect(titles).toEqual(['Il museo', 'Cronaca', 'Le opere e le sale', 'Consigli per la visita'])
  })

  it('borgo: include "Sapori e tradizioni" e non "Natura e storia"', () => {
    const titles = scaffoldSectionsFor('borgo_citta').map(s => s.title)
    expect(titles).toEqual(['Il borgo', 'Cronaca', 'Storia e curiosità', 'Sapori e tradizioni', 'In sintesi'])
  })

  it('ordine progressivo e id univoci', () => {
    const s = scaffoldSectionsFor('sito', 'cascata')
    expect(s.map(x => x.order)).toEqual(s.map((_, i) => i))
    expect(new Set(s.map(x => x.id)).size).toBe(s.length)
  })
})

describe('sectionHintsFor', () => {
  it('un suggerimento per ogni sezione, nessuno per un sentiero', () => {
    expect(sectionHintsFor('sentiero')).toEqual({})
    const sections = scaffoldSectionsFor('sito', 'castello')
    const hints = sectionHintsFor('sito', 'castello')
    for (const s of sections) expect(hints[s.title], s.title).toBeTruthy()
  })
})

describe('isUntouchedSentieroScaffold', () => {
  it('vero solo per lo scheletro da percorso ancora vuoto', () => {
    expect(isUntouchedSentieroScaffold(SCAFFOLD_SECTIONS)).toBe(true)
    expect(isUntouchedSentieroScaffold(SCAFFOLD_SECTIONS.map((s, i) => i === 0 ? { ...s, body: 'testo' } : s))).toBe(false)
    expect(isUntouchedSentieroScaffold(scaffoldSectionsFor('sito', 'museo'))).toBe(false)
  })
})
