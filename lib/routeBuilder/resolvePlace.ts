// Risolve un nome libero di luogo — un comune, ma anche una feature naturale specifica come
// "Gole del Biedano, Blera" o "Cascata del Picchio" — a una coordinata, per usarlo come punto di
// partenza o destinazione nel route builder (vedi components/upload/RouteBuilder.tsx). Tre livelli,
// in ordine, il primo che trova qualcosa vince:
//  1. Nominatim (copre bene luoghi con una propria voce OSM, compresi molti nomi di comuni/frazioni)
//  2. Ricerca Overpass per nome su feature puntuali naturali/turistiche/storiche (cascate, sorgenti,
//     gole, boschi nominati...), sull'area indicata dopo la virgola se presente, altrimenti sull'intero
//     bbox Italia — copre i casi che Nominatim da solo non trova ma che sono comunque ben mappati su OSM.
//  3. Solo se i primi due non trovano nulla, e solo quando il chiamante passa una chiave Claude
//     personale (mai la chiave condivisa di emergenza — scelta esplicita dell'utente, vedi
//     resolveViaAI), un terzo livello AI con ricerca web: individua il comune/area contenente il
//     luogo (che rientra poi nello stesso livello 2 sopra) oppure, se la trova da una fonte
//     affidabile (es. un infobox Wikipedia), una coordinata diretta come scorciatoia.
import Anthropic from '@anthropic-ai/sdk'
import { fetchOverpass, resolveAreaBbox, padBbox, ITALY_BBOX } from '@/lib/overpassTrails'

const NOMINATIM_USER_AGENT = 'DTrek/1.0 (personal hiking diary; mzulpt@gmail.com)'

