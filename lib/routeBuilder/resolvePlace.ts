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
import { POI_META, type PoiType } from '@/lib/overpass'
import { HIKER_ENVIRONMENT_PREFS, type HikerEnvironmentPrefKey } from '@/lib/hikerProfile'
import type { RouteType } from './loopBuilder'

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

export interface InterpretedPlace {
  /** Testo da ripassare tale e quale al Livello 0 (resolvePlaceName + ricerca percorsi esistenti
   *  non-AI) — non una coordinata: questo livello interpreta, non cerca. */
  query: string
}

export interface InterpretedPreferences {
  routeType?: RouteType
  targetDistanceKm?: number
  targetElevationM?: number
  desiredPoiTypes?: PoiType[]
  environmentPrefs?: HikerEnvironmentPrefKey[]
}

export interface InterpretedRequest {
  /** Uno o più luoghi/zone candidati — plurale perché una richiesta vaga ("un anello con una
   *  cascata vicino Soriano") può ammettere più interpretazioni valide, non una sola. */
  places: InterpretedPlace[]
  prefs: InterpretedPreferences
}

const INTERPRET_LUOGHI_RE = /\[luoghi\]([\s\S]*?)\[\/luoghi\]/
const INTERPRET_PREFS_RE = /\[preferenze\]([\s\S]*?)\[\/preferenze\]/

function buildInterpretSystemPrompt(): string {
  const poiTypesList = Object.keys(POI_META).join(', ')
  const envPrefsList = HIKER_ENVIRONMENT_PREFS.map(p => p.key).join(', ')
  return `Sei un assistente che interpreta una richiesta di ricerca percorso escursionistico scritta in italiano da un utente dell'app Dtrek, PRIMA che venga cercata su OpenStreetMap — il tuo compito è capire cosa intende, NON cercare nulla: non hai accesso alla ricerca web in questo passaggio.

Estrai:
1. Uno o più nomi di luogo/percorso da cercare — una feature specifica (es. "Cascata del Picchio, Blera") o una zona/comune più ampia se non c'è un punto specifico (es. "Monti Cimini, Soriano nel Cimino"). Nella forma "nome, area" quando possibile.
2. Le preferenze di percorso desumibili dal testo, SOLO se esplicite o chiaramente implicite — non inventare valori altrimenti:
   - routeType: uno tra "anello", "andata_ritorno", "solo_andata" (solo_andata = punto A a punto B, senza tornare indietro)
   - targetDistanceKm: numero, se una lunghezza è indicata
   - targetElevationM: numero, se un dislivello è indicato
   - desiredPoiTypes: array, solo valori tra: ${poiTypesList}
   - environmentPrefs: array, solo valori tra: ${envPrefsList}

Rispondi SOLO in questo formato, senza altro testo:
[luoghi]primo luogo o zona|secondo luogo o zona (se pertinente)[/luoghi]
[preferenze]{"routeType":"...","targetDistanceKm":NUM,"targetElevationM":NUM,"desiredPoiTypes":[...],"environmentPrefs":[...]}[/preferenze]

Ometti dal JSON delle preferenze ogni campo non desumibile dal testo (non usare null, ometti la chiave). Se il testo non permette di identificare NESSUN luogo o zona, rispondi solo [nessuno][/nessuno].`
}

/**
 * Primo livello AI (economico: nessun tool di ricerca web, solo interpretazione del testo già
 * scritto dall'utente) — usato SOLO quando il Livello 0 (Nominatim/Overpass, non-AI) non trova
 * nulla per il testo originale. Individua uno o più luoghi/zone da ripassare esattamente al
 * Livello 0 (mai ricorsivamente a questo stesso livello o al Livello 2 di ricerca web) più le
 * preferenze di percorso desumibili dal testo originale (vedi app/api/route-build/search/route.ts).
 * Stessa regola del terzo livello di resolvePlaceName: mai la chiave condivisa di emergenza, solo
 * quella personale dell'utente.
 */
export async function interpretSearchRequest(query: string, apiKey: string, model: string): Promise<InterpretedRequest | null> {
  try {
    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model,
      max_tokens: 512,
      system: buildInterpretSystemPrompt(),
      messages: [{ role: 'user', content: query }],
    })
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')

    const luoghiMatch = INTERPRET_LUOGHI_RE.exec(text)
    if (!luoghiMatch) return null
    const places = luoghiMatch[1].split('|').map(s => s.trim()).filter(Boolean).map(q => ({ query: q }))
    if (places.length === 0) return null

    const prefs: InterpretedPreferences = {}
    const prefsMatch = INTERPRET_PREFS_RE.exec(text)
    if (prefsMatch) {
      try {
        const parsed = JSON.parse(prefsMatch[1]) as Record<string, unknown>
        if (parsed.routeType === 'anello' || parsed.routeType === 'andata_ritorno' || parsed.routeType === 'solo_andata') {
          prefs.routeType = parsed.routeType
        }
        if (typeof parsed.targetDistanceKm === 'number') prefs.targetDistanceKm = parsed.targetDistanceKm
        if (typeof parsed.targetElevationM === 'number') prefs.targetElevationM = parsed.targetElevationM
        if (Array.isArray(parsed.desiredPoiTypes)) {
          const validPoiTypes = new Set(Object.keys(POI_META))
          prefs.desiredPoiTypes = parsed.desiredPoiTypes.filter((t): t is PoiType => typeof t === 'string' && validPoiTypes.has(t))
        }
        if (Array.isArray(parsed.environmentPrefs)) {
          const validEnvPrefs = new Set<string>(HIKER_ENVIRONMENT_PREFS.map(p => p.key))
          prefs.environmentPrefs = parsed.environmentPrefs.filter((k): k is HikerEnvironmentPrefKey => typeof k === 'string' && validEnvPrefs.has(k))
        }
      } catch {
        // preferenze malformate — prosegue solo con i luoghi, nessuna precompilazione
      }
    }

    return { places, prefs }
  } catch (e) {
    console.error('[resolvePlace] interpretSearchRequest failed:', e)
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
