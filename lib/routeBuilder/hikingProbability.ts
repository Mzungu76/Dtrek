// Classificatore euristico "probabilità escursionistica" per singolo arco OSM — a differenza di
// osmGraph.ts (rete grezza per il pathfinding di "Su misura") e overpassTrails.ts (solo relation
// route= già curate, per "Esistenti"), qui si valuta OGNI arco percorribile del bbox con un
// punteggio a sottocategorie, per intercettare sentieri reali mai assemblati in una relation — il
// caso che lascia "Esistenti" vuoto in zone poco mappate.
//
// Distingue due domande diverse, tenute deliberatamente separate invece di un unico numero:
//  - networkScore = quanto l'arco appartiene a una rete escursionistica riconosciuta (relation +
//    topologia). Un arco può avere networkScore alto pur non essendo, di per sé, un sentiero — es.
//    il tratto di via del paese che un percorso CAI reale attraversa per raggiungere il trailhead.
//  - trailScore   = quanto l'arco è FISICAMENTE un sentiero (tag della way + contesto + penalità
//    urbane). È questo il punteggio usato per il tier finale — "fa parte di un percorso" e "è un
//    tratto naturalistico" sono informazioni diverse, e confonderle classificava vie di paese ben
//    collegate alla rete come "quasi certo sentiero" solo per la loro appartenenza.
//
// Fasi:
//  1. Filtro       — esclusioni (veto): un arco escluso ha punteggio 0 e non entra nel sottografo
//                     di topologia, a prescindere dagli altri tag.
//  2. Sottopunteggi — relationScore + wayScore + contextScore + urbanPenalty, calcolati
//                     indipendentemente così da poter tarare o debuggare una categoria alla volta.
//  3. Conferma topologica — topologyScore, calcolato sul sottografo "escursionistico" (niente
//                     residential/unclassified, né vie identificate come attraversamento urbano —
//                     vedi isUrbanTransferWay — così un paese resta un punto di attraversamento
//                     invece di gonfiare il componente connesso).
import { fetchOverpass, type OsmRelation } from '@/lib/overpassTrails'
import { haversineM } from '@/lib/geoUtils'

export type Bbox = [minLat: number, minLon: number, maxLat: number, maxLon: number]

function bboxStr([minLat, minLon, maxLat, maxLon]: Bbox): string {
  return `${minLat},${minLon},${maxLat},${maxLon}`
}

// ── Fase 1 — esclusioni (veto) ──────────────────────────────────────────────

// Way incluse nella query di rete camminabile — stesso elenco di osmGraph.ts (residential/
// unclassified servono da "ponte" per agganciare un paese ai sentieri fuori centro), ma qui
// portiamo anche i tag completi (non solo highway), necessari per relationScore/wayScore.
const WALKABLE_HIGHWAY = 'path|track|footway|bridleway|steps|unclassified|residential'

// Sottoinsieme usato SOLO in fase 3 (topologia): residential/unclassified sono escluse del tutto
// dal grafo, non solo "non contano" — altrimenti la rete stradale di un paese diventa un unico
// componente connesso enorme e gonfia il punteggio di topologia anche per un vicolo cittadino.
const HIKING_HIGHWAY = new Set(['path', 'track', 'footway', 'bridleway', 'steps'])

function isExcluded(tags: Record<string, string>): boolean {
  if (tags.access === 'private' || tags.access === 'no') return true
  if (tags.foot === 'no') return true
  if (tags.highway === 'footway' && (tags.footway === 'sidewalk' || tags.footway === 'crossing')) return true
  if (tags.indoor === 'yes' || tags.area === 'yes' || tags.location === 'indoor') return true
  // Un passaggio dentro un edificio può formalmente appartenere a una relation escursionistica
  // (il percorso ufficiale attraversa un portico/androne) ma non è mai, di per sé, un segmento
  // escursionistico — a differenza delle vie del paese (vedi isUrbanTransferWay), qui non c'è
  // nessuna lettura in cui valga la pena mostrarlo come "tratto probabile".
  if (tags.tunnel === 'building_passage') return true
  return false
}

// ── Fase 2a — punteggio da appartenenza a relation route=hiking/foot ───────

