// Legge la rete percorribile OSM (sentieri, tracciati, strade bianche, strade minori) di un bbox
// come un grafo navigabile — a differenza di lib/overpassTrails.ts, che cerca solo relation
// route=hiking per nome, qui servono le way generiche con i node id (non solo la geometria), così
// i nodi condivisi tra way diverse restano visibili come intersezioni reali della rete stradale.
import { OVERPASS_ENDPOINTS } from '@/lib/overpassTrails'
import { haversineM, simplifyPolyline, nearestPointOnSegment } from '@/lib/geoUtils'
import { mapOsmSacScale } from '@/lib/osm/sacScale'

// Tag highway ammessi: sentieri/tracciati/carrarecce (comprese le "strade bianche", tipicamente
// track/unclassified) più residential — necessario perché un punto di partenza scelto in un paese
// (il caso più comune) è spesso collegato ai sentieri veri fuori centro abitato proprio tramite le
// sue strade residenziali: escluderle del tutto (come in una versione precedente, per contenere il
// tempo di risposta di Overpass) lasciava il nodo di partenza agganciato a un frammento di rete
// isolato, senza nessun cammino reale verso nessun altro punto — la generazione falliva sempre,
// non per dati scarsi ma per grafo disconnesso.
// tertiary/secondary aggiunti per lo stesso motivo, un livello più in su: due paesi diversi (non
// un punto di partenza e i sentieri nei dintorni, il caso sopra) sono quasi sempre collegati SOLO
// da una strada provinciale ("SP..."), tipicamente taggata tertiary o secondary in OSM, mai da
// residential/unclassified (che restano interni al singolo paese) né da un sentiero. Escluderli
// lasciava paesi realmente raggiungibili a piedi (la personalizzazione multi-tappa di un Borgo/
// Città, lib/routeBuilder/multiStopRoute.ts, sceglie tappe che sono spesso paesi diversi) senza
// NESSUN arco che li collegasse nel grafo scaricato — non un limite di ricerca (Dijkstra non trova
// un cammino che non è mai stato scaricato), un buco nei dati fetchati. Le strade davvero maggiori
// (motorway/primary/trunk) restano escluse insieme a `service` (accessi/parcheggi interni,
// numerosissimi e non utili) e agli accessi privati/vietati — troppo trafficate per un pedone,
// mai l'unica via reale fra due paesi vicini in area rurale.
// pedestrian/living_street aggiunti per lo stesso identico motivo, stavolta dentro un centro
// storico: una piazza o un vicolo pedonale italiano è quasi sempre taggato così in OSM, MAI
// residential/unclassified — un punto di interesse (Chiesa, palazzo) affacciato su una di queste
// vie restava con l'aggancio alla rete riuscito (un nodo vicino esiste) ma isolato da tutto il
// resto, perché la via che lo collegava al resto del paese non era mai stata scaricata — stesso
// sintomo del buco tertiary/secondary sopra (due punti vicinissimi, "nessun cammino trovato", non
// "troppo lontano dalla rete"), stavolta all'interno di un solo centro abitato invece che fra due.
const WALKABLE_HIGHWAY = 'path|track|footway|bridleway|steps|unclassified|residential|tertiary|secondary|pedestrian|living_street'

// Il filtro sul tag `access` da solo esclude in blocco anche le vie di una Zona a Traffico
// Limitato taggate `access=private` (comune per le ZTL dei centri storici) — un tag che per
// convenzione OSM si applica di default A TUTTI i modi di trasporto, pedoni compresi, ma che nella
// pratica i mappatori italiani usano quasi sempre per restringere SOLO i veicoli (l'accesso
// pedonale a una ZTL è quasi sempre libero). Un router pedonale deve quindi guardare il tag `foot`
// quando presente — più specifico, prevale sempre su `access` per convenzione OSM — e ripiegare su
// `access` solo quando `foot` non è taggato affatto: unione di due filtri invece di uno solo,
// Overpass QL non supporta un "coalesce" fra tag in un singolo filtro.
const WALKABLE_ACCESS_FILTER =
  '["access"!~"^(private|no)$"]["foot"!~"^(private|no)$"]'
const WALKABLE_FOOT_OVERRIDE_FILTER = '["foot"~"^(yes|permissive|designated)$"]'

// Bump ad ogni cambio della query stessa (WALKABLE_HIGHWAY, i filtri di accesso sopra, o
// qualunque altro filtro dentro fetchWalkNetwork sotto, INCLUSA stitchNearbyEndpoints/
// bridgeDisconnectedComponents — cambia la forma del grafo restituito, non solo la query Overpass)
// — lib/routeBuilder/walkNetworkCache.ts lo include nella chiave di cache proprio perché la chiave
// è altrimenti solo il bbox: senza questo, una rete già in cache da PRIMA di un cambio di filtro
// (es. l'aggiunta di tertiary/secondary, o di pedestrian/living_street sopra) resterebbe servita
// così com'era, con lo stesso identico buco nei dati che il cambio doveva risolvere, fino alla
// scadenza naturale della cache (45gg) — un fix silenziosamente inefficace per qualunque bbox già
// visitato. v5: aggiunta bridgeDisconnectedComponents sotto (verifica utente, Chieti — un bbox già
// in cache da PRIMA di questo fix resterebbe altrimenti scollegato per altri 45 giorni). v6:
// bridgeDisconnectedComponents ricostruita (verifica utente, Agrigento — un bug di prestazioni e
// una correzione di correttezza sulla stessa funzione, entrambi capaci di cambiare quali ponti
// vengono trovati) — un bbox già in cache da un deploy intermedio fra i due fix andrebbe altrimenti
// servito con la ricucitura sbagliata per altri 45 giorni.
export const WALK_NETWORK_QUERY_VERSION = 6

