// Immagine statica di un percorso su mappa, per le immagini di condivisione e per i PDF.
//
// Sostituisce i due "cucitori di tile" che il progetto si portava dietro (utils/shareImage/
// tileHelpers.ts e utils/pdfExport/mapTiles.ts: la stessa matematica scritta due volte, con
// costanti e stili divergenti). Quella strada aveva tre limiti insuperabili:
//
//  - risoluzione legata alle tile 256px, quindi ingrandimento bicubico su qualunque canvas grande;
//  - zoom solo a valori interi, con ritagli approssimativi;
//  - fondo cartografico piatto, senza rilievo né sentieri, poco adatto all'escursionismo.
//
// Qui si usa invece MapLibre, che l'app già carica per lo Studio Video e per la navigazione: mappa
// vettoriale nitida a qualunque risoluzione, stile "outdoor" con curve di livello e sentieri, zoom
// continuo. Il pattern (preserveDrawingBuffer + attesa di 'idle' + toDataURL) è quello già in
// produzione in components/RouteMap3D.tsx.
//
// NOTA IMPORTANTE sui marker: i `maplibregl.Marker` sono elementi HTML sovrapposti al canvas, NON
// disegnati dentro di esso, quindi `getCanvas().toDataURL()` non li contiene — è il motivo per cui
// gli screenshot 3D dell'app escono senza i pin. Qui i marker si disegnano dopo, sul canvas 2D di
// composizione, proiettando le coordinate con `map.project()`.

import { MAPTILER_KEY, maptilerStyleUrl, type MapTilerStyleId } from './mapStyles'
import { ROUTE_COLORS, ROUTE_START, ROUTE_END, TERRA, WHITE } from './designTokens'

export type MarkerKind = 'start' | 'end' | 'photo' | 'poi'

export interface RouteMarker {
  lat: number
  lon: number
  kind: MarkerKind
  /** Numero o sigla disegnata dentro al pin (usata da foto e punti di interesse). */
  label?: string
}

export interface RouteMapOptions {
  /** Una o più tracce, ognuna come sequenza [lat, lon]. */
  polylines: [number, number][][]
  /** Dimensioni logiche del risultato, in px CSS. */
  width: number
  height: number
  style?: MapTilerStyleId
  /** Sovracampionamento. 2 = retina. Va tenuto basso su mobile per non esaurire la memoria GPU. */
  pixelRatio?: number
  colors?: readonly string[]
  markers?: RouteMarker[]
  /** Inclinazione della camera. >0 dà profondità, ma richiede `terrain` per avere senso. */
  pitch?: number
  bearing?: number
  /** Rilievo 3D dal DEM MapTiler. Ha effetto solo con `pitch` > 0. */
  terrain?: boolean
  /** Margine attorno alla traccia, in px CSS. */
  padding?: number
  attribution?: boolean
  timeoutMs?: number
}

