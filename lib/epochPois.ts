// Stratigrafia temporale: "cosa vedresti da qui" in epoche diverse, per i POI che hanno
// davvero un layer storico stratificato (siti archeologici, castelli, rovine...). Contenuto
// scritto in fase di generazione guida (nessuna generazione in tempo reale, quindi funziona
// offline durante la navigazione), un tag per nome POI matchato contro coordinate reali già
// note — mai coordinate inventate dal modello.
import type { PoiItem } from '@/lib/overpass'
import type { WikiPage } from '@/lib/wikipedia'
import { findPoiByName } from '@/lib/poiNameMatch'

export type Epoch = 'etrusca' | 'romana' | 'medievale' | 'oggi'

export const EPOCH_LABELS: Record<Epoch, string> = {
  etrusca: 'Etrusca',
  romana: 'Romana',
  medievale: 'Medievale',
  oggi: 'Oggi',
}

export interface EpochPoi {
  id: string
  lat: number
  lon: number
  epoch: Epoch
  poiName: string
  text: string // "cosa vedresti da qui" in quell'epoca
}

const EPOCH_BLOCK_RE = /\[epoca\s+poi="([^"]+)"\s+periodo="(etrusca|romana|medievale|oggi)"\]([\s\S]*?)\[\/epoca\]/g

/**
 * Parses `[epoca poi="Nome esatto" periodo="etrusca|romana|medievale|oggi"]testo[/epoca]`
 * blocks out of the generated guide markdown. A block whose poi name doesn't match a known
 * POI is dropped.
 *
 * Also returns `cleanedText` with every `[epoca]` block removed — this content is meant to
 * surface as its own widget, never as raw bracket markup in the guide text (was leaking through
 * unstripped, see GuideReader.tsx).
 */
export function extractEpochPois(guideText: string, cachedPois: PoiItem[], cachedPoiWiki: { poi: PoiItem; wiki: WikiPage }[]): { epochPois: EpochPoi[]; cleanedText: string } {
  const epochPois: EpochPoi[] = []
  let match: RegExpExecArray | null
  let i = 0
  EPOCH_BLOCK_RE.lastIndex = 0
  while ((match = EPOCH_BLOCK_RE.exec(guideText)) !== null) {
    const [, poiName, epoch, body] = match
    const text = body.trim()
    if (!text) continue
    const coords = findPoiByName(poiName, cachedPois, cachedPoiWiki)
    if (!coords) continue
    epochPois.push({ id: `epoch-${i++}`, lat: coords.lat, lon: coords.lon, epoch: epoch as Epoch, poiName, text })
  }
  const cleanedText = guideText.replace(EPOCH_BLOCK_RE, '').replace(/\n{3,}/g, '\n\n')
  return { epochPois, cleanedText }
}
