'use client'
import { useEffect, useState } from 'react'
import type { PlannedHike } from '@/lib/plannedStore'
import { updatePlannedMeta } from '@/lib/plannedStore'
import type { TrailDtmProfile } from '@/lib/dtm/trailDtmProfile'
import { hashTrack } from '@/lib/geoUtils'

export function useDtmProfile(hike: PlannedHike | null): TrailDtmProfile | undefined {
  const [dtmProfile, setDtmProfile] = useState<TrailDtmProfile | undefined>(undefined)

  useEffect(() => {
    if (!hike) return
    const gps = (hike.trackPoints ?? []).filter(p => p.lat && p.lon).map(p => [p.lat!, p.lon!] as [number, number])
    if (gps.length < 2) return

    // The DTM profile depends only on the GPS track, which never changes once a hike is
    // imported — so a valid cached result is good forever, invalidated only by a track-hash
    // mismatch (see lib/geoUtils.ts hashTrack), not by a temporal TTL. Skips the live
    // /api/tei-dtm round trip (and the OpenTopography fetch behind it) entirely on every open
    // after the first.
    const hash = hashTrack(gps)
    if (hike.dtmProfile && hike.dtmTrackHash === hash) {
      setDtmProfile(hike.dtmProfile)
      return
    }

    let cancelled = false
    fetch(`/api/tei-dtm?track=${encodeURIComponent(JSON.stringify(gps))}`)
      .then(r => r.json())
      .then((p: TrailDtmProfile) => {
        if (cancelled) return
        setDtmProfile(p)
        // Only a genuine computation is worth persisting forever — 'unavailable' can mean a
        // transient upstream failure or a missing API key, either of which should be retried
        // on the next open rather than cached as if it were a permanent answer.
        if (p.source === 'dtm') {
          updatePlannedMeta(hike.id, { dtmProfile: p, dtmTrackHash: hash, dtmComputedAt: new Date().toISOString() }).catch(() => {})
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hike?.id])

  return dtmProfile
}
