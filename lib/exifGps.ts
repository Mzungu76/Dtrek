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

export interface ExifMetadata {
  /** Coordinate valide, o null se assenti/non attendibili (vedi isPlausible). */
  gps: ExifGps | null
  /** Istante di scatto in epoch ms, o null se il file non lo dichiara.
   *
   *  Serve come seconda strada per posizionare la foto lungo la traccia quando le coordinate non
   *  ci sono — caso tutt'altro che raro, perché è la posizione (non la data) che i selettori foto
   *  di Android e iOS rimuovono dai file consegnati alle pagine web. Ed è anche più precisa del
   *  GPS della fotocamera: l'orologio del telefono non sbaglia di trenta metri sotto gli alberi. */
  takenAt: number | null
}

/**
 * "YYYY:MM:DD HH:MM:SS" (il formato EXIF, con i due punti anche nella data) → epoch ms.
 *
 * `tzOffset` è OffsetTimeOriginal ("+02:00") quando il file lo dichiara: in quel caso l'istante è
 * assoluto e non serve indovinare nulla. Senza, l'orario si interpreta come ora locale del
 * dispositivo che sta guardando — che per una foto scattata durante la propria escursione, aperta
 * dallo stesso telefono, è quasi sempre l'ipotesi giusta. Chi consuma questo valore deve comunque
 * verificare che cada dentro la finestra temporale dell'attività prima di fidarsene.
 */
