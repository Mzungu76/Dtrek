// lib/videoTimeline.ts — dove cadono foto e stacchi sul percorso, e chi si pesta i piedi.
//
// Il montaggio automatico (planInterludes) fa del suo meglio, ma su un percorso corto e pieno di
// foto "il meglio" resta una successione di interruzioni ravvicinate: nessuna regola può inventare
// spazio che non c'è, e solo chi ha camminato quel sentiero sa quale momento merita una sosta.
// Da qui l'editor (components/video/RouteLeafletEditor.tsx): si vede il tracciato su una mappa
// vera, si vede dove cadono le cose, si trascinano dove si vuole.
//
// Qui sta solo la geometria — ricavare la posizione lungo il percorso da un punto toccato sulla
// mappa, e dire quali elementi si stanno pestando i piedi. Il disegno e il trascinamento vivono
// nel componente.
//
// Logica pura: nessun DOM, nessun React.

/** Un punto del tracciato ridotto a ciò che serve qui. */
export interface TimelineTrackPoint { lat?: number; lon?: number }

const EARTH_R_M = 6371000

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const f1 = lat1 * Math.PI / 180, f2 = lat2 * Math.PI / 180
  const df = (lat2 - lat1) * Math.PI / 180, dl = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(df / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2
  return EARTH_R_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Dato un punto lat/lon toccato sulla mappa (dove un marcatore Leaflet è stato trascinato), la
 * progressione 0-1 del punto del tracciato più vicino — per DISTANZA reale percorsa, non per
 * indice del vertice più vicino (che sono fitti in salita e radi in pianura, e sfalserebbero tutto).
 *
 * Si costruisce la tabella delle distanze cumulate al volo e ci si proietta sopra il segmento più
 * vicino (equirettangolare locale, la stessa approssimazione usata altrove in lib/geoUtils.ts —
 * l'errore è ben sotto il metro alle distanze di un'escursione), così trascinare "verso" un tratto
 * basta a posizionarcisi sopra: il dito non deve mai seguire la linea con precisione.
 */
export function progressFromLatLng(track: TimelineTrackPoint[], lat: number, lon: number): number {
  const pts = track.filter(p => p.lat != null && p.lon != null) as { lat: number; lon: number }[]
  if (pts.length < 2) return 0

  const cum: number[] = [0]
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + haversineM(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon))
  const total = cum[cum.length - 1]
  if (total <= 0) return 0

  const kx = Math.cos(lat * Math.PI / 180)
  const toXY = (la: number, lo: number): [number, number] => [(lo - lon) * kx, la - lat]
  const [px, py] = [0, 0]   // il punto toccato è l'origine del sistema locale

  let bestDist = 0, bestD2 = Infinity
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = toXY(pts[i - 1].lat, pts[i - 1].lon)
    const [bx, by] = toXY(pts[i].lat, pts[i].lon)
    const dx = bx - ax, dy = by - ay
    const lenSq = dx * dx + dy * dy
    let t = lenSq > 0 ? ((px - ax) * dx + (py - ay) * dy) / lenSq : 0
    t = Math.max(0, Math.min(1, t))
    const cx = ax + t * dx, cy = ay + t * dy
    const d2 = (px - cx) ** 2 + (py - cy) ** 2
    if (d2 < bestD2) {
      bestD2 = d2
      bestDist = cum[i - 1] + t * (cum[i] - cum[i - 1])
    }
  }
  return Math.max(0, Math.min(1, bestDist / total))
}

// ── Chi si pesta i piedi ──────────────────────────────────────────────────────

export interface TimelineItem {
  id: string
  kind: 'photo' | 'interlude'
  /** Posizione lungo il percorso, 0-1. */
  atP: number
  label: string
  /** Secondi che l'elemento tiene fermo il video: serve a dire se due cose vicine sono davvero un
   *  problema. Due foto a un secondo di distanza lo sono; due segnaposto senza durata no. */
  seconds: number
}

export interface TimelineCrowding {
  /** Coppie di id che stanno troppo vicine, con quanto percorso le separa in secondi di volo. */
  pairs: { a: string; b: string; apartSec: number }[]
  /** Gli id coinvolti in almeno una coppia — comodo per evidenziarli. */
  ids: Set<string>
}