const NETWORK_BONUS: Record<string, number> = { nwn: 20, rwn: 15, lwn: 5 }

interface RelationScoreInfo {
  score: number
  isRouteFoot: boolean
}

function scoreRelationTags(tags: Record<string, string>): number {
  let s = tags.route === 'hiking' ? 100 : 50
  if (tags.network) s += NETWORK_BONUS[tags.network] ?? 0
  if (tags['osmc:symbol']) s += 50
  if (tags.ref) s += 40
  if (tags.operator === 'CAI') s += 15
  return s
}

// ── Fase 2b — punteggio dai tag diretti sulla way ───────────────────────────

// Superfici "naturali" — elenco ampliato rispetto alla prima bozza: route=hiking-only o path/track
// da soli erano troppo stretti, molti sentieri reali hanno solo surface=dirt/grass senza nessun
// altro tag esplicitamente escursionistico.
const NATURAL_SURFACES = new Set([
  'ground', 'earth', 'rock', 'gravel', 'dirt', 'grass', 'grass_paver',
  'pebblestone', 'fine_gravel', 'woodchips',
])

function scoreWayTags(tags: Record<string, string>, nearCoast: boolean): number {
  let s = 0
  if (tags.sac_scale) s += 60
  if (tags.trail_visibility) s += 30
  if (tags.trailblazed === 'yes') s += 20
  if (tags.highway === 'path') s += 25
  if (tags.highway === 'track' && (tags.tracktype === 'grade4' || tags.tracktype === 'grade5')) s += 20
  if (tags.highway === 'footway' && tags.footway !== 'sidewalk' && tags.footway !== 'crossing') s += 15
  if (tags.surface === 'sand') {
    // La sabbia in ambiente costiero è più spesso una spiaggia che un sentiero — il bonus si
    // applica solo lontano dalla costa (nearCoast arriva dal TerrainContext del chiamante).
    if (!nearCoast) s += 15
  } else if (tags.surface && NATURAL_SURFACES.has(tags.surface)) {
    s += 15
  }
  if (tags.highway === 'track' && tags.tracktype === 'grade3') s += 10
  if (tags.informal === 'yes') s += 5
  if (tags.ford === 'yes') s += 10
  if (tags.highway === 'track' && !tags.tracktype) s += 5
  if (tags.bridge === 'yes') s += 3
  if (tags.tunnel === 'yes') s += 3
  if (tags.incline) s += 5
  if (tags['mtb:scale']) s += 3
  return s
}

// ── Fase 2c — punteggio contestuale (aree protette + prossimità POI) ───────

type ProtectedAreaTier = 'nationalPark' | 'natureReserve' | 'sicZsc' | 'protectedGeneric'

const PROTECTED_AREA_BONUS: Record<ProtectedAreaTier, number> = {
  nationalPark: 12,
  natureReserve: 10,
  protectedGeneric: 8,
  sicZsc: 6,
}

interface ProtectedArea {
  tier: ProtectedAreaTier
  // Bounding box dell'elemento OSM ("out bb"), non il poligono esatto — approssimazione accettata
  // per lo stesso motivo di "out center" in overpassTrails.ts: un secondo giro con la geometria
  // completa costerebbe molto di più su Overpass per un guadagno di precisione marginale qui.
  bbox: Bbox
}

function pointInBbox(lat: number, lon: number, [minLat, minLon, maxLat, maxLon]: Bbox): boolean {
  return lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon
}

function scoreProtectedAreas(lat: number, lon: number, areas: ProtectedArea[]): number {
  let best = 0
  for (const a of areas) {
    if (pointInBbox(lat, lon, a.bbox)) best = Math.max(best, PROTECTED_AREA_BONUS[a.tier])
  }
  return best
}

export interface PoiPoint { lat: number; lon: number }

const POI_PROXIMITY_CAP = 20

function scorePoiProximity(lat: number, lon: number, pois: PoiPoint[]): number {
  let s = 0
  for (const p of pois) {
    const d = haversineM(lat, lon, p.lat, p.lon)
    if (d <= 30) s += 5
    else if (d <= 60) s += 3
    else if (d <= 100) s += 1
  }
  return Math.min(s, POI_PROXIMITY_CAP)
}