export interface GraphNode {
  lat: number
  lon: number
  edges: GraphEdge[]
  /** Quota reale (m), popolata best-effort dopo il fetch (Fase 7 di
   *  docs/navigator-orizzonti-roadmap.md, lib/dtm/graphElevation.ts) — assente su un nodo appena
   *  scaricato o su un grafo persistito prima di questa fase. Mai richiesta al momento del
   *  fetch stesso: il DTM è rate-limited, va cache-ata una volta sola a valle. */
  elevM?: number
}

export interface GraphEdge {
  to: number
  distM: number
  wayId: number
  highway?: string
  // DTREK-AUDIT.md P0 #10 — già presenti sui tag della way scaricata per il grafo (nessuna nuova
  // query Overpass), semplicemente mai letti finora oltre a `highway`. sacScale è già mappato a
  // T1-T6 (vedi lib/osm/sacScale.ts), non il valore OSM grezzo.
  sacScale?: string
  ford?: boolean
}

export interface WalkNetwork {
  nodes: Map<number, GraphNode>
}

interface OverpassNodeEl {
  type: 'node'
  id: number
  lat: number
  lon: number
}

interface OverpassWayEl {
  type: 'way'
  id: number
  nodes: number[]
  tags?: Record<string, string>
}

type OverpassEl = OverpassNodeEl | OverpassWayEl

function addEdge(nodes: Map<number, GraphNode>, fromId: number, toId: number, wayId: number, highway?: string, sacScale?: string, ford?: boolean) {
  const from = nodes.get(fromId)
  const to = nodes.get(toId)
  if (!from || !to) return
  const distM = haversineM(from.lat, from.lon, to.lat, to.lon)
  if (distM <= 0) return
  from.edges.push({ to: toId, distM, wayId, highway, sacScale, ford })
  to.edges.push({ to: fromId, distM, wayId, highway, sacScale, ford })
}

interface OverpassNetworkResponse { elements: OverpassEl[]; remark?: string }

async function fetchOverpassNetworkOnce(endpoint: string, query: string, timeoutMs: number): Promise<OverpassNetworkResponse> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new Error(`status ${res.status}`)
  return res.json()
}

/**
 * Verifica utente ("gli itinerari sono tornati in linea d'aria", anche dopo aver alzato
 * WALK_NETWORK_TIMEOUT_MS a 45s) — causa reale trovata sui dati: lib/overpassTrails.ts's
 * fetchOverpass fa una Promise.any fra i 3 mirror, "il primo che risponde vince". Ottimo per una
 * query leggera dove ogni mirror o fallisce o restituisce la stessa risposta completa — sbagliato
 * per QUESTA query (la rete pedonale di un centro storico denso, spesso al limite del [timeout:]
 * interno di Overpass): un mirror può rispondere PRIMA degli altri proprio perché ha rinunciato
 * prima, restituendo una rete PARZIALE (HTTP 200, `remark` valorizzato) — la corsa premiava sempre
 * il mirror più "pigro", anche quando un altro stava per restituire la rete COMPLETA solo qualche
 * secondo dopo. allSettled aspetta ogni mirror fino al proprio timeoutMs (già applicato per
 * richiesta, quindi nessun costo aggiuntivo nel caso peggiore rispetto a prima), poi sceglie la
 * risposta migliore fra quelle arrivate: una completa se ce n'è almeno una, altrimenti la parziale
 * con più elementi — mai la prima e basta.
 */
async function fetchWalkNetworkOnceAcrossMirrors(query: string, timeoutMs: number): Promise<OverpassNetworkResponse | null> {
  const settled = await Promise.allSettled(
    OVERPASS_ENDPOINTS.map(endpoint => fetchOverpassNetworkOnce(endpoint, query, timeoutMs)),
  )
  const results = settled
    .filter((r): r is PromiseFulfilledResult<OverpassNetworkResponse> => r.status === 'fulfilled')
    .map(r => r.value)
  if (results.length === 0) return null
  const complete = results.find(r => !r.remark)
  return complete ?? results.reduce((best, r) => (r.elements.length > best.elements.length ? r : best))
}

/**
 * Verifica utente (Sirmione, log Vercel: "Overpass non disponibile" — i 3 mirror avevano TUTTI
 * rifiutato la richiesta, non solo risposto parziale) — passando da fetchOverpass (lib/
 * overpassTrails.ts) alla scelta "risposta migliore" sopra si era perso anche il SUO singolo
 * retry dopo una breve pausa, che copriva proprio questo caso: un rifiuto simultaneo dei 3 mirror
 * pubblici è quasi sempre un throttling/hiccup transitorio lato loro (traffico da IP datacenter),
 * mai un errore permanente affidabile dopo un solo giro in parallelo. Un secondo giro, stessa
 * pausa di fetchOverpass, prima di arrendersi davvero (→ linea d'aria in fetchWalkNetworkForPoints,
 * lib/routeBuilder/borgoWalkLegs.ts, mai un errore che fa fallire l'intero itinerario).
 */