export interface ResolvedPlace {
  lat: number
  lon: number
  displayName: string
  source: 'nominatim' | 'overpass' | 'ai'
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
// così) — aggiunto qui perché è esattamente il caso motivante ("Gole del Biedano"). natural=wood e
// landuse=forest aggiunti per coprire boschi/faggete con un proprio nome (es. "Faggeta del Cimino"),
// mancanti fino ad ora: senza questi tag una foresta nominata non poteva mai essere trovata anche
// se ben mappata.
function buildNamedFeatureQuery(escapedName: string, bbox: [number, number, number, number]): string {
  const [minLat, minLon, maxLat, maxLon] = bbox
  const b = `${minLat},${minLon},${maxLat},${maxLon}`
  return `[out:json][timeout:20];
(
  node["name"~"${escapedName}",i]["natural"~"^(waterfall|valley|spring|cave_entrance|peak|saddle)$"](${b});
  way["name"~"${escapedName}",i]["natural"~"^(valley|water|wood)$"](${b});
  way["name"~"${escapedName}",i]["landuse"="forest"](${b});
  relation["name"~"${escapedName}",i]["landuse"="forest"](${b});
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

const AI_SYSTEM_PROMPT = `Sei un assistente che identifica luoghi escursionistici italiani (cascate, gole, sorgenti, ruderi, boschi, siti archeologici...) cercati per nome da un utente, quando le mappe OSM/Nominatim non li hanno già trovati da sole. Usa la ricerca web per capire di quale luogo si tratta e in quale comune italiano ricade.

Rispondi SOLO in uno di questi tre formati, senza altro testo:
- Se trovi coordinate precise da una fonte affidabile (es. un infobox Wikipedia con coordinate esplicite): [luogo]{"lat":NUM,"lon":NUM,"displayName":"nome completo del luogo"}[/luogo]
- Se non hai coordinate precise ma identifichi con sicurezza il comune/area in cui si trova: [area]{"comune":"nome del comune","nome":"nome del luogo come da cercare su OSM"}[/area]
- Se non riesci a identificare il luogo con ragionevole sicurezza: [nessuno][/nessuno]

Non inventare mai coordinate o comuni: se non sei sicuro, rispondi [nessuno][/nessuno].`

const LUOGO_RE = /\[luogo\]([\s\S]*?)\[\/luogo\]/
const AREA_RE = /\[area\]([\s\S]*?)\[\/area\]/

/**
 * Terzo livello di risoluzione, via Claude + ricerca web — usato SOLO come fallback quando
 * Nominatim e la ricerca Overpass per nome non trovano nulla (vedi resolvePlaceName). Richiede
 * sempre una chiave Claude personale dell'utente: il chiamante (app/api/route-build/resolve-place/
 * route.ts) non deve mai passare la chiave condivisa di emergenza qui, per scelta esplicita
 * dell'utente (un uso "a consumo" gratuito per tutti sarebbe troppo facile da abusare rispetto agli
 * altri usi AI dell'app, tutti dietro azioni esplicite dell'utente autenticato).
 */
async function resolveViaAI(query: string, apiKey: string, model: string): Promise<ResolvedPlace | null> {
  try {
    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      system: AI_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: query }],
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
    })
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')

    const luogoMatch = LUOGO_RE.exec(text)
    if (luogoMatch) {
      try {
        const parsed = JSON.parse(luogoMatch[1]) as { lat?: number; lon?: number; displayName?: string }
        if (typeof parsed.lat === 'number' && typeof parsed.lon === 'number' && parsed.displayName) {
          return { lat: parsed.lat, lon: parsed.lon, displayName: parsed.displayName, source: 'ai' }
        }
      } catch {
        // risposta malformata — prosegue sotto, prova [area] o restituisce null
      }
    }

    const areaMatch = AREA_RE.exec(text)
    if (areaMatch) {
      try {
        const parsed = JSON.parse(areaMatch[1]) as { comune?: string; nome?: string }
        if (parsed.comune && parsed.nome) {
          const areaBbox = await resolveAreaBbox(parsed.comune)
          if (areaBbox) {
            const viaOverpass = await resolveViaOverpassByName(parsed.nome, padBbox(areaBbox, 15))
            if (viaOverpass) return viaOverpass
          }
        }
      } catch {
        // risposta malformata
      }
    }

    return null
  } catch (e) {
    console.error('[resolvePlace] resolveViaAI failed:', e)
    return null
  }
}

/**
 * Risolve un nome libero a una coordinata. Se la query è nella forma "nome, area" (es. "Cascata
 * del Picchio, Blera"), l'area viene usata per restringere il bbox della ricerca Overpass di
 * fallback quando Nominatim non trova nulla per la query intera. Senza una virgola (es. solo
 * "Cascata del Picchio"), la ricerca Overpass gira comunque, ma sull'intero bbox Italia (stesso
 * fallback di searchHikingRoutesByName in lib/overpassTrails.ts) — più lenta ma non saltata:
 * l'utente spesso conosce il nome del luogo ma non l'area amministrativa esatta in cui ricade.
 * Se anche questo fallisce e il chiamante passa `ai` (chiave Claude personale dell'utente — mai la
 * condivisa, vedi resolveViaAI), tenta un terzo livello con ricerca web. Ritorna null se nessuna
 * fonte trova un risultato.
 */
export async function resolvePlaceName(
  query: string,
  ai?: { apiKey: string; model: string },
): Promise<ResolvedPlace | null> {
  const trimmed = query.trim()
  if (!trimmed) return null

  const viaNominatim = await resolveViaNominatim(trimmed)
  if (viaNominatim) return viaNominatim

  const parts = trimmed.split(',').map(p => p.trim()).filter(Boolean)
  const areaHint = parts.length >= 2 ? parts[parts.length - 1] : null
  const nameQuery = parts.length >= 2 ? parts.slice(0, -1).join(' ') : trimmed

  const areaBbox = areaHint ? await resolveAreaBbox(areaHint) : null
  const bbox = areaBbox ? padBbox(areaBbox, 15) : ITALY_BBOX

  const viaOverpass = await resolveViaOverpassByName(nameQuery, bbox)
  if (viaOverpass) return viaOverpass

  if (ai) return resolveViaAI(trimmed, ai.apiKey, ai.model)
  return null
}
