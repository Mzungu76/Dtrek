// lib/videoPoiCards.ts — selezione e messa in scena dei punti di interesse nel video "Illustrativo".
//
// Il problema che questo file risolve non è disegnare: è la DENSITÀ. Overpass restituisce 50-100 POI
// su un percorso che sfiora dei paesi, e anche tenendone quindici, su un volo di 30 secondi sarebbe
// uno ogni due secondi — con i grappoli (fontana + cappella + panchina in cento metri) che ne
// farebbero comparire quattro in mezzo secondo, uno sopra l'altro.
//
// Tre meccanismi, in quest'ordine:
//
// 1. DUE REGISTRI. I POI di servizio (fontana, sorgente, panchina, picnic) non hanno mai una scheda:
//    restano segnaposti sulla mappa. Solo i "protagonisti" (cima, rifugio, cascata, castello…)
//    possono prendersi lo schermo. Da sola questa regola toglie quasi tutto il rumore, perché i
//    grappoli fitti sono quasi sempre servizi.
//
// 2. UNA SOLA CASELLA. Esiste una sola posizione a schermo in cui può apparire una scheda, quindi le
//    sovrapposizioni sono impossibili PER COSTRUZIONE e resta solo da decidere il quando: un
//    problema di ordinamento su una dimensione, non di posizionamento su due. È la differenza tra
//    una pianificazione che si può ragionare e l'anticollisione di etichette, che è dove queste cose
//    di solito falliscono.
//
// 3. RAGGRUPPAMENTO. Protagonisti ravvicinati diventano UNA scheda che li nomina insieme: si legge
//    meglio ed è anche più fedele a com'è camminarci davvero.
//
// Tutto il file è logica pura (nessun canvas, nessun React): si può provare da solo.
import type { PoiItem, PoiType } from './overpass'

/** 0 = protagonista sicuro, 1 = protagonista se ha un nome, 2 = sempre e solo segnaposto. */
export const POI_TIER: Record<PoiType, 0 | 1 | 2> = {
  peak: 0, hut: 0, bivouac: 0, pass: 0, viewpoint: 0, waterfall: 0,
  cave: 1, shelter: 1, ruins: 1, castle: 1, archaeological: 1, cross: 1,
  monument: 1, chapel: 1, tower: 1, bridge: 1,
  spring: 2, fountain: 2, picnic: 2, bench: 2,
}

/** Luoghi che un video pensato per girare può contribuire a rovinare: chi li conosce ci arriva
 *  comunque, chi non li conosce non dovrebbe trovarli in un reel con le coordinate. Esclusi dalle
 *  schede per impostazione predefinita — vedi `includeSensitive` in PoiPlanOptions. */
export const SENSITIVE_POI_TYPES: PoiType[] = ['cave', 'archaeological', 'ruins', 'spring']

export interface PoiOnRoute {
  id: number
  type: PoiType
  name?: string
  progress: number        // 0..1 lungo il percorso, punto più vicino
  distFromTrackM: number
  /** Miniatura Wikipedia del luogo, se ne esiste una (WikiPage.thumbnail). */
  imageUrl?: string
  /** Prima frase dell'estratto Wikipedia — una riga, non un paragrafo. */
  blurb?: string
}

export interface PoiCard {
  key: string
  pois: PoiOnRoute[]      // più di uno = grappolo raggruppato
  progress: number        // dove sta sul percorso (il POI principale)
  startFrame: number
  endFrame: number
}

export interface PoiPlan {
  cards: PoiCard[]
  /** Tutti gli altri: segnaposto sulla mappa, mai una scheda. */
  markers: PoiOnRoute[]
}

