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

function parseExifGpsFromBuffer(buf: ArrayBuffer): ExifGps | null {
  const view = new DataView(buf)
  if (view.byteLength < 4 || view.getUint16(0) !== 0xFFD8) return null

  let off = 2
  while (off < view.byteLength - 4) {
    const marker = view.getUint16(off)
    off += 2
    // Fuori dalla catena dei marker (dati compressi, o file troncato) — non c'è più nulla da leggere.
    if ((marker & 0xFF00) !== 0xFF00) return null
    const segLen = view.getUint16(off)
    if (segLen < 2 || off + segLen > view.byteLength) return null

    if (marker === 0xFFE1) {
      const header = new Uint8Array(buf, off + 2, 4)
      if (String.fromCharCode(header[0], header[1], header[2], header[3]) !== 'Exif') { off += segLen; continue }

      const tiffStart = off + 2 + 6
      const tv = new DataView(buf, tiffStart, Math.min(segLen - 8, view.byteLength - tiffStart))
      const le = tv.getUint16(0) === 0x4949
      const rd16 = (o: number) => tv.getUint16(o, le)
      const rd32 = (o: number) => tv.getUint32(o, le)

      const ifd0 = rd32(4)
      const n0 = rd16(ifd0)
      let gpsIfd = 0
      for (let i = 0; i < n0; i++) {
        const eo = ifd0 + 2 + i * 12
        if (rd16(eo) === 0x8825) { gpsIfd = rd32(eo + 8); break }
      }
      if (!gpsIfd) return null

      const gN = rd16(gpsIfd)
      const rationals: Record<number, number[]> = {}
      const ascii: Record<number, string> = {}
      for (let i = 0; i < gN; i++) {
        const eo = gpsIfd + 2 + i * 12
        const tag = rd16(eo), type = rd16(eo + 2), count = rd32(eo + 4)
        if (type === 5 && count > 0 && count <= 8) {
          // RATIONAL: 8 byte per valore, quindi mai inline nei 4 byte dell'entry — sempre a offset.
          const vOff = rd32(eo + 8)
          const vals: number[] = []
          for (let j = 0; j < count; j++) {
            const num = rd32(vOff + j * 8)
            const den = rd32(vOff + j * 8 + 4)
            // Denominatore 0 ⇒ valore non valido, NON zero: NaN si propaga e viene scartato da
            // isPlausible invece di diventare una coordinata a 0 gradi apparentemente legittima.
            vals.push(den === 0 ? NaN : num / den)
          }
          rationals[tag] = vals
        } else if (type === 2 && count > 0 && count <= 4) {
          // ASCII corto (i ref N/S/E/W sono 2 byte incluso il terminatore) ⇒ inline nell'entry.
          let sVal = ''
          for (let j = 0; j < count; j++) {
            const c = tv.getUint8(eo + 8 + j)
            if (c === 0) break
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
