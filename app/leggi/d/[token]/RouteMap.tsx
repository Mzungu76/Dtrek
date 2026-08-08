// Mappa del percorso per la pagina pubblica del Diario: mosaico di tile OSM con la traccia
// disegnata sopra in SVG.
//
// Perché non Leaflet/MapLibre: questa pagina è un componente server e viene aperta da chi riceve
// un link, spesso da telefono. Montare una mappa interattiva per escursione significherebbe decine
// di istanze vive, un runtime da spedire al browser e centinaia di richieste a `/api/tile` al
// caricamento — per una pagina che si scorre e basta. Qui le tile sono semplici `<img>` con
// `loading="lazy"`: il browser le scarica solo quando l'escursione entra nel viewport, e la
// traccia è un `<path>` sopra. Nessun JavaScript, nessuna istanza da distruggere.
//
// La versione precedente (RouteSketch, ancora usata per le miniature) disegnava la sola traccia su
// fondo grigio: corretta come geometria ma senza contesto geografico — «la mappa OSM non viene
// visualizzata» era una segnalazione giusta, un percorso sospeso nel vuoto non dice dove sei.

const TILE = 256
const VIEW_W = 560
const MIN_H = 240
const MAX_H = 420
const PAD = 22
/** Oltre questo zoom le tile esistono ma il percorso non ci starebbe: è solo il tetto della ricerca. */
const MAX_ZOOM = 17

// ── Web Mercator: coordinate geografiche → coordinate di tile (frazionarie) ────────────────────
const lon2tx = (lon: number, z: number) => ((lon + 180) / 360) * 2 ** z
const lat2ty = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z
}

export function RouteMap({ polyline, photoProgress = [], color = '#1d5e2a' }: {
  polyline: [number, number][]
  photoProgress?: number[]
  color?: string
}) {
  if (polyline.length < 2) return null

  const lats = polyline.map(p => p[0])
  const lons = polyline.map(p => p[1])
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLon = Math.min(...lons), maxLon = Math.max(...lons)

  // L'altezza segue la forma del percorso invece di essere fissa: una traccia verticale in un
  // riquadro panoramico verrebbe schiacciata in una striscia al centro. Il rapporto è calcolato in
  // spazio Mercator (non in gradi), che è quello in cui poi la si disegna.
  const mercSpanX = lon2tx(maxLon, 0) - lon2tx(minLon, 0)
  const mercSpanY = lat2ty(minLat, 0) - lat2ty(maxLat, 0)
  const trackAspect = mercSpanX / Math.max(mercSpanY, 1e-12)
  const VIEW_H = Math.round(Math.min(MAX_H, Math.max(MIN_H, VIEW_W / Math.max(trackAspect, 0.1))))

  // Zoom più stretto in cui il percorso, con il suo margine, entra ancora nel riquadro.
  let zoom = 1
  for (let z = MAX_ZOOM; z >= 1; z--) {
    const wPx = (lon2tx(maxLon, z) - lon2tx(minLon, z)) * TILE
    const hPx = (lat2ty(minLat, z) - lat2ty(maxLat, z)) * TILE
    if (wPx <= VIEW_W - 2 * PAD && hPx <= VIEW_H - 2 * PAD) { zoom = z; break }
  }

  // Origine del riquadro in pixel-mondo, centrata sul percorso.
  const centerX = ((lon2tx(minLon, zoom) + lon2tx(maxLon, zoom)) / 2) * TILE
  const centerY = ((lat2ty(minLat, zoom) + lat2ty(maxLat, zoom)) / 2) * TILE
  const originX = centerX - VIEW_W / 2
  const originY = centerY - VIEW_H / 2

  // Tile che coprono il riquadro. `floor` sull'origine e sul bordo opposto: la copertura parte
  // dalla tile che contiene l'origine e arriva a quella che contiene l'ultimo pixel visibile.
  const tx0 = Math.floor(originX / TILE), tx1 = Math.floor((originX + VIEW_W) / TILE)
  const ty0 = Math.floor(originY / TILE), ty1 = Math.floor((originY + VIEW_H) / TILE)
  const maxIndex = 2 ** zoom - 1

  const tiles: { key: string; x: number; y: number; left: number; top: number }[] = []
  for (let tx = tx0; tx <= tx1; tx++) {
    for (let ty = ty0; ty <= ty1; ty++) {
      // Fuori dal mondo (ai poli, o oltre l'antimeridiano): niente richiesta, resta lo sfondo.
      if (ty < 0 || ty > maxIndex) continue
      const wrappedX = ((tx % (maxIndex + 1)) + maxIndex + 1) % (maxIndex + 1)
      tiles.push({
        key: `${tx}_${ty}`,
        x: wrappedX,
        y: ty,
        left: tx * TILE - originX,
        top:  ty * TILE - originY,
      })
    }
  }

  const pts = polyline.map(([lat, lon]): [number, number] => [
    lon2tx(lon, zoom) * TILE - originX,
    lat2ty(lat, zoom) * TILE - originY,
  ])
  const d = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')

  const [sx, sy] = pts[0]
  const [ex, ey] = pts[pts.length - 1]
  const photoDots = photoProgress
    .filter(p => p >= 0 && p <= 1)
    .map(p => pts[Math.min(pts.length - 1, Math.round(p * (pts.length - 1)))])

  return (
    <figure className="relative w-full overflow-hidden rounded-2xl border border-stone-200 bg-stone-100"
      style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }}>
      {/* Le tile sono posizionate in percentuale del riquadro, così il mosaico scala con la
          larghezza della colonna senza perdere l'allineamento con la traccia SVG sopra. */}
      {tiles.map(t => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={t.key} src={`/api/tile?z=${zoom}&x=${t.x}&y=${t.y}&style=voyager`} alt=""
          loading="lazy" decoding="async" aria-hidden="true"
          style={{
            position: 'absolute',
            left:   `${(t.left / VIEW_W) * 100}%`,
            top:    `${(t.top  / VIEW_H) * 100}%`,
            width:  `${(TILE / VIEW_W) * 100}%`,
            height: `${(TILE / VIEW_H) * 100}%`,
          }} />
      ))}

      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} role="img" aria-label="Mappa del percorso"
        className="absolute inset-0 w-full h-full">
        {/* Alone bianco sotto la traccia: la stacca dal fondo della mappa, che a queste scale è
            pieno di linee e toponimi. Stesso trattamento delle mappe dentro l'app. */}
        <path d={d} fill="none" stroke="#ffffff" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
        <path d={d} fill="none" stroke={color} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />

        {photoDots.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={4} fill="#e08d3c" stroke="#fff" strokeWidth={1.5} />
        ))}
        <circle cx={sx} cy={sy} r={5.5} fill="#22c55e" stroke="#fff" strokeWidth={2} />
        <circle cx={ex} cy={ey} r={5.5} fill="#ef4444" stroke="#fff" strokeWidth={2} />
      </svg>

      {/* Attribuzione: è un requisito di licenza ODbL su un documento pubblicato, non un vezzo. */}
      <figcaption className="absolute bottom-0 right-0 bg-white/75 text-stone-500 text-[9px] leading-none px-1.5 py-1 rounded-tl">
        © OpenStreetMap contributors · © CARTO
      </figcaption>
    </figure>
  )
}
