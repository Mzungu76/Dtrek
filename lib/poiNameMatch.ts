// Used by lib/epochPois.ts: extracts LLM-generated content tagged with a POI name (never
// coordinates — the model only ever names a place it was given in the guide prompt) and needs
// to resolve that name back to the POI's real, already-known lat/lon. An unmatched name means
// the content is dropped, never guessed at.
import type { PoiItem } from '@/lib/overpass'
import type { WikiPage } from '@/lib/wikipedia'

export function findPoiByName(name: string, cachedPois: PoiItem[], cachedPoiWiki: { poi: PoiItem; wiki: WikiPage }[]): { lat: number; lon: number } | null {
  const target = name.trim().toLowerCase()
  const wikiMatch = cachedPoiWiki.find((e) => e.wiki?.title?.trim().toLowerCase() === target)
  if (wikiMatch) return { lat: wikiMatch.poi.lat, lon: wikiMatch.poi.lon }
  const poiMatch = cachedPois.find((p) => p.name?.trim().toLowerCase() === target)
  if (poiMatch) return { lat: poiMatch.lat, lon: poiMatch.lon }
  return null
}
