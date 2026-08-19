import { describe, it, expect } from 'vitest'
import { computeLiveStatus, LIVE_STALE_MS, LIVE_CRITICAL_MS } from '../liveShareStatus'

const NOW = Date.parse('2026-08-17T12:00:00Z')

function isoAgo(ms: number): string {
  return new Date(NOW - ms).toISOString()
}

describe('computeLiveStatus', () => {
  it('un fix appena arrivato è "live"', () => {
    expect(computeLiveStatus(isoAgo(0), NOW)).toBe('live')
  })

  it('resta "live" appena sotto la soglia stale', () => {
    expect(computeLiveStatus(isoAgo(LIVE_STALE_MS - 1), NOW)).toBe('live')
  })

  it('diventa "stale" esattamente alla soglia', () => {
    expect(computeLiveStatus(isoAgo(LIVE_STALE_MS), NOW)).toBe('stale')
  })

  it('resta "stale" appena sotto la soglia critica', () => {
    expect(computeLiveStatus(isoAgo(LIVE_CRITICAL_MS - 1), NOW)).toBe('stale')
  })

  it('diventa "critical" esattamente alla soglia critica', () => {
    expect(computeLiveStatus(isoAgo(LIVE_CRITICAL_MS), NOW)).toBe('critical')
  })

  it('resta "critical" molto oltre la soglia (es. ore)', () => {
    expect(computeLiveStatus(isoAgo(3 * 60 * 60 * 1000), NOW)).toBe('critical')
  })

  it('usa Date.now() di default quando nowMs non è passato', () => {
    const justNow = new Date().toISOString()
    expect(computeLiveStatus(justNow)).toBe('live')
  })
})
