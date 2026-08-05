// lib/videoTimeline.ts — il percorso come figura su cui posare foto e stacchi.
//
// Il montaggio automatico (planInterludes) fa del suo meglio, ma su un percorso corto e pieno di
// foto "il meglio" resta una successione di interruzioni ravvicinate: nessuna regola può inventare
// spazio che non c'è, e solo chi ha camminato quel sentiero sa quale momento merita una sosta.
// Da qui l'editor: si vede il tracciato, si vede dove cadono le cose, si trascinano dove si vuole.
//
// Qui sta solo la geometria — trasformare il tracciato in una figura disegnabile, ricavare la
// posizione lungo il percorso da un punto toccato, e dire quali elementi si stanno pestando i
// piedi. Il disegno e il trascinamento vivono in components/video/RouteTimelineEditor.tsx.
//
// Logica pura: nessun DOM, nessun React.

export interface TimelinePoint { x: number; y: number }

/** Un punto del tracciato ridotto a ciò che serve qui. */
export interface TimelineTrackPoint { lat?: number; lon?: number }

export interface TimelineShape {
  /** Il tracciato in coordinate del riquadro di disegno. */
  points: TimelinePoint[]
  /** Progressione 0-1 di ciascun punto, per distanza percorsa: serve a mettere un elemento
   *  ESATTAMENTE dove cade lungo il cammino, non dove cade lungo l'elenco dei vertici (che sono
   *  fitti in salita e radi in pianura, e sfalserebbero tutto). */
  progress: number[]
}

const EARTH_R_M = 6371000

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const f1 = lat1 * Math.PI / 180, f2 = lat2 * Math.PI / 180
  const df = (lat2 - lat1) * Math.PI / 180, dl = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(df / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2
  return EARTH_R_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Il tracciato ridotto a una figura dentro un riquadro, mantenendo le proporzioni.
 *
 * Non è una mappa e non vuole esserlo: niente sfondo, niente scala, niente nord. È la FORMA del
 * cammino, che è tutto ciò che serve per rispondere alla domanda «questa foto sta prima o dopo
 * quella curva?». Una mappa vera qui aggiungerebbe solo peso e distrazione — e sul telefono ruberebbe
 * lo spazio che serve alle cose da trascinare.
 *
 * Proiezione equirettangolare locale (x scalato per cos(lat)): alle dimensioni di un'escursione
 * l'errore è ben sotto il pixel, e non introduce la dipendenza da una libreria di proiezione per
 * disegnare una linea.
 */
export function buildTimelineShape(
  track: TimelineTrackPoint[],
  box: { width: number; height: number; padding: number },
  maxPoints = 300,
): TimelineShape | null {
  const pts = track.filter(p => p.lat != null && p.lon != null) as { lat: number; lon: number }[]
  if (pts.length < 2) return null

  // Sottocampionamento: una traccia da 5000 punti disegnata in 300 px non guadagna nulla da tutti i
  // suoi vertici, e li paga in fluidità del trascinamento.
  const step = Math.max(1, Math.ceil(pts.length / maxPoints))
  const kept = pts.filter((_, i) => i % step === 0)
  if (kept[kept.length - 1] !== pts[pts.length - 1]) kept.push(pts[pts.length - 1])

  // Progressione per distanza REALE, calcolata sui punti tenuti.
  const cum: number[] = [0]
  for (let i = 1; i < kept.length; i++) {
    cum.push(cum[i - 1] + haversineM(kept[i - 1].lat, kept[i - 1].lon, kept[i].lat, kept[i].lon))
  }
  const total = cum[cum.length - 1]
  const progress = total > 0 ? cum.map(d => d / total) : kept.map((_, i) => i / Math.max(1, kept.length - 1))

  const lat0 = kept[Math.floor(kept.length / 2)].lat
  const kx = Math.cos(lat0 * Math.PI / 180)
  const raw = kept.map(p => ({ x: p.lon * kx, y: -p.lat }))   // y negata: a nord in alto

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of raw) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y
  }
  const spanX = Math.max(1e-9, maxX - minX), spanY = Math.max(1e-9, maxY - minY)
  const availW = Math.max(1, box.width - box.padding * 2)
  const availH = Math.max(1, box.height - box.padding * 2)
  // Una sola scala per i due assi: scalarli separatamente stirerebbe il percorso, e una salita a
  // zig-zag diventerebbe irriconoscibile rispetto alla mappa che l'utente ha in testa.
  const scale = Math.min(availW / spanX, availH / spanY)
  const offX = box.padding + (availW - spanX * scale) / 2
  const offY = box.padding + (availH - spanY * scale) / 2

  return {
    points: raw.map(p => ({ x: offX + (p.x - minX) * scale, y: offY + (p.y - minY) * scale })),
    progress,
  }
}

/** Il punto del riquadro corrispondente a una progressione 0-1. */
export function pointAtProgress(shape: TimelineShape, t: number): TimelinePoint {
  const k = Math.max(0, Math.min(1, t))
  const { points, progress } = shape
  if (points.length === 1) return points[0]
  let i = 1
  while (i < progress.length - 1 && progress[i] < k) i++
  const p0 = progress[i - 1], p1 = progress[i]
  const f = p1 > p0 ? (k - p0) / (p1 - p0) : 0
  return {
    x: points[i - 1].x + (points[i].x - points[i - 1].x) * f,
    y: points[i - 1].y + (points[i].y - points[i - 1].y) * f,
  }
}

/**
 * La progressione del punto di tracciato più vicino a una posizione toccata.
 *
 * È il cuore del trascinamento: il dito non segue mai la linea con precisione, e pretendere che lo
 * faccia renderebbe l'editor esasperante su un telefono. Si proietta invece sul segmento più
 * vicino, così trascinare "verso" un tratto basta a posizionarcisi sopra.
 */
export function progressAtPoint(shape: TimelineShape, at: TimelinePoint): number {
  const { points, progress } = shape
  if (points.length < 2) return 0
  let best = 0, bestD = Infinity
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i]
    const dx = b.x - a.x, dy = b.y - a.y
    const lenSq = dx * dx + dy * dy
    let t = lenSq > 0 ? ((at.x - a.x) * dx + (at.y - a.y) * dy) / lenSq : 0
    t = Math.max(0, Math.min(1, t))
    const d = Math.hypot(at.x - (a.x + t * dx), at.y - (a.y + t * dy))
    if (d < bestD) { bestD = d; best = progress[i - 1] + (progress[i] - progress[i - 1]) * t }
  }
  return Math.max(0, Math.min(1, best))
}

/**
 * Dove mettere le frecce di marcia, e con quale inclinazione.
 *
 * Servono a rispondere a una domanda che la sola linea non risolve: da che parte si cammina. Senza,
 * "l'inizio" è solo un pallino e non si capisce se una foto sta all'andata o al ritorno.
 */
export interface TimelineArrow { x: number; y: number; angleDeg: number; progress: number }

export function directionArrows(shape: TimelineShape, count: number): TimelineArrow[] {
  const out: TimelineArrow[] = []
  for (let i = 0; i < count; i++) {
    // Sfalsate dagli estremi: una freccia sopra il pallino di partenza li rende illeggibili entrambi.
    const t = (i + 1) / (count + 1)
    const here = pointAtProgress(shape, t)
    const ahead = pointAtProgress(shape, Math.min(1, t + 0.012))
    const behind = pointAtProgress(shape, Math.max(0, t - 0.012))
    out.push({
      x: here.x, y: here.y, progress: t,
      angleDeg: Math.atan2(ahead.y - behind.y, ahead.x - behind.x) * 180 / Math.PI,
    })
  }
  return out
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
