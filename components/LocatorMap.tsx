// Mappa d'insieme: dove cade il percorso dentro l'Italia — e, con `detail`, dov'è nella sua zona.
//
// La mappa del percorso è zoomata al punto che il contesto sparisce: chi legge vede una traccia
// fra due boschi e non sa se è in Piemonte o in Puglia. Questa, affiancata, risponde a quella
// domanda con un colpo d'occhio — un riquadro dell'Italia intera con un segno dove si è camminato.
// L'Italia intera però è a ~5 km per pixel: dice la regione, non il posto. Il secondo riquadro
// (`detail`) è un ingrandimento regionale (~0,9 km per pixel, ~180 × 235 km) centrato sullo stesso
// punto, con le località leggibili; sull'Italia un rettangolino mostra quale zona è ingrandita.
//
// Stessa tecnica di RouteMap: mosaico di tile dal proxy `/api/tile` con un segno in SVG sopra.
// Nessun JavaScript, tile pigre. Lo stile è `positron`, il fondo quasi senza colore: a questa scala
// servono solo le coste e i confini, e il pallino deve essere l'unica cosa satura del riquadro.

const TILE = 256
const VIEW_W = 200
const VIEW_H = 260

/** Zoom del riquadro regionale: a z7 il riquadro copre ~180 × 235 km alle latitudini italiane. */
const DETAIL_ZOOM = 7

/** Riquadro geografico dell'Italia, isole comprese, con un margine. */
const ITALY = { minLat: 35.3, maxLat: 47.3, minLon: 6.2, maxLon: 18.8 }

const lon2tx = (lon: number, z: number) => ((lon + 180) / 360) * 2 ** z
const lat2ty = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z
}

interface Layout {
  zoom: number
  scale: number
  tiles: { key: string; x: number; y: number; left: number; top: number }[]
  /** Posizione del punto nel riquadro (px di disegno, 0..VIEW_W/VIEW_H). */
  px: number
  py: number
  inside: boolean
}

/** Mosaico di tile per un riquadro VIEW_W × VIEW_H centrato su (centerX, centerY) — coordinate in
 *  pixel-tile allo zoom dato — con le tile ridimensionate di `scale`. */
function layoutFor(zoom: number, scale: number, centerX: number, centerY: number, lat: number, lon: number): Layout {
  const viewW = VIEW_W / scale
  const viewH = VIEW_H / scale
  const originX = centerX - viewW / 2
  const originY = centerY - viewH / 2

  const tx0 = Math.floor(originX / TILE), tx1 = Math.floor((originX + viewW) / TILE)
  const ty0 = Math.floor(originY / TILE), ty1 = Math.floor((originY + viewH) / TILE)
  const maxIndex = 2 ** zoom - 1

  const tiles: Layout['tiles'] = []
  for (let tx = tx0; tx <= tx1; tx++) {
    for (let ty = ty0; ty <= ty1; ty++) {
      if (ty < 0 || ty > maxIndex) continue
      tiles.push({
        key: `${tx}_${ty}`,
        x: ((tx % (maxIndex + 1)) + maxIndex + 1) % (maxIndex + 1),
        y: ty,
        left: (tx * TILE - originX) * scale,
        top:  (ty * TILE - originY) * scale,
      })
    }
  }

  const px = (lon2tx(lon, zoom) * TILE - originX) * scale
  const py = (lat2ty(lat, zoom) * TILE - originY) * scale
  // Un punto fuori dal riquadro (un'escursione all'estero) verrebbe disegnato sul bordo dando
  // un'informazione falsa: meglio non disegnare nulla che indicare il posto sbagliato.
  const inside = px >= 0 && px <= VIEW_W && py >= 0 && py <= VIEW_H
  return { zoom, scale, tiles, px, py, inside }
}

function italyLayout(lat: number, lon: number) {
  // Zoom più stretto in cui l'Italia intera entra nel riquadro. Fisso per costruzione, non
  // dipendente dal percorso: due escursioni diverse devono dare due riquadri confrontabili, ed è
  // proprio il confronto il motivo per cui questa mappa esiste.
  let fitZoom = 1
  for (let z = 10; z >= 1; z--) {
    const w = (lon2tx(ITALY.maxLon, z) - lon2tx(ITALY.minLon, z)) * TILE
    const h = (lat2ty(ITALY.minLat, z) - lat2ty(ITALY.maxLat, z)) * TILE
    if (w <= VIEW_W && h <= VIEW_H) { fitZoom = z; break }
  }
  // L'Italia a quello zoom occupa solo ~70% del riquadro (le tile hanno zoom interi): si usa lo zoom
  // successivo, ridotto a misura di riquadro. Stesso riquadro, ma ~1,4 volte più nitido.
  const zoom = fitZoom + 1
  const spanW = (lon2tx(ITALY.maxLon, zoom) - lon2tx(ITALY.minLon, zoom)) * TILE
  const spanH = (lat2ty(ITALY.minLat, zoom) - lat2ty(ITALY.maxLat, zoom)) * TILE
  const scale = Math.min(VIEW_W / spanW, VIEW_H / spanH)
  const centerX = ((lon2tx(ITALY.minLon, zoom) + lon2tx(ITALY.maxLon, zoom)) / 2) * TILE
  const centerY = ((lat2ty(ITALY.minLat, zoom) + lat2ty(ITALY.maxLat, zoom)) / 2) * TILE
  return layoutFor(zoom, scale, centerX, centerY, lat, lon)
}