/** Attesa con tetto massimo: un contesto WebGL che non si stabilizza non deve bloccare tutto.
 *  Stesso accorgimento usato in RouteMap3D per le attese di 'idle'. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>(r => setTimeout(() => r(null), ms))])
}

/** MapLibre è utilizzabile solo con WebGL disponibile e con una chiave MapTiler configurata. */
export function canUseMapLibre(): boolean {
  if (typeof document === 'undefined' || !MAPTILER_KEY) return false
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

function boundsOf(polylines: [number, number][][]): [[number, number], [number, number]] | null {
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity
  for (const line of polylines) {
    for (const [lat, lon] of line) {
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
      if (lon < minLon) minLon = lon
      if (lon > maxLon) maxLon = lon
    }
  }
  if (!Number.isFinite(minLat)) return null
  // Una traccia degenere (un solo punto) darebbe bounds nulli e uno zoom infinito.
  if (maxLat - minLat < 1e-5) { minLat -= 5e-4; maxLat += 5e-4 }
  if (maxLon - minLon < 1e-5) { minLon -= 5e-4; maxLon += 5e-4 }
  return [[minLon, minLat], [maxLon, maxLat]]
}

const MARKER_FILL: Record<MarkerKind, string> = {
  start: ROUTE_START,
  end:   ROUTE_END,
  photo: TERRA[400],
  poi:   TERRA[600],
}

function drawMarker(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, r: number,
  kind: MarkerKind, label: string | undefined,
  fontFamily: string,
) {
  ctx.save()
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = MARKER_FILL[kind]
  ctx.fill()
  ctx.lineWidth = Math.max(1.5, r * 0.32)
  ctx.strokeStyle = WHITE
  ctx.stroke()

  if (label) {
    ctx.fillStyle = WHITE
    ctx.font = `600 ${Math.round(r * 1.1)}px ${fontFamily}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, x, y + r * 0.05)
  }
  ctx.restore()
}

function drawAttribution(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number, fontFamily: string) {
  const text = '© MapTiler © OpenStreetMap contributors'
  const pad = 5 * dpr
  ctx.save()
  ctx.font = `${Math.round(10 * dpr)}px ${fontFamily}`
  ctx.textAlign = 'right'
  ctx.textBaseline = 'bottom'
  const tw = ctx.measureText(text).width
  ctx.fillStyle = 'rgba(255,255,255,0.72)'
  ctx.fillRect(w - tw - pad * 2, h - 15 * dpr - pad, tw + pad * 2, 15 * dpr + pad)
  ctx.fillStyle = 'rgba(0,0,0,0.65)'
  ctx.fillText(text, w - pad, h - pad * 0.6)
  ctx.restore()
}

/**
 * Cattura la mappa con MapLibre. Solleva un errore se WebGL o la chiave MapTiler non ci sono,
 * oppure se la mappa non arriva a uno stato stabile entro il tempo massimo.
 *
 * Preferire `renderRouteMap`, che incapsula il ripiego.
 */
export async function captureRouteMap(opts: RouteMapOptions): Promise<string> {
  if (!canUseMapLibre()) throw new Error('MapLibre non disponibile (WebGL assente o MAPTILER_KEY non configurata)')

  const bounds = boundsOf(opts.polylines)
  if (!bounds) throw new Error('Traccia vuota')

  const {
    width, height,
    style = 'outdoor',
    pixelRatio = 2,
    colors = ROUTE_COLORS,
    markers = [],
    pitch = 0,
    bearing = 0,
    terrain = false,
    padding = Math.round(Math.min(width, height) * 0.1),
    attribution = true,
    timeoutMs = 12_000,
  } = opts

  const maplibregl = (await import('maplibre-gl')).default

  const container = document.createElement('div')
  container.style.cssText =
    `position:fixed;left:-10000px;top:0;width:${width}px;height:${height}px;pointer-events:none`
  document.body.appendChild(container)

  let map: import('maplibre-gl').Map | null = null
  try {
    map = new maplibregl.Map({
      container,
      style: maptilerStyleUrl(style),
      // Indispensabile: senza, il buffer viene azzerato dopo ogni frame e toDataURL torna vuoto.
      // In maplibre-gl 5 questa opzione vive dentro `canvasContextAttributes`: passata al livello
      // superiore, come si faceva nella versione 2, viene ignorata in silenzio.
      canvasContextAttributes: { preserveDrawingBuffer: true },
      pixelRatio,
      interactive: false,
      attributionControl: false,
      fadeDuration: 0, // niente dissolvenze delle etichette: la cattura deve trovare tutto a regime
      pitch,
      bearing,
      center: [(bounds[0][0] + bounds[1][0]) / 2, (bounds[0][1] + bounds[1][1]) / 2],
      zoom: 11,
    })
    const m = map

    const loaded = await withTimeout(new Promise<void>(r => m.once('load', () => r())), timeoutMs)
    if (loaded === null) throw new Error('Stile della mappa non caricato entro il tempo massimo')

    if (terrain && pitch > 0) {
      m.addSource('dem', {
        type: 'raster-dem',
        url: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${MAPTILER_KEY}`,
        tileSize: 512,
      })
      m.setTerrain({ source: 'dem', exaggeration: 1.2 })
    }

    // Le tracce, dalla prima all'ultima. Alone bianco sotto e linea colorata sopra: è lo stesso
    // trattamento "alone + linea" usato nell'app, e serve a tenere il tracciato leggibile sia sul
    // verde dei boschi sia sul grigio della roccia.
    opts.polylines.forEach((line, i) => {
      if (line.length < 2) return
      const id = `route-${i}`
      m.addSource(id, {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: line.map(([lat, lon]) => [lon, lat]) },
        },
      })
      m.addLayer({
        id: `${id}-casing`, type: 'line', source: id,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': WHITE, 'line-width': 8, 'line-opacity': 0.75 },
      })
      m.addLayer({
        id: `${id}-line`, type: 'line', source: id,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': colors[i % colors.length], 'line-width': 4.5 },
      })
    })

    m.fitBounds(bounds, { padding, animate: false, pitch, bearing })

    // 'idle' = niente più da caricare e niente più da disegnare. È il solo momento in cui il
    // buffer contiene davvero la mappa completa invece di un fotogramma a metà caricamento.
    await withTimeout(new Promise<void>(r => m.once('idle', () => r())), timeoutMs)

    const glCanvas = m.getCanvas()
    const out = document.createElement('canvas')
    out.width = Math.round(width * pixelRatio)
    out.height = Math.round(height * pixelRatio)
    const ctx = out.getContext('2d')!
    ctx.drawImage(glCanvas, 0, 0, out.width, out.height)

    // Marker e attribuzione sopra la mappa, in coordinate proiettate.
    const fontFamily = 'system-ui, -apple-system, "Segoe UI", sans-serif'
    const r = Math.max(6, Math.round(Math.min(out.width, out.height) * 0.014))
    for (const mk of markers) {
      const p = m.project([mk.lon, mk.lat])
      drawMarker(ctx, p.x * pixelRatio, p.y * pixelRatio, r, mk.kind, mk.label, fontFamily)
    }
    if (attribution) drawAttribution(ctx, out.width, out.height, pixelRatio, fontFamily)

    return out.toDataURL('image/png')
  } finally {
    try { map?.remove() } catch { /* il contesto può essere già perso */ }
    container.remove()
  }
}

