import { describe, it, expect } from 'vitest'
import { guideProfileFor, GUIDE_PROFILES } from '../guideProfiles'
import { GUIDE_SECTIONS } from '../guideSections'

describe('guideProfileFor', () => {
  it('assente → trattato come sentiero (default di colonna)', () => {
    expect(guideProfileFor(undefined)).toBe(GUIDE_PROFILES.sentiero)
  })

  it('sentiero include tutte le sezioni, invariato rispetto a prima del piano multi-tipologia', () => {
    const profile = guideProfileFor('sentiero')
    expect(profile.availableSections).toEqual(GUIDE_SECTIONS.map(s => s.key))
    expect(profile.sectionOverrides).toBeUndefined()
    expect(profile.personaAddendum).toBeUndefined()
  })

  it('borgo_citta e sito escludono "dati_sicurezza" — nessuna metrica escursionistica fabbricata', () => {
    expect(guideProfileFor('borgo_citta').availableSections).not.toContain('dati_sicurezza')
    expect(guideProfileFor('sito').availableSections).not.toContain('dati_sicurezza')
  })

  it('borgo_citta e sito mantengono tutte le altre sezioni del sentiero', () => {
    const nonHiking = GUIDE_SECTIONS.map(s => s.key).filter(k => k !== 'dati_sicurezza')
    expect(guideProfileFor('borgo_citta').availableSections).toEqual(nonHiking)
    expect(guideProfileFor('sito').availableSections).toEqual(nonHiking)
  })

  it('borgo_citta e sito hanno un personaAddendum che vieta dislivello/traccia GPS', () => {
    expect(guideProfileFor('borgo_citta').personaAddendum).toMatch(/traccia GPS/)
    expect(guideProfileFor('sito').personaAddendum).toMatch(/traccia GPS/)
  })

  it('gli override di sezione hanno titolo e istruzioni non vuoti', () => {
    for (const metaType of ['borgo_citta', 'sito'] as const) {
      const overrides = guideProfileFor(metaType).sectionOverrides ?? {}
      for (const [, override] of Object.entries(overrides)) {
        expect(override.title.length).toBeGreaterThan(0)
        expect(override.brief.length).toBeGreaterThan(0)
      }
    }
  })
})
