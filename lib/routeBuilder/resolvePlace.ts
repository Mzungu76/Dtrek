// Risolve un nome libero di luogo — un comune, ma anche una feature naturale specifica come
// "Gole del Biedano, Blera" o "Cascata del Picchio" — a una coordinata, per usarlo come punto di
// partenza o destinazione nel route builder (vedi components/upload/RouteBuilder.tsx). Prova prima
// Nominatim (copre bene luoghi con una propria voce OSM, compresi molti nomi di comuni/frazioni),
// poi — solo se la query include un riferimento d'area separato da virgola (es. "..., Blera") — una
// ricerca Overpass per nome su feature puntuali naturali/turistiche/storiche, per i casi che
// Nominatim da solo non trova (cascate, sorgenti, gole locali poco note). Senza un'area da cui
// restringere il bbox, la ricerca Overpass su scala nazionale sarebbe lenta/pesante (stessa classe
// di problema già affrontata per la rete percorribile, vedi lib/routeBuilder/osmGraph.ts) — in quel
// caso si preferisce dichiarare il luogo non trovato piuttosto che rischiarlo. Nessuna ricerca
// web/AI in questo giro (rimandata deliberatamente).
import { fetchOverpass, resolveAreaBbox, padBbox } from '@/lib/overpassTrails'

const NOMINATIM_USER_AGENT = 'DTrek/1.0 (personal hiking diary; mzulpt@gmail.com)'

export interface ResolvedPlace {
  lat: number
  lon: number
  displayName: string
  source: 'nominatim' | 'overpass'
}

async function resolveViaNominatim(query: string): Promise<ResolvedPlace | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({
      q: query, format: 'json', limit: '1', countrycodes: 'it',
    })}`
    const res = await fetch(url, { headers: { 'User-Agent': NOMINATIM_USER_AGENT }, signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const results = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>
    const hit = results[0]
    if (!hit) return null
    return { lat: parseFloat(hit.lat), lon: parseFloat(hit.lon), displayName: hit.display_name, source: 'nominatim' }
  } catch {
    return null
  }
}

interface OverpassNameEl {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

// Stessi insiemi di valori tag di lib/pois/overpassSource.ts's fetchOverpassPois (cascate,
// sorgenti, grotte, cime, valichi, belvedere, feature storiche), più natural=valley — non gestito
// altrove nell'app (OSM non ha un tag standard per "gola"; una gola con nome è tipicamente mappata
// così) — aggiunto qui perché è esattamente il caso motivante ("Gole del Biedano").
function buildNamedFeatureQuery(escapedName: string, bbox: [number, number, number, number]): string {
  const [minLat, minLon, maxLat, maxLon] = bbox
  const b = `${minLat},${minLon},${maxLat},${maxLon}`
  return `[out:json][timeout:20];
(
  node["name"~"${escapedName}",i]["natural"~"^(waterfall|valley|spring|cave_entrance|peak|saddle)$"](${b});
  way["name"~"${escapedName}",i]["natural"~"^(valley|water)$"](${b});
  node["name"~"${escapedName}",i]["waterway"="waterfall"](${b});
  node["name"~"${escapedName}",i]["tourism"~"^(viewpoint|alpine_hut|wilderness_hut|picnic_site)$"](${b});
  node["name"~"${escapedName}",i]["historic"](${b});
);
out center 5;`
}

async function resolveViaOverpassByName(nameQuery: string, bbox: [number, number, number, number]): Promise<ResolvedPlace | null> {
  const escaped = nameQuery.replace(/[[\]{}()*+?.,\\^$|#\s]/g, s => (s === ' ' ? '.*' : `\\${s}`))
  try {
    const json = await fetchOverpass<{ elements: OverpassNameEl[] }>(buildNamedFeatureQuery(escaped, bbox), 20_000)
    for (const el of json.elements ?? []) {
      const lat = el.type === 'node' ? el.lat : el.center?.lat
      const lon = el.type === 'node' ? el.lon : el.center?.lon
      const name = el.tags?.name || el.tags?.['name:it']
      if (lat == null || lon == null || !name) continue
      return { lat, lon, displayName: name, source: 'overpass' }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Risolve un nome libero a una coordinata. Se la query è nella forma "nome, area" (es. "Cascata
 * del Picchio, Blera"), l'area viene usata per restringere il bbox della ricerca Overpass di
 * fallback quando Nominatim non trova nulla per la query intera — senza una virgola, il fallback
 * Overpass viene saltato (nessun bbox plausibile da cui partire senza un costo di ricerca
 * nazionale). Ritorna null se nessuna delle due fonti trova un risultato.
 */
export async function resolvePlaceName(query: string): Promise<ResolvedPlace | null> {
  const trimmed = query.trim()
  if (!trimmed) return null

  const viaNominatim = await resolveViaNominatim(trimmed)
  if (viaNominatim) return viaNominatim

  const parts = trimmed.split(',').map(p => p.trim()).filter(Boolean)
  if (parts.length < 2) return null

  const areaHint = parts[parts.length - 1]
  const areaBbox = await resolveAreaBbox(areaHint)
  if (!areaBbox) return null

  const nameQuery = parts.slice(0, -1).join(' ')
  return resolveViaOverpassByName(nameQuery, padBbox(areaBbox, 15))
}
