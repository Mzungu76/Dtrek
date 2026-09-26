import { describe, it, expect } from 'vitest'
import { guideProfileFor, GUIDE_PROFILES } from '../guideProfiles'
import { GUIDE_SECTIONS, sectionDefForTitle } from '../guideSections'
import { SITE_TYPES } from '../metaTypes'
import { borgoCardVariant, isNaturalSiteType } from '../guideCardVariant'

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

  it('borgo_citta e sito (base, non naturalistico) escludono "dati_sicurezza", "comfort" e "natura" — nessuna metrica/confronto escursionistico o galleria di specie fabbricata', () => {
    expect(guideProfileFor('borgo_citta').availableSections).not.toContain('dati_sicurezza')
    expect(guideProfileFor('sito').availableSections).not.toContain('dati_sicurezza')
    expect(guideProfileFor('borgo_citta').availableSections).not.toContain('comfort')
    expect(guideProfileFor('sito').availableSections).not.toContain('comfort')
    expect(guideProfileFor('borgo_citta').availableSections).not.toContain('natura')
    expect(guideProfileFor('sito').availableSections).not.toContain('natura')
  })

  it('borgo_citta e sito (base, non naturalistico) mantengono tutte le altre sezioni del sentiero', () => {
    const nonHiking = GUIDE_SECTIONS.map(s => s.key).filter(k => k !== 'dati_sicurezza' && k !== 'comfort' && k !== 'natura')
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
    expect(override?.title).toBe('Itinerario consigliato')
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
      // availableSections resta quello del profilo 'sito' base per ogni siteType, TRANNE i
      // naturalistici (isNaturalSiteType, verifica post-piano guide-eccellenza), che riguadagnano
      // "natura" — personaAddendum resta comunque sempre quello generico.
      if (isNaturalSiteType(siteType)) {
        expect(profile.availableSections).toContain('natura')
      } else {
        expect(profile.availableSections).toEqual(generic.availableSections)
      }
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

// piano §52.5 — un Sito nested (parentMetaId valorizzato) condivide il contesto territoriale col
// suo Borgo/Città genitore: sapori/consigli, già raccontati lì, sono ridondanti nella Guida figlia.
describe('guideProfileFor — Sito nested (piano §52.5)', () => {
  it('un Sito nested esclude "sapori" e "consigli" in più delle esclusioni base', () => {
    const profile = guideProfileFor('sito', undefined, undefined, true)
    expect(profile.availableSections).not.toContain('sapori')
    expect(profile.availableSections).not.toContain('consigli')
  })

  it('un Sito autonomo (isNestedSite assente o false) mantiene "sapori" e "consigli"', () => {
    expect(guideProfileFor('sito').availableSections).toContain('sapori')
    expect(guideProfileFor('sito').availableSections).toContain('consigli')
    expect(guideProfileFor('sito', undefined, undefined, false).availableSections).toContain('sapori')
  })

  it('isNestedSite non tocca sectionOverrides/personaAddendum né le altre sezioni disponibili', () => {
    const base = guideProfileFor('sito', 'museo')
    const nested = guideProfileFor('sito', 'museo', undefined, true)
    expect(nested.sectionOverrides).toEqual(base.sectionOverrides)
    expect(nested.personaAddendum).toBe(base.personaAddendum)
    expect(nested.availableSections).toEqual(base.availableSections.filter(k => k !== 'sapori' && k !== 'consigli'))
  })

  it('un Sito naturalistico nested mantiene "natura" (non tra le sezioni escluse per nested)', () => {
    const profile = guideProfileFor('sito', 'cascata', undefined, true)
    expect(profile.availableSections).toContain('natura')
  })

  it('isNestedSite è ignorato per metaType diverso da "sito"', () => {
    expect(guideProfileFor('borgo_citta', undefined, undefined, true)).toEqual(guideProfileFor('borgo_citta'))
    expect(guideProfileFor('sentiero', undefined, undefined, true)).toEqual(guideProfileFor('sentiero'))
  })
})

// piano guide-eccellenza §Fase 3 — lib/guideCardVariant.ts promette che un Borgo/Città
// 'trekking_misto' mantiene "Dati e sicurezza" quasi come un Sentiero; guideProfileFor lo
// escludeva prima per OGNI borgo_citta senza eccezione, in disaccordo con quella promessa.
describe('guideProfileFor — variante borgo_citta (piano guide-eccellenza §Fase 3)', () => {
  it('nessuna variante (o "cammino_urbano") esclude "dati_sicurezza", come il profilo base', () => {
    expect(guideProfileFor('borgo_citta').availableSections).not.toContain('dati_sicurezza')
    expect(guideProfileFor('borgo_citta', undefined, 'cammino_urbano').availableSections).not.toContain('dati_sicurezza')
  })

  it('"trekking_misto" include "dati_sicurezza" e "natura" ma non "comfort" — il piano cita solo dati_sicurezza, natura segue la stessa logica (verifica post-piano)', () => {
    const profile = guideProfileFor('borgo_citta', undefined, 'trekking_misto')
    expect(profile.availableSections).toContain('dati_sicurezza')
    expect(profile.availableSections).toContain('natura')
    expect(profile.availableSections).not.toContain('comfort')
  })

  it('"trekking_misto" non tocca gli override di sezione ("Il percorso" resta "Il borgo")', () => {
    const base = guideProfileFor('borgo_citta')
    const trekkingMisto = guideProfileFor('borgo_citta', undefined, 'trekking_misto')
    expect(trekkingMisto.sectionOverrides).toEqual(base.sectionOverrides)
    expect(trekkingMisto.personaAddendum).toBe(base.personaAddendum)
  })

  it('borgoVariant è ignorato per metaType diverso da "borgo_citta"', () => {
    expect(guideProfileFor('sito', undefined, 'trekking_misto')).toEqual(guideProfileFor('sito'))
    expect(guideProfileFor('sentiero', undefined, 'trekking_misto')).toEqual(guideProfileFor('sentiero'))
  })

  // La verifica letterale del "Fatto quando" del piano: le due fonti (guideCardVariant.ts che
  // decide la variante, guideProfiles.ts che decide le sezioni) devono dire la stessa cosa per lo
  // stesso hike — non solo per lo stesso valore di variant passato a mano.
  it('un Borgo/Città con una traccia GPS reale collegata ottiene "Dati e sicurezza"; senza, no', () => {
    const conTraccia = { trackPoints: [{ lat: 42.1, lon: 12.1 }, { lat: 42.2, lon: 12.2 }] }
    const senzaTraccia = { trackPoints: [] }
    expect(borgoCardVariant(conTraccia)).toBe('trekking_misto')
    expect(borgoCardVariant(senzaTraccia)).toBe('cammino_urbano')
    expect(guideProfileFor('borgo_citta', undefined, borgoCardVariant(conTraccia)).availableSections)
      .toContain('dati_sicurezza')
    expect(guideProfileFor('borgo_citta', undefined, borgoCardVariant(senzaTraccia)).availableSections)
      .not.toContain('dati_sicurezza')
  })
})

// Verifica post-piano guide-eccellenza: "Natura intorno a te" non ha senso per un Borgo/Città o
// un Sito generico (NaturaWidget mostrava comunque due pulsanti "Galleria" quasi certamente
// vuoti) — solo un Borgo/Città trekking_misto (traccia reale) o un Sito naturalistico
// (isNaturalSiteType: cascata, grotta, belvedere, area naturale) hanno un "intorno" reale da
// raccontare.
describe('guideProfileFor — sezione "natura" condizionata alla tipologia', () => {
  it('un Sentiero include sempre "natura"', () => {
    expect(guideProfileFor('sentiero').availableSections).toContain('natura')
  })

  it('un Borgo/Città cammino_urbano (o senza variante) esclude "natura"; trekking_misto la include', () => {
    expect(guideProfileFor('borgo_citta').availableSections).not.toContain('natura')
    expect(guideProfileFor('borgo_citta', undefined, 'cammino_urbano').availableSections).not.toContain('natura')
    expect(guideProfileFor('borgo_citta', undefined, 'trekking_misto').availableSections).toContain('natura')
  })

  it('un Sito naturalistico include "natura"; ogni altro Sito la esclude', () => {
    for (const siteType of SITE_TYPES) {
      const profile = guideProfileFor('sito', siteType)
      if (isNaturalSiteType(siteType)) {
        expect(profile.availableSections, siteType).toContain('natura')
      } else {
        expect(profile.availableSections, siteType).not.toContain('natura')
      }
    }
    expect(guideProfileFor('sito', undefined).availableSections).not.toContain('natura')
  })

  it('cascata, grotta, belvedere, area_naturale sono esattamente i Siti naturalistici', () => {
    const expected = ['cascata', 'grotta', 'belvedere', 'area_naturale']
    for (const siteType of SITE_TYPES) {
      expect(isNaturalSiteType(siteType), siteType).toBe(expected.includes(siteType))
    }
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