async function fetchWalkNetworkRaw(query: string, timeoutMs: number): Promise<OverpassNetworkResponse> {
  const first = await fetchWalkNetworkOnceAcrossMirrors(query, timeoutMs)
  if (first) return first
  await new Promise(r => setTimeout(r, 1200))
  const second = await fetchWalkNetworkOnceAcrossMirrors(query, timeoutMs)
  if (second) return second
  throw new Error('Overpass non disponibile')
}

/**
 * Scarica ed espande in un grafo in memoria la rete percorribile in un bbox
 * [minLat, minLon, maxLat, maxLon]. Ogni way viene spezzata negli archi tra i suoi node
 * consecutivi — i node condivisi da più way (le intersezioni reali sul terreno) collegano
 * automaticamente i due tratti, senza bisogno di calcoli geometrici di prossimità.
 */
// `timeoutMs`, opzionale: il chiamante sceglie in base al proprio budget residuo (vedi
// maxDuration del proprio endpoint) — 18s per default, il valore storico condiviso da tutti i
// chiamanti finché era l'unico usato (app/api/route-build/route.ts, che a valle deve ancora
// lasciare margine a pathfinding e arricchimento DTM/POI). app/api/borgo-itinerary/route.ts non
// ha stage pesanti a valle (solo Dijkstra per tappa, già limitato da DIJKSTRA_MAX_NODES) e passa
// un valore più alto: un fetch a freddo di questa query, quella più lenta e più spesso causa di
// ripiego su linee d'aria, ha così più margine per riuscire prima di arrendersi.
export async function fetchWalkNetwork(bbox: [number, number, number, number], timeoutMs = 18_000): Promise<WalkNetwork> {
  const [minLat, minLon, maxLat, maxLon] = bbox
  // DTREK-AUDIT.md P0 #10 — "out skel qt" (verbosità precedente) NON include mai i tag delle way,
  // solo id/skeleton: el.tags?.highway era quindi sempre undefined, e con esso anche
  // pathHasSteps/hasSteps (bug preesistente, mai notato perché "nessuno scalino rilevato" è
  // indistinguibile da "davvero nessuno scalino" senza guardare il codice). "out body qt" include
  // i tag — stessa identica combinazione filtro/bbox già usata con successo in produzione da
  // lib/routeBuilder/hikingProbability.ts::fetchTaggedNetwork (lì con [timeout:25] anziché 18, ma
  // il costo lato server di trovare le way corrispondenti è identico: cambia solo la
  // serializzazione/il trasferimento, non la ricerca) — stesso pattern, non una query nuova. Il
  // tetto lato server della query segue timeoutMs (in secondi, arrotondato per difetto) invece di
  // un valore fisso, così il client non chiude la connessione prima che Overpass stesso rinunci.
  // Union di due filtri (vedi WALKABLE_ACCESS_FILTER/WALKABLE_FOOT_OVERRIDE_FILTER sopra) invece
  // di un solo `way[...]`: la seconda metà recupera le vie che la prima esclude per `access`
  // generico ma che un tag `foot` esplicito rende comunque percorribili a piedi (le ZTL dei centri
  // storici, tipicamente). `(._;>;);` sotto funziona identico su una union di più way — stessa
  // sintassi già usata per un singolo statement, Overpass la accetta indifferentemente.
  const query = `[out:json][timeout:${Math.floor(timeoutMs / 1000)}][maxsize:536870912];
(
way["highway"~"^(${WALKABLE_HIGHWAY})$"]${WALKABLE_ACCESS_FILTER}(${minLat},${minLon},${maxLat},${maxLon});
way["highway"~"^(${WALKABLE_HIGHWAY})$"]${WALKABLE_FOOT_OVERRIDE_FILTER}(${minLat},${minLon},${maxLat},${maxLon});
);
(._;>;);
out body qt;`

  // Timeout client allineato al [timeout:] della query, applicato per-mirror (vedi
  // fetchWalkNetworkRaw sopra) — il caso peggiore resta timeoutMs, mai un multiplo: nessun retry
  // sequenziale qui, i 3 mirror sono già interrogati in parallelo.
  const json = await fetchWalkNetworkRaw(query, timeoutMs)
  const elements = json.elements ?? []
  // `remark` compare SOLO quando OGNI mirror che ha risposto ha comunque interrotto la query prima
  // di finirla (fetchWalkNetworkRaw sopra ha già preferito una risposta completa quando almeno un
  // mirror l'ha restituita) — la risposta resta comunque HTTP 200 con qualunque elemento raccolto
  // fino a quel momento. Nessun modo affidabile di distinguere qui "parziale ma sufficiente per il
  // bbox richiesto" da "parziale e con un buco proprio dove serviva" — solo segnalarlo, non
  // correggerlo oltre: vedi §4 punto 3 di docs/crea-guida-itinerario-personalizzato-stato.md.
  if (json.remark) {
    console.warn('[osmGraph] risposta Overpass parziale/incompleta per bbox (nessun mirror ha risposto completo)', bbox, '-', json.remark)
  }

  // Verificato dal vivo su un itinerario Borgo/Città a più tappe (Viterbo): il bbox è quello
  // dell'INTERO itinerario (tutte le tappe, non una sola giornata), con lo stesso padding usato
  // per un Sentiero — copre l'intero centro storico, restituendo un numero di elementi ben oltre
  // qualunque corridoio di un Sentiero già visto dal vivo (Chieti, il caso più grande finora
  // documentato: 8345 nodi, già una volta causa di un rallentamento di diversi secondi in
  // bridgeDisconnectedComponents prima che quella funzione venisse limitata ai soli nodi di
  // minoranza — vedi il suo commento). Un centro storico intero, con ogni via/vicolo pedonale
  // tracciato, moltiplica quel numero di un ordine di grandezza: costruire la mappa nodi/archi e
  // poi ricucire (stitchNearbyEndpoints/bridgeDisconnectedComponents sotto) su un grafo così
  // grande blocca il thread principale abbastanza a lungo da far comparire il dialogo "la pagina
  // non risponde" del browser. Questo grafo resta un arricchimento best-effort per Map Matching/
  // l'Escape Engine (entrambi degradano già al solo percorso pianificato senza di esso, mai un
  // errore bloccante per la navigazione) — sopra questa soglia si rinuncia a costruirlo invece di
  // rischiare di bloccare l'avvio della navigazione per un centro storico intero.
  const MAX_ELEMENTS = 20_000
  if (elements.length > MAX_ELEMENTS) {
    throw new Error(`Rete OSM troppo grande per il grafo pedonale (${elements.length} elementi, tetto ${MAX_ELEMENTS})`)
  }

  const nodes = new Map<number, GraphNode>()
  for (const el of elements) {
    if (el.type === 'node') nodes.set(el.id, { lat: el.lat, lon: el.lon, edges: [] })
  }

  for (const el of elements) {
    if (el.type !== 'way' || !el.nodes || el.nodes.length < 2) continue
    const sacScale = mapOsmSacScale(el.tags?.sac_scale) ?? undefined
    // "no" è un valore esplicito valido per il tag ford (nessun guado) — solo qualunque altro
    // valore presente (yes, stepping_stones, ...) conta come guado reale.
    const ford = el.tags?.ford != null && el.tags.ford !== 'no'
    for (let i = 0; i < el.nodes.length - 1; i++) {
      addEdge(nodes, el.nodes[i], el.nodes[i + 1], el.id, el.tags?.highway, sacScale, ford)
    }
  }

  stitchNearbyEndpoints(nodes)
  bridgeDisconnectedComponents(nodes)

  return { nodes }
}

