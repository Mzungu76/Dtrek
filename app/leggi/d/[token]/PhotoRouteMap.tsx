// Seconda mappa, separata da RouteMap.tsx — dove sono state scattate le foto, non il percorso o i
// POI. Stesso principio della sezione "Foto sulla mappa" dell'app (app/components/RoutePhotoMap.tsx,
// usata da components/resoconto/PhotoMapSection.tsx): lì è una mappa Leaflet a sé, distinta dalla
// mappa di "Andamento" — qui, senza interattività, lo stesso: un'unica mappa con percorso + POI +
// foto sarebbe troppo affollata da leggere a colpo d'occhio su un telefono, così come nell'app le
// due cose vivono in due mappe separate invece che sovrapposte.
//
// Ogni foto è un vero ritaglio circolare della foto stessa (non un pallino anonimo, tecnica identica
// ai marker sul grafico altimetrico privato — components/diario/ProgressChart.tsx): il riferimento
// che mancava è proprio questo, la foto stessa è già la sua didascalia.
const TILE = 256
const VIEW_W = 560
const MIN_H = 200
const MAX_H = 360
const PAD = 32
const MAX_ZOOM = 17

const lon2tx = (lon: number, z: number) => ((lon + 180) / 360) * 2 ** z
const lat2ty = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z
}

export interface PhotoRouteMapPhoto {
  url:      string
  /** Posizione lungo il percorso (0–1) — mai una coordinata propria: la pagina pubblica non riceve
   *  l'EXIF della foto, solo la sua distanza percorsa (lib/sharePublicDiary.ts). */
  progress: number
}

export function PhotoRouteMap({ polyline, photos, idPrefix }: {
  polyline: [number, number][]
  photos:   PhotoRouteMapPhoto[]
  /** Namespace per gli id dei clipPath SVG: un Diario mette una mappa per escursione sulla stessa
   *  pagina, id ripetuti fra istanze diverse farebbero scegliere al browser il ritaglio sbagliato
   *  (stesso problema, stessa causa, di components/diario/ProgressChart.tsx). Un prop invece di
   *  `useId()` perché questo resta un componente server, senza runtime client da spedire. */
  idPrefix: string
}) {
  const dotsRaw = photos.filter(p => p.progress >= 0 && p.progress <= 1)
  if (polyline.length < 2 || dotsRaw.length === 0) return null

  const lats = polyline.map(p => p[0])
  const lons = polyline.map(p => p[1])
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLon = Math.min(...lons), maxLon = Math.max(...lons)

  const mercSpanX = lon2tx(maxLon, 0) - lon2tx(minLon, 0)
  const mercSpanY = lat2ty(minLat, 0) - lat2ty(maxLat, 0)
  const trackAspect = mercSpanX / Math.max(mercSpanY, 1e-12)
  const VIEW_H = Math.round(Math.min(MAX_H, Math.max(MIN_H, VIEW_W / Math.max(trackAspect, 0.1))))

  let zoom = 1
  for (let z = MAX_ZOOM; z >= 1; z--) {
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

  const pts = polyline.map(([lat, lon]): [number, number] => [
    lon2tx(lon, zoom) * TILE - originX,
    lat2ty(lat, zoom) * TILE - originY,
  ])
  const d = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')

  const dots = dotsRaw.map(p => {
    const [x, y] = pts[Math.min(pts.length - 1, Math.round(p.progress * (pts.length - 1)))]
    return { ...p, x, y }
  })

  const R = 14

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

      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} role="img" aria-label="Foto lungo il percorso"
        className="absolute inset-0 w-full h-full">
        {/* Il percorso resta come riferimento, ma sottotono: qui il soggetto sono le foto. */}
        <path d={d} fill="none" stroke="#ffffff" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
        <path d={d} fill="none" stroke="#9ca3af" strokeWidth={2} strokeLinecap="round" strokeDasharray="1,5" />

        <defs>
          {dots.map((p, i) => (
            <clipPath key={i} id={`${idPrefix}-photomap-${i}`}>
              <circle cx={p.x} cy={p.y} r={R - 1.5} />
            </clipPath>
          ))}
        </defs>
        {dots.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={R} fill="#fff" />
            <image href={p.url} x={p.x - (R - 1.5)} y={p.y - (R - 1.5)} width={(R - 1.5) * 2} height={(R - 1.5) * 2}
              clipPath={`url(#${idPrefix}-photomap-${i})`} preserveAspectRatio="xMidYMid slice" />
            <circle cx={p.x} cy={p.y} r={R - 1.5} fill="none" stroke="#e08d3c" strokeWidth={2} />
          </g>
        ))}
      </svg>

      <figcaption className="absolute bottom-0 right-0 bg-white/75 text-stone-500 text-[9px] leading-none px-1.5 py-1 rounded-tl">
        © OpenStreetMap contributors
      </figcaption>
    </figure>
  )
}
