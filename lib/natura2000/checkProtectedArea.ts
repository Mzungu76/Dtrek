// Client orchestrator combining lib/geoUtils.ts's computeBbox + a fetch to /api/natura2000 +
// pointInPolygon checks against the dense track — same role lib/poisProxy.ts's
// fetchPoisNearTrack plays for POIs (computeBbox + fetch + a track-aware post-processing step,
// not a raw passthrough of the API response). Single reusable function for all 7 TEI call
// sites that need TeiInput.inProtectedArea; throws on a non-ok response, same as
// fetchPoisNearTrack — callers wrap this in their own .catch(), exactly like the existing
// dtmProfile/terrainProfile fetches at each site.
import { computeBbox } from '@/lib/geoUtils'
import { pointInPolygon } from '@/lib/geo/pointInPolygon'
import type { Natura2000Feature } from '@/lib/natura2000/natura2000Client'

export interface ProtectedAreaResult {
  inProtectedArea: boolean
  sites: Natura2000Feature[]
}

export async function checkProtectedArea(track: [number, number][]): Promise<ProtectedAreaResult> {
  if (track.length === 0) return { inProtectedArea: false, sites: [] }

  const bbox = computeBbox(track)
  const res = await fetch(`/api/natura2000?bbox=${bbox}`)
  if (!res.ok) throw new Error(`/api/natura2000 ${res.status}`)

  const features = (await res.json()) as Natura2000Feature[]
  if (!Array.isArray(features) || features.length === 0) return { inProtectedArea: false, sites: [] }

  const sites = features.filter(f => track.some(([lat, lon]) => pointInPolygon(lat, lon, f.geometry)))
  return { inProtectedArea: sites.length > 0, sites }
}