// Verifica utente (Sirmione, "ancora linea d'aria" — confermato con Dijkstra su dati reali, non
// un limite di SNAP_THRESHOLD_M/DIJKSTRA_MAX_DIST_M: entrambi gli estremi agganciano un nodo della
// rete a pochi metri, ma quel nodo NON RAGGIUNGE l'altro con nessuna distanza, perché appartengono
// a due componenti del grafo scollegate fra loro). Causa reale: due way OSM che si toccano o si
// incrociano sul terreno senza condividere un node — un artefatto comune di digitalizzazione
// (un marciapiede digitalizzato separatamente dalla strada che costeggia, un sentiero che sfiora
// una via senza un vero incrocio mappato) — mai risolvibile allargando la soglia di aggancio o il
// raggio Dijkstra, perché il grafo scaricato non ha proprio l'arco che li collegherebbe.
// Qui si aggiunge un arco "virtuale" fra coppie di node abbastanza vicini sul terreno (pochi metri,
// ben sotto la precisione GPS/di digitalizzazione tipica) che il grafo non collega già — SOLO fra
// node a bassa valenza (<= MAX_STITCH_DEGREE archi originali): un vero incrocio già mappato (una
// piazza con 5+ vie) non ha bisogno di altre scorciatoie, i candidati sono le estremità di way
// isolate, dove un buco come questo può davvero esistere. Griglia spaziale invece di un confronto
// O(n²) fra tutti i node — con qualche migliaio di node per bbox (il caso comune) il costo resta
// lineare.
const STITCH_THRESHOLD_M = 15
const MAX_STITCH_DEGREE = 3
const STITCH_CELL_DEG = 0.0003 // ~33m in latitudine, abbastanza per contenere STITCH_THRESHOLD_M in una cella adiacente

export function stitchNearbyEndpoints(nodes: Map<number, GraphNode>): void {
  const cellKey = (lat: number, lon: number) => `${Math.floor(lat / STITCH_CELL_DEG)}_${Math.floor(lon / STITCH_CELL_DEG)}`
  const grid = new Map<string, number[]>()
  const candidates: [number, GraphNode][] = []
  for (const entry of Array.from(nodes)) {
    const [, node] = entry
    if (node.edges.length > MAX_STITCH_DEGREE) continue
    candidates.push(entry)
    const k = cellKey(node.lat, node.lon)
    const bucket = grid.get(k)
    if (bucket) bucket.push(entry[0])
    else grid.set(k, [entry[0]])
  }

  for (const [id, node] of candidates) {
    const cx = Math.floor(node.lat / STITCH_CELL_DEG)
    const cy = Math.floor(node.lon / STITCH_CELL_DEG)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = grid.get(`${cx + dx}_${cy + dy}`)
        if (!bucket) continue
        for (const otherId of bucket) {
          if (otherId <= id) continue // ogni coppia una sola volta
          const other = nodes.get(otherId)!
          if (node.edges.some(e => e.to === otherId)) continue // già collegati (stessa way o incrocio reale)
          const distM = haversineM(node.lat, node.lon, other.lat, other.lon)
          if (distM > STITCH_THRESHOLD_M) continue
          node.edges.push({ to: otherId, distM, wayId: -1, highway: 'stitch' })
          other.edges.push({ to: id, distM, wayId: -1, highway: 'stitch' })
        }
      }
    }
  }
}

