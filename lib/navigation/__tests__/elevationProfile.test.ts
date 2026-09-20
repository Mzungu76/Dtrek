import { describe, it, expect } from 'vitest'
import { reverseElevationProfile, remainingElevation, type ElevationProfilePoint } from '../elevationProfile'

// A climb from 1000m to 1300m over the first half, then a descent back to 1100m — walked in the
// original direction this is +300 gain then -200 loss; walked backwards (reverseRoute()) it
// should read as the mirror: +200 gain then -300 loss.
const PROFILE: ElevationProfilePoint[] = [
  { distanceAlongRouteM: 0, altitudeM: 1000 },
  { distanceAlongRouteM: 500, altitudeM: 1300 },
  { distanceAlongRouteM: 1000, altitudeM: 1100 },
]

describe('reverseElevationProfile', () => {
  it('re-bases distance from the other end, keeping altitude attached to the same point', () => {
    const reversed = reverseElevationProfile(PROFILE)
    expect(reversed).toEqual([
      { distanceAlongRouteM: 0, altitudeM: 1100 },
      { distanceAlongRouteM: 500, altitudeM: 1300 },
      { distanceAlongRouteM: 1000, altitudeM: 1000 },
    ])
  })

  it('flips what remainingElevation/traveledElevation report at the same physical point', () => {
    const forward = remainingElevation(PROFILE, 0)
    expect(forward).toEqual({ gainM: 300, lossM: 200 })

    const reversed = reverseElevationProfile(PROFILE)
    const backward = remainingElevation(reversed, 0)
    expect(backward).toEqual({ gainM: 200, lossM: 300 })

    // Gain/loss over the whole route swap exactly (same ground, opposite direction) — this is
    // the correction PaceAssistant's plannedPace/ETA relies on after NavigationEngine.reverseRoute().
    expect(backward).toEqual({ gainM: forward.lossM, lossM: forward.gainM })
  })

  it('is a no-op on a degenerate (< 2 point) profile', () => {
    expect(reverseElevationProfile([])).toEqual([])
    const single = [{ distanceAlongRouteM: 0, altitudeM: 500 }]
    expect(reverseElevationProfile(single)).toEqual(single)
  })
})
