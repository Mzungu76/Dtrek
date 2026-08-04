import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Corsi d'acqua e sentieri CON GEOMETRIA lungo un percorso — la materia prima dello stacco
 * "Visione" del video (vedi lib/videoVision.ts e components/RouteMap3D.tsx).
 *
 * Perché non riusare /api/tei-overpass, che già interroga gli stessi corsi d'acqua: quella query
 * chiude con `out center` e riduce ogni elemento a un punto, perché al TEI serve solo la densità.
 * Qui le linee servono per davvero — vanno disegnate sulla mappa — e servono i nomi.
 *
 * Cime, sorgenti, valichi, cascate e grotte NON stanno qui: sono già in /api/pois (lib/overpass.ts,
 * PoiItem), che il video riceve come prop. Duplicarli vorrebbe dire due elenchi da tenere
 * d'accordo e due chiamate Overpass per gli stessi luoghi.
 */

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]

const USER_AGENT = 'DTrek/1.0 (personal hiking diary; mzulpt@gmail.com)'

// Massimo di punti per geometria: una linea che sulla mappa è larga 3 px non guadagna nulla da
// mille vertici, e il payload sì.
const MAX_GEOM_POINTS = 60

export interface RouteFeatureLine {
  id: number
  kind: 'waterway' | 'trail'
  /** Nome OSM, oppure il numero del sentiero ("651") quando il nome manca ma il `ref` c'è. */
  name: string
  /** Sottotipo grezzo OSM (river, stream, path, track…) — decide il tratto con cui si disegna. */
  osmType: string
  geometry: [number, number][]   // [lat, lon]
}

function simplify(geom: Array<{ lat: number; lon: number }>): [number, number][] {
  const pts = geom.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon))
  if (pts.length <= MAX_GEOM_POINTS) return pts.map(p => [p.lat, p.lon])
  const step = Math.ceil(pts.length / MAX_GEOM_POINTS)
  const out = pts.filter((_, i) => i % step === 0).map(p => [p.lat, p.lon] as [number, number])
  // L'ultimo vertice va tenuto comunque: senza, una linea campionata si accorcia visibilmente.
  const last = pts[pts.length - 1]
  if (out[out.length - 1][0] !== last.lat || out[out.length - 1][1] !== last.lon) out.push([last.lat, last.lon])
  return out
}

// ── GET /api/route-features?bbox=minLat,minLon,maxLat,maxLon ─────────────────
export async function GET(req: NextRequest) {
  const bbox = req.nextUrl.searchParams.get('bbox')
  if (!bbox) return NextResponse.json({ error: 'Missing bbox' }, { status: 400 })
  const parts = bbox.split(',').map(Number)
  if (parts.length !== 4 || parts.some(n => !Number.isFinite(n))) {
    return NextResponse.json({ error: 'Malformed bbox' }, { status: 400 })
  }
  const [s, w, n, e] = parts

  // Solo elementi che portano un nome o un numero: è il filtro "importanti e caratteristici".
  // Un fosso anonimo e un sentierino senza segnavia non hanno nulla da annotare — una linea con
  // scritto "Torrente" non aggiunge niente a quello che si vede già.
  const query = `
[out:json][timeout:30];
(
  way["waterway"~"^(river|stream|canal)$"]["name"](${s},${w},${n},${e});
  way["highway"~"^(path|track|footway|bridleway)$"]["name"](${s},${w},${n},${e});
  way["highway"~"^(path|track|footway|bridleway)$"]["ref"](${s},${w},${n},${e});
);
out geom;`

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(25000),
      })
      if (!res.ok) continue
      const json = await res.json() as { elements?: unknown[] }
      const lines: RouteFeatureLine[] = []
      for (const raw of json.elements ?? []) {
        const el = raw as {
          id?: number
          tags?: Record<string, string>
          geometry?: Array<{ lat: number; lon: number }>
        }
        if (!el.geometry || el.geometry.length < 2 || el.id == null) continue
        const tags = el.tags ?? {}
        const isWater = !!tags.waterway
        const name = tags.name ?? (tags.ref ? `Sentiero ${tags.ref}` : '')
        if (!name) continue
        lines.push({
          id: el.id,
          kind: isWater ? 'waterway' : 'trail',
          name,
          osmType: (isWater ? tags.waterway : tags.highway) ?? '',
          geometry: simplify(el.geometry),
        })
      }
      return NextResponse.json({ lines }, {
        // Geometria OSM di un'area fissa: non cambia da un'ora all'altra, e ogni rigenerazione del
        // video rifarebbe la stessa identica interrogazione.
        headers: { 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800' },
      })
    } catch { /* endpoint successivo */ }
  }
  // Nessun endpoint ha risposto: elenco vuoto, non un errore. La Visione semplicemente si limita a
  // ciò che sa già (POI e toponimi), invece di far fallire la generazione del video.
  return NextResponse.json({ lines: [] })
}
