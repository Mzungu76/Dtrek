/**
 * Lettura delle coordinate GPS dall'EXIF di una foto JPEG, senza dipendenze esterne.
 *
 * Sostituisce due copie quasi identiche (app/components/ActivityPhotoManager.tsx e
 * components/RouteMap3D.tsx) che condividevano gli stessi tre difetti, tutti visibili come "le
 * foto finiscono tutte nello stesso punto del percorso":
 *
 *  1. Un blocco GPS presente ma con valori nulli/illeggibili (denominatore 0, tag azzerati da un
 *     export, o valori oltre i primi 64 KB del file) veniva restituito come {lat:0, lon:0} invece
 *     che come "nessun GPS". Chi lo riceveva marcava la foto come geolocalizzata e ne cercava il
 *     punto della traccia più vicino a (0,0): lo stesso, identico punto per ogni foto — l'estremo
 *     sud-ovest del tracciato, cioè quasi sempre la partenza o l'arrivo. Ora si convalida:
 *     coordinate finite, in range, e non l'isola nulla.
 *  2. GPSLatitudeRef/GPSLongitudeRef (N/S, E/W) venivano ignorati, quindi ogni foto scattata a
 *     latitudine sud o longitudine ovest finiva nell'emisfero sbagliato.
 *  3. Si leggevano solo i primi 64 KB: l'APP1 di molti telefoni (EXIF + thumbnail incorporata) è
 *     più grande, e il puntatore ai valori GPS cadeva fuori dal buffer — l'eccezione veniva
 *     inghiottita e la foto risultava senza GPS.
 */

/** Abbondantemente oltre il massimo di un segmento APP1 (65 535 byte + marker), così l'intero
 *  blocco EXIF è sempre dentro il buffer letto, thumbnail incorporata compresa. */
const EXIF_SCAN_BYTES = 256 * 1024

export interface ExifGps {
  lat: number
  lon: number
}

function isPlausible(lat: number, lon: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return false
  // Null Island: nessuna foto di escursione viene da lì, ma è esattamente il valore prodotto da un
  // blocco GPS azzerato o mal interpretato — trattarlo come "nessun dato" è più utile che
  // depositare ogni foto sullo stesso punto della traccia.
  if (Math.abs(lat) < 1e-7 && Math.abs(lon) < 1e-7) return false
  return true
}

function dmsToDecimal(parts: number[] | undefined): number | null {
  if (!parts || parts.length === 0) return null
  const [d = 0, m = 0, s = 0] = parts
  if (![d, m, s].every(Number.isFinite)) return null
  return d + m / 60 + s / 3600
}

/**
 * Legge il blocco GPS a partire dall'inizio dell'header TIFF di un segmento EXIF.
 *
 * Le letture sono deliberatamente NON limitate alla lunghezza dichiarata del segmento APP1, ma
 * solo alla fine del buffer: nei file reali capita che gli offset interni puntino oltre quella
 * lunghezza (scrittori che la sottostimano, EXIF spezzato su più segmenti, thumbnail agganciate
 * dopo). Limitare la DataView al segmento faceva fallire l'INTERA lettura su quei file — con il
 * risultato che una foto geolocalizzata risultava priva di GPS e perdeva il badge. Ogni accesso è
 * comunque protetto dai controlli di intervallo qui sotto, quindi la tolleranza non costa sicurezza.
 */
