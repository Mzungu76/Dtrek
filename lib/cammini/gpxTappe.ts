import { haversineM } from '../geoUtils'
import { parseGpxServerSide } from '../serverGpxParser'
import type { BuiltCammino } from '../../scripts/places/cammini/build'
import { assessQuality, type QualityReport } from '../../scripts/places/cammini/buildRegistry'
import type { CamminoConfig } from '../../scripts/places/cammini/config'
import type { Bbox } from './geometry'
import { polylineLengthM, type LatLon } from './geometry'
import {
  canonicalizeEndpointNames, fillEndpointsFromAnchors, orientNamesByGeometry, parseTappaNumber,
  propagateSharedEndpoints, simplifyTappa, type TappaAnchor, type TappaDraft,
} from './tappe'

const ITALY_BBOX: Bbox = [35.2, 6.6, 47.1, 18.8]

// Costruisce un Cammino dai GPX ufficiali delle tappe (non da OSM/Overpass): il caso della Via
// Francigena, le cui relazioni OSM non si incatenano in un unico tracciato (vedi diagnostics di
// buildFromRegistry — "tappe non collegate", colpa della struttura delle relazioni, non di Overpass).
// Le tappe sono già numerate e nell'ordine giusto dalla fonte: qui si parte da quell'ordine, non si
// ricostruisce il percorso dalla geometria come in buildFromRegistry.

export interface GpxTappaFile {
  /** Nome del file (nei log e per escludere le varianti: "…variante…" non entra nella sequenza). */
  filename: string
  xml: string
}

export interface GpxSkipped { filename: string; reason: string }
export interface GpxTappeResult { built: BuiltCammino; skipped: GpxSkipped[] }

/** Dati minimi per un cammino importato da GPX — non serve un RegistryEntry (searchName, match,
 *  bbox… non si usano: niente ricerca OSM qui), e un "del Sud" come via-francigena-sud non ha una
 *  voce propria nel registro, è solo l'altra metà della Francigena divisa a Roma. */
export interface GpxCamminoInfo {
  id: string
  name: string
  theme: 'religioso' | 'storico' | 'naturalistico'
  region?: string
}

const VARIANT_RE = /variant[ei]/i
// parseTappaNumber (lib/cammini/tappe.ts) richiede uno spazio dopo "tappa" (nomi di relazione OSM
// stile "Tappa 12: A - B"): nei filename reali il separatore è un trattino ("tappa-09-da-…",
// "tappa-7bis-…"), quindi serve anche questo, provato sul filename quando il titolo non basta.
const TAPPA_FILENAME_RE = /tappa-?\s*(\d+)/i

/** "Tappa 01 - Dal Gran S. Bernardo a Echevennoz" → "Tappa 01": via stageLabel-like taglio sul nome. */
function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim()
}

export function buildFromGpxFiles(files: GpxTappaFile[], info: GpxCamminoInfo, anchorsAll: TappaAnchor[]): GpxTappeResult {
  const skipped: GpxSkipped[] = []
  const numbered: { number: number; name: string; polyline: LatLon[] }[] = []

  for (const f of files) {
    if (VARIANT_RE.test(f.filename)) { skipped.push({ filename: f.filename, reason: 'variante: non entra nella sequenza principale' }); continue }
    const parsed = parseGpxServerSide(f.xml)
    if (!parsed || parsed.trackPoints.length < 2) { skipped.push({ filename: f.filename, reason: 'GPX vuoto o illeggibile' }); continue }
    const name = cleanName(parsed.title || f.filename)
    const number = parseTappaNumber(name) ?? parseTappaNumber(f.filename) ?? Number(TAPPA_FILENAME_RE.exec(f.filename)?.[1] ?? NaN)
    if (!Number.isFinite(number)) { skipped.push({ filename: f.filename, reason: 'nessun numero di tappa nel nome o nel file' }); continue }
    numbered.push({ number, name, polyline: parsed.trackPoints.map(p => [p.lat, p.lon] as LatLon) })
  }

  numbered.sort((a, b) => a.number - b.number)
  const seen = new Set<number>()
  const unique = numbered.filter(t => {
    if (seen.has(t.number)) { skipped.push({ filename: t.name, reason: `tappa ${t.number} già presente: duplicato scartato` }); return false }
    seen.add(t.number)
    return true
  })
  if (unique.length === 0) throw new Error(`${info.name}: nessuna tappa GPX utilizzabile (${files.length} file, tutti scartati).`)

  // Orienta ogni tappa in continuità con la precedente (i GPX non sono garantiti tutti nello stesso
  // verso) e misura lo scarto fra una tappa e la successiva, come fa orderAlongRoute per le tappe OSM.
  let tappe: TappaDraft[] = []
  let prevTail: LatLon | undefined
  let jumps = 0
  for (const [i, t] of Array.from(unique.entries())) {
    const head = t.polyline[0], tail = t.polyline[t.polyline.length - 1]
    let line = t.polyline
    let gapBeforeM = 0
    if (prevTail) {
      const dHead = haversineM(prevTail[0], prevTail[1], head[0], head[1])
      const dTail = haversineM(prevTail[0], prevTail[1], tail[0], tail[1])
      if (dTail < dHead) line = [...t.polyline].reverse()
      gapBeforeM = Math.min(dHead, dTail)
      if (gapBeforeM > 500) jumps++
    }
    prevTail = line[line.length - 1]
    tappe.push({ ordinal: i + 1, name: t.name, lengthM: polylineLengthM(line), polyline: line, source: 'official' })
  }
  const connected = tappe.every((_, i) => i === 0 || haversineM(
    tappe[i - 1].polyline[tappe[i - 1].polyline.length - 1][0], tappe[i - 1].polyline[tappe[i - 1].polyline.length - 1][1],
    tappe[i].polyline[0][0], tappe[i].polyline[0][1],
  ) <= 3000)

  canonicalizeEndpointNames(tappe, anchorsAll)
  orientNamesByGeometry(tappe, anchorsAll)
  fillEndpointsFromAnchors(tappe, anchorsAll)
  fillEndpointsFromAnchors(tappe, anchorsAll, 5000)
  propagateSharedEndpoints(tappe)
  tappe = tappe.map(t => simplifyTappa(t, 15))

  const line = tappe.flatMap((t, i) => (i === 0 ? t.polyline : t.polyline.slice(1)))
  const quality: QualityReport = assessQuality(tappe, connected, jumps)
  const diagnostics = [
    `${unique.length} tappe GPX usate, ${skipped.length} scartate (varianti/doppioni/illeggibili).`,
    ...(connected ? [] : ['Una o più tappe hanno uno scarto oltre 3 km dalla precedente: controllare l\'ordine/i file.']),
  ]

  const first = line[0], last = line[line.length - 1]
  const config: CamminoConfig = {
    id: info.id, name: info.name, nameRegex: info.name, region: info.region ?? 'Italia', bbox: ITALY_BBOX,
    start: { name: tappe[0].fromName ?? '', lat: first[0], lon: first[1] },
    end: { name: tappe[tappe.length - 1].toName ?? '', lat: last[0], lon: last[1] },
    theme: info.theme,
  }
  const built: BuiltCammino = {
    config, line, lengthM: polylineLengthM(line), tappe, tappeSource: 'official',
    relationIds: [], tags: {}, diagnostics, quality: { ...quality }, structure: 'cammino',
  }
  return { built, skipped }
}
