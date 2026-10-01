// Mappa di TUTTI i percorsi del Diario, per il sito pubblico — stesso principio del privato
// DiarioMappa (components/diario/DiarioMappa.tsx: un'unica mappa d'insieme con una traccia per
// colore), ma sul mosaico di tile statiche + SVG di RouteMap.tsx invece di Leaflet: quel file
// spiega perché una mappa interattiva non ha senso qui (niente JS, niente istanze vive per una
// pagina scorrevole aperta da telefono) — vale ancora di più per una mappa che dovrebbe ospitare
// tutte le tracce di un Diario invece di una sola.

import { ROUTE_COLORS } from '@/lib/designTokens'

const TILE = 256
const VIEW_W = 660
const MIN_H = 280
const MAX_H = 460
const PAD = 28
const MAX_ZOOM = 15

const lon2tx = (lon: number, z: number) => ((lon + 180) / 360) * 2 ** z
const lat2ty = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z
}

export interface AtlasRoute {
  id:       string
  title:    string
  polyline: [number, number][]
}

/** Un luogo visitato senza traccia (Sito o Borgo/Città): un pin, non una linea. */
export interface AtlasPoint {
  id:    string
  title: string
  lat:   number
  lon:   number
}

/** Colore dei pin dei luoghi — lo stesso ambra dei riquadri "Dove si trova" (components/LocatorMap.tsx). */
const POINT_COLOR = '#c05a17'
/** Senza tracce (solo pin) un'inquadratura a zoom 15 non direbbe dove si è: tetto più largo. */
const MAX_ZOOM_POINTS_ONLY = 10

export function AllRoutesMap({ routes, points = [] }: { routes: AtlasRoute[]; points?: AtlasPoint[] }) {
  const withTrack = routes.filter(r => r.polyline.length > 1)
  if (withTrack.length === 0 && points.length === 0) return null

  const allPoints: [number, number][] = [...withTrack.flatMap(r => r.polyline), ...points.map(p => [p.lat, p.lon] as [number, number])]
  const lats = allPoints.map(p => p[0])
  const lons = allPoints.map(p => p[1])
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLon = Math.min(...lons), maxLon = Math.max(...lons)

  const mercSpanX = lon2tx(maxLon, 0) - lon2tx(minLon, 0)
  const mercSpanY = lat2ty(minLat, 0) - lat2ty(maxLat, 0)
  const trackAspect = mercSpanX / Math.max(mercSpanY, 1e-12)
  const VIEW_H = Math.round(Math.min(MAX_H, Math.max(MIN_H, VIEW_W / Math.max(trackAspect, 0.1))))

  let zoom = 1
  for (let z = withTrack.length === 0 ? MAX_ZOOM_POINTS_ONLY : MAX_ZOOM; z >= 1; z--) {
    const wPx = (lon2tx(maxLon, z) - lon2tx(minLon, z)) * TILE
    const hPx = (lat2ty(minLat, z) - lat2ty(maxLat, z)) * TILE
    if (wPx <= VIEW_W - 2 * PAD && hPx <= VIEW_H - 2 * PAD) { zoom = z; break }
  }

  const centerX = ((lon2tx(minLon, zoom) + lon2tx(maxLon, zoom)) / 2) * TILE
  const centerY = ((lat2ty(minLat, zoom) + lat2ty(maxLat, zoom)) / 2) * TILE
  const originX = centerX - VIEW_W / 2
  const originY = centerY - VIEW_H / 2

  const tx0 = Math.floor(originX / TILE), tx1 = Math.floor((originX + VIEW_W) / TILE)
  const ty0 = Math.floor(originY / TILE), ty1 = Math.floor((originY + VIEW_H) / TILE)
  const maxIndex = 2 ** zoom - 1

  const tiles: { key: string; x: number; y: number; left: number; top: number }[] = []
  for (let tx = tx0; tx <= tx1; tx++) {
    for (let ty = ty0; ty <= ty1; ty++) {
      if (ty < 0 || ty > maxIndex) continue
      const wrappedX = ((tx % (maxIndex + 1)) + maxIndex + 1) % (maxIndex + 1)
      tiles.push({ key: `${tx}_${ty}`, x: wrappedX, y: ty, left: tx * TILE - originX, top: ty * TILE - originY })
    }
  }

  const project = (lat: number, lon: number): [number, number] =>
    [lon2tx(lon, zoom) * TILE - originX, lat2ty(lat, zoom) * TILE - originY]

  return (
    <figure className="relative w-full overflow-hidden rounded-2xl border border-stone-200 bg-stone-100"
      style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }}>
      {tiles.map(t => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={t.key} src={`/api/tile?z=${zoom}&x=${t.x}&y=${t.y}&style=light`} alt=""
          loading="lazy" decoding="async" aria-hidden="true"
          style={{
            position: 'absolute',
            left:   `${(t.left / VIEW_W) * 100}%`,
            top:    `${(t.top  / VIEW_H) * 100}%`,
            width:  `${(TILE / VIEW_W) * 100}%`,
            height: `${(TILE / VIEW_H) * 100}%`,
          }} />
      ))}

      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} role="img" aria-label="Mappa di tutti i percorsi"
        className="absolute inset-0 w-full h-full">
        {withTrack.map((r, i) => {
          const d = r.polyline.map((([lat, lon], pi) => {
            const [x, y] = project(lat, lon)
            return `${pi === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
          })).join(' ')
          const color = ROUTE_COLORS[i % ROUTE_COLORS.length]
          return (
            <g key={r.id}>
              <path d={d} fill="none" stroke="#ffffff" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
              <path d={d} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
            </g>
          )
        })}
        {points.map(pt => {
          const [x, y] = project(pt.lat, pt.lon)
          return (
            <g key={pt.id}>
              <circle cx={x} cy={y} r={9} fill={POINT_COLOR} opacity={0.2} />
              <circle cx={x} cy={y} r={4.5} fill={POINT_COLOR} stroke="#ffffff" strokeWidth={1.8} />
            </g>
          )
        })}
      </svg>

      <figcaption className="absolute bottom-0 right-0 bg-white/75 text-stone-500 text-[9px] leading-none px-1.5 py-1 rounded-tl">
        © OpenStreetMap contributors
      </figcaption>
    </figure>
  )
}

/** Legenda colori sotto la mappa — stesso limite di 8 voci del privato DiarioMappa: oltre
 *  diventerebbe un muro di etichette illeggibile sotto una mappa che le ha già rese come colore. */
export function AllRoutesLegend({ routes, points = [] }: { routes: AtlasRoute[]; points?: AtlasPoint[] }) {
  const withTrack = routes.filter(r => r.polyline.length > 1)
  if (withTrack.length === 0 && points.length === 0) return null
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
      {withTrack.slice(0, 8).map((r, i) => (
        <div key={r.id} className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-[3px] rounded-full shrink-0" style={{ background: ROUTE_COLORS[i % ROUTE_COLORS.length] }} />
          <span className="text-[10px] text-stone-500 truncate max-w-[140px]">{r.title || 'Percorso'}</span>
        </div>
      ))}
      {points.slice(0, Math.max(0, 8 - withTrack.length)).map(pt => (
        <div key={pt.id} className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: POINT_COLOR }} />
          <span className="text-[10px] text-stone-500 truncate max-w-[140px]">{pt.title || 'Luogo'}</span>
        </div>
      ))}
    </div>
  )
}
