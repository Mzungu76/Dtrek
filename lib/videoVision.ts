// lib/videoVision.ts — lo stacco "Visione": il percorso spiegato tutto in una volta.
//
// Gli altri stacchi (lib/videoInterludes.ts) fermano la telecamera e coprono lo schermo con un
// pannello. Questo no: allarga a volo d'uccello fino a inquadrare l'intero tracciato, fa affiorare
// sul satellitare quello che la vegetazione nasconde (corsi d'acqua, sentieri) e annota le cose che
// contano con etichette collegate da una linea sottile — un'infografica, non una scheda.
//
// Sta vicino alla partenza per un motivo preciso: serve a capire DOVE si sta per andare. Messa in
// fondo racconterebbe una cosa già vista.
//
// Logica pura: nessun canvas, nessun React, nessuna mappa. Qui si decide COSA mostrare e DOVE
// scriverlo; il disegno vive in lib/videoOverlays.ts e la regia in components/RouteMap3D.tsx.

export type VisionCategory = 'idrografia' | 'sentieri' | 'luoghi' | 'toponimi'

export const VISION_CATEGORY_LABEL: Record<VisionCategory, string> = {
  idrografia: 'Corsi d’acqua',
  sentieri:   'Sentieri e bivi',
  luoghi:     'Luoghi di interesse',
  toponimi:   'Cime e valichi',
}

export const DEFAULT_VISION_CATEGORIES: VisionCategory[] = ['idrografia', 'sentieri', 'luoghi', 'toponimi']

/** Oltre questo numero le etichette si accavallano e la Visione smette di essere leggibile: è
 *  un'occhiata d'insieme, non una legenda. Meglio quattro cose capite di dieci intraviste. */
export const MAX_VISION_CALLOUTS = 6

/** Quanto vicino al tracciato deve passare una linea perché la si consideri "di questo percorso". */
const LINE_RELEVANCE_M = 120
/** Un sentiero che per quasi tutta la sua lunghezza coincide col tracciato È il tracciato: va
 *  scartato, altrimenti la Visione annota il percorso stesso come se fosse un bivio. */
const TRAIL_SEPARATION_M = 60
const TRAIL_MIN_SEPARATE_FRACTION = 0.35
/** Un POI più lontano di così dal tracciato non lo si incontra camminando. */
const POI_RELEVANCE_M = 400

export interface VisionSourceLine {
  id: number
  kind: 'waterway' | 'trail'
  name: string
  osmType: string
  geometry: [number, number][]
}

export interface VisionSourcePoint {
  id: number | string
  name?: string
  lat: number
  lon: number
  /** Tipo POI (lib/overpass.ts PoiType) — separa "cime e valichi" dagli altri luoghi. */
  type: string
  distFromTrack?: number
}

/** Una cosa da annotare: dove sta, come si chiama, e a quale categoria appartiene. */
export interface VisionFeature {
  key: string
  category: VisionCategory
  name: string
  /** Punto a cui punta la linea guida. Per una linea è il punto in cui passa più vicino al
   *  tracciato: è lì che chi cammina la incontra davvero. */
  lat: number
  lon: number
  /** Etichetta secondaria ("Torrente", "Sentiero", "Cima") — dice di che cosa si tratta senza
   *  costringere a dedurlo dal nome. */
  qualifier: string
  /** Quanto merita di stare nella Visione. Serve solo a scegliere i primi MAX_VISION_CALLOUTS. */
  score: number
}

