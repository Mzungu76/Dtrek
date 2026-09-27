import { describe, it, expect } from 'vitest'
import { reportProfileFor, REPORT_PROFILES } from '../reportProfiles'

describe('reportProfileFor', () => {
  it('assente → trattato come sentiero (default di colonna)', () => {
    expect(reportProfileFor(undefined)).toBe(REPORT_PROFILES.sentiero)
  })

  it('sentiero mantiene le metriche escursionistiche e "Il percorso"', () => {
    const profile = reportProfileFor('sentiero')
    expect(profile.hikingMetrics).toBe(true)
    expect(profile.sectionTitle).toBe('Il percorso')
    expect(profile.personaAddendum).toBeUndefined()
  })

  it('borgo_citta e sito escludono le metriche escursionistiche', () => {
    expect(reportProfileFor('borgo_citta').hikingMetrics).toBe(false)
    expect(reportProfileFor('sito').hikingMetrics).toBe(false)
  })

  it('borgo_citta e sito hanno un titolo di sezione dedicato, non "Il percorso"', () => {
    expect(reportProfileFor('borgo_citta').sectionTitle).toBe('Il borgo')
    expect(reportProfileFor('sito').sectionTitle).toBe('Il sito')
  })

  it('borgo_citta e sito hanno un personaAddendum che vieta distanza/dislivello/passo', () => {
    expect(reportProfileFor('borgo_citta').personaAddendum).toMatch(/dislivello/)
    expect(reportProfileFor('sito').personaAddendum).toMatch(/dislivello/)
  })

  it('ogni profilo ha un sectionBrief non vuoto', () => {
    for (const metaType of ['sentiero', 'borgo_citta', 'sito'] as const) {
      expect(reportProfileFor(metaType).sectionBrief.length).toBeGreaterThan(0)
    }
  })

  it('sentiero mantiene "Natura e storia" come seconda sezione', () => {
    expect(reportProfileFor('sentiero').section2Title).toBe('Natura e storia')
  })

  it('borgo_citta e sito hanno "Storia e curiosità" al posto di "Natura e storia"', () => {
    expect(reportProfileFor('borgo_citta').section2Title).toBe('Storia e curiosità')
    expect(reportProfileFor('sito').section2Title).toBe('Storia e curiosità')
  })

  it('solo sentiero valuta la "difficoltà" nella sezione finale', () => {
    expect(reportProfileFor('sentiero').section3Brief).toMatch(/difficoltà/)
    expect(reportProfileFor('borgo_citta').section3Brief).not.toMatch(/difficoltà/)
    expect(reportProfileFor('sito').section3Brief).not.toMatch(/difficoltà/)
  })

  it('un siteType noto sovrascrive titolo e brief della prima sezione di un sito', () => {
    const museo = reportProfileFor('sito', 'museo')
    expect(museo.sectionTitle).toBe('Il museo')
    expect(museo.sectionBrief).toMatch(/opere/)
    // Le altre due sezioni restano quelle del profilo 'sito' generico.
    expect(museo.section2Title).toBe('Storia e curiosità')
    expect(museo.section3Title).toBe('In sintesi')
  })

  it('siteType assente o "altro" (nessun override) ricade sul profilo sito generico', () => {
    expect(reportProfileFor('sito', undefined)).toBe(REPORT_PROFILES.sito)
    expect(reportProfileFor('sito', 'altro')).toBe(REPORT_PROFILES.sito)
  })

  it('siteType è ignorato per metaType diversi da sito', () => {
    expect(reportProfileFor('borgo_citta', 'museo')).toBe(REPORT_PROFILES.borgo_citta)
    expect(reportProfileFor('sentiero', 'museo')).toBe(REPORT_PROFILES.sentiero)
  })

  it('solo borgo_citta ha una sezione "Sapori e tradizioni" — sentiero e sito restano a 3 sezioni', () => {
    expect(reportProfileFor('borgo_citta').saporiTitle).toBe('Sapori e tradizioni')
    expect(reportProfileFor('borgo_citta').saporiBrief?.length).toBeGreaterThan(0)
    expect(reportProfileFor('sentiero').saporiTitle).toBeUndefined()
    expect(reportProfileFor('sito').saporiTitle).toBeUndefined()
  })
})
