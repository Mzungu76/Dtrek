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
})