// Un centro abitato vicino declassa il bonus estensivo di route=foot (spesso passeggiate urbane
// mappate come route=foot) — usato solo come modulatore di quel bonus, non come esclusione: un
// route=foot vicino a un paese resta comunque un arco valido, solo con un punteggio più prudente.
const SETTLEMENT_PROXIMITY_M = 300

function nearestDistM(lat: number, lon: number, points: PoiPoint[]): number {
  let min = Infinity
  for (const p of points) {
    const d = haversineM(lat, lon, p.lat, p.lon)
    if (d < min) min = d
  }
  return min
}

// ── Fase 2d — penalità di natura urbana ─────────────────────────────────────
//
// Appartenere a una relation escursionistica (relationScore) non significa che UN SINGOLO arco sia
// fisicamente un sentiero: molti cammini/percorsi CAI reali attraversano il centro di un paese
// (parcheggio → paese → piazza → sentiero), e quell'attraversamento resta correttamente parte del
// percorso — ma non va confuso con un tratto naturalistico. Queste penalità riducono solo
// wayScore/contextScore (trailScore), MAI relationScore/topologyScore (networkScore): l'arco resta
// nel percorso, cambia solo come lo si descrive.

const ASPHALT_SURFACES = new Set([
  'asphalt', 'paved', 'concrete', 'paving_stones', 'sett', 'cobblestone', 'concrete:plates', 'concrete:lanes',
])

// "strada"/"vicinale"/"comunale" volutamente esclusi: nomi come "Strada di Sacco" sono frequenti su
// tracciati rurali/tratturi reali, non solo su vie di paese — includerli avrebbe penalizzato
// esattamente il genere di sentiero che questo classificatore vuole recuperare. Il pattern è quindi
// tenuto stretto (vie urbane inequivocabili) e SEMPRE condizionato alla vicinanza a un centro
// abitato (vedi isNearSettlement), non applicato da solo.
const URBAN_STREET_NAME_RE = /\b(via|viale|piazza|corso|vicolo|largo)\b/i

function isUrbanTransferWay(tags: Record<string, string>, isNearSettlement: boolean): boolean {
  if (!isNearSettlement) return false
  if (tags.highway === 'footway' || tags.highway === 'pedestrian') return true
  if (tags.name && URBAN_STREET_NAME_RE.test(tags.name)) return true
  return false
}

function computeUrbanPenalty(tags: Record<string, string>, isNearSettlement: boolean): number {
  let penalty = 0
  if (isNearSettlement) {
    if (tags.highway === 'footway') penalty -= 20
    if (tags.highway === 'pedestrian') penalty -= 20
    if (tags.name && URBAN_STREET_NAME_RE.test(tags.name)) penalty -= 20
  }
  // L'asfalto abbassa la plausibilità "sentiero" ovunque, non solo in paese — anche una pista
  // forestale asfaltata fuori centro è meno riconoscibile come sentiero.
  if (ASPHALT_SURFACES.has(tags.surface ?? '')) penalty -= 15
  return penalty
}

// ── Fase 3 — conferma topologica ────────────────────────────────────────────

class UnionFind {
  private parent = new Map<number, number>()

  find(x: number): number {
    if (!this.parent.has(x)) this.parent.set(x, x)
    let root = x
    while (this.parent.get(root) !== root) root = this.parent.get(root)!
    let cur = x
    while (cur !== root) {
      const next = this.parent.get(cur)!
      this.parent.set(cur, root)
      cur = next
    }
    return root
  }

  union(a: number, b: number) {
    const ra = this.find(a), rb = this.find(b)
    if (ra !== rb) this.parent.set(ra, rb)
  }
}

function componentLengthBonus(lenM: number): number {
  if (lenM > 5000) return 25
  if (lenM >= 1000) return 15
  if (lenM >= 300) return 5
  return 0
}

function densityBonus(count: number): number {
  if (count > 10) return 15
  if (count >= 6) return 10
  if (count >= 3) return 5
  return 0
}