// Verifica utente (Chieti, place id eb07bfac-e861-484c-bb4c-acca63838e3f) — confermato sui dati
// reali (walk_network_cache id=69, 8345 nodi): "Terme romane di Chieti" cade su un frammento
// isolato di sole 3 node, staccato dal resto della rete (7269 nodi) da un varco di ~56m — la
// stessa causa di stitchNearbyEndpoints sopra (due way che non condividono un node), ma un varco
// troppo largo per STITCH_THRESHOLD_M=15 (pensato per un buco di digitalizzazione di pochi metri,
// Sirmione ~8m, non per un frammento OSM realmente isolato di decine di metri). Alzare
// STITCH_THRESHOLD_M stesso per farlo passare significherebbe applicare quella soglia più ampia a
// OGNI coppia di nodi a bassa valenza della rete, rischiando di inventare scorciatoie fra way
// vicine ma reciprocamente irraggiungibili per un motivo reale (un fiume, un dislivello, un varco
// senza attraversamento) — un rischio molto più concreto quando la soglia sale da 15 a oltre 50m.
// Qui la soglia più ampia si applica SOLO fra componenti del grafo altrimenti del tutto scollegate
// (mai fra due nodi già raggiungibili l'uno dall'altro, quale che sia la distanza reale del
// percorso) — e limitata all'UNICO ponte più corto necessario a riunirle, mai una scorciatoia in
// più su una rete già connessa. Approccio stile Kruskal (minimum bridging forest): si valutano
// tutti i ponti candidati entro COMPONENT_BRIDGE_MAX_M in ordine di distanza crescente, applicando
// solo quelli che uniscono due componenti ancora distinte — un varco più corto già ricucito rende
// ridondante (mai dannoso) un secondo ponte più lungo fra le stesse due componenti.
// Snap alla via più vicina (nearestPointOnSegment, lib/geoUtils.ts) invece che al solo nodo più
// vicino — l'approccio standard di un router pedonale OSM per agganciare un punto alla rete: il
// punto più vicino di un frammento isolato cade spesso a metà di un arco esistente dell'altra
// componente (un marciapiede che sfiora il centro di un tratto di strada, non uno dei suoi due
// estremi), non su uno dei suoi node — agganciare solo ai node (come stitchNearbyEndpoints)
// richiederebbe una soglia ancora più larga per lo stesso identico varco fisico.
const COMPONENT_BRIDGE_MAX_M = 220
// Verifica utente — un tentativo di stringere questa cella a 0.0032 (il minimo teoricamente
// sufficiente per COMPONENT_BRIDGE_MAX_M, calcolato dal solo margine cella>=soglia) ha fatto perdere
// dei ponti validi sui dati reali di Chieti (8351/8368 raggiungibili invece di tutti): un arco lungo
// (fra due node distanti, non infrequente su una via poco digitalizzata) è indicizzato SOLO sulla
// cella dei suoi due estremi, mai sulle celle che il segmento attraversa in mezzo — un candidato
// vicino al centro di un arco simile ma lontano da entrambi i suoi estremi può cadere in una cella
// che l'intorno 3×3 del candidato non arriva a coprire, quale che sia il margine teorico su un
// singolo punto. Tornare a 0.004 (stesso rapporto cella/soglia di STITCH_CELL_DEG, ~440m) elimina
// il problema con un margine ben più ampio del minimo — verificato senza nodi orfani su tutti i
// bbox reali già testati (Chieti, Sirmione, Porto Torres, Pescara).
const COMPONENT_BRIDGE_CELL_DEG = 0.004

class UnionFind {
  private parent = new Map<number, number>()
  find(x: number): number {
    const p = this.parent.get(x)
    if (p == null) { this.parent.set(x, x); return x }
    if (p !== x) {
      const root = this.find(p)
      this.parent.set(x, root)
      return root
    }
    return p
  }
  union(a: number, b: number): void {
    const ra = this.find(a), rb = this.find(b)
    if (ra !== rb) this.parent.set(ra, rb)
  }
}

