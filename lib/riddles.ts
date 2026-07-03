// Trail riddles ("indovinelli per tappa") — no new tech, content written at guide-generation
// time (see app/api/guide/route.ts's SYSTEM prompt) and extracted here. The LLM only ever
// names a POI it was given in the prompt — it never invents coordinates — so a riddle is kept
// only when its named POI matches a real, already-known lat/lon from cachedPois/cachedPoiWiki.
// An unmatched name is silently dropped rather than guessed.
import type { PoiItem } from '@/lib/overpass'
import type { WikiPage } from '@/lib/wikipedia'
import { findPoiByName } from '@/lib/poiNameMatch'

export interface TrailRiddle {
  id: string
  lat: number
  lon: number
  question: string
  answer: string
}

const RIDDLE_BLOCK_RE = /\[indovinello\s+poi="([^"]+)"\]([\s\S]*?)\[\/indovinello\]/g

/**
 * Parses `[indovinello poi="Nome esatto"]Domanda?|Risposta[/indovinello]` blocks out of the
 * generated guide markdown, same bracket-tag convention as extractCuriosita's [curiosita].
 * Blocks whose poi name doesn't match a known POI, or without a question|answer split,
 * are dropped rather than kept with a guessed/missing field.
 */
export function extractRiddles(guideText: string, cachedPois: PoiItem[], cachedPoiWiki: { poi: PoiItem; wiki: WikiPage }[]): TrailRiddle[] {
  const riddles: TrailRiddle[] = []
  let match: RegExpExecArray | null
  let i = 0
  RIDDLE_BLOCK_RE.lastIndex = 0
  while ((match = RIDDLE_BLOCK_RE.exec(guideText)) !== null) {
    const [, poiName, body] = match
    const parts = body.split('|')
    if (parts.length !== 2) continue
    const question = parts[0].trim()
    const answer = parts[1].trim()
    if (!question || !answer) continue
    const coords = findPoiByName(poiName, cachedPois, cachedPoiWiki)
    if (!coords) continue
    riddles.push({ id: `riddle-${i++}`, lat: coords.lat, lon: coords.lon, question, answer })
  }
  return riddles
}