const DENSITY_RADIUS_M = 200
// ~200m in gradi di latitudine — usata solo per il bucketing spaziale (candidati da verificare con
// haversine reale), non come unità di misura: evita un confronto O(n²) tra tutti gli archi.
const DENSITY_CELL_DEG = 0.0018

function computeDensityCounts(edges: ScoredEdge[]): number[] {
  const buckets = new Map<string, number[]>()
  const cellOf = (v: number) => Math.floor(v / DENSITY_CELL_DEG)

  edges.forEach((e, i) => {
    const key = `${cellOf(e.midLat)}_${cellOf(e.midLon)}`
    const bucket = buckets.get(key)
    if (bucket) bucket.push(i); else buckets.set(key, [i])
  })

  return edges.map((e, i) => {
    const latCell = cellOf(e.midLat), lonCell = cellOf(e.midLon)
    let count = 0
    for (let dLat = -1; dLat <= 1; dLat++) {
      for (let dLon = -1; dLon <= 1; dLon++) {
        const bucket = buckets.get(`${latCell + dLat}_${lonCell + dLon}`)
        if (!bucket) continue
        for (const j of bucket) {
          if (j === i) continue
          if (haversineM(e.midLat, e.midLon, edges[j].midLat, edges[j].midLon) <= DENSITY_RADIUS_M) count++
        }
      }
    }
    return count
  })
}

function applyTopologyScore(edges: ScoredEdge[]) {
  // isUrbanTransfer fuori dal sottografo: senza, una via di paese senza il subtag
  // footway=sidewalk (es. "Via delle Focaiole") resta comunque dentro HIKING_HIGHWAY per tag, e
  // essendo fisicamente connessa alla stessa rete del sentiero vero propaga componente/densità a
  // tutto il centro abitato che attraversa — lo stesso identico problema che questa fase dovrebbe
  // risolvere per i sentieri poco taggati, ma applicato a un tratto urbano.
  const hikingEdges = edges.filter(e => !e.excluded && !e.isUrbanTransfer && HIKING_HIGHWAY.has(e.highway))
  if (hikingEdges.length === 0) return

  const uf = new UnionFind()
  for (const e of hikingEdges) uf.union(e.fromNodeId, e.toNodeId)

  const componentLength = new Map<number, number>()
  for (const e of hikingEdges) {
    const root = uf.find(e.fromNodeId)
    componentLength.set(root, (componentLength.get(root) ?? 0) + e.distM)
  }

  const densities = computeDensityCounts(hikingEdges)

  hikingEdges.forEach((e, i) => {
    const root = uf.find(e.fromNodeId)
    e.topologyScore = componentLengthBonus(componentLength.get(root) ?? 0) + densityBonus(densities[i])
  })
}

// ── Overpass fetch (3 query separate e mirate, non un'unica mega-query — coerente con lo stile
// del resto del modulo Overpass: una query pesante che concentra tutto rischia più facilmente il
// 504 di tre query più piccole in parallelo). ──────────────────────────────────────────────────

interface OverpassNodeEl { type: 'node'; id: number; lat: number; lon: number; tags?: Record<string, string> }
interface OverpassWayEl { type: 'way'; id: number; nodes: number[]; tags?: Record<string, string> }
type OverpassNetworkEl = OverpassNodeEl | OverpassWayEl

interface TaggedNetwork {
  nodes: Map<number, { lat: number; lon: number }>
  ways: Array<{ id: number; nodeIds: number[]; tags: Record<string, string> }>
}

async function fetchTaggedNetwork(bbox: Bbox): Promise<TaggedNetwork> {
  const query = `[out:json][timeout:25][maxsize:536870912];
way["highway"~"^(${WALKABLE_HIGHWAY})$"]["access"!~"^(private|no)$"](${bboxStr(bbox)});
(._;>;);
out body qt;`

  const json = await fetchOverpass<{ elements: OverpassNetworkEl[] }>(query, 25_000)
  const elements = json.elements ?? []

  const nodes = new Map<number, { lat: number; lon: number }>()
  const ways: TaggedNetwork['ways'] = []
  for (const el of elements) {
    if (el.type === 'node') nodes.set(el.id, { lat: el.lat, lon: el.lon })
    else if (el.type === 'way' && el.nodes.length >= 2) ways.push({ id: el.id, nodeIds: el.nodes, tags: el.tags ?? {} })
  }
  return { nodes, ways }
}

