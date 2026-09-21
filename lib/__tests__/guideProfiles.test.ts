import { describe, it, expect } from 'vitest'
import { guideProfileFor, GUIDE_PROFILES } from '../guideProfiles'
import { GUIDE_SECTIONS, sectionDefForTitle } from '../guideSections'
import { SITE_TYPES } from '../metaTypes'

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

  it('borgo_citta e sito escludono "dati_sicurezza" e "comfort" — nessuna metrica/confronto escursionistico fabbricato', () => {
    expect(guideProfileFor('borgo_citta').availableSections).not.toContain('dati_sicurezza')
    expect(guideProfileFor('sito').availableSections).not.toContain('dati_sicurezza')
    expect(guideProfileFor('borgo_citta').availableSections).not.toContain('comfort')
    expect(guideProfileFor('sito').availableSections).not.toContain('comfort')
  })

  it('borgo_citta e sito mantengono tutte le altre sezioni del sentiero', () => {
    const nonHiking = GUIDE_SECTIONS.map(s => s.key).filter(k => k !== 'dati_sicurezza' && k !== 'comfort')
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

  it('borgo_citta sovrascrive "luoghi" con la narrazione tappa-per-tappa (piano §29)', () => {
    const override = guideProfileFor('borgo_citta').sectionOverrides?.luoghi
    expect(override?.title).toBe('Le tappe del borgo')
    expect(override?.brief).toMatch(/TAPPA 1/)
  })
})

describe('guideProfileFor — profili per siteType (piano §30)', () => {
  it('sito senza siteType (o "altro") resta sul profilo generico', () => {
    const generic = guideProfileFor('sito')
    expect(guideProfileFor('sito', undefined)).toEqual(generic)
    expect(guideProfileFor('sito', 'altro')).toEqual(generic)
  })

  it('ogni siteType con un override produce un profilo diverso da quello generico, con titolo/brief non vuoti', () => {
    const generic = guideProfileFor('sito')
    for (const siteType of SITE_TYPES) {
      const profile = guideProfileFor('sito', siteType)
      // availableSections/personaAddendum restano quelli del profilo 'sito' base — solo prima_di_partire/il_percorso cambiano.
      expect(profile.availableSections).toEqual(generic.availableSections)
      expect(profile.personaAddendum).toBe(generic.personaAddendum)
      if (siteType === 'altro') continue
      expect(profile.sectionOverrides?.il_percorso?.title).not.toBe(generic.sectionOverrides?.il_percorso?.title)
      expect(profile.sectionOverrides?.il_percorso?.brief.length).toBeGreaterThan(0)
      expect(profile.sectionOverrides?.prima_di_partire?.brief.length).toBeGreaterThan(0)
    }
  })

  it('siteType è ignorato per metaType diverso da "sito"', () => {
    expect(guideProfileFor('borgo_citta', 'museo')).toEqual(guideProfileFor('borgo_citta'))
    expect(guideProfileFor('sentiero', 'museo')).toEqual(guideProfileFor('sentiero'))
  })
})

// Regressione: components/guida/GuideReader.tsx e lib/guideParse.ts riconoscono una sezione SOLO
// tramite sectionDefForTitle(titolo) → GUIDE_SECTIONS[k].match — un override che introduce un
// nuovo titolo (es. "Il museo" per il_percorso) senza aggiungere la relativa voce a `match` produce
// una sezione scritta da Giulia ma mai riconosciuta: il body sparisce dalla card canonica e finisce
// scambiato per una sezione "legacy". Copre ogni combinazione metaType×siteType, non solo i pochi
// casi toccati a mano sopra.
describe('ogni titolo di override risolve alla sua sezione canonica (lib/guideSections.ts match)', () => {
  const metaTypes = ['sentiero', 'borgo_citta', 'sito'] as const
  for (const metaType of metaTypes) {
    for (const siteType of metaType === 'sito' ? SITE_TYPES : [undefined]) {
      const label = siteType ? `sito/${siteType}` : metaType
      it(label, () => {
        const profile = guideProfileFor(metaType, siteType)
        for (const [key, override] of Object.entries(profile.sectionOverrides ?? {})) {
          expect(sectionDefForTitle(override.title)?.key, `override "${override.title}" per la sezione "${key}"`).toBe(key)
        }
      })
    }
  }
})