export function bridgeDisconnectedComponents(nodes: Map<number, GraphNode>): void {
  if (nodes.size === 0) return

  const uf = new UnionFind()
  for (const [id, node] of Array.from(nodes)) {
    uf.find(id)
    for (const e of node.edges) uf.union(id, e.to)
  }
  // Verifica utente (Agrigento — "sembra lentissimo") — confermato sui dati reali già raccolti per
  // Chieti/Sirmione/Pescara: senza la restrizione sotto, bridgeDisconnectedComponents impiegava
  // fino a 8 SECONDI su una rete di 8345 node, perché "solo node a bassa valenza" da solo non basta
  // a restringere i CANDIDATI di partenza — la stragrande maggioranza dei node di una qualunque
  // rete stradale ha grado 2 (un punto intermedio qualunque lungo una via, non solo l'estremità di
  // un frammento isolato): il 71% dei node di Chieti passava il filtro (5890/8345), ciascuno a
  // scandagliare un intorno di ~1.3km×1.3km (COMPONENT_BRIDGE_CELL_DEG, molto più ampio dei ~100m
  // di STITCH_CELL_DEG) — un costo che stitchNearbyEndpoints non paga proprio perché la sua cella è
  // piccola, non perché il suo filtro di grado sia più stretto. La vera proprietà che rende un node
  // un candidato utile da cui CERCARE un ponte è appartenere a una componente DIVERSA da quella
  // principale (quella con più node): un node già nella componente principale non ha mai bisogno
  // di iniziare la ricerca da sé stesso. Attenzione però (verificato sui dati reali, un primo
  // tentativo di scartare interamente i node della componente principale aveva perso alcuni ponti
  // validi): un ponte può benissimo avere il suo punto più vicino su un ARCO principale ma vicino a
  // un ESTREMO che è proprio un node della componente principale — nearestPointOnSegment(punto,
  // arco) NON è simmetrico rispetto a chi "cerca" (la ricerca inversa, punto sull'arco principale
  // verso l'arco minoritario, è una query geometrica diversa) — per questo sotto si cercano ENTRAMBE
  // le direzioni, ciascuna delimitata dal solo lato minoritario (mai iterando tutti i node/archi
  // principali): dai node minoritari verso QUALUNQUE arco vicino, e dagli archi minoritari verso i
  // node principali vicini.
  const componentSize = new Map<number, number>()
  for (const id of Array.from(nodes.keys())) {
    const root = uf.find(id)
    componentSize.set(root, (componentSize.get(root) ?? 0) + 1)
  }
  let mainRoot = -1, mainSize = -1
  for (const [root, size] of Array.from(componentSize)) {
    if (size > mainSize) { mainSize = size; mainRoot = root }
  }
  if (componentSize.size <= 1) return // già tutta una sola componente, niente da ricucire

  const cellKey = (lat: number, lon: number) => `${Math.floor(lat / COMPONENT_BRIDGE_CELL_DEG)}_${Math.floor(lon / COMPONENT_BRIDGE_CELL_DEG)}`

  // Griglia di ARCHI (non solo nodi, vedi il commento sopra) — indicizzati sulla cella di entrambi
  // gli estremi, così una ricerca vicino a uno qualunque dei due lo trova. Include TUTTI gli archi
  // (anche quelli della componente principale): serve da bersaglio per la ricerca dal lato
  // minoritario sotto.
  interface EdgeRef { aId: number; bId: number }
  const edgeGrid = new Map<string, EdgeRef[]>()
  const addToGrid = <T,>(grid: Map<string, T[]>, key: string, ref: T) => {
    const bucket = grid.get(key)
    if (bucket) bucket.push(ref)
    else grid.set(key, [ref])
  }
  const seenEdge = new Set<string>()
  for (const [id, node] of Array.from(nodes)) {
    for (const e of node.edges) {
      const key = id < e.to ? `${id}|${e.to}` : `${e.to}|${id}`
      if (seenEdge.has(key)) continue
      seenEdge.add(key)
      const a = nodes.get(id)!, b = nodes.get(e.to)!
      const ref: EdgeRef = { aId: id, bId: e.to }
      addToGrid(edgeGrid, cellKey(a.lat, a.lon), ref)
      addToGrid(edgeGrid, cellKey(b.lat, b.lon), ref)
    }
  }

  // Griglia di NODI della sola componente principale — bersaglio per la ricerca dal lato degli
  // archi minoritari sotto (mai bisogno di indicizzare i node minoritari qui: un ponte fra due
  // componenti minoritarie è già trovato dalla ricerca "da node minoritario" sopra, in entrambe le
  // direzioni essendo entrambi i lati minoritari).
  const mainNodeGrid = new Map<string, number[]>()
  for (const [id, node] of Array.from(nodes)) {
    if (uf.find(id) !== mainRoot) continue
    addToGrid(mainNodeGrid, cellKey(node.lat, node.lon), id)
  }

  interface BridgeCandidate { fromId: number; edge: EdgeRef; proj: { lat: number; lon: number; distM: number; t: number } }
  const candidates: BridgeCandidate[] = []

  // Dai node minoritari a bassa valenza (le estremità di way isolate, stesso identico criterio di
  // stitchNearbyEndpoints — un vero incrocio già mappato al loro interno non ha bisogno di un
  // ponte) verso QUALUNQUE arco vicino di una componente diversa, entro COMPONENT_BRIDGE_MAX_M.
  for (const [id, node] of Array.from(nodes)) {
    if (uf.find(id) === mainRoot) continue
    if (node.edges.length > MAX_STITCH_DEGREE) continue
    const cx = Math.floor(node.lat / COMPONENT_BRIDGE_CELL_DEG)
    const cy = Math.floor(node.lon / COMPONENT_BRIDGE_CELL_DEG)
    const seenHere = new Set<string>()
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = edgeGrid.get(`${cx + dx}_${cy + dy}`)
        if (!bucket) continue
        for (const edgeRef of bucket) {
          const edgeKey = `${edgeRef.aId}|${edgeRef.bId}`
          if (seenHere.has(edgeKey)) continue
          seenHere.add(edgeKey)
          if (edgeRef.aId === id || edgeRef.bId === id) continue // il proprio stesso arco
          if (uf.find(id) === uf.find(edgeRef.aId)) continue // stessa componente, mai una scorciatoia su una rete già connessa
          const a = nodes.get(edgeRef.aId)!, b = nodes.get(edgeRef.bId)!
          const proj = nearestPointOnSegment(node.lat, node.lon, [a.lat, a.lon], [b.lat, b.lon])
          if (proj.distM > COMPONENT_BRIDGE_MAX_M) continue
          candidates.push({ fromId: id, edge: edgeRef, proj })
        }
      }
    }
  }

  // Dagli archi minoritari (entrambi gli estremi in una componente non principale per costruzione —
  // un arco esistente unisce sempre i suoi due estremi nella stessa componente) ai node principali
  // vicini — la direzione "mancante" sopra: il punto più vicino di un arco minoritario può cadere
  // vicino a un node principale che non è mai stato considerato come punto di partenza. Cerca dal
  // vicinato di ENTRAMBI gli estremi dell'arco (mai solo dal punto medio): lo stesso motivo per cui
  // la griglia degli archi sopra indicizza entrambi gli estremi — un arco più lungo della cella
  // avrebbe altrimenti un estremo fuori dal vicinato 3×3 centrato sul solo punto medio.
  for (const [id, node] of Array.from(nodes)) {
    if (uf.find(id) === mainRoot) continue
    for (const e of node.edges) {
      if (id >= e.to) continue // ogni arco una sola volta (stesso criterio di seenEdge sopra)
      const other = nodes.get(e.to)!
      const seenHere = new Set<number>()
      for (const endpoint of [node, other]) {
        const cx = Math.floor(endpoint.lat / COMPONENT_BRIDGE_CELL_DEG)
        const cy = Math.floor(endpoint.lon / COMPONENT_BRIDGE_CELL_DEG)
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            const bucket = mainNodeGrid.get(`${cx + dx}_${cy + dy}`)
            if (!bucket) continue
            for (const mainId of bucket) {
              if (seenHere.has(mainId)) continue
              seenHere.add(mainId)
              const mainNode = nodes.get(mainId)!
              const proj = nearestPointOnSegment(mainNode.lat, mainNode.lon, [node.lat, node.lon], [other.lat, other.lon])
              if (proj.distM > COMPONENT_BRIDGE_MAX_M) continue
              candidates.push({ fromId: mainId, edge: { aId: id, bId: e.to }, proj })
            }
          }
        }
      }
    }
  }

  // Kruskal: si applicano i ponti in ordine di distanza crescente, saltando quelli le cui due
  // componenti sono già state riunite da un ponte più corto processato prima.
  candidates.sort((x, y) => x.proj.distM - y.proj.distM)

  let nextVirtualId = -1
  const EPS_T = 0.02 // proiezione (quasi) su un estremo → aggancio diretto, mai un nodo virtuale praticamente coincidente
  for (const c of candidates) {
    if (uf.find(c.fromId) === uf.find(c.edge.aId)) continue

    let targetId: number
    if (c.proj.t <= EPS_T) {
      targetId = c.edge.aId
    } else if (c.proj.t >= 1 - EPS_T) {
      targetId = c.edge.bId
    } else {
      const a = nodes.get(c.edge.aId)!, b = nodes.get(c.edge.bId)!
      const original = a.edges.find(e => e.to === c.edge.bId)
      // Può mancare se un ponte precedente ha già spezzato proprio questo arco (due componenti
      // diverse che proiettano sullo stesso segmento, raro) — il target di quel primo split resta
      // comunque raggiungibile dalla stessa componente, un secondo ponte qui sarebbe ridondante.
      if (!original) continue
      a.edges = a.edges.filter(e => !(e.to === c.edge.bId && e.wayId === original.wayId))
      b.edges = b.edges.filter(e => !(e.to === c.edge.aId && e.wayId === original.wayId))
      targetId = nextVirtualId--
      nodes.set(targetId, { lat: c.proj.lat, lon: c.proj.lon, edges: [] })
      addEdge(nodes, c.edge.aId, targetId, original.wayId, original.highway, original.sacScale, original.ford)
      addEdge(nodes, targetId, c.edge.bId, original.wayId, original.highway, original.sacScale, original.ford)
      uf.union(c.edge.aId, targetId)
    }

    addEdge(nodes, c.fromId, targetId, -2, 'bridge')
    uf.union(c.fromId, targetId)
  }
}