function detailLayout(lat: number, lon: number) {
  // Centrato sul punto: lì il pallino sta sempre in mezzo, e il contesto (strade, centri, coste)
  // attorno dice dov'è con ~900 m di risoluzione.
  return layoutFor(DETAIL_ZOOM, 1, lon2tx(lon, DETAIL_ZOOM) * TILE, lat2ty(lat, DETAIL_ZOOM) * TILE, lat, lon)
}

function Tiles({ layout, eager }: { layout: Layout; eager: boolean }) {
  return (
    <>
      {layout.tiles.map(t => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={t.key} src={`/api/tile?z=${layout.zoom}&x=${t.x}&y=${t.y}&style=positron`} alt=""
          loading={eager ? 'eager' : 'lazy'} decoding="async" aria-hidden="true"
          style={{
            position: 'absolute',
            left:   `${(t.left / VIEW_W) * 100}%`,
            top:    `${(t.top  / VIEW_H) * 100}%`,
            width:  `${((TILE * layout.scale) / VIEW_W) * 100}%`,
            height: `${((TILE * layout.scale) / VIEW_H) * 100}%`,
          }} />
      ))}
    </>
  )
}

const figureClass = 'relative overflow-hidden rounded-2xl border border-stone-200 bg-stone-100'
const captionClass = 'absolute bottom-0 left-0 right-0 bg-white/80 text-stone-500 text-[9px] leading-none px-1.5 py-1 text-center'

export function LocatorMap({ lat, lon, label, eager = false, caption = 'Dove si cammina', detail = false }: {
  lat: number; lon: number; label?: string
  /** `true` nel Diario: la cattura per il PDF avviene fuori schermo, e un'immagine `lazy` che non
   *  entra mai nel viewport non comincia nemmeno a caricarsi — la mappa uscirebbe vuota. */
  eager?: boolean
  /** Didascalia in basso: "Dove si cammina" per un percorso, "Dove si trova" per un luogo. */
  caption?: string
  /** Aggiunge, affiancato, l'ingrandimento regionale dello stesso punto. Il chiamante deve dare al
   *  contenitore una larghezza adatta a due riquadri. */
  detail?: boolean
}) {
  const italy = italyLayout(lat, lon)
  const region = detail ? detailLayout(lat, lon) : null
  const ariaItaly = label ? `Posizione di ${label} in Italia` : 'Posizione del percorso in Italia'

  // Rettangolino sull'Italia: la zona mostrata dal riquadro regionale (VIEW_W × VIEW_H allo zoom
  // regionale, riportati allo zoom e alla scala del riquadro nazionale).
  const factor = (2 ** (italy.zoom - DETAIL_ZOOM)) * italy.scale
  const boxW = VIEW_W * factor
  const boxH = VIEW_H * factor

  const italyFigure = (
    <figure className={figureClass} style={{ width: '100%', aspectRatio: `${VIEW_W} / ${VIEW_H}` }}>
      <Tiles layout={italy} eager={eager} />
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} role="img" aria-label={ariaItaly} className="absolute inset-0 w-full h-full">
        {italy.inside && (
          <>
            {region && (
              <rect x={italy.px - boxW / 2} y={italy.py - boxH / 2} width={boxW} height={boxH}
                fill="none" stroke="#c05a17" strokeWidth={1} opacity={0.7} />
            )}
            {/* Alone disegnato, non animato: deve reggere anche stampato nel PDF. */}
            <circle cx={italy.px} cy={italy.py} r={7}   fill="#e08d3c" opacity={0.22} />
            <circle cx={italy.px} cy={italy.py} r={2.8} fill="#c05a17" stroke="#fff" strokeWidth={1.2} />
          </>
        )}
      </svg>
      <figcaption className={captionClass}>{detail ? 'In Italia' : caption}</figcaption>
    </figure>
  )

  if (!region) return italyFigure

  return (
    <div className="flex items-stretch gap-1.5">
      <div style={{ flex: '1 1 0', minWidth: 0 }}>{italyFigure}</div>
      <div style={{ flex: '1.3 1 0', minWidth: 0 }}>
        <figure className={figureClass} style={{ width: '100%', aspectRatio: `${VIEW_W} / ${VIEW_H}` }}>
          <Tiles layout={region} eager={eager} />
          <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} role="img"
            aria-label={label ? `Zona di ${label}, ingrandimento regionale` : 'Zona del percorso, ingrandimento regionale'}
            className="absolute inset-0 w-full h-full">
            <circle cx={region.px} cy={region.py} r={14} fill="#e08d3c" opacity={0.2} />
            <circle cx={region.px} cy={region.py} r={5}  fill="#c05a17" stroke="#fff" strokeWidth={2} />
          </svg>
          <figcaption className={captionClass}>{caption}</figcaption>
        </figure>
      </div>
    </div>
  )
}