function parseGpsFromTiff(view: DataView, tiffStart: number): ExifGps | null {
  const end = view.byteLength
  const inRange = (o: number, size: number) => o >= 0 && tiffStart + o + size <= end

  if (!inRange(0, 8)) return null
  const byteOrder = view.getUint16(tiffStart)
  if (byteOrder !== 0x4949 && byteOrder !== 0x4D4D) return null
  const le = byteOrder === 0x4949

  const rd16 = (o: number): number | null => inRange(o, 2) ? view.getUint16(tiffStart + o, le) : null
  const rd32 = (o: number): number | null => inRange(o, 4) ? view.getUint32(tiffStart + o, le) : null
  const rd8  = (o: number): number | null => inRange(o, 1) ? view.getUint8(tiffStart + o) : null

  const ifd0 = rd32(4)
  if (ifd0 == null) return null
  const n0 = rd16(ifd0)
  if (n0 == null) return null

  let gpsIfd: number | null = null
  for (let i = 0; i < n0; i++) {
    const eo = ifd0 + 2 + i * 12
    if (rd16(eo) === 0x8825) { gpsIfd = rd32(eo + 8); break }
  }
  if (gpsIfd == null) return null

  const gN = rd16(gpsIfd)
  if (gN == null) return null

  const rationals: Record<number, number[]> = {}
  const ascii: Record<number, string> = {}
  for (let i = 0; i < gN; i++) {
    const eo = gpsIfd + 2 + i * 12
    const tag = rd16(eo), type = rd16(eo + 2), count = rd32(eo + 4)
    if (tag == null || type == null || count == null) break

    // 5 = RATIONAL, 10 = SRATIONAL: alcuni scrittori usano il secondo per le coordinate. Prima si
    // accettava solo il primo, e su quei file il tag risultava assente.
    if ((type === 5 || type === 10) && count > 0 && count <= 8) {
      const vOff = rd32(eo + 8)
      if (vOff == null) continue
      const vals: number[] = []
      for (let j = 0; j < count; j++) {
        const num = type === 10
          ? (inRange(vOff + j * 8, 4) ? view.getInt32(tiffStart + vOff + j * 8, le) : null)
          : rd32(vOff + j * 8)
        const den = type === 10
          ? (inRange(vOff + j * 8 + 4, 4) ? view.getInt32(tiffStart + vOff + j * 8 + 4, le) : null)
          : rd32(vOff + j * 8 + 4)
        // Valore illeggibile o denominatore 0 ⇒ NaN, non 0: si propaga e viene scartato da
        // isPlausible invece di diventare una coordinata a 0 gradi apparentemente legittima.
        vals.push(num == null || den == null || den === 0 ? NaN : num / den)
      }
      rationals[tag] = vals
    } else if (type === 2 && count > 0 && count <= 4) {
      // ASCII corto (i ref N/S/E/W sono 2 byte incluso il terminatore) ⇒ inline nell'entry.
      let sVal = ''
      for (let j = 0; j < count; j++) {
        const c = rd8(eo + 8 + j)
        if (c == null || c === 0) break
        sVal += String.fromCharCode(c)
      }
      ascii[tag] = sVal.trim().toUpperCase()
    }
  }

  const lat = dmsToDecimal(rationals[2])
  const lon = dmsToDecimal(rationals[4])
  if (lat == null || lon == null) return null

  // I ref mancanti si trattano come N/E: è l'ipotesi storica di questo parser e resta corretta
  // per l'Italia, ma quando ci sono si rispettano.
  const signedLat = ascii[1] === 'S' ? -lat : lat
  const signedLon = ascii[3] === 'W' ? -lon : lon
  return isPlausible(signedLat, signedLon) ? { lat: signedLat, lon: signedLon } : null
}

function parseExifGpsFromBuffer(buf: ArrayBuffer): ExifGps | null {
  const view = new DataView(buf)
  if (view.byteLength < 4 || view.getUint16(0) !== 0xFFD8) return null

  let off = 2
  while (off + 4 <= view.byteLength) {
    // Byte di riempimento 0xFF ammessi dallo standard prima di un marker: si scavalcano invece di
    // interpretarli come l'inizio di un segmento, che manderebbe fuori sincrono tutta la scansione.
    if (view.getUint8(off) !== 0xFF) break
    let markerByte = view.getUint8(off + 1)
    while (markerByte === 0xFF && off + 2 < view.byteLength) { off++; markerByte = view.getUint8(off + 1) }
    const marker = 0xFF00 | markerByte
    off += 2

    // Marker senza payload (RSTn, SOI, EOI, TEM) — nessuna lunghezza da leggere dopo di essi.
    if (marker === 0xFFD8 || marker === 0xFF01 || (marker >= 0xFFD0 && marker <= 0xFFD7)) continue
    // Inizio dei dati compressi (o fine immagine): da qui in poi non ci sono più segmenti EXIF.
    if (marker === 0xFFDA || marker === 0xFFD9) break

    if (off + 2 > view.byteLength) break
    const segLen = view.getUint16(off)
    if (segLen < 2) break

    if (marker === 0xFFE1 && off + 8 <= view.byteLength) {
      const isExif = view.getUint8(off + 2) === 0x45 && view.getUint8(off + 3) === 0x78
        && view.getUint8(off + 4) === 0x69 && view.getUint8(off + 5) === 0x66
      // Un APP1 non-EXIF (tipicamente XMP) si salta e si continua a cercare: l'EXIF può benissimo
      // venire dopo di lui.
      if (isExif) {
        const found = parseGpsFromTiff(view, off + 8)
        if (found) return found
      }
    }

    off += segLen
  }
  return null
}

/** Coordinate GPS dell'EXIF, o null se assenti/non attendibili (vedi isPlausible). */
export async function readExifGps(file: File): Promise<ExifGps | null> {
  try {
    const buf = await file.slice(0, EXIF_SCAN_BYTES).arrayBuffer()
    return parseExifGpsFromBuffer(buf)
  } catch {
    return null
  }
}

/**
 * Distanza oltre la quale un punto EXIF non viene più considerato "su questo percorso".
 *
 * Serve a distinguere due casi che prima finivano confusi: una foto scattata lungo il sentiero con
 * una posizione un po' imprecisa (bosco fitto, canyon → anche qualche centinaio di metri), e una
 * foto che con questa escursione non c'entra nulla (scattata a casa, o un'immagine salvata da
 * altrove che si porta dietro il suo EXIF). La prima si ancora al punto di traccia più vicino; la
 * seconda non deve trascinare un pin a un capo del percorso solo perché è l'estremo più vicino a
 * un luogo lontano chilometri.
 */
export const EXIF_MAX_SNAP_DISTANCE_M = 2000