/** Nodo del grafo più vicino a (lat, lon), entro thresholdM — null se la rete è vuota o troppo lontana. */
export function nearestGraphNode(
  network: WalkNetwork,
  lat: number,
  lon: number,
  thresholdM = 400,
): { nodeId: number; distM: number } | null {
  let best: { nodeId: number; distM: number } | null = null
  for (const [nodeId, node] of Array.from(network.nodes)) {
    const distM = haversineM(lat, lon, node.lat, node.lon)
    if (distM <= thresholdM && (!best || distM < best.distM)) best = { nodeId, distM }
  }
  return best
}

/**
 * Un tratto contratto della rete, da un'intersezione reale alla successiva — per l'editor manuale
 * dei percorsi (app/api/walk-network-segments/route.ts), dove un click deve selezionare "tutta la
 * strada fino al prossimo incrocio", non un singolo arco fra due nodi consecutivi della stessa way
 * (il grafo grezzo ne avrebbe decine anche per un tratto dritto). `wayId`/`highway` riportano solo
 * il PRIMO arco del tratto: un tratto può in teoria attraversare un cambio di way OSM senza un vero
 * incrocio (una way spezzata in due dai mappatori senza motivo topologico) — qui serve solo come
 * etichetta indicativa, mai per la geometria stessa.
 */