export interface PoiPlanOptions {
  /** Converte un avanzamento 0..1 nel fotogramma (globale) in cui la telecamera ci passa. */
  progressToFrame: (p: number) => number
  cardFrames: number          // durata di una scheda
  minGapFrames: number        // respiro minimo tra la fine di una e l'inizio della successiva
  lastFrame: number           // oltre questo non si programma più nulla
  maxCards: number
  /** Distanza minima tra due schede in avanzamento, per non ammassarle nel primo terzo. */
  minSpacingP: number
  /** Entro questa distanza in avanzamento due protagonisti finiscono nella stessa scheda. */
  groupWindowP: number
  includeSensitive?: boolean
  /** Solo i luoghi con un'immagine possono prendersi una scheda. Gli altri restano segnaposti:
   *  una scheda fatta di nome e icona ripete quello che il segnaposto sulla mappa dice già. */
  requireImage?: boolean
}

/** Proietta i POI sul percorso: per ognuno l'avanzamento del punto di tracciato più vicino. */
/** Prima frase di un estratto, tagliata corta: a schermo una scheda regge una riga, non un capoverso. */
function firstSentence(extract: string, maxLen = 120): string | undefined {
  const clean = extract.replace(/\s+/g, ' ').trim()
  if (!clean) return undefined
  const m = clean.match(/^.{20,}?[.!?](?=\s|$)/)
  const s = (m ? m[0] : clean).trim()
  if (s.length <= maxLen) return s
  const cut = s.slice(0, maxLen)
  return cut.slice(0, Math.max(0, cut.lastIndexOf(' '))).trim() + '…'
}

export function projectPoisOnRoute(
  pois: PoiItem[],
  routeLatLon: { lat: number; lon: number }[],
  /** Miniature/estratti Wikipedia per id di POI — vedi fetchWikiForNamedPois. */
  wikiById?: Map<number, { thumbnail?: string; extract?: string }>,
): PoiOnRoute[] {
  if (routeLatLon.length < 2) return []
  const out: PoiOnRoute[] = []
  for (const poi of pois) {
    let best = Infinity, bestIdx = 0
    for (let i = 0; i < routeLatLon.length; i++) {
      const dLat = routeLatLon[i].lat - poi.lat
      // longitudine accorciata dal coseno della latitudine, altrimenti alle nostre latitudini
      // un grado di longitudine "pesa" quanto uno di latitudine e il punto più vicino esce sbagliato
      const dLon = (routeLatLon[i].lon - poi.lon) * Math.cos(poi.lat * Math.PI / 180)
      const d2 = dLat * dLat + dLon * dLon
      if (d2 < best) { best = d2; bestIdx = i }
    }
    const w = wikiById?.get(poi.id)
    out.push({
      id: poi.id, type: poi.type, name: poi.name?.trim() || undefined,
      progress: bestIdx / (routeLatLon.length - 1),
      distFromTrackM: poi.distFromTrack,
      imageUrl: w?.thumbnail,
      blurb: w?.extract ? firstSentence(w.extract) : undefined,
    })
  }
  return out
}

/** Quanto "merita" lo schermo. Il nome pesa più di tutto: una scheda che dice solo "Rovine" non
 *  aggiunge niente a un segnaposto con la stessa icona, mentre "Castello di Zumelle" sì. */
export function scorePoi(p: PoiOnRoute): number {
  const tier = POI_TIER[p.type]
  if (tier === 2) return 0
  let s = tier === 0 ? 60 : 40
  if (p.name) s += 45
  else if (tier === 1) return 0        // tier 1 senza nome non ha niente da raccontare
  s += Math.max(0, 20 - p.distFromTrackM / 25)   // più è sul percorso, più è "tuo"
  return s
}

/**
 * Decide chi va in scheda, chi resta segnaposto, e quando ogni scheda entra.
 *
 * Le schede scartate non spariscono: scendono tra i segnaposti, così il luogo resta sulla mappa
 * anche quando non merita di prendersi lo schermo.
 */