/**
 * Punto d'ingresso da usare nei chiamanti: prova MapLibre e, se non è praticabile, ripiega sul
 * disegno delle tile raster.
 *
 * Il ripiego serve davvero: WebGL può mancare (browser vecchi, GPU in blocklist, macchine
 * virtuali), la chiave MapTiler può non essere configurata in un ambiente, e il contesto può
 * andare perso sotto pressione di memoria su mobile. In tutti quei casi è meglio una mappa
 * meno bella che nessuna mappa.
 */
export async function renderRouteMap(opts: RouteMapOptions): Promise<string> {
  try {
    return await captureRouteMap(opts)
  } catch (err) {
    console.warn('[mapSnapshot] MapLibre non utilizzabile, ripiego sulle tile raster:', err)
    return renderRouteMapFromTiles(opts)
  }
}

/** Ripiego: tile raster attraverso il proxy `/api/tile`, con il disegno traccia già in uso per le
 *  immagini di condivisione. */
async function renderRouteMapFromTiles(opts: RouteMapOptions): Promise<string> {
  const { drawTiledMap, drawRouteOnTiles } = await import('@/utils/shareImage/tileHelpers')
  const { width, height, pixelRatio = 2, colors = ROUTE_COLORS } = opts

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * pixelRatio)
  canvas.height = Math.round(height * pixelRatio)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = WHITE
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const usable = opts.polylines.filter(l => l.length > 1)
  if (usable.length === 0) return canvas.toDataURL('image/png')

  const tileCtx = await drawTiledMap(ctx, usable, 0, 0, canvas.width, canvas.height, {
    style: 'voyager',
    fillCanvas: true,
    retina: pixelRatio > 1,
  })
  usable.forEach((line, i) => {
    drawRouteOnTiles(ctx, line, tileCtx.pixelOf, colors[i % colors.length], 5 * pixelRatio)
  })

  const fontFamily = 'system-ui, -apple-system, "Segoe UI", sans-serif'
  const r = Math.max(6, Math.round(Math.min(canvas.width, canvas.height) * 0.014))
  for (const mk of opts.markers ?? []) {
    const [x, y] = tileCtx.pixelOf(mk.lat, mk.lon)
    drawMarker(ctx, x, y, r, mk.kind, mk.label, fontFamily)
  }
  if (opts.attribution !== false) {
    drawAttributionOsm(ctx, canvas.width, canvas.height, pixelRatio, fontFamily)
  }

  return canvas.toDataURL('image/png')
}

/** Il ripiego usa CARTO/OSM, non MapTiler: l'attribuzione deve dire il vero. */
function drawAttributionOsm(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number, fontFamily: string) {
  const text = '© OpenStreetMap contributors © CARTO'
  const pad = 5 * dpr
  ctx.save()
  ctx.font = `${Math.round(10 * dpr)}px ${fontFamily}`
  ctx.textAlign = 'right'
  ctx.textBaseline = 'bottom'
  const tw = ctx.measureText(text).width
  ctx.fillStyle = 'rgba(255,255,255,0.72)'
  ctx.fillRect(w - tw - pad * 2, h - 15 * dpr - pad, tw + pad * 2, 15 * dpr + pad)
  ctx.fillStyle = 'rgba(0,0,0,0.65)'
  ctx.fillText(text, w - pad, h - pad * 0.6)
  ctx.restore()
}