async function fetchHikingRelations(bbox: Bbox): Promise<OsmRelation[]> {
  const query = `[out:json][timeout:20][maxsize:268435456];
relation["route"~"^(hiking|foot)$"](${bboxStr(bbox)});
out body qt;`
  const json = await fetchOverpass<{ elements: OsmRelation[] }>(query, 20_000)
  return (json.elements ?? []).filter(e => e.type === 'relation')
}

interface OverpassBoundedEl { type: 'way' | 'relation'; id: number; tags?: Record<string, string>; bounds?: { minlat: number; minlon: number; maxlat: number; maxlon: number } }
interface OverpassPlaceEl { type: 'node'; id: number; lat: number; lon: number }
type OverpassContextEl = OverpassBoundedEl | OverpassPlaceEl

async function fetchContextFeatures(bbox: Bbox): Promise<{ areas: ProtectedArea[]; placeNodes: PoiPoint[] }> {
  const b = bboxStr(bbox)
  const query = `[out:json][timeout:20][maxsize:268435456];
(
  relation["boundary"="national_park"](${b});
  relation["boundary"="protected_area"](${b});
  way["boundary"="protected_area"](${b});
  relation["leisure"="nature_reserve"](${b});
  way["leisure"="nature_reserve"](${b});
);
out tags bb qt;
node["place"~"^(city|town|village|hamlet)$"](${b});
out qt;`

  const json = await fetchOverpass<{ elements: OverpassContextEl[] }>(query, 20_000)
  const elements = json.elements ?? []

  const areas: ProtectedArea[] = []
  const placeNodes: PoiPoint[] = []
  for (const el of elements) {
    if (el.type === 'node') { placeNodes.push({ lat: el.lat, lon: el.lon }); continue }
    if (!el.bounds) continue
    const t = el.tags ?? {}
    const areaBbox: Bbox = [el.bounds.minlat, el.bounds.minlon, el.bounds.maxlat, el.bounds.maxlon]
    let tier: ProtectedAreaTier
    if (t.boundary === 'national_park') tier = 'nationalPark'
    else if (t.leisure === 'nature_reserve') tier = 'natureReserve'
    // Nessuna convenzione OSM univoca per distinguere SIC/ZSC da un parco regionale generico in
    // Italia — protect_class=97 (Natura 2000) è la miglior approssimazione disponibile, non garantita.
    else if (t.protect_class === '97') tier = 'sicZsc'
    else tier = 'protectedGeneric'
    areas.push({ tier, bbox: areaBbox })
  }
  return { areas, placeNodes }
}

// ── Orchestrazione ───────────────────────────────────────────────────────────

export interface ScoredEdge {
  fromNodeId: number
  toNodeId: number
  wayId: number
  distM: number
  midLat: number
  midLon: number
  highway: string
  tags: Record<string, string>
  excluded: boolean
  relationScore: number
  wayScore: number
  contextScore: number
  urbanPenalty: number
  // Attraversamento urbano di un percorso escursionistico (es. una via di paese): fa parte
  // dell'itinerario (relationScore intatto) ma non conta come sentiero fisico né come nodo della
  // rete escursionistica ai fini della topologia (vedi applyTopologyScore).
  isUrbanTransfer: boolean
  topologyScore: number
  // Quanto l'arco appartiene a una rete escursionistica riconosciuta (relation + topologia).
  networkScore: number
  // Quanto l'arco è FISICAMENTE un sentiero (tag della way + contesto + penalità urbane) —
  // indipendente dall'appartenenza a una rete: è questo il punteggio usato per il tier finale.
  trailScore: number
  finalScore: number
}

export interface HikingProbabilityContext {
  /** Il bbox è vicino a una costa — attenua il bonus surface=sand (spiaggia vs sentiero). */
  nearCoast?: boolean
  /** POI già noti al chiamante (picchi, sorgenti, grotte, rovine...) per il bonus di prossimità. */
  pois?: PoiPoint[]
}

export interface HikingProbabilityResult {
  edges: ScoredEdge[]
}