export function planPoiCards(pois: PoiOnRoute[], opts: PoiPlanOptions): PoiPlan {
  const {
    progressToFrame, cardFrames, minGapFrames, lastFrame,
    maxCards, minSpacingP, groupWindowP, includeSensitive = false, requireImage = false,
  } = opts

  const markers: PoiOnRoute[] = []
  const eligible: PoiOnRoute[] = []
  for (const p of pois) {
    const sensitive = !includeSensitive && SENSITIVE_POI_TYPES.includes(p.type)
    const noImage = requireImage && !p.imageUrl
    if (sensitive || noImage || scorePoi(p) <= 0) markers.push(p)
    else eligible.push(p)
  }

  // 1. Raggruppa i protagonisti ravvicinati in un'unica scheda
  eligible.sort((a, b) => a.progress - b.progress)
  const groups: PoiOnRoute[][] = []
  for (const p of eligible) {
    const last = groups[groups.length - 1]
    if (last && p.progress - last[0].progress <= groupWindowP) last.push(p)
    else groups.push([p])
  }

  // 2. Ordina i gruppi per merito, tenendo il migliore in testa a ciascuno
  const ranked = groups
    .map(g => {
      const sorted = g.slice().sort((a, b) => scorePoi(b) - scorePoi(a))
      return { pois: sorted, score: scorePoi(sorted[0]) + (sorted.length - 1) * 8, progress: sorted[0].progress }
    })
    .sort((a, b) => b.score - a.score)

  // 3. Scelta ingorda col vincolo di distanza: prendi il migliore, poi vieta i suoi dintorni.
  //    Senza questo vincolo un percorso che parte da un paese si prenderebbe tutte le schede nei
  //    primi dieci secondi e poi il nulla.
  const chosen: typeof ranked = []
  for (const g of ranked) {
    if (chosen.length >= maxCards) break
    if (chosen.some(c => Math.abs(c.progress - g.progress) < minSpacingP)) continue
    chosen.push(g)
  }
  const chosenKeys = new Set(chosen.map(c => c.pois[0].id))
  for (const g of ranked) {
    if (!chosenKeys.has(g.pois[0].id)) markers.push(...g.pois)
  }
  // Nei gruppi scelti, oltre i primi tre i restanti restano segnaposto: una scheda che elenca sei
  // nomi non la legge nessuno nel tempo in cui resta a schermo.
  for (const c of chosen) {
    if (c.pois.length > 3) markers.push(...c.pois.slice(3))
    c.pois = c.pois.slice(0, 3)
  }

  // 4. Programmazione: in ordine di percorso, spingendo avanti chi arriva troppo presto.
  //    Non si scarta mai per mancanza di spazio — si mostra un attimo dopo, col segnaposto che
  //    intanto pulsa, così il legame col luogo resta leggibile.
  chosen.sort((a, b) => a.progress - b.progress)
  const cards: PoiCard[] = []
  let freeFrom = 0
  for (const c of chosen) {
    const wanted = progressToFrame(c.progress)
    const start = Math.max(wanted, freeFrom)
    if (start + cardFrames > lastFrame) break     // finito il percorso, niente code fuori tempo
    cards.push({
      key: `poi-${c.pois[0].id}`,
      pois: c.pois,
      progress: c.progress,
      startFrame: start,
      endFrame: start + cardFrames,
    })
    freeFrom = start + cardFrames + minGapFrames
  }

  const kept = new Set(cards.map(c => c.key))
  for (const c of chosen) {
    if (!kept.has(`poi-${c.pois[0].id}`)) markers.push(...c.pois)
  }
  return { cards, markers }
}

/** Scheda attiva nel fotogramma dato, con il suo avanzamento 0..1. */
export function activeCardAt(plan: PoiPlan, frame: number): { card: PoiCard; t: number } | null {
  for (const c of plan.cards) {
    if (frame >= c.startFrame && frame < c.endFrame) {
      return { card: c, t: (frame - c.startFrame) / Math.max(1, c.endFrame - c.startFrame) }
    }
  }
  return null
}
