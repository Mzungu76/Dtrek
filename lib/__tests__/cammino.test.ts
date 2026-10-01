import { describe, expect, it } from 'vitest'
import { META_TYPES, META_TYPE_CONFIG, isMetaType, metaHasHikingMetrics } from '../metaTypes'
import { guideProfileFor } from '../guideProfiles'
import { reportProfileFor } from '../reportProfiles'
import { reportFixedSectionsFor } from '../reportSections'
import { metaEligibleForHikingScores } from '../guideCardVariant'

describe('MetaType cammino (piano Cammini, Fase 1)', () => {
  it('è una tipologia valida con metriche escursionistiche', () => {
    expect(META_TYPES).toContain('cammino')
    expect(isMetaType('cammino')).toBe(true)
    expect(META_TYPE_CONFIG.cammino.pluralLabel).toBe('Cammini')
    expect(metaHasHikingMetrics('cammino')).toBe(true)
  })

  it('è idoneo ai punteggi escursionistici anche senza traccia caricata', () => {
    expect(metaEligibleForHikingScores({ metaType: 'cammino' })).toBe(true)
  })

  it('la Guida ha tutte le sezioni, con "Tappa per tappa" al posto dei luoghi', () => {
    const profile = guideProfileFor('cammino')
    expect(profile.availableSections).toContain('dati_sicurezza')
    expect(profile.sectionOverrides?.luoghi?.title).toBe('Tappa per tappa')
    expect(profile.sectionOverrides?.il_percorso?.title).toBe('Il cammino')
  })

  it('il Reportage è profilato sul cammino e include i dati escursionistici', () => {
    expect(reportProfileFor('cammino').sectionTitle).toBe('Il cammino')
    expect(reportFixedSectionsFor({ metaType: 'cammino' })).toEqual(
      expect.arrayContaining(['dati_punteggi', 'andamento', 'natura', 'poi', 'galleria_foto']),
    )
  })
})