const TOPONYM_POI_TYPES = new Set(['peak', 'pass'])

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const f1 = lat1 * Math.PI / 180, f2 = lat2 * Math.PI / 180
  const df = (lat2 - lat1) * Math.PI / 180, dl = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(df / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** Distanza minima di un punto dal tracciato, e l'indice del punto di traccia che la realizza. */
function nearestOnRoute(lat: number, lon: number, route: [number, number][]): { distM: number; idx: number } {
  let best = Infinity, idx = 0
  for (let i = 0; i < route.length; i++) {
    const d = haversineM(lat, lon, route[i][0], route[i][1])
    if (d < best) { best = d; idx = i }
  }
  return { distM: best, idx }
}

const WATER_QUALIFIER: Record<string, string> = { river: 'Fiume', stream: 'Torrente', canal: 'Canale' }
const TRAIL_QUALIFIER: Record<string, string> = { path: 'Sentiero', footway: 'Sentiero', track: 'Sterrata', bridleway: 'Mulattiera' }
const POI_QUALIFIER: Record<string, string> = {
  peak: 'Cima', pass: 'Valico', spring: 'Sorgente', waterfall: 'Cascata', cave: 'Grotta',
  hut: 'Rifugio', bivouac: 'Bivacco', viewpoint: 'Belvedere', cross: 'Croce',
}

/**
 * Sceglie cosa annotare, in ordine di importanza, evitando di ripetere lo stesso nome e di
 * ammassare più etichette sullo stesso tratto di percorso.
 *
 * Il punteggio premia ciò che si incontra davvero: più una cosa è vicina al tracciato, più conta.
 * Fra pari, un fiume conta più di un fosso e una cima più di un belvedere — non per gerarchia
 * astratta, ma perché sono gli elementi con cui si riconosce un posto guardandolo dall'alto.
 */
export function selectVisionFeatures(
  route: [number, number][],
  lines: VisionSourceLine[],
  points: VisionSourcePoint[],
  categories: VisionCategory[],
  max = MAX_VISION_CALLOUTS,
): VisionFeature[] {
  if (route.length < 2) return []
  const wanted = new Set(categories)
  const out: VisionFeature[] = []

  for (const line of lines) {
    const category: VisionCategory = line.kind === 'waterway' ? 'idrografia' : 'sentieri'
    if (!wanted.has(category)) continue

    // Punto di massimo avvicinamento al tracciato: è lì che chi cammina incontra il corso d'acqua
    // o il bivio, ed è lì che ha senso puntare la linea guida.
    let bestD = Infinity, bestPt: [number, number] | null = null
    let farCount = 0
    for (const g of line.geometry) {
      const d = nearestOnRoute(g[0], g[1], route).distM
      if (d < bestD) { bestD = d; bestPt = g }
      if (d > TRAIL_SEPARATION_M) farCount++
    }
    if (!bestPt || bestD > LINE_RELEVANCE_M) continue

    if (line.kind === 'trail') {
      // Il tracciato stesso, ritrovato in OSM, va scartato: se quasi tutti i suoi vertici stanno
      // addosso al percorso non è un bivio, è il percorso.
      const separateFraction = farCount / line.geometry.length
      if (separateFraction < TRAIL_MIN_SEPARATE_FRACTION) continue
    }

    const typeBonus = line.kind === 'waterway'
      ? (line.osmType === 'river' ? 1.4 : 1)
      : (line.osmType === 'path' || line.osmType === 'footway' ? 1.2 : 0.9)
    out.push({
      key: `line-${line.id}`,
      category, name: line.name,
      lat: bestPt[0], lon: bestPt[1],
      qualifier: (line.kind === 'waterway' ? WATER_QUALIFIER[line.osmType] : TRAIL_QUALIFIER[line.osmType]) ?? '',
      score: typeBonus * (1 - Math.min(1, bestD / LINE_RELEVANCE_M)) + 0.35 * typeBonus,
    })
  }

  for (const pt of points) {
    if (!pt.name) continue
    const isToponym = TOPONYM_POI_TYPES.has(pt.type)
    const category: VisionCategory = isToponym ? 'toponimi' : 'luoghi'
    if (!wanted.has(category)) continue
    const d = pt.distFromTrack ?? nearestOnRoute(pt.lat, pt.lon, route).distM
    if (d > POI_RELEVANCE_M) continue
    out.push({
      key: `poi-${pt.id}`,
      category, name: pt.name, lat: pt.lat, lon: pt.lon,
      qualifier: POI_QUALIFIER[pt.type] ?? '',
      score: (isToponym ? 1.5 : 1.1) * (1 - Math.min(1, d / POI_RELEVANCE_M)) + (isToponym ? 0.4 : 0.2),
    })
  }

  // Un nome ripetuto (lo stesso torrente spezzato in più way OSM, un caso frequentissimo) va
  // annotato una volta sola, tenendo l'occorrenza che passa più vicino.
  const byName = new Map<string, VisionFeature>()
  for (const f of out.sort((a, b) => b.score - a.score)) {
    const k = f.name.toLowerCase()
    if (!byName.has(k)) byName.set(k, f)
  }

  // Distribuzione lungo il percorso: sei etichette tutte nello stesso angolo della mappa sono
  // illeggibili anche se sono le sei più importanti. Si accetta una feature solo se il punto di
  // traccia che la riguarda non è troppo vicino a quello di una già accettata.
  const minSeparation = Math.max(1, Math.floor(route.length / (max * 2)))
  const chosen: VisionFeature[] = []
  const takenIdx: number[] = []
  for (const f of Array.from(byName.values()).sort((a, b) => b.score - a.score)) {
    if (chosen.length >= max) break
    const { idx } = nearestOnRoute(f.lat, f.lon, route)
    if (takenIdx.some(t => Math.abs(t - idx) < minSeparation)) continue
    takenIdx.push(idx)
    chosen.push(f)
  }
  return chosen
}

// ── Disposizione delle etichette ──────────────────────────────────────────────

export interface VisionCalloutLayout {
  feature: VisionFeature
  /** Punto annotato, in pixel del fotogramma. */
  anchorX: number
  anchorY: number
  /** Estremo della linea guida dal lato dell'etichetta, dove comincia il testo. */
  labelX: number
  labelY: number
  side: 'left' | 'right'
  /** Ordine di comparsa: le etichette entrano una dopo l'altra, non tutte insieme. */
  order: number
}

export interface VisionLayoutOptions {
  width: number
  height: number
  /** Margini in cui NON scrivere (barre di sistema, HUD del video). */
  insets: { top: number; bottom: number; left: number; right: number }
  /** Larghezza stimata di un'etichetta, per non farla uscire dal fotogramma. */
  labelWidth: number
  /** Passo verticale fra un'etichetta e la successiva sullo stesso lato. */
  rowHeight: number
}

/**
 * Dispone le etichette lungo i due bordi verticali del fotogramma e le collega al punto annotato
 * con una linea sottile — lo schema dell'infografica di riferimento.
 *
 * Ogni etichetta va sul lato verso cui il suo punto già pende (un punto a sinistra del centro
 * prende un'etichetta a sinistra): così la linea guida resta corta e non attraversa mai
 * l'inquadratura passando sopra il tracciato. Le righe di ciascun lato sono slot fissi assegnati
 * per ordine verticale, il che garantisce che due etichette non si sovrappongano mai — cosa che
 * un semplice "scrivi accanto al punto" non può garantire quando due punti sono vicini.
 */
export function layoutVisionCallouts(
  features: VisionFeature[],
  project: (lat: number, lon: number) => { x: number; y: number },
  opts: VisionLayoutOptions,
): VisionCalloutLayout[] {
  const { width, height, insets, labelWidth, rowHeight } = opts
  const usableTop = insets.top + rowHeight
  const usableBottom = height - insets.bottom - rowHeight
  const maxRows = Math.max(1, Math.floor((usableBottom - usableTop) / rowHeight))

  const projected = features.map(f => ({ feature: f, ...project(f.lat, f.lon) }))
    // Fuori dal fotogramma non c'è niente da annotare: la linea guida punterebbe nel vuoto.
    .filter(p => p.x >= -width * 0.1 && p.x <= width * 1.1 && p.y >= -height * 0.1 && p.y <= height * 1.1)

  const left = projected.filter(p => p.x < width / 2).sort((a, b) => a.y - b.y)
  const right = projected.filter(p => p.x >= width / 2).sort((a, b) => a.y - b.y)

  // Riequilibrio: con tutti i punti da una parte sola, quel lato esaurisce gli slot e l'altro resta
  // vuoto. Si spostano i più lontani dal bordo affollato, che sono anche quelli la cui linea guida
  // si allunga di meno attraversando.
  const rebalance = (from: typeof left, to: typeof right, fromSide: 'left' | 'right') => {
    while (from.length > maxRows && to.length < maxRows) {
      const moved = fromSide === 'left'
        ? from.reduce((a, b) => (b.x > a.x ? b : a))
        : from.reduce((a, b) => (b.x < a.x ? b : a))
      from.splice(from.indexOf(moved), 1)
      to.push(moved)
      to.sort((a, b) => a.y - b.y)
    }
  }
  rebalance(left, right, 'left')
  rebalance(right, left, 'right')

  const place = (group: typeof left, side: 'left' | 'right'): VisionCalloutLayout[] => {
    const rows = group.slice(0, maxRows)
    // Slot centrati sul gruppo invece che ancorati in alto: con due sole etichette per lato
    // restano vicine ai propri punti invece di finire entrambe sotto il bordo superiore.
    const span = rows.length * rowHeight
    const wantCenter = rows.reduce((a, p) => a + p.y, 0) / Math.max(1, rows.length)
    const start = Math.min(Math.max(wantCenter - span / 2, usableTop), Math.max(usableTop, usableBottom - span))
    return rows.map((p, i) => ({
      feature: p.feature,
      anchorX: p.x, anchorY: p.y,
      labelX: side === 'left' ? insets.left : width - insets.right - labelWidth,
      labelY: start + i * rowHeight + rowHeight / 2,
      side,
      order: 0,
    }))
  }

  const all = [...place(left, 'left'), ...place(right, 'right')]
  // Ordine di comparsa dall'alto in basso: si legge come si legge una pagina, non a caso.
  return all
    .sort((a, b) => a.labelY - b.labelY)
    .map((c, i) => ({ ...c, order: i }))
}

/**
 * Durata consigliata: quanto ci vuole a leggere davvero le etichette.
 *
 * Stessa filosofia di recommendedInterludeSeconds — ma qui non c'è prosa, ci sono nomi propri
 * colti a colpo d'occhio, più il tempo dell'allargamento della telecamera che va visto finire,
 * altrimenti le etichette compaiono mentre la mappa si sta ancora muovendo.
 */
export const VISION_CAMERA_SECONDS = 1.8
const VISION_PER_CALLOUT_SECONDS = 0.7
const VISION_MIN_SECONDS = 4
const VISION_MAX_SECONDS = 9

export function recommendedVisionSeconds(calloutCount: number): number {
  const raw = VISION_CAMERA_SECONDS + Math.max(1, calloutCount) * VISION_PER_CALLOUT_SECONDS + 1.4
  return Math.min(VISION_MAX_SECONDS, Math.max(VISION_MIN_SECONDS, Math.round(raw * 2) / 2))
}

// ── Inquadratura che contiene tutto il percorso ───────────────────────────────

/** MapLibre: la larghezza del mondo in pixel è 512 · 2^zoom. */
const MAPLIBRE_TILE_SIZE = 512

/**
 * Margine di zoom sottratto al risultato esatto.
 *
 * Il calcolo qui sotto è esatto per una vista perfettamente dall'alto e su terreno piatto. La
 * Visione però inclina un poco la telecamera e la mappa ha il rilievo 3D attivo: un picco vicino
 * al bordo si proietta più in fuori del punto del terreno che gli sta sotto, e l'inclinazione
 * allarga il fondo dell'inquadratura restringendone la cima. Mezzo livello di zoom copre entrambi
 * gli effetti con abbondanza — e "un po' più largo del necessario" è esattamente l'errore giusto
 * da commettere qui: il difetto da evitare è il percorso tagliato fuori, non quello un po' piccolo.
 */
const FIT_ZOOM_MARGIN = 0.5

export interface LatLonBounds { minLat: number; minLon: number; maxLat: number; maxLon: number }

export function boundsOfRoute(route: [number, number][]): LatLonBounds | null {
  if (route.length === 0) return null
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity
  for (const [la, lo] of route) {
    if (la < minLat) minLat = la
    if (la > maxLat) maxLat = la
    if (lo < minLon) minLon = lo
    if (lo > maxLon) maxLon = lo
  }
  return { minLat, maxLat, minLon, maxLon }
}

/** Coordinata Y di Mercator normalizzata (0 al polo nord, 1 al polo sud). */
export function mercatorY(lat: number): number {
  const clamped = Math.max(-85.051129, Math.min(85.051129, lat))
  const phi = clamped * Math.PI / 180
  return (1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2
}

/**
 * Il livello di zoom al quale l'intero rettangolo sta dentro il fotogramma, margini esclusi.
 *
 * Calcolato invece di chiesto a `map.cameraForBounds`: quel metodo parte dallo stato corrente
 * della telecamera — inclinazione compresa — e durante la preparazione del video la mappa è ancora
 * inclinata a 48° per il pre-caricamento del volo, quindi restituiva uno zoom tarato su
 * un'inquadratura diversa da quella che poi la Visione avrebbe usato davvero. Risultato: un pezzo
 * di percorso fuori dal fotogramma proprio nel momento pensato per mostrarlo tutto.
 *
 * Questa formula non dipende da nessuno stato: date le dimensioni del fotogramma e i margini,
 * restituisce sempre lo stesso numero, ed è verificabile da sola.
 */
export function fitZoomForBounds(
  bounds: LatLonBounds,
  viewport: { width: number; height: number },
  padding: { top: number; bottom: number; left: number; right: number },
  margin = FIT_ZOOM_MARGIN,
): number {
  const availW = Math.max(1, viewport.width - padding.left - padding.right)
  const availH = Math.max(1, viewport.height - padding.top - padding.bottom)

  // Frazioni di mondo occupate dal rettangolo. Il minimo evita che un percorso quasi puntiforme
  // (o del tutto verticale/orizzontale) produca uno zoom infinito.
  const fx = Math.max(1e-7, Math.abs((bounds.maxLon - bounds.minLon) / 360))
  const fy = Math.max(1e-7, Math.abs(mercatorY(bounds.minLat) - mercatorY(bounds.maxLat)))

  const zoomX = Math.log2(availW / (MAPLIBRE_TILE_SIZE * fx))
  const zoomY = Math.log2(availH / (MAPLIBRE_TILE_SIZE * fy))
  return Math.min(zoomX, zoomY) - margin
}

/** Centro geografico dell'inquadratura: il punto medio in spazio Mercator, non la media delle
 *  latitudini — alle nostre latitudini differiscono di poco, ma la seconda non è il centro dello
 *  schermo e su percorsi molto estesi in verticale lo scarto si vede. */
export function centerOfBounds(bounds: LatLonBounds): { lat: number; lon: number } {
  const yMid = (mercatorY(bounds.minLat) + mercatorY(bounds.maxLat)) / 2
  const phi = Math.atan(Math.sinh(Math.PI * (1 - 2 * yMid)))
  return { lat: phi * 180 / Math.PI, lon: (bounds.minLon + bounds.maxLon) / 2 }
}

// ── Etichette che restano dopo lo stacco ───────────────────────────────────────
//
// Quando la Visione finisce, le sei cose annotate non spariscono: restano lì, piantate nel mondo
// 3D come cartelli veri, e la telecamera del volo le incontra o le supera come farebbe con
// qualunque altro elemento della mappa — non è più un pannello sopra lo schermo, è diventata la
// mappa stessa. Chi lo chiede da qui è components/RouteMap3D.tsx a ogni fotogramma del volo
// principale; qui si decide solo la geometria: dove sta un cartello nel mondo, e dove finisce sullo
// schermo dato lo stato della telecamera in quel fotogramma.

/**
 * Quanto deve essere lungo, a schermo, il filo che regge un cartello: l'altezza "standard" chiesta,
 * espressa dove conta davvero, cioè nell'inquadratura.
 *
 * Non è un capriccio di unità di misura. Un'altezza fissa in metri sembra la scelta ovvia — è un
 * oggetto 3D, gli oggetti 3D hanno un'altezza — ma il filo che ne risulta è lungo sullo schermo in
 * proporzione allo zoom, e lo zoom qui cambia di parecchio: gli stessi 46 m che a zoom 16 fanno un
 * palo di 50 px, a zoom 11 ne fanno 1,6 e il cartello sembra appoggiato per terra. Il cartello
 * resta un oggetto del mondo (lo proietta la matrice vera, gli passa davanti e dietro il rilievo
 * come a qualunque altro), ma l'altezza a cui lo si pianta si sceglie guardando l'inquadratura.
 */
const MARKER_LIFT_TARGET_PX = 58
/** Estremi fisici entro cui la quota resta plausibile: sotto, il filo si accartoccia sul punto;
 *  sopra, il cartello si stacca visibilmente dal luogo che sta indicando. */
const MARKER_MIN_HEIGHT_M = 35
const MARKER_MAX_HEIGHT_M = 420

const EARTH_CIRCUMFERENCE_M = 2 * Math.PI * 6378137

/** Pixel di schermo per metro di quota, alla latitudine e allo zoom correnti. Stessa formula di
 *  MapLibre (`mercatorZfromAltitude(1, lat) * worldSize`), ricavata invece che letta da un campo
 *  privato del transform. */
export function pixelsPerMeterAt(lat: number, worldSize: number): number {
  return worldSize / (EARTH_CIRCUMFERENCE_M * Math.cos(lat * Math.PI / 180))
}

/**
 * A che quota piantare il cartello di un punto che sta a `groundElevM` sul livello del mare, perché
 * il suo filo misuri all'incirca MARKER_LIFT_TARGET_PX nell'inquadratura corrente.
 *
 * Torna una quota ASSOLUTA (sul livello del mare), pronta per projectWorldMarker.
 */
export function visionMarkerAltitudeM(groundElevM: number, lat: number, worldSize: number, liftPx = MARKER_LIFT_TARGET_PX): number {
  const ppm = pixelsPerMeterAt(lat, worldSize)
  const wanted = ppm > 1e-9 ? liftPx / ppm : MARKER_MIN_HEIGHT_M
  return groundElevM + Math.min(MARKER_MAX_HEIGHT_M, Math.max(MARKER_MIN_HEIGHT_M, wanted))
}

function mercatorX(lon: number): number { return (180 + lon) / 360 }

/**
 * Proietta un punto SOSPESO nel mondo (lat, lon, quota sul livello del mare) in pixel CSS del
 * fotogramma, usando la matrice vista-proiezione della mappa (`transform.modelViewProjectionMatrix`
 * di MapLibre — colonne, non righe, come ogni matrice WebGL/glMatrix).
 *
 * `map.project()` non basta: sa proiettare solo un punto SUL terreno. Qui il punto sta a una quota
 * fissa SOPRA il terreno — vedi VISION_MARKER_HEIGHT_M — e serve la proiezione prospettica vera
 * perché il cartello si muova sullo schermo come un oggetto 3D reale quando la telecamera gira o
 * si avvicina, non come un'etichetta incollata al display.
 *
 * ATTENZIONE alle unità di ingresso, che non sono quelle che il nome "mercator" farebbe supporre e
 * sono costate la prima versione di questa funzione (i cartelli non comparivano mai). La matrice
 * di MapLibre — vedi `_calcMatrices` in mercator_transform — si costruisce così:
 *
 *     translate(m, [-x, -y, 0])      con x,y = mercatore × worldSize   → PIXEL DI MONDO
 *     scale(m, [1, 1, pixelPerMeter])                                  → z in METRI
 *     translate(m, [0, 0, -elevation])
 *
 * quindi vuole x,y in pixel di mondo (mercatore normalizzato MOLTIPLICATO per `worldSize`, che a
 * zoom 14 vale già ~8,4 milioni) e z in metri sul livello del mare, non in unità mercatore. Passare
 * il mercatore normalizzato — l'errore della prima versione — collassava ogni cartello vicino
 * all'origine del mondo, cioè dietro la telecamera: `w` usciva negativo e la funzione tornava
 * `null` per tutti, sempre. Da qui il parametro `worldSize`, che il chiamante legge da
 * `transform.worldSize`.
 *
 * Torna null quando il punto è dietro la telecamera (w ≤ 0): oltre quel limite la divisione
 * prospettica specchierebbe le coordinate, facendo comparire un fantasma del cartello dalla parte
 * opposta del fotogramma — capita normalmente quando il volo supera un cartello incontrato prima.
 */
export function projectWorldMarker(
  matrix: ArrayLike<number>,
  lat: number, lon: number, altitudeM: number,
  viewport: { width: number; height: number; worldSize: number },
): { x: number; y: number } | null {
  const x = mercatorX(lon) * viewport.worldSize
  const y = mercatorY(lat) * viewport.worldSize
  const z = altitudeM
  const m = matrix
  const cx = m[0] * x + m[4] * y + m[8] * z + m[12]
  const cy = m[1] * x + m[5] * y + m[9] * z + m[13]
  const cw = m[3] * x + m[7] * y + m[11] * z + m[15]
  if (!Number.isFinite(cw) || cw <= 1e-9) return null
  return {
    x: (cx / cw * 0.5 + 0.5) * viewport.width,
    y: (1 - (cy / cw * 0.5 + 0.5)) * viewport.height,
  }
}

/**
 * Quanto far svanire un cartello vicino al bordo del fotogramma, 0-1: pieno oltre `margin` px dal
 * bordo, sfumato a zero esattamente sul bordo.
 *
 * Senza questa sfumatura un cartello entrerebbe ed uscirebbe dall'inquadratura di scatto — un
 * comportamento da HUD, non da oggetto della scena. Un vero cartello ai margini del campo visivo
 * si perde gradualmente nella periferia, non sparisce di colpo al bordo del fotogramma.
 */
export function visionMarkerEdgeFade(
  x: number, y: number, width: number, height: number, margin: number,
): number {
  if (margin <= 0) return x >= 0 && x <= width && y >= 0 && y <= height ? 1 : 0
  const mx = Math.min(x, width - x) / margin
  const my = Math.min(y, height - y) / margin
  return Math.max(0, Math.min(1, Math.min(mx, my)))
}