export interface NetworkSegment {
  id: string
  points: [number, number][]
  wayId: number
  highway?: string
}

/**
 * Contrae un WalkNetwork in NetworkSegment intersezione-intersezione: un nodo è un'intersezione se
 * ha un numero di archi diverso da 2 (una vera diramazione, o l'estremità di un ramo cieco) — da
 * ogni arco uscente da un'intersezione si cammina lungo nodi di grado 2 finché non se ne incontra
 * un'altra. Ogni arco (fisico, non le due metà bidirezionali con cui è memorizzato in WalkNetwork)
 * viene emesso una sola volta.
 *
 * Un secondo giro raccoglie i cicli isolati senza NESSUNA intersezione (un anello completo di soli
 * nodi di grado 2, raro ma possibile) — altrimenti il primo giro, che parte solo da intersezioni
 * reali, li salterebbe interamente: nessun nodo del ciclo farebbe mai da punto di partenza.
 */
// Pochi metri, impercettibile alla scala a cui questi tratti si vedono su una mappa (anche zoomata
// a livello di quartiere) — ma una via leggermente curva con uno shape-point OSM ogni pochi metri
// può perdere la maggior parte dei suoi vertici senza cambiare forma percepibile, alleggerendo sia
// il payload JSON sia il numero di punti che Leaflet deve disegnare (il vero costo su un centro
// storico denso, vedi il commento su NETWORK_FETCH_RADIUS_M in ManualRouteEditor.tsx).
const NETWORK_SEGMENT_SIMPLIFY_TOLERANCE_M = 4

export function buildNetworkSegments(network: WalkNetwork): NetworkSegment[] {
  const segments: NetworkSegment[] = []
  const visited = new Set<string>()
  const isJunction = (id: number) => (network.nodes.get(id)?.edges.length ?? 0) !== 2
  const edgeKey = (a: number, b: number, wayId: number) => (a < b ? `${a}|${b}|${wayId}` : `${b}|${a}|${wayId}`)

  function walkFrom(startNodeId: number, startEdge: GraphEdge) {
    const startNode = network.nodes.get(startNodeId)
    let curNode = network.nodes.get(startEdge.to)
    if (!startNode || !curNode) return
    visited.add(edgeKey(startNodeId, startEdge.to, startEdge.wayId))

    const points: [number, number][] = [[startNode.lat, startNode.lon], [curNode.lat, curNode.lon]]
    const { wayId, highway } = startEdge
    let prevNodeId = startNodeId
    let curId = startEdge.to

    // Si ferma a una vera intersezione, oppure tornando al nodo di partenza stesso (chiusura di un
    // ciclo isolato senza intersezioni — vedi il secondo giro sotto).
    while (!isJunction(curId) && curId !== startNodeId) {
      const backEdge = curNode.edges.find(e => e.to === prevNodeId)
      const forwardEdge = curNode.edges.find(e => e !== backEdge)
      if (!forwardEdge) break
      const nextNode = network.nodes.get(forwardEdge.to)
      if (!nextNode) break
      visited.add(edgeKey(curId, forwardEdge.to, forwardEdge.wayId))
      points.push([nextNode.lat, nextNode.lon])
      prevNodeId = curId
      curId = forwardEdge.to
      curNode = nextNode
    }

    segments.push({ id: `${wayId}:${segments.length}`, points: simplifyPolyline(points, NETWORK_SEGMENT_SIMPLIFY_TOLERANCE_M), wayId, highway })
  }

  for (const [nodeId, node] of Array.from(network.nodes)) {
    if (!isJunction(nodeId)) continue
    for (const edge of node.edges) {
      if (visited.has(edgeKey(nodeId, edge.to, edge.wayId))) continue
      walkFrom(nodeId, edge)
    }
  }

  // Cicli isolati: ogni arco rimasto non visitato appartiene per forza a una componente senza
  // nessuna intersezione — il nodo di partenza scelto qui è un taglio arbitrario, non un'intersezione
  // reale (non ce ne sono), solo per rendere il ciclo comunque selezionabile come un tratto.
  for (const [nodeId, node] of Array.from(network.nodes)) {
    for (const edge of node.edges) {
      if (visited.has(edgeKey(nodeId, edge.to, edge.wayId))) continue
      walkFrom(nodeId, edge)
    }
  }

  return segments
}
