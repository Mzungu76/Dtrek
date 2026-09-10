// Mappa d'insieme: dove cade il percorso dentro l'Italia.
//
// La mappa del percorso è zoomata al punto che il contesto sparisce: chi legge vede una traccia
// fra due boschi e non sa se è in Piemonte o in Puglia. Questa, affiancata, risponde a quella
// domanda con un colpo d'occhio — un riquadro dell'Italia intera con un segno dove si è camminato.
//
// Stessa tecnica di RouteMap: mosaico di tile dal proxy `/api/tile` con un segno in SVG sopra.
// Nessun JavaScript, tile pigre. Lo stile è `positron`, il fondo quasi senza colore: a questa scala
// servono solo le coste e i confini, e il pallino deve essere l'unica cosa satura del riquadro.

const TILE = 256
const VIEW_W = 200
const VIEW_H = 260

/** Riquadro geografico dell'Italia, isole comprese, con un margine. */
const ITALY = { minLat: 35.3, maxLat: 47.3, minLon: 6.2, maxLon: 18.8 }

const lon2tx = (lon: number, z: number) => ((lon + 180) / 360) * 2 ** z
const lat2ty = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z
}

export function LocatorMap({ lat, lon, label, eager = false }: {
  lat: number; lon: number; label?: string
  /** `true` nel Diario: la cattura per il PDF avviene fuori schermo, e un'immagine `lazy` che non
   *  entra mai nel viewport non comincia nemmeno a caricarsi — la mappa uscirebbe vuota. */
  eager?: boolean
}) {
  // Zoom più stretto in cui l'Italia intera entra nel riquadro. Fisso per costruzione, non
  // dipendente dal percorso: due escursioni diverse devono dare due riquadri confrontabili, ed è
  // proprio il confronto il motivo per cui questa mappa esiste.
  let zoom = 1
  for (let z = 10; z >= 1; z--) {
    const w = (lon2tx(ITALY.maxLon, z) - lon2tx(ITALY.minLon, z)) * TILE
    const h = (lat2ty(ITALY.minLat, z) - lat2ty(ITALY.maxLat, z)) * TILE
    if (w <= VIEW_W && h <= VIEW_H) { zoom = z; break }
  }

  const centerX = ((lon2tx(ITALY.minLon, zoom) + lon2tx(ITALY.maxLon, zoom)) / 2) * TILE
  const centerY = ((lat2ty(ITALY.minLat, zoom) + lat2ty(ITALY.maxLat, zoom)) / 2) * TILE
  const originX = centerX - VIEW_W / 2
  const originY = centerY - VIEW_H / 2

  const tx0 = Math.floor(originX / TILE), tx1 = Math.floor((originX + VIEW_W) / TILE)
  const ty0 = Math.floor(originY / TILE), ty1 = Math.floor((originY + VIEW_H) / TILE)
  const maxIndex = 2 ** zoom - 1

  const tiles: { key: string; x: number; y: number; left: number; top: number }[] = []
  for (let tx = tx0; tx <= tx1; tx++) {
    for (let ty = ty0; ty <= ty1; ty++) {
      if (ty < 0 || ty > maxIndex) continue
      tiles.push({
        key: `${tx}_${ty}`,
        x: ((tx % (maxIndex + 1)) + maxIndex + 1) % (maxIndex + 1),
        y: ty,
        left: tx * TILE - originX,
        top:  ty * TILE - originY,
      })
    }
  }

  const px = lon2tx(lon, zoom) * TILE - originX
  const py = lat2ty(lat, zoom) * TILE - originY
  // Un punto fuori dal riquadro (un'escursione all'estero) verrebbe disegnato sul bordo dando
  // un'informazione falsa: meglio non disegnare nulla che indicare il posto sbagliato.
  const inside = px >= 0 && px <= VIEW_W && py >= 0 && py <= VIEW_H

  return (
    <figure className="relative overflow-hidden rounded-2xl border border-stone-200 bg-stone-100"
      style={{ width: '100%', aspectRatio: `${VIEW_W} / ${VIEW_H}` }}>
      {tiles.map(t => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={t.key} src={`/api/tile?z=${zoom}&x=${t.x}&y=${t.y}&style=positron`} alt=""
          loading={eager ? 'eager' : 'lazy'} decoding="async" aria-hidden="true"
          style={{
            position: 'absolute',
            left:   `${(t.left / VIEW_W) * 100}%`,
            top:    `${(t.top  / VIEW_H) * 100}%`,
            width:  `${(TILE / VIEW_W) * 100}%`,
            height: `${(TILE / VIEW_H) * 100}%`,
          }} />
      ))}

      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} role="img"
        aria-label={label ? `Posizione di ${label} in Italia` : 'Posizione del percorso in Italia'}
        className="absolute inset-0 w-full h-full">
        {inside && (
          <>
            {/* Alone pulsante disegnato, non animato: deve reggere anche stampato nel PDF. */}
            <circle cx={px} cy={py} r={13} fill="#e08d3c" opacity={0.18} />
            <circle cx={px} cy={py} r={7}  fill="#e08d3c" opacity={0.35} />
            <circle cx={px} cy={py} r={4}  fill="#c05a17" stroke="#fff" strokeWidth={1.6} />
          </>
        )}
      </svg>

      <figcaption className="absolute bottom-0 left-0 right-0 bg-white/80 text-stone-500 text-[9px] leading-none px-1.5 py-1 text-center">
        Dove si cammina
      </figcaption>
    </figure>
  )
}
