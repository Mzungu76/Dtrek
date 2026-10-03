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
//
// Il numero di tappa non è sempre dove ti aspetti: nei GPX reali della Francigena, da una certa
// tappa in poi il nome del FILE e il <name> dentro il GPX sono scalati di una posizione (il percorso
// è stato rinumerato dopo che i file erano stati nominati). Il <name> quando dice "Tappa N" o inizia
// con un numero nudo ("22 Troia - …") è la fonte più aggiornata; il nome del file è l'ultima spiaggia.

export interface GpxTappaFile {
  /** Nome del file (nei log, e come ultima spiaggia per il numero quando il titolo non basta). */
  filename: string
  xml: string
}

export interface GpxSkipped { filename: string; reason: string }
export interface GpxVariant {
  /** Tappa a cui questa variante si affianca — il numero più vicino che il titolo/filename della
   *  variante stesso riporta; null se non deducibile. */
  tappaOrdinal: number | null
  name: string
  filename: string
  lengthM: number
  polyline: LatLon[]
}
export interface GpxTappeResult { built: BuiltCammino; skipped: GpxSkipped[]; variants: GpxVariant[] }

/** Dati minimi per un cammino importato da GPX — non serve un RegistryEntry (searchName, match,
 *  bbox… non si usano: niente ricerca OSM qui), e un "del Sud" come via-francigena-sud non ha una
 *  voce propria nel registro, è solo l'altra metà della Francigena divisa a Roma. */
export interface GpxCamminoInfo {
  id: string
  name: string
  theme: 'religioso' | 'storico' | 'naturalistico'
  region?: string
  /** Pattern aggiuntivi per leggere il numero di tappa (branch con convenzioni proprie: "Tappa MSA
   *  01", "Variante Mare 01", "Bra01"…), provati su titolo e filename dopo quelli standard. */
  numberPatterns?: RegExp[]
  /** Nel branch "Via Litoranea" ogni file si chiama "variante mare NN": qui "variante" nel nome
   *  non deve escluderlo dalla sequenza principale, è proprio quella l'identità del cammino. */
  mainSequenceIsVariant?: boolean
}

const VARIANT_RE = /variant[ei]/i
// parseTappaNumber (lib/cammini/tappe.ts) richiede uno spazio dopo "tappa" (nomi di relazione OSM
// stile "Tappa 12: A - B"): nei filename reali il separatore è un trattino ("tappa-09-da-…",
// "tappa-7bis-…"), quindi serve anche questo.
const TAPPA_FILENAME_RE = /tappa-?\s*(\d+)/i
// "22 Troia - Castelluccio dei Sauri": nessuna parola "tappa", ma il numero all'inizio del titolo è
// comunque quello buono — più buono del nome del file, quando i due non sono d'accordo.
const BARE_LEADING_NUMBER_RE = /^(\d+)\b/
// Per associare una variante alla tappa più vicina: qualunque numero nel testo, l'ultima spiaggia.
const ANY_NUMBER_RE = /(\d+)/

function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim()
}

function tryPatterns(text: string, patterns: RegExp[]): number | null {
  for (const re of patterns) { const m = re.exec(text); if (m) return Number(m[1]) }
  return null
}

/**
 * Ordine di fiducia: titolo esplicito ("Tappa N") → pattern del branch (titolo poi filename) →
 * filename standard, con trattino → **ultimissima spiaggia**: il numero nudo in testa al titolo
 * ("22 Troia - …", senza la parola "tappa"). Non è messo prima perché su un lotto con numerazioni
 * incoerenti tra file (Francigena del Sud: filename e titolo sfasati da un punto in poi) un numero
 * nudo è ambiguo — meglio lasciare vincere un altro file che ha un segnale più netto (il filename,
 * o un "Tappa N" esplicito altrove), e tenere questo solo per i casi senza alcuna alternativa.
 */
function resolveTappaNumber(title: string, filename: string, extra: RegExp[] = []): number | null {
  return parseTappaNumber(title)
    ?? tryPatterns(title, extra)
    ?? tryPatterns(filename, extra)
    ?? parseTappaNumber(filename)
    ?? tryPatterns(filename, [TAPPA_FILENAME_RE])
    ?? tryPatterns(title, [BARE_LEADING_NUMBER_RE])
}

export function buildFromGpxFiles(files: GpxTappaFile[], info: GpxCamminoInfo, anchorsAll: TappaAnchor[]): GpxTappeResult {
  const skipped: GpxSkipped[] = []
  const variants: GpxVariant[] = []
  const numbered: { number: number; name: string; polyline: LatLon[] }[] = []
  const extra = info.numberPatterns ?? []

  for (const f of files) {
    if (!info.mainSequenceIsVariant && VARIANT_RE.test(f.filename)) {
      const parsed = parseGpxServerSide(f.xml)
      if (parsed && parsed.trackPoints.length >= 2) {
        const title = cleanName(parsed.title || f.filename)
        const tappaOrdinal = tryPatterns(title, [BARE_LEADING_NUMBER_RE, ANY_NUMBER_RE]) ?? tryPatterns(f.filename, [TAPPA_FILENAME_RE, ANY_NUMBER_RE])
        const polyline = parsed.trackPoints.map(p => [p.lat, p.lon] as LatLon)
        variants.push({ tappaOrdinal, name: title, filename: f.filename, lengthM: polylineLengthM(polyline), polyline })
      }
      skipped.push({ filename: f.filename, reason: 'variante: non entra nella sequenza principale, salvata come variante' })
      continue
    }
    const parsed = parseGpxServerSide(f.xml)
    if (!parsed || parsed.trackPoints.length < 2) { skipped.push({ filename: f.filename, reason: 'GPX vuoto o illeggibile' }); continue }
    const name = cleanName(parsed.title || f.filename)
    const number = resolveTappaNumber(name, f.filename, extra)
    if (number == null) { skipped.push({ filename: f.filename, reason: 'nessun numero di tappa nel nome o nel file' }); continue }
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

  // Le varianti erano numerate sulla sequenza "vecchia" del filename/titolo: qui le si riancora
  // all'ordinal vero della tappa (ordinal, non il numero grezzo che può essere scalato come per la
  // sequenza principale) cercando quale tappa ha lo stesso numero originale.
  const ordinalByOriginalNumber = new Map(unique.map((t, i) => [t.number, i + 1]))
  for (const v of variants) if (v.tappaOrdinal != null) v.tappaOrdinal = ordinalByOriginalNumber.get(v.tappaOrdinal) ?? null

  const line = tappe.flatMap((t, i) => (i === 0 ? t.polyline : t.polyline.slice(1)))
  const quality: QualityReport = assessQuality(tappe, connected, jumps)
  const diagnostics = [
    `${unique.length} tappe GPX usate, ${skipped.length} scartate (${variants.length} varianti salvate a parte, il resto doppioni/illeggibili).`,
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
  return { built, skipped, variants }
}
