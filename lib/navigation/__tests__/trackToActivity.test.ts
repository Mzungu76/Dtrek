import { describe, it, expect } from 'vitest'
import { buildActivityFromTrack } from '@/lib/navigation/trackToActivity'
import type { TrackPoint } from '@/lib/tcxParser'

// DTREK-AUDIT.md P1 #16 — buildActivityFromTrack ("same stat computation as parseGpxActivity",
// vedi il suo stesso commento) usava Math.max(...alts)/Math.max(...speedSamples)/
// Math.max(...hrValues) sull'intera traccia grezza — un'escursione registrata a lungo con
// posizioni ogni pochi secondi arriva realisticamente a decine di migliaia di punti, oltre il
// limite di argomenti dello spread. Test end-to-end sul chiamante reale, non solo sull'helper
// puro arrayMax/arrayMin.
function buildLongTrack(n: number): TrackPoint[] {
  const start = Date.now()
  return Array.from({ length: n }, (_, i) => ({
    time: new Date(start + i * 5000).toISOString(),
    lat: 42.5 + i * 0.0001,
    lon: 12.1 + i * 0.0001,
    altitudeMeters: 800 + (i % 500),
    heartRateBpm: 100 + (i % 60),
  }))
}

describe('buildActivityFromTrack su una traccia molto lunga', () => {
  it('non lancia RangeError su 150.000 punti (una registrazione plausibile per un\'uscita multi-giorno)', () => {
    const track = buildLongTrack(150_000)
    expect(() => buildActivityFromTrack(track)).not.toThrow()
  })

  it('calcola altitudeMax/Min e maxHeartRate corretti su una traccia lunga, non solo "non crasha"', () => {
    const track = buildLongTrack(150_000)
    const activity = buildActivityFromTrack(track)
    // altitudeMeters ciclico 800..1299 (i % 500 + 800)
    expect(activity.altitudeMax).toBe(1299)
    expect(activity.altitudeMin).toBe(800)
    // heartRateBpm ciclico 100..159
    expect(activity.maxHeartRate).toBe(159)
  })
})
