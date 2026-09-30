import { describe, it, expect } from 'vitest'
import { normalizeDashboardConfig, applyPin, DEFAULT_PINNED } from '../dashboardConfig'

describe('dashboardConfig: widget fissati', () => {
  it('senza pinned (configurazione vecchia) usa i due di sempre', () => {
    expect(normalizeDashboardConfig({ tabs: [{ id: 'a', label: 'A', widgetIds: [] }] }).pinned).toEqual(DEFAULT_PINNED)
    expect(normalizeDashboardConfig(null).pinned).toEqual(DEFAULT_PINNED)
  })

  it('rispetta una scelta vuota, scarta id sconosciuti e duplicati, tiene al massimo due', () => {
    const cfg = (pinned: unknown) => normalizeDashboardConfig({ tabs: [{ id: 'a', label: 'A', widgetIds: [] }], pinned })
    expect(cfg([]).pinned).toEqual([])
    expect(cfg(['streak', 'nonesiste', 'streak', 'volume', 'forma']).pinned).toEqual(['streak', 'volume'])
    expect(cfg('bad').pinned).toEqual(DEFAULT_PINNED)
  })

  it('applyPin sostituisce, aggiunge, svuota e scambia', () => {
    expect(applyPin(['recovery', 'prossima-uscita'], 0, 'streak')).toEqual(['streak', 'prossima-uscita'])
    expect(applyPin(['recovery'], 1, 'volume')).toEqual(['recovery', 'volume'])
    expect(applyPin(['recovery', 'volume'], 0, null)).toEqual(['volume'])
    expect(applyPin(['recovery', 'volume'], 0, 'volume')).toEqual(['volume', 'recovery']) // scambio, non si perde recovery
    expect(applyPin(['recovery'], 1, 'recovery')).toEqual(['recovery']) // già fissato: nessuna copia
  })
})