function parseExifDateTime(raw: string | null, tzOffset: string | null): number | null {
  if (!raw) return null
  const m = /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(raw.trim())
  if (!m) return null
  const [, y, mo, d, hh, mm, ss] = m.map(Number) as unknown as number[]
  // Una data EXIF tutta a zeri ("0000:00:00 00:00:00") vuol dire "campo presente ma mai scritto".
  if (!y || !mo || !d) return null

  const tz = tzOffset ? /^([+-])(\d{2}):?(\d{2})$/.exec(tzOffset.trim()) : null
  if (tz) {
    const sign = tz[1] === '-' ? -1 : 1
    const offsetMin = sign * (Number(tz[2]) * 60 + Number(tz[3]))
    return Date.UTC(y, mo - 1, d, hh, mm, ss) - offsetMin * 60_000
  }
  const local = new Date(y, mo - 1, d, hh, mm, ss)
  const t = local.getTime()
  return Number.isFinite(t) ? t : null
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
 * Legge GPS e istante di scatto a partire dall'inizio dell'header TIFF di un segmento EXIF.
 *
 * Le letture sono deliberatamente NON limitate alla lunghezza dichiarata del segmento APP1, ma
 * solo alla fine del buffer: nei file reali capita che gli offset interni puntino oltre quella
 * lunghezza (scrittori che la sottostimano, EXIF spezzato su più segmenti, thumbnail agganciate
 * dopo). Limitare la DataView al segmento faceva fallire l'INTERA lettura su quei file — con il
 * risultato che una foto geolocalizzata risultava priva di GPS e perdeva il badge. Ogni accesso è
 * comunque protetto dai controlli di intervallo qui sotto, quindi la tolleranza non costa sicurezza.
 */
function parseTiff(view: DataView, tiffStart: number): ExifMetadata | null {
  const end = view.byteLength
  const inRange = (o: number, size: number) => o >= 0 && tiffStart + o + size <= end

  if (!inRange(0, 8)) return null
  const byteOrder = view.getUint16(tiffStart)
  if (byteOrder !== 0x4949 && byteOrder !== 0x4D4D) return null
  const le = byteOrder === 0x4949

  const rd16 = (o: number): number | null => inRange(o, 2) ? view.getUint16(tiffStart + o, le) : null
  const rd32 = (o: number): number | null => inRange(o, 4) ? view.getUint32(tiffStart + o, le) : null
  const rd8  = (o: number): number | null => inRange(o, 1) ? view.getUint8(tiffStart + o) : null

  interface Entry { tag: number; type: number; count: number; valueOffset: number; entryOffset: number }

  /** Le voci di una IFD. Restituisce [] (non null) su una IFD illeggibile: un blocco rotto non deve
   *  impedire di leggere gli altri, che spesso sono intatti. */
  const readIfd = (ifdOffset: number): Entry[] => {
    const n = rd16(ifdOffset)
    if (n == null || n > 512) return []
    const out: Entry[] = []
    for (let i = 0; i < n; i++) {
      const eo = ifdOffset + 2 + i * 12
      const tag = rd16(eo), type = rd16(eo + 2), count = rd32(eo + 4), valueOffset = rd32(eo + 8)
      if (tag == null || type == null || count == null || valueOffset == null) break
      out.push({ tag, type, count, valueOffset, entryOffset: eo })
    }
    return out
  }

  /** Un valore è scritto dentro i 4 byte della voce quando ci sta; altrimenti la voce contiene
   *  l'offset a cui trovarlo. Sbagliare questo bivio è il modo classico di leggere spazzatura. */
  const dataOffset = (e: Entry, bytesPerComponent: number): number =>
    e.count * bytesPerComponent <= 4 ? e.entryOffset + 8 : e.valueOffset

  const readAscii = (e: Entry): string | null => {
    if (e.type !== 2 || e.count === 0 || e.count > 256) return null
    const at = dataOffset(e, 1)
    let out = ''
    for (let j = 0; j < e.count; j++) {
      const c = rd8(at + j)
      if (c == null || c === 0) break
      out += String.fromCharCode(c)
    }
    return out.trim() || null
  }

  // 5 = RATIONAL, 10 = SRATIONAL: alcuni scrittori usano il secondo per le coordinate. Accettarne
  // uno solo faceva risultare assente il tag su quei file.
  const readRationals = (e: Entry): number[] | null => {
    if ((e.type !== 5 && e.type !== 10) || e.count === 0 || e.count > 8) return null
    const at = dataOffset(e, 8)
    const vals: number[] = []
    for (let j = 0; j < e.count; j++) {
      const numOk = inRange(at + j * 8, 4), denOk = inRange(at + j * 8 + 4, 4)
      const num = numOk ? (e.type === 10 ? view.getInt32(tiffStart + at + j * 8, le) : view.getUint32(tiffStart + at + j * 8, le)) : null
      const den = denOk ? (e.type === 10 ? view.getInt32(tiffStart + at + j * 8 + 4, le) : view.getUint32(tiffStart + at + j * 8 + 4, le)) : null
      // Valore illeggibile o denominatore 0 ⇒ NaN, non 0: si propaga e viene scartato da
      // isPlausible invece di diventare una coordinata a 0 gradi apparentemente legittima.
      vals.push(num == null || den == null || den === 0 ? NaN : num / den)
    }
    return vals
  }

  const ifd0Offset = rd32(4)
  if (ifd0Offset == null) return null
  const ifd0 = readIfd(ifd0Offset)
  const byTag = (entries: Entry[], tag: number) => entries.find(e => e.tag === tag)

  // ── GPS ────────────────────────────────────────────────────────────────────
  let gps: ExifGps | null = null
  const gpsPointer = byTag(ifd0, 0x8825)
  const gpsIfd = gpsPointer ? readIfd(gpsPointer.valueOffset) : []
  if (gpsIfd.length > 0) {
    const latE = byTag(gpsIfd, 0x0002), lonE = byTag(gpsIfd, 0x0004)
    const lat = latE ? dmsToDecimal(readRationals(latE) ?? undefined) : null
    const lon = lonE ? dmsToDecimal(readRationals(lonE) ?? undefined) : null
    if (lat != null && lon != null) {
      // I ref mancanti si trattano come N/E: è l'ipotesi storica di questo parser e resta corretta
      // per l'Italia, ma quando ci sono si rispettano.
      const latRefE = byTag(gpsIfd, 0x0001), lonRefE = byTag(gpsIfd, 0x0003)
      const latRef = latRefE ? readAscii(latRefE)?.toUpperCase() : undefined
      const lonRef = lonRefE ? readAscii(lonRefE)?.toUpperCase() : undefined
      const signedLat = latRef === 'S' ? -lat : lat
      const signedLon = lonRef === 'W' ? -lon : lon
      if (isPlausible(signedLat, signedLon)) gps = { lat: signedLat, lon: signedLon }
    }
  }

  // ── Istante di scatto ──────────────────────────────────────────────────────
  // DateTimeOriginal vive nella SubIFD Exif (puntata dal tag 0x8769 di IFD0), non in IFD0.
  const exifPointer = byTag(ifd0, 0x8769)
  const exifIfd = exifPointer ? readIfd(exifPointer.valueOffset) : []
  const dtOriginal = (() => {
    for (const [entries, tag] of [[exifIfd, 0x9003], [exifIfd, 0x9004], [ifd0, 0x0132]] as [Entry[], number][]) {
      const e = byTag(entries, tag)
      const v = e ? readAscii(e) : null
      if (v) return v
    }
    return null
  })()
  // OffsetTimeOriginal ("+02:00"), quando c'è, rende l'orario assoluto senza doverlo dedurre dal
  // fuso del dispositivo che sta guardando la foto adesso.
  const offsetE = byTag(exifIfd, 0x9011) ?? byTag(exifIfd, 0x9010)
  const tzOffset = offsetE ? readAscii(offsetE) : null

  const takenAt = parseExifDateTime(dtOriginal, tzOffset)

  return gps || takenAt != null ? { gps, takenAt } : null
}

function parseExifFromBuffer(buf: ArrayBuffer): ExifMetadata | null {
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
        const found = parseTiff(view, off + 8)
        if (found) return found
      }
    }

    off += segLen
  }
  return null
}

/** GPS e istante di scatto dell'EXIF — entrambi null se il file non li contiene o non è leggibile. */
export async function readExifMetadata(file: File): Promise<ExifMetadata> {
  try {
    const buf = await file.slice(0, EXIF_SCAN_BYTES).arrayBuffer()
    return parseExifFromBuffer(buf) ?? { gps: null, takenAt: null }
  } catch {
    return { gps: null, takenAt: null }
  }
}

