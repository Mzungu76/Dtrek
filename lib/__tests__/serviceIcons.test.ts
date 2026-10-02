import { describe, it, expect } from 'vitest'
import { servicePopupHtml, serviceBadgeMarkup, serviceIconFor, SERVICE_STYLE } from '../../components/guida/serviceIcons'
import type { ServiceItem } from '../cammini/services'

const base: ServiceItem = { id: 'node/1', category: 'lodging', kind: 'Hotel', lat: 1, lon: 2, confidence: 'bassa' }

describe('servicePopupHtml', () => {
  it('escapa nomi e testi che vengono da OpenStreetMap', () => {
    const html = servicePopupHtml({ ...base, name: '<img src=x onerror=alert(1)>', openingHours: '"><script>x</script>', website: 'javascript:alert(1)' })
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('href="javascript:')
    expect(html).toContain('&lt;img')
  })
  it('dichiara l\'affidabilità e che OSM non garantisce l\'apertura', () => {
    expect(servicePopupHtml(base)).toContain('Non verificato')
    expect(servicePopupHtml(base)).toContain('non garantisce')
  })
})

describe('icone dei servizi', () => {
  it('ogni categoria ha un\'icona e un colore, il tipo affina l\'icona', () => {
    for (const c of ['water', 'food', 'shop', 'lodging', 'transport', 'pharmacy'] as const) expect(SERVICE_STYLE[c].Icon).toBeTruthy()
    expect(serviceIconFor({ category: 'transport', kind: 'Stazione' })).not.toBe(serviceIconFor({ category: 'transport', kind: 'Fermata bus' }))
  })
  it('il marker non è un punto: riquadro arrotondato con icona SVG, tratteggiato se non verificato', () => {
    const html = serviceBadgeMarkup(base, 30)
    expect(html).toContain('<svg')
    expect(html).toContain('border-radius:9px')
    expect(html).toContain('dashed')
    expect(serviceBadgeMarkup({ ...base, confidence: 'alta' }, 30)).not.toContain('dashed')
  })
})
