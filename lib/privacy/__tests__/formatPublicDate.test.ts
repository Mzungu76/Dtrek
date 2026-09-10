import { describe, expect, it } from 'vitest'
import { formatPublicDate } from '../formatPublicDate'

describe('formatPublicDate', () => {
  it('con hideExactDate false, mostra il giorno esatto', () => {
    expect(formatPublicDate('2026-08-29T10:00:00Z', false)).toBe('29 agosto 2026')
  })

  it('con hideExactDate true, mostra solo mese e anno', () => {
    expect(formatPublicDate('2026-08-29T10:00:00Z', true)).toBe('agosto 2026')
  })
})