/**
 * Quali elementi sono troppo ravvicinati, misurato in SECONDI DI VOLO fra l'uno e l'altro.
 *
 * Non in percentuale di percorso, che è la misura sbagliata e non ovvia: il 5% di un anello da 3 km
 * percorso lentamente sono parecchi secondi, il 5% di una traversata da 25 km a cursore veloce è un
 * battito di ciglia. Quello che infastidisce chi guarda è il tempo fra un'interruzione e l'altra, e
 * quello dipende dalla velocità scelta — quindi è quello che si misura.
 */
export function findCrowding(items: TimelineItem[], routeSeconds: number, minApartSec: number): TimelineCrowding {
  const sorted = items.slice().sort((a, b) => a.atP - b.atP)
  const pairs: { a: string; b: string; apartSec: number }[] = []
  const ids = new Set<string>()
  for (let i = 1; i < sorted.length; i++) {
    const apartSec = (sorted[i].atP - sorted[i - 1].atP) * Math.max(0, routeSeconds)
    if (apartSec < minApartSec) {
      pairs.push({ a: sorted[i - 1].id, b: sorted[i].id, apartSec })
      ids.add(sorted[i - 1].id); ids.add(sorted[i].id)
    }
  }
  return { pairs, ids }
}

/** Quanto percorso deve scorrere fra due interruzioni perché non sembrino attaccate. Stesso valore
 *  del "respiro" di planInterludes: l'editor e il montaggio automatico devono giudicare uguale,
 *  altrimenti l'editor dichiara buona una disposizione che il montaggio poi contesta. */
export const MIN_ITEM_GAP_SEC = 4

/**
 * Sistema automaticamente ciò che findCrowding si limita a segnalare: dato un insieme di elementi
 * (foto e stacchi, insieme) restituisce le posizioni minime necessarie a rispettare il respiro fra
 * l'uno e l'altro, senza toccare l'ordine in cui cadono lungo il percorso.
 *
 * Usato quando si applica un preset: un preset accende stacchi in punti fissi (0.06, 0.22, 0.50…)
 * pensati per un percorso "medio", ma le foto vere hanno posizioni proprie — e le due cose insieme
 * possono benissimo cadere a un secondo l'una dall'altra su un anello corto. Ricalcolare a mano
 * ogni volta è il lavoro che il preset dovrebbe risparmiare, non aggiungere.
 *
 * Algoritmo in due passate, lo stesso usato per il collocamento di etichette che non devono
 * sovrapporsi: si lavora in SECONDI (non in frazione di percorso, per lo stesso motivo di
 * findCrowding — il fastidio è nel tempo, non nella distanza), si scorre in avanti spingendo ogni
 * elemento troppo vicino al precedente subito dopo di lui, poi si torna indietro nel caso l'ultimo
 * elemento sia stato spinto oltre la fine del percorso. Non è la disposizione più elegante
 * possibile (quella richiederebbe una redistribuzione globale, non giustificata per una manciata
 * di elementi), ma è quella che sposta ciascuno il MENO possibile dalla sua posizione di partenza.
 */
export function declutterItems(
  items: TimelineItem[], routeSeconds: number, minGapSec: number,
): Map<string, number> {
  const result = new Map<string, number>()
  if (routeSeconds <= 0 || items.length === 0) {
    for (const it of items) result.set(it.id, it.atP)
    return result
  }

  const sorted = items.slice().sort((a, b) => a.atP - b.atP)
  const sec = sorted.map(it => it.atP * routeSeconds)

  for (let i = 1; i < sec.length; i++) {
    if (sec[i] - sec[i - 1] < minGapSec) sec[i] = sec[i - 1] + minGapSec
  }
  // La passata in avanti può aver spinto l'ultimo elemento oltre la fine del percorso: si
  // riporta dentro e si ripropaga all'indietro, così l'eccesso si redistribuisce verso l'inizio
  // invece di restare tutto accatastato in fondo.
  if (sec[sec.length - 1] > routeSeconds) {
    sec[sec.length - 1] = routeSeconds
    for (let i = sec.length - 2; i >= 0; i--) {
      if (sec[i + 1] - sec[i] < minGapSec) sec[i] = sec[i + 1] - minGapSec
    }
  }

  for (let i = 0; i < sorted.length; i++) {
    result.set(sorted[i].id, Math.max(0, Math.min(1, sec[i] / routeSeconds)))
  }
  return result
}