/** Scorciatoia per i chiamanti che delle sole coordinate hanno bisogno. */
export async function readExifGps(file: File): Promise<ExifGps | null> {
  return (await readExifMetadata(file)).gps
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

/**
 * Quanto può distare l'orario di scatto dalla finestra temporale dell'attività perché la foto sia
 * ancora considerata "scattata durante questa escursione".
 *
 * Non zero, perché è normale fotografare il parcheggio o il panorama poco prima di far partire il
 * cronometro e poco dopo averlo fermato. Ma nemmeno illimitato: senza questo margine, una foto di
 * tutt'altro giorno verrebbe agganciata comunque all'estremo più vicino della traccia — lo stesso
 * effetto che aveva il vecchio ancoraggio a coordinate spazzatura.
 */
export const PHOTO_TIME_MATCH_TOLERANCE_MS = 45 * 60 * 1000

export type PhotoPlacementSource = 'gps' | 'time' | 'none'

export interface PhotoPlacement {
  /** Posizione lungo il percorso, 0-1 — anche l'ordine con cui la foto compare tra le altre. */
  progress: number
  /** Vero solo con coordinate proprie: è ciò che fa mostrare il badge GPS e fa piantare il pin sul
   *  punto esatto dello scatto invece che sul punto di traccia corrispondente a `progress`. */
  hasExifGps: boolean
  lat?: number
  lon?: number
  /** Da cosa è stata dedotta la posizione — l'interfaccia lo comunica invece di lasciar credere
   *  che una foto finita a metà percorso per mancanza di dati sia stata messa lì di proposito. */
  source: PhotoPlacementSource
}

interface PlacementPoint { time?: string; lat?: number; lon?: number }

/**
 * Dove va questa foto lungo la traccia, in ordine di attendibilità: coordinate proprie, poi orario
 * di scatto, poi niente (metà percorso, da sistemare a mano).
 *
 * Condivisa da app/components/ActivityPhotoManager.tsx e components/RouteMap3D.tsx: erano due copie
 * della stessa regola che avevano già iniziato a divergere.
 */
export function placePhotoOnTrack(
  meta: ExifMetadata,
  points: PlacementPoint[],
): PhotoPlacement {
  const gpsPts = points.filter(p => p.lat != null && p.lon != null)

  if (meta.gps) {
    let minD = Infinity, bestIdx = 0
    gpsPts.forEach((pt, i) => {
      const d = haversineMeters(pt.lat!, pt.lon!, meta.gps!.lat, meta.gps!.lon)
      if (d < minD) { minD = d; bestIdx = i }
    })
    // Senza traccia con cui confrontarle, le coordinate si tengono comunque: sono un dato del file,
    // non un'ipotesi. Si scartano solo quando la traccia c'è e dice che lo scatto è lontanissimo.
    if (gpsPts.length === 0 || minD <= EXIF_MAX_SNAP_DISTANCE_M) {
      return {
        progress: gpsPts.length > 1 ? bestIdx / (gpsPts.length - 1) : 0.5,
        hasExifGps: true, lat: meta.gps.lat, lon: meta.gps.lon, source: 'gps',
      }
    }
  }

  // Nessuna coordinata utilizzabile: si prova con l'orario. I telefoni consegnano alle pagine web
  // foto con la posizione rimossa molto più spesso di quanto rimuovano la data, quindi questa non è
  // una via di riserva marginale — su un telefono con la localizzazione delle foto negata al
  // browser è LA strada che funziona.
  const timed = points.filter(p => p.time && p.lat != null && p.lon != null)
  if (meta.takenAt != null && timed.length > 1) {
    const times = timed.map(p => new Date(p.time!).getTime())
    const first = times[0], last = times[times.length - 1]
    if (Number.isFinite(first) && Number.isFinite(last)) {
      const withinHike = meta.takenAt >= first - PHOTO_TIME_MATCH_TOLERANCE_MS
        && meta.takenAt <= last + PHOTO_TIME_MATCH_TOLERANCE_MS
      if (withinHike) {
        let minDt = Infinity, bestIdx = 0
        times.forEach((t, i) => {
          const dt = Math.abs(t - meta.takenAt!)
          if (dt < minDt) { minDt = dt; bestIdx = i }
        })
        return { progress: bestIdx / (timed.length - 1), hasExifGps: false, source: 'time' }
      }
    }
  }

  return { progress: 0.5, hasExifGps: false, source: 'none' }
}

/** Copia locale di lib/geoUtils.ts's haversineM — questo modulo resta senza dipendenze interne,
 *  così è verificabile da solo (vedi i test di parsing) senza tirarsi dietro mezza app. */
function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const f1 = lat1 * Math.PI / 180, f2 = lat2 * Math.PI / 180
  const df = (lat2 - lat1) * Math.PI / 180, dl = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(df / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