export async function computeHikingProbability(
  bbox: Bbox,
  ctx: HikingProbabilityContext = {},
): Promise<HikingProbabilityResult> {
  const [network, relations, context] = await Promise.all([
    fetchTaggedNetwork(bbox),
    fetchHikingRelations(bbox),
    fetchContextFeatures(bbox),
  ])

  // way id -> punteggio della miglior relation di cui è membro (max, non somma: una way membro di
  // più relation non deve essere premiata più volte per lo stesso segnale).
  const wayRelationScore = new Map<number, RelationScoreInfo>()
  for (const rel of relations) {
    const tags = rel.tags ?? {}
    const info: RelationScoreInfo = { score: scoreRelationTags(tags), isRouteFoot: tags.route === 'foot' }
    for (const m of rel.members ?? []) {
      if (m.type !== 'way') continue
      const prev = wayRelationScore.get(m.ref)
      if (!prev || info.score > prev.score) wayRelationScore.set(m.ref, info)
    }
  }

  const edges: ScoredEdge[] = []
  for (const way of network.ways) {
    const excluded = isExcluded(way.tags)
    const relInfo = wayRelationScore.get(way.id)

    for (let i = 0; i < way.nodeIds.length - 1; i++) {
      const a = network.nodes.get(way.nodeIds[i])
      const b = network.nodes.get(way.nodeIds[i + 1])
      if (!a || !b) continue
      const distM = haversineM(a.lat, a.lon, b.lat, b.lon)
      if (distM <= 0) continue

      const midLat = (a.lat + b.lat) / 2
      const midLon = (a.lon + b.lon) / 2

      let relationScore = 0
      let wayScore = 0
      let contextScore = 0
      let urbanPenalty = 0
      let isUrbanTransfer = false

      if (!excluded) {
        const distToSettlement = nearestDistM(midLat, midLon, context.placeNodes)
        const isNearSettlement = distToSettlement <= SETTLEMENT_PROXIMITY_M

        relationScore = relInfo?.score ?? 0
        if (relInfo?.isRouteFoot && !isNearSettlement) relationScore += 25

        wayScore = scoreWayTags(way.tags, !!ctx.nearCoast)
        contextScore = scoreProtectedAreas(midLat, midLon, context.areas) + scorePoiProximity(midLat, midLon, ctx.pois ?? [])
        urbanPenalty = computeUrbanPenalty(way.tags, isNearSettlement)
        isUrbanTransfer = isUrbanTransferWay(way.tags, isNearSettlement)
      }

      edges.push({
        fromNodeId: way.nodeIds[i],
        toNodeId: way.nodeIds[i + 1],
        wayId: way.id,
        distM,
        midLat,
        midLon,
        highway: way.tags.highway ?? '',
        tags: way.tags,
        excluded,
        relationScore,
        wayScore,
        contextScore,
        urbanPenalty,
        isUrbanTransfer,
        topologyScore: 0,
        networkScore: 0,
        trailScore: 0,
        finalScore: 0,
      })
    }
  }

  applyTopologyScore(edges)

  for (const e of edges) {
    if (e.excluded) continue
    e.networkScore = e.relationScore + e.topologyScore
    e.trailScore = e.wayScore + e.contextScore + e.urbanPenalty
    e.finalScore = e.networkScore + e.trailScore
  }

  return { edges }
}

// ── Classificazione ──────────────────────────────────────────────────────────
//
// Applicata a trailScore, non a finalScore: appartenere a una rete riconosciuta (networkScore) fa
// includere un arco, ma il tier deve rispondere "è fisicamente un sentiero?", non "fa parte di un
// percorso?" — altrimenti una via di paese ben collegata alla rete torna a sembrare "quasi certo"
// solo per la sua appartenenza, esattamente il problema che questa fase corregge.

export type HikingProbabilityTier = 'quasi_certo' | 'molto_probabile' | 'possibile' | 'improbabile'

export function classifyTrailScore(trailScore: number): HikingProbabilityTier {
  if (trailScore >= 150) return 'quasi_certo'
  if (trailScore >= 80) return 'molto_probabile'
  if (trailScore >= 40) return 'possibile'
  return 'improbabile'
}
