// Schizzo vettoriale della traccia, per la pagina pubblica del Diario.
//
// Non è una mappa: niente tile, niente Leaflet, niente MapLibre. La pagina pubblica viene aperta
// da chi riceve un link — spesso da telefono, spesso in mobilità — e montare una mappa interattiva
// per escursione significherebbe decine di istanze e centinaia di richieste a `/api/tile` per una
// pagina che si scorre e basta. La forma del percorso, con partenza, arrivo e le posizioni delle
// foto, è l'informazione che serve davvero, e sta in poche centinaia di byte di SVG inline.
//
// Componente server puro: nessuno stato, nessun JavaScript spedito al browser.

const W = 320
const H = 200
const PAD = 14

export function RouteSketch({ polyline, photoProgress = [], color = '#277134' }: {
  polyline: [number, number][]
  /** Posizioni (0–1) lungo il percorso in cui sono state scattate le foto. */
  photoProgress?: number[]
  color?: string
}) {
  if (polyline.length < 2) return null

  const lats = polyline.map(p => p[0])
  const lons = polyline.map(p => p[1])
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLon = Math.min(...lons), maxLon = Math.max(...lons)

  // Alle nostre latitudini un grado di longitudine è molto più corto di un grado di latitudine:
  // senza la correzione per cos(lat) ogni traccia risulterebbe stirata in orizzontale.
  const latMid = (minLat + maxLat) / 2
  const lonScale = Math.cos((latMid * Math.PI) / 180)
  const spanX = Math.max((maxLon - minLon) * lonScale, 1e-9)
  const spanY = Math.max(maxLat - minLat, 1e-9)

  // Un solo fattore di scala per entrambi gli assi: la traccia mantiene le proporzioni reali
  // invece di essere deformata per riempire il riquadro.
  const scale = Math.min((W - 2 * PAD) / spanX, (H - 2 * PAD) / spanY)
  const offsetX = (W - spanX * scale) / 2
  const offsetY = (H - spanY * scale) / 2

  const project = ([lat, lon]: [number, number]): [number, number] => [
    offsetX + (lon - minLon) * lonScale * scale,
    // y invertito: in SVG cresce verso il basso, la latitudine verso l'alto.
    offsetY + (maxLat - lat) * scale,
  ]

  const pts = polyline.map(project)
  const d = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')

  const [sx, sy] = pts[0]
  const [ex, ey] = pts[pts.length - 1]

  const photoDots = photoProgress
    .filter(p => p >= 0 && p <= 1)
    .map(p => pts[Math.min(pts.length - 1, Math.round(p * (pts.length - 1)))])

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Schizzo del percorso"
      className="w-full h-auto block rounded-2xl bg-stone-100">
      {/* Alone chiaro sotto la traccia: la stacca dallo sfondo come sulle mappe dell'app. */}
      <path d={d} fill="none" stroke="#ffffff" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />

      {photoDots.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={3.5} fill="#e08d3c" stroke="#fff" strokeWidth={1.5} />
      ))}

      <circle cx={sx} cy={sy} r={5} fill="#22c55e" stroke="#fff" strokeWidth={2} />
      <circle cx={ex} cy={ey} r={5} fill="#ef4444" stroke="#fff" strokeWidth={2} />
    </svg>
  )
}
