/**
 * MiC (Ministero della Cultura) — "Istituti e luoghi della cultura" (ArCo) → dtrek_places
 *
 * Dataset più ampio della sola componente archeologica già coperta da `lib/pois/gnaSource.ts`
 * (GNA/WFS) — musei, monumenti, castelli, palazzi, chiese, abbazie (piano §8).
 *
 * ── Fonte (verificata via WebSearch/WebFetch in questa sessione, 2026-08-30) ────────────────────
 *
 * Il dataset "Luoghi della cultura" del piano è **ArCo** ("Architettura della Conoscenza"), il
 * knowledge graph ufficiale del MiC (progetto ICCD-MiBACT, https://github.com/ICCD-MiBACT/ArCo).
 * Endpoint SPARQL pubblico, citato dalla home ufficiale del progetto
 * (https://dati.beniculturali.it/arco/index.php?lang=en, sezione "Data Access"):
 *
 *     https://dati.cultura.gov.it/sparql
 *
 * Classe RDF e proprietà VERIFICATE leggendo direttamente il file dell'ontologia (non un URL
 * indovinato — scaricato da GitHub, https://raw.githubusercontent.com/ICCD-MiBACT/ArCo/master/ArCo-release/ontologie/location/location.owl):
 *
 *   - Classe: `http://dati.beniculturali.it/cis/CulturalInstituteOrSite` (CIS = "Cultural
 *     Institute or Site")
 *   - `<...location/hasCulturalInstituteOrSiteType>` — collega l'istituto al suo tipo
 *   - `<...location/hasTimeIndexedTypedLocation>` (domain owl:Thing, quindi anche su CIS) →
 *     `TimeIndexedTypedLocation`, che a sua volta collega via:
 *       - `<...location/atSite>` → `http://dati.beniculturali.it/cis/Site`
 *       - `<...location/atLocation>` → `Feature` (CLV — Core Location Vocabulary AgID), con
 *         `<...location/hasHistoricalAddress>` per l'indirizzo
 *
 * Ogni istanza reale ha un ID numerico stabile nel path (verificato su risultati di ricerca reali,
 * es. `http://dati.beniculturali.it/mibact/luoghi/resource/CulturalInstituteOrSite/104060`) — è
 * questo l'identificativo MiC usato come `sourceId` sotto (piano §48.12, mai inventato).
 *
 * ── Coordinate: risolto leggendo i dati reali, dopo due tentativi dedotti dalla sola ontologia ──
 * Tentativo 1 (`geo:lat`/`geo:long` su `?site`) e tentativo 2 (`clv:lat`/`clv:long` via
 * `clv:hasGeometry` su CIS/Site/Feature, dedotto da `location.owl`+`CLV-AP_IT.rdf`) hanno dato
 * entrambi 0 risultati contro l'endpoint reale — dedotti dalla documentazione, mai verificati.
 * `runDescribe()` più sotto (`--describe`) ha finalmente dumpato la struttura vera di un
 * CulturalInstituteOrSite reale (7275, Archivio di Stato di Firenze — Fondo Coppedè,
 * 2026-09-17): il collegamento è `cis:hasSite` (confermato, `hasTimeIndexedTypedLocation` non è
 * mai apparso nei dati reali), e la geometria è `clvapit:hasGeometry` sul **Site** stesso →
 * `clvapit:lat`/`clvapit:long` — è l'esempio ufficiale nel commento della classe Site restituito
 * dall'endpoint stesso, non più una deduzione. Nota: quel record specifico NON aveva coordinate
 * popolate (solo un indirizzo strutturato via `cis:siteAddress`) — non è detto che tutti i record
 * ArCo abbiano la geometria, verificare la copertura reale con un dry-run prima di contare su un
 * tasso di successo alto.
 *
 * La tipologia (`hasCulturalInstituteOrSiteType`) punta a una risorsa di un thesaurus MiC di cui
 * non è stato possibile verificare i valori esatti in questa sessione — la classificazione sotto
 * lavora quindi sull'**etichetta testuale** (rdfs:label) della risorsa di tipo, con lo stesso
 * approccio a sottostringa di `GNA_TYPE_MAP` in `lib/pois/gnaSource.ts` (indicato come riferimento
 * dal README di questa cartella) invece che su URI di tipo specifici.
 *
 * ── Licenza (piano §8/§44, CC BY-SA 4.0) ─────────────────────────────────────────────────────
 * Il dataset LOD "Luoghi della Cultura" è pubblicato dal MiC sotto CC BY-SA 4.0 — richiede
 * attribuzione e "share-alike" (redistribuire con la stessa licenza), non vieta il riuso di
 * contenuto editoriale. `description` (predicato `l0:description`, verificato reale su
 * CulturalInstituteOrSite/105665 — Museo delle tradizioni popolari di Canepina, MIC_DATA_SOURCES.md
 * §3bis) è quindi popolato — a differenza di una nota precedente in questo file che escludeva
 * qualunque campo testuale esteso per prudenza prima di aver verificato dati reali. `sourceUrl` del
 * candidato resta sempre l'attribuzione minima richiesta ovunque il testo venga mostrato.
 *
 * Usage:
 *   npx tsx scripts/places/mic/fetch.ts [--dry-run] [--region Lazio] [--limit 5000]
 *   npx tsx scripts/places/mic/fetch.ts --describe   (diagnostica, vedi runDescribe più sotto —
 *     dump di un CulturalInstituteOrSite ARBITRARIO)
 *   npx tsx scripts/places/mic/fetch.ts --describe --name "Museo X"   (stessa diagnostica, ma sul
 *     primo record il cui rdfs:label contiene questo testo — per verificare cosa ArCo porta
 *     davvero per UNA Meta specifica, es. per capire se orari/foto/contatti esistono da qualche
 *     parte oltre ai campi già importati)
 *
 * --limit sovrascrive la LIMIT SPARQL (default 5000) — usare un valore piccolo (5-20) per il primo
 * lancio contro l'endpoint reale, dato il punto non verificato sulle coordinate in cima al file:
 * ispezionare l'esempio stampato da --dry-run prima di un caricamento completo.
 *
 * ── Coordinate mancanti (Lombardia/Toscana, verificato 2026-09-21) — geocodifica di ripiego ────
 * Il sotto-grafo ArCo per Lombardia/Toscana (namespace w3id.org/arco/resource/<Regione>/...,
 * diverso da quello nazionale usato da Lazio e dalle altre regioni) porta un indirizzo strutturato
 * completo ma MAI una tripla di coordinate — non un dato mancante alla fonte (SIRBeC per la
 * Lombardia, il sistema della Regione Toscana/Consorzio LaMMA, entrambi georeferenziati), solo
 * assente nella conversione verso ArCo. Questi record non vengono più scartati in silenzio: se
 * hanno un `comune`, vengono geocodificati via Nominatim (fillMissingCoordinates/geocodeAddress,
 * sequenziale, ~1 richiesta/secondo per la policy d'uso pubblica) e marcati `coordinatesGeocoded`
 * in metadata con confidenza ridotta — mai spacciati per precisi quanto una coordinata diretta di
 * ArCo (l'indirizzo di ArCo è tipicamente senza numero civico, Nominatim geocodifica al centroide
 * di via/piazza).
 */
import { createClient } from '@supabase/supabase-js'
import { importPlaceCandidates } from '../import'
import type { PlaceCandidate, FieldProvenance } from '../types'
import type { SiteType } from '../../../lib/metaTypes'

const SPARQL_ENDPOINT = 'https://dati.cultura.gov.it/sparql'
const USER_AGENT = 'DTrek/1.0 (places catalog batch import; mzulpt@gmail.com)'

// ── Etichetta tipo MiC (testo, non URI — vedi nota di verifica in cima) → SiteType ─────────────
// Stesso approccio a sottostringa di GNA_TYPE_MAP (lib/pois/gnaSource.ts), applicato qui
// all'etichetta invece che a un codice URI perché il vocabolario dei tipi MiC non è stato
// verificabile in questa sessione.
const MIC_TYPE_MAP: [string, SiteType][] = [
  ['area archeologic', 'sito_archeologico'],
  ['scavi', 'sito_archeologico'],
  ['necropoli', 'sito_archeologico'],
  ['parco archeologic', 'sito_archeologico'],
  ['castello', 'castello'],
  ['rocca', 'castello'],
  ['fortezza', 'castello'],
  ['fortificazione', 'castello'],
  ['forte', 'castello'],
  ['abbazia', 'abbazia'],
  ['monastero', 'abbazia'],
  ['convento', 'abbazia'],
  ['eremo', 'abbazia'],
  ['chiesa', 'chiesa'],
  ['basilica', 'chiesa'],
  ['cattedrale', 'chiesa'],
  ['santuario', 'chiesa'],
  ['duomo', 'chiesa'],
  ['battistero', 'chiesa'],
  ['palazzo', 'palazzo'],
  ['villa', 'palazzo'],
  ['dimora storica', 'palazzo'],
  ['teatro', 'teatro'],
  ['anfiteatro', 'teatro'],
  ['museo', 'museo'],
  ['pinacoteca', 'museo'],
  ['galleria', 'museo'],
  ['collezione', 'museo'],
  ['monumento', 'monumento'],
  ['mausoleo', 'monumento'],
  ['obelisco', 'monumento'],
]

export function micTypeLabelToSiteType(label: string | undefined | null): SiteType {
  if (!label) return 'altro'
  const lower = label.toLowerCase()
  for (const [needle, type] of MIC_TYPE_MAP) {
    if (lower.includes(needle)) return type
  }
  return 'altro'
}

// ── Binding SPARQL grezzo → PlaceCandidate ──────────────────────────────────────────────────────
export interface MicBinding {
  id: string          // parte numerica finale dell'IRI CulturalInstituteOrSite
  name: string
  // `l0:description` — VERIFICATO reale su CulturalInstituteOrSite/105665 (MIC_DATA_SOURCES.md
  // §3bis), letterale diretto sul CIS. Coverage reale su un campione di 443 righe (probe
  // `copertura-campi-arricchenti`, non necessariamente 443 CIS distinti — vedi nota lì su
  // COUNT(*) senza DISTINCT): 281 con descrizione — maggioritario, non un caso isolato.
  description?: string
  typeLabel?: string
  // `dc:type` (http://purl.org/dc/elements/1.1/type) — letterale diretto sul CIS, es. "Museo,
  // Galleria e/o raccolta". VERIFICATO reale con --describe --name Canepina (MIC_DATA_SOURCES.md
  // §3bis, CulturalInstituteOrSite/105665): quel record NON ha alcuna tripla
  // `loc:hasCulturalInstituteOrSiteType` (typeLabel sempre unbound), ma ha `dc:type` popolato —
  // senza questo fallback, quel record specifico cade silenziosamente su 'altro' nonostante il
  // dato reale dica chiaramente "Museo". Non ancora noto quanto sia diffuso sul resto del catalogo
  // (vedi probe `copertura-campi-arricchenti` in probe.ts) — usato solo come fallback, mai al posto
  // di typeLabel quando quest'ultimo è presente.
  dcType?: string
  comune?: string
  province?: string
  region?: string
  address?: string
  // Assenti quando ArCo non porta geometria per questo record (verificato reale 2026-09-21 su
  // "Cenacolo Vinciano", Lombardia — vedi geocodeAddress/fillMissingCoordinates più sotto) — MAI
  // scartati subito, prima si tenta la geocodifica di ripiego sull'indirizzo strutturato.
  lat?: number
  lon?: number
  // true quando lat/lon vengono da geocodeAddress invece che da una tripla diretta di ArCo — letto
  // da micBindingToPlaceCandidate per abbassare la confidenza e marcare la provenienza.
  geocoded?: boolean
  // Predicati del VALORE letterale verificati reali su Canepina/105665 (probe
  // contatti-canepina-un-salto-oltre, MIC_DATA_SOURCES.md §12) — `website` esisteva già in questa
  // interfaccia ma non era mai stato popolato dalla query prima d'ora (nessun predicato verificato).
  website?: string
  // `sm:emailAddress` letterale reale osservato: "mailto:info@cmcimini.it" (schema mailto: incluso)
  // — ripulito in micBindingToPlaceCandidate, non qui (questo campo resta il valore SPARQL grezzo).
  email?: string
  phone?: string
}

// Pura, testabile senza rete.
// `sm:emailAddress` è letteralmente "mailto:indirizzo@dominio" nei dati reali (verificato,
// probe contatti-canepina-un-salto-oltre) — non un'ipotesi di formato. Pura, testabile senza rete.
export function stripMailto(email: string): string {
  return email.replace(/^mailto:/i, '')
}

// Pura, testabile senza rete. Il chiamante (main()) passa solo binding già filtrati da
// hasCoordinates — lat/lon sono garantiti qui, diretti da ArCo o riempiti da geocodeAddress.
export function micBindingToPlaceCandidate(b: MicBinding & { lat: number; lon: number }): PlaceCandidate {
  const typeSource = b.typeLabel ?? b.dcType
  const sourceUrl = `http://dati.beniculturali.it/mibact/luoghi/resource/CulturalInstituteOrSite/${b.id}`
  const retrievedAt = new Date().toISOString()
  const email = b.email !== undefined ? stripMailto(b.email) : undefined

  // Nessun `sourceUpdatedAt` su nessuno di questi campi: ArCo non espone una data di aggiornamento
  // per record (verificato, non solo non cercato — MIC_DATA_SOURCES.md §3bis, dump esaustivo di
  // CulturalInstituteOrSite/105665 senza alcun predicato di data/timestamp). `sourceUrl` è
  // l'attribuzione richiesta da CC BY-SA 4.0 per `description` — vedi nota licenza in cima al file.
  const fieldProvenance: Record<string, FieldProvenance> = {}
  const track = (field: string, value: unknown) => {
    if (value === undefined) return
    fieldProvenance[field] = { value, source: 'mic', sourceUrl, retrievedAt, confidence: 'high', status: 'ok' }
  }
  track('description', b.description)
  track('phone', b.phone)
  track('email', email)
  track('website', b.website)
  // Provenienza SEPARATA per lat/lon quando geocodificate — mai spacciate per la stessa
  // affidabilità di una tripla diretta di ArCo (piano §48.8, mai un dato incerto marcato "high").
  if (b.geocoded) {
    fieldProvenance.latitude = { value: b.lat, source: 'nominatim', retrievedAt, confidence: 'low', status: 'ok' }
    fieldProvenance.longitude = { value: b.lon, source: 'nominatim', retrievedAt, confidence: 'low', status: 'ok' }
  }

  return {
    name: b.name,
    metaType: 'sito',
    subtype: micTypeLabelToSiteType(typeSource),
    description: b.description,
    latitude: b.lat,
    longitude: b.lon,
    region: b.region,
    province: b.province,
    municipality: b.comune,
    address: b.address,
    website: b.website,
    phone: b.phone,
    email,
    source: 'mic',
    sourceId: b.id,
    sourceUrl,
    rawType: typeSource,
    // Non 1 come ISTAT/PTPR: la conversione tipo-testuale→SiteType qui è euristica (vedi
    // MIC_TYPE_MAP), non un campo strutturato con valori chiusi verificati. Ulteriormente scontata
    // quando la posizione è geocodificata invece che diretta da ArCo.
    confidence: (typeSource ? 0.9 : 0.6) * (b.geocoded ? 0.7 : 1),
    metadata: {
      micTypeLabel: b.typeLabel,
      micDcType: b.dcType,
      // Letto da searchSiti.ts/ranking per non trattare un pin geocodificato (indirizzo senza
      // civico → precisione via/piazza, non edificio) come affidabile quanto uno diretto da ArCo.
      ...(b.geocoded ? { coordinatesGeocoded: true } : {}),
      ...(Object.keys(fieldProvenance).length > 0 ? { fieldProvenance } : {}),
    },
  }
}

// ── SPARQL (server-side, batch — MAI per-ricerca-utente, piano §9/§21) ─────────────────────────
// Collegamento CONFERMATO su dati reali (2026-09-17, --describe su CulturalInstituteOrSite/7275 —
// Archivio di Stato di Firenze): `?cis cis:hasSite ?site` (non hasTimeIndexedTypedLocation, mai
// apparso nei dati reali). Quel record però non aveva coordinate — solo un indirizzo strutturato.
//
// Le coordinate: un SECONDO record reale (CulturalInstituteOrSite/100005, "Museo civico
// aufidenate", trovato dall'utente su LodView) le aveva sì, ma con un vocabolario DIVERSO da
// quello confermato nell'esempio ufficiale della classe Site: `geo:lat`/`geo:long` (WGS84 Basic
// Geo) direttamente sul nodo, oltre a `clvapit:hasGeometry`. Il catalogo ArCo non è uniforme —
// schede diverse, catalogate in periodi diversi, sembrano usare vocabolari diversi. La query sotto
// prova ENTRAMBI i vocabolari (`geo:lat`/`geo:long` diretto, e `clvapit:hasGeometry` →
// `clvapit:lat`/`clvapit:long`) su ENTRAMBI i punti di aggancio (CIS e Site), invece di sceglierne
// uno solo — ogni ramo è supportato da un'osservazione reale, non una nuova ipotesi.
//
// L'indirizzo (siteAddress → clvapit:fullAddress, un testo leggibile tipo "Via Roma, 1 - Firenze")
// era invece sempre presente anche sul record senza coordinate — possibile fallback futuro
// (geocodifica) per i record senza geometria, oggi scartati dal FILTER sotto: latitude/longitude
// sono NOT NULL su dtrek_places, un indirizzo da solo non basta.
// Ancora "MiC SPARQL 500" con la sotto-query a candidati limitati (vedi git history) — il limite
// sui candidati non basta. Causa più probabile, seconda ipotesi: il pattern OPTIONAL che avvolge
// una UNION a 4 rami è un caso noto in cui i motori SPARQL (Virtuoso incluso, verosimile qui viste
// le tracce "@id"/JSON-LD tipiche di ICCD-MiBACT) pianificano male la query, indipendentemente da
// quanti candidati arrivano a quel punto. Due correzioni insieme, entrambe pratiche SPARQL note,
// non nuove ipotesi sui dati:
//   1. 4 OPTIONAL indipendenti (uno per combinazione vocabolario/nodo) invece di un OPTIONAL con
//      UNION dentro, poi COALESCE per prendere il primo che ha valore — evita la combinazione
//      OPTIONAL+UNION.
//   2. Il filtro regione entra nella sotto-query PRIMA del limite sui candidati (join
//      hasSite/siteAddress/hasRegion spostati lì) — con una regione specificata, i candidati
//      esaminati sono già quelli di quella regione, non un pool casuale su tutta Italia di cui la
//      maggior parte verrebbe scartata dopo (come nella versione precedente).
//
// FIX (2026-09-17, terzo round — timeout visto dal vivo, log reale): il pool era fisso a 2000
// indipendentemente da `--limit`, quindi anche un test con `--limit 20` (il default del workflow)
// forzava comunque alla sotto-query un JOIN su 2000 candidati prima di scartarne la stragrande
// maggioranza. Scalato con `limit` (4x, minimo 50) — vedi però FIX successivo: quel pool è stato
// rimosso del tutto, la ragione è sotto.
//
// FIX (2026-09-17, isolato con scripts/places/mic/probe.ts contro l'endpoint reale — non
// un'ipotesi): il filtro regione con CONTAINS/LCASE, dopo i due salti OPTIONAL
// siteAddress→hasRegion, fa esplodere lo stimatore di costo di Virtuoso — rifiuto immediato
// ("estimated execution time ... exceeds the limit", ~5.7h stimate), non un timeout dopo
// esecuzione lenta. Un'uguaglianza esatta sullo stesso punto della query è invece passata
// (200, <300ms, risultati corretti) — probe `combo-candidati-uguaglianza-regione`. Compromesso
// accettato: l'uguaglianza è case-sensitive e non fa più match parziale — la regione va passata
// con la stessa capitalizzazione usata da rdfs:label nel grafo (es. "Lazio", non "lazio"/"LAZIO").
//
// FIX (2026-09-17, quarto round, di un'altra sessione concorrente — bug segnalato dal vivo:
// "Regione: tutta Italia, Limit: 10000" → 0 risultati, nessun errore HTTP). All'epoca `buildSparqlQuery`
// veniva ancora chiamata anche SENZA alcun filtro regione per "tutta Italia" — il pool fisso di
// candidati (allora 2000) era una fetta ARBITRARIA dell'intero catalogo (nessun `ORDER BY`), che con
// una copertura coordinate bassa e non uniforme poteva benissimo non contenere NESSUN record
// georeferenziato. Il fix di quel round aveva spostato i 4 `OPTIONAL` coordinate + `COALESCE` +
// `FILTER(BOUND(...))` DENTRO la stessa sotto-query del filtro regione, prima del suo `LIMIT`.
//
// FIX (2026-09-17, sesto round, bis — bug segnalato dal vivo, log reale): quella struttura, con
// l'uguaglianza esatta invece di CONTAINS/LCASE, ha dato lo STESSO tipo di rifiuto del pianificatore
// visto al round 3 (`Virtuoso 42000 Error The estimated execution time ... exceeds the limit`, questa
// volta un numero negativo — tipico overflow), ma stavolta su OGNI singola regione provata (Marche,
// Piemonte, Calabria, Emilia-Romagna, Friuli-Venezia Giulia, Molise, Trentino-Alto Adige, Veneto —
// tutte etichette reali, confermate dalla whitelist del round precedente, non un valore sporco).
// Un numero di stima IDENTICO su regioni con cardinalità reale molto diversa tra loro esclude che sia
// un problema del valore filtrato — è la FORMA della query: 6 `OPTIONAL` (hasSite, siteAddress+city,
// siteAddress+region, più i 4 delle coordinate) combinati con un'uguaglianza e un `FILTER(BOUND(...))`
// nello stesso scope fa esplodere lo stimatore, come già visto in altra forma al round 2/3.
//
// Il punto chiave che sblocca la scelta: da quando "tutta Italia" passa da `fetchAllRegions` (sopra),
// `buildSparqlQuery` non viene MAI più chiamata senza un `regionLabel` reale — il caso che il fix del
// round 4 doveva risolvere (scansione dell'intero catalogo senza filtro) non può più accadere da
// nessun punto di chiamata attuale. Si può quindi tornare alla struttura del round 3, GIÀ VERIFICATA
// con una scrittura reale riuscita (495 record importati in Lazio, confermati in Supabase): i 4
// `OPTIONAL` coordinate + `COALESCE` + `FILTER(BOUND(...))` nella query ESTERNA, fuori dalla
// sotto-query filtrata per regione — che riguadagna un pool di candidati proprio (scalato con
// `limit`, mai un pool arbitrario su tutto il catalogo perché la regione filtra già a monte).
//
// FIX (2026-09-21 — bug segnalato dal vivo: "cerco Siti vicino a Milano, zero risultati").
// `FILTER(BOUND(?lat) && BOUND(?long))` scartava OGNI record senza geometria diretta — verificato
// con --describe --name "Cenacolo Vinciano" (Lombardia, MIC_DATA_SOURCES.md): il sotto-grafo
// regionale di ArCo per Lombardia/Toscana (namespace w3id.org/arco/resource/<Regione>/..., diverso
// da quello nazionale usato da Lazio e dalle altre regioni) porta un indirizzo strutturato COMPLETO
// (fullAddress/hasCity/hasRegion) ma mai una tripla di coordinate — non un dato mancante alla fonte
// (Lombardia ha SIRBeC, Toscana un proprio sistema, entrambi georeferenziati), solo assente nella
// conversione verso ArCo. `|| BOUND(?address)` lascia passare anche questi record — vengono
// geocodificati in JS da fillMissingCoordinates/geocodeAddress sotto, MAI scartati in silenzio
// come prima. Un record senza coordinate E senza indirizzo resta comunque escluso qui: non c'è
// nulla da geocodificare, inutile portarlo fino a JS per poi buttarlo via.
const CANDIDATE_POOL_CAP = 2000

function buildSparqlQuery(regionLabel?: string, limit = 5000): string {
  const candidatePool = Math.min(CANDIDATE_POOL_CAP, Math.max(limit * 4, 50))
  const regionFilter = regionLabel
    ? `FILTER(?regionLabel = "${regionLabel.replace(/"/g, '')}")`
    : ''

  return `
PREFIX cis: <http://dati.beniculturali.it/cis/>
PREFIX loc: <https://w3id.org/arco/ontology/location/>
PREFIX clvapit: <https://w3id.org/italia/onto/CLV/>
PREFIX geo: <http://www.w3.org/2003/01/geo/wgs84_pos#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX dc: <http://purl.org/dc/elements/1.1/>
PREFIX l0: <https://w3id.org/italia/onto/l0/>
PREFIX sm: <https://w3id.org/italia/onto/SM/>

SELECT DISTINCT ?cis ?name ?typeLabel ?dcType ?description ?comune ?regionLabel ?address ?lat ?long ?phone ?email ?website WHERE {
  {
    SELECT ?cis ?name ?site ?address ?comune ?regionLabel WHERE {
      ?cis a cis:CulturalInstituteOrSite ;
           rdfs:label ?name .
      OPTIONAL { ?cis cis:hasSite ?site . }
      OPTIONAL {
        ?site cis:siteAddress ?addr .
        ?addr clvapit:fullAddress ?address .
        OPTIONAL { ?addr clvapit:hasCity ?comuneRes . ?comuneRes rdfs:label ?comune . }
        OPTIONAL { ?addr clvapit:hasRegion ?regionRes . ?regionRes rdfs:label ?regionLabel . }
      }
      ${regionFilter}
    }
    LIMIT ${candidatePool}
  }
  OPTIONAL {
    ?cis loc:hasCulturalInstituteOrSiteType ?type .
    ?type rdfs:label ?typeLabel .
  }
  # Fallback verificato reale su CulturalInstituteOrSite/105665 (Canepina, MIC_DATA_SOURCES.md
  # §3bis) — letterale diretto, indipendente da typeLabel sopra, mai annidato in un altro OPTIONAL
  # (stessa forma sicura già usata per le coordinate, round 6/7 in probe.ts).
  OPTIONAL { ?cis dc:type ?dcType . }
  # l0:description — verificato reale sullo stesso record (§3bis), maggioritario nel campione
  # (probe copertura-campi-arricchenti: 281/443). OPTIONAL indipendente in cima allo scope, stessa
  # forma sicura di dc:type sopra.
  OPTIONAL { ?cis l0:description ?description . }
  # Contatti — predicati del VALORE letterale (non solo l'esistenza del nodo) verificati reali sui
  # 3 nodi contatto di Canepina/105665, un salto oltre a dove --describe si era fermato (probe
  # contatti-canepina-un-salto-oltre, MIC_DATA_SOURCES.md §12): sm:telephoneNumber, sm:emailAddress
  # (letterale "mailto:...", ripulito in micBindingToPlaceCandidate), sm:URL. Percorsi di proprietà
  # (mai annidati in OPTIONAL multipli) — SELECT DISTINCT a monte evita duplicati quando lo stesso
  # valore è raggiungibile da più OnlineContactPoint dello stesso CIS (visto su Canepina: 2 contact
  # point, stesso numero di telefono su entrambi).
  OPTIONAL { ?cis sm:hasOnlineContactPoint/sm:hasTelephone/sm:telephoneNumber ?phone . }
  OPTIONAL { ?cis sm:hasOnlineContactPoint/sm:hasEmail/sm:emailAddress ?email . }
  OPTIONAL { ?cis sm:hasOnlineContactPoint/sm:hasWebSite/sm:URL ?website . }
  OPTIONAL { ?cis geo:lat ?lat1 ; geo:long ?long1 . }
  OPTIONAL { ?site geo:lat ?lat2 ; geo:long ?long2 . }
  OPTIONAL { ?cis clvapit:hasGeometry ?geomA . ?geomA clvapit:lat ?lat3 ; clvapit:long ?long3 . }
  OPTIONAL { ?site clvapit:hasGeometry ?geomB . ?geomB clvapit:lat ?lat4 ; clvapit:long ?long4 . }
  BIND(COALESCE(?lat1, ?lat2, ?lat3, ?lat4) AS ?lat)
  BIND(COALESCE(?long1, ?long2, ?long3, ?long4) AS ?long)
  FILTER(BOUND(?lat) || BOUND(?address))
}
LIMIT ${limit}`
}

// dati.cultura.gov.it è un endpoint pubblico condiviso, non dedicato a questo script — visto dal
// vivo: un --describe è fallito con "ConnectTimeoutError... timeout: 10000ms" (il timeout di
// connessione di undici, più stretto dei 60s di AbortSignal sotto, che copre solo la risposta una
// volta stabilita la connessione). Stesso trattamento del retry con backoff già aggiunto a
// scripts/places/wikidata/enrich.ts dopo un problema analogo (502 lì, connect timeout qui).
const TRANSIENT_STATUS = new Set([429, 500, 502, 503, 504])
const MAX_RETRIES = 4

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchSparqlJson(query: string): Promise<unknown> {
  let lastError: unknown
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(1000 * 2 ** (attempt - 1)) // 1s, 2s, 4s, 8s

    let res: Response
    try {
      res = await fetch(SPARQL_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/sparql-results+json',
          'User-Agent': USER_AGENT,
        },
        body: `query=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(60000),
      })
    } catch (e) {
      // Errore di rete/timeout (incluso il ConnectTimeoutError visto dal vivo) — stesso
      // trattamento di uno status transitorio.
      lastError = e
      continue
    }
    if (res.ok) return res.json()
    // FIX (2026-09-17, quinto round — visto dal vivo: un 500 su "tutta Italia"/limit 10000 è
    // arrivato in log come solo "MiC SPARQL 500", senza corpo, perché 500 è in TRANSIENT_STATUS e
    // il ramo sotto scartava il testo della risposta prima di esaurire i retry — nessun modo di
    // sapere se fosse un rifiuto immediato del pianificatore (come il caso CONTAINS/LCASE) o un
    // timeout reale dopo esecuzione lenta. Il corpo va letto e conservato ad ogni tentativo, non
    // solo per gli status non transitori.
    const bodyText = (await res.text()).slice(0, 500)
    if (!TRANSIENT_STATUS.has(res.status)) throw new Error(`MiC SPARQL ${res.status}: ${bodyText}`)
    lastError = new Error(`MiC SPARQL ${res.status}: ${bodyText}`)
  }
  throw lastError instanceof Error ? lastError : new Error('MiC SPARQL: troppi tentativi falliti')
}

async function querySparql(query: string): Promise<MicBinding[]> {
  const data = await fetchSparqlJson(query) as { results: { bindings: Record<string, { value: string }>[] } }
  const out: MicBinding[] = []
  for (const row of data.results.bindings) {
    const iri = row.cis?.value
    if (!iri) continue
    const id = iri.split('/').pop()
    if (!id) continue
    // Assenti (non più NaN-e-scartate) quando ArCo non porta geometria per questo record — il
    // filtro SPARQL sopra ora lascia passare anche questi, fillMissingCoordinates() li geocodifica
    // prima che main() li scarti per davvero (hasCoordinates, se anche quello fallisce).
    const rawLat = row.lat ? parseFloat(row.lat.value) : NaN
    const rawLon = row.long ? parseFloat(row.long.value) : NaN
    const lat = Number.isNaN(rawLat) ? undefined : rawLat
    const lon = Number.isNaN(rawLon) ? undefined : rawLon

    // `?? 'fallback'` da solo non basta: verificato dal vivo su un record Lombardia (via
    // fillMissingCoordinates, 2026-09-22) che `name` è una tripla PRESENTE ma con valore stringa
    // vuota — mai visto prima perché quei record erano sempre stati scartati a monte per mancanza
    // di coordinate. Una stringa vuota non è `undefined`, `??` non scatta, e un pin senza nome
    // finirebbe in ricerca. `.trim()` tratta anche whitespace-only allo stesso modo.
    const rawName = row.name?.value?.trim()

    out.push({
      id,
      name: rawName || 'Luogo della cultura',
      description: row.description?.value,
      typeLabel: row.typeLabel?.value,
      dcType: row.dcType?.value,
      comune: row.comune?.value,
      region: row.regionLabel?.value,
      address: row.address?.value,
      lat,
      lon,
      phone: row.phone?.value,
      email: row.email?.value,
      website: row.website?.value,
    })
  }
  return out
}

// ── Geocodifica di ripiego (Nominatim/OSM) per i record senza coordinate dirette in ArCo ───────
// Vedi la nota FIX 2026-09-21 sopra buildSparqlQuery per il perché esistono record così (Lombardia/
// Toscana). Precisione: `address` di ArCo è tipicamente un indirizzo SENZA numero civico
// ("Piazza X", "Via Y") — Nominatim lo geocodifica al centroide della via/piazza, non
// all'edificio: buono per un luogo puntuale come una piazza (decine di metri), più incerto per una
// via lunga. Mai spacciato per preciso quanto una coordinata diretta — vedi `geocoded`/
// `coordinatesGeocoded`/confidenza ridotta in micBindingToPlaceCandidate.
const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search'
// Policy d'uso Nominatim (operations.osmfoundation.org/policies/nominatim): max 1 richiesta al
// secondo, MAI in parallelo. 1100ms invece di 1000 per un margine contro il jitter di rete.
const NOMINATIM_DELAY_MS = 1100
// Bounding box dell'Italia coi margini (Sicilia/Sardegna/Alpi) — un risultato di Nominatim fuori da
// qui è quasi certamente un omonimo (stessa via in un altro Paese), mai accettato in silenzio.
const ITALY_BBOX = { minLat: 35, maxLat: 47.5, minLon: 6, maxLon: 19 }

interface GeocodeResult { lat: number; lon: number }

// Un solo tentativo, nessun retry: è un arricchimento best-effort, non il percorso dati primario —
// un fallimento qui significa solo che quel record resta escluso da questo giro (mai un errore
// fatale per l'intero import, mai ripetuto a raffica contro un servizio pubblico condiviso).
async function geocodeAddress(query: string): Promise<GeocodeResult | null> {
  const url = `${NOMINATIM_ENDPOINT}?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=it`
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const results = await res.json() as { lat: string; lon: string }[]
    const first = results[0]
    if (!first) return null
    const lat = parseFloat(first.lat)
    const lon = parseFloat(first.lon)
    if (Number.isNaN(lat) || Number.isNaN(lon)) return null
    if (lat < ITALY_BBOX.minLat || lat > ITALY_BBOX.maxLat || lon < ITALY_BBOX.minLon || lon > ITALY_BBOX.maxLon) return null
    return { lat, lon }
  } catch {
    return null
  }
}

// Sequenziale per costruzione (MAI Promise.all — violerebbe il limite di 1 richiesta/secondo sopra)
// — muta e restituisce lo stesso array, toccando solo i binding privi di coordinate dirette.
async function fillMissingCoordinates(bindings: MicBinding[]): Promise<void> {
  const missing = bindings.filter(b => b.lat === undefined || b.lon === undefined)
  if (missing.length === 0) return
  console.log(`${missing.length} record senza coordinate dirette — tento la geocodifica (Nominatim, ~1/sec)…`)

  let resolved = 0
  for (const b of missing) {
    // Un comune è il minimo per una geocodifica non arbitraria — senza, l'unico testo disponibile
    // sarebbe la sola regione ("Lombardia, Italia"), troppo grossolano per un pin utile.
    if (!b.comune) continue
    const query = [b.address, b.comune, b.region, 'Italia'].filter(Boolean).join(', ')
    const result = await geocodeAddress(query)
    await sleep(NOMINATIM_DELAY_MS)
    if (result) {
      b.lat = result.lat
      b.lon = result.lon
      b.geocoded = true
      resolved++
    }
  }
  console.log(`  geocodifica: ${resolved}/${missing.length} risolti.`)
}

// Pura, testabile senza rete.
export function hasCoordinates(b: MicBinding): b is MicBinding & { lat: number; lon: number } {
  return b.lat !== undefined && b.lon !== undefined
}

// ── "Tutta Italia": query per-regione, mai una query unica non filtrata ────────────────────────
// FIX (2026-09-17, quinto round — bug segnalato dal vivo: dopo il fix del round 4, "Regione: tutta
// Italia, Limit: 10000" non dava più 0 risultati silenziosi ma un `MiC SPARQL 500` dopo tutti i
// retry). Causa più probabile, non ancora confermata (il corpo dell'errore non era leggibile prima
// del fix a fetchSparqlJson sopra — la prossima esecuzione lo dirà con certezza): senza un filtro
// regione a restringere subito lo spazio di ricerca, la sotto-query con i 4 OPTIONAL coordinate +
// FILTER(BOUND(...)) deve scandire l'intero catalogo (decine di migliaia di CulturalInstituteOrSite)
// per trovare fino a 10000 record georeferenziati — lo stesso genere di esplosione di costo già
// visto con CONTAINS/LCASE, ma qui per assenza di un filtro selettivo invece che per un filtro non
// indicizzabile.
//
// La query per-regione con uguaglianza esatta È invece verificata veloce e corretta (round 3,
// 200/<300ms). Invece di tentare "tutta Italia" come un'unica query non filtrata, "tutta Italia" ora
// interroga una regione alla volta, usando le etichette REALI presenti nel grafo (mai una lista di
// nomi regione indovinata — vedi nota di verifica in cima al file) fino a raggiungere `limit` o
// esaurire le regioni. `clvapit:hasRegion`/`rdfs:label` senza filtro è già stato provato veloce
// (probe round 1, <1.3s) — REGION_LIST_QUERY sotto è lo stesso predicato, solo con DISTINCT invece
// di un LIMIT piccolo.
// Non ancora verificato dal vivo (sandbox senza rete verso l'endpoint) — testare con
// `--dry-run --limit 20` prima di un `write` con limit alto.
const REGION_LIST_QUERY = `
PREFIX cis: <http://dati.beniculturali.it/cis/>
PREFIX clvapit: <https://w3id.org/italia/onto/CLV/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT DISTINCT ?regionLabel WHERE {
  ?cis a cis:CulturalInstituteOrSite ;
       cis:hasSite ?site .
  ?site cis:siteAddress ?addr .
  ?addr clvapit:hasRegion ?regionRes .
  ?regionRes rdfs:label ?regionLabel .
}
LIMIT 100`

// FIX (2026-09-17, sesto round — bug segnalato dal vivo: "tutta Italia"/limit 10000 ha dato
// "100 regioni trovate nel grafo" — l'Italia ne ha 20 — seguito da
// `Virtuoso 42000 Error The estimated execution time -907544064 (sec) exceeds the limit`, un numero
// NEGATIVO tipico di un overflow di interi del pianificatore, non il rifiuto "pulito" già visto col
// caso CONTAINS/LCASE. `clvapit:hasRegion` non è vincolato a restituire solo vere regioni — con
// `REGION_LIST_QUERY` senza alcun filtro di validità, un'etichetta rara o sporca tra le 100 può
// mandare in confusione lo stimatore di costo per quel valore specifico quando usato
// nell'uguaglianza esatta. Le 20 regioni italiane sono un'enumerazione fissa e nota (non una
// deduzione da documentazione, come il thesaurus dei tipi MiC) — filtrare l'elenco scoperto dal
// grafo contro questa lista, invece di fidarsi di ogni valore distinto restituito, evita di
// interrogare mai con un valore sporco. Compromesso accettato: un'etichetta reale con
// capitalizzazione diversa da questa lista verrebbe scartata silenziosamente — già osservato però
// che "Lazio" nel grafo usa esattamente questa capitalizzazione (round 3).
const ITALIAN_REGIONS = new Set([
  'Abruzzo', 'Basilicata', 'Calabria', 'Campania', 'Emilia-Romagna',
  'Friuli-Venezia Giulia', 'Lazio', 'Liguria', 'Lombardia', 'Marche',
  'Molise', 'Piemonte', 'Puglia', 'Sardegna', 'Sicilia', 'Toscana',
  'Trentino-Alto Adige', 'Umbria', "Valle d'Aosta", 'Veneto',
])

// Pura, testabile senza rete.
export function filterToKnownRegions(labels: string[]): string[] {
  return labels.filter(label => ITALIAN_REGIONS.has(label))
}

async function fetchRegionLabels(): Promise<string[]> {
  const data = await fetchSparqlJson(REGION_LIST_QUERY) as { results: { bindings: Record<string, { value: string }>[] } }
  const raw = data.results.bindings
    .map(row => row.regionLabel?.value)
    .filter((label): label is string => !!label)
  return filterToKnownRegions(raw)
}

async function fetchAllRegions(limit: number): Promise<MicBinding[]> {
  const regions = await fetchRegionLabels()
  console.log(`${regions.length} regioni valide trovate nel grafo — interrogo una alla volta.`)
  const out: MicBinding[] = []
  for (const region of regions) {
    if (out.length >= limit) break
    const remaining = limit - out.length
    // FIX (sesto round): un errore su una singola regione non deve abortire l'intero "tutta
    // Italia" — l'endpoint si è già dimostrato imprevedibile per valori/piani specifici (round 3,
    // round 6) anche con un filtro whitelisted. Logga e continua con le regioni restanti invece di
    // perdere tutto il lavoro già fatto.
    try {
      const bindings = await querySparql(buildSparqlQuery(region, remaining))
      console.log(`  ${region}: ${bindings.length} risultati con coordinate valide.`)
      out.push(...bindings)
    } catch (e) {
      console.error(`  ${region}: saltata — ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return out
}

// ── Diagnostica (--describe) ─────────────────────────────────────────────────────────────────
// Due tentativi di correggere il predicato delle coordinate (geo:lat/geo:long su ?site, poi
// clv:hasGeometry/clv:lat/clv:long su tre percorsi diversi) hanno entrambi dato 0 risultati contro
// l'endpoint reale, dedotti leggendo l'ontologia invece che i dati veri. Un primo --describe (dump
// a 2 salti da un CIS reale) ha rivelato il collegamento VERO: `cis:hasSite` (semplice, diretto —
// non loc:hasTimeIndexedTypedLocation/atSite come assunto in entrambi i tentativi precedenti), su
// un nodo reale `Site/Sede_di_7275`. Quel primo dump si è fermato un salto troppo presto per vedere
// COSA c'è dentro quel Site — questa seconda query segue `cis:hasSite` e dumpa le proprietà dirette
// del Site (più un salto in più, nel caso le coordinate siano un ulteriore livello sotto, es. via
// un nodo Address/Geometry) — dovrebbe rivelare direttamente il predicato delle coordinate.
const DESCRIBE_QUERY = `
PREFIX cis: <http://dati.beniculturali.it/cis/>
SELECT ?cis ?p1 ?o1 ?p2 ?o2 WHERE {
  { SELECT ?cis WHERE { ?cis a cis:CulturalInstituteOrSite . } LIMIT 1 }
  ?cis ?p1 ?o1 .
  OPTIONAL { ?o1 ?p2 ?o2 . }
}`

const DESCRIBE_SITE_QUERY = `
PREFIX cis: <http://dati.beniculturali.it/cis/>
SELECT ?cis ?site ?p1 ?o1 ?p2 ?o2 WHERE {
  { SELECT ?cis WHERE { ?cis a cis:CulturalInstituteOrSite . } LIMIT 1 }
  ?cis cis:hasSite ?site .
  ?site ?p1 ?o1 .
  OPTIONAL { ?o1 ?p2 ?o2 . }
}`

// Variante di DESCRIBE_QUERY/DESCRIBE_SITE_QUERY filtrata per nome invece che su un record
// arbitrario (--describe "Museo X") — per verificare se ArCo porta per DAVVERO campi che la query
// di importo principale sopra non chiede (orari, foto, contatti, biglietti: assenti dall'ontologia
// "location" già letta, vedi discussione "Guida Borgo/Città e Sito" — potrebbero comunque vivere
// su altre proprietà del CIS/Site che solo un dump reale rivela). Il filtro è sullo stesso pattern
// diretto `?cis a cis:CulturalInstituteOrSite ; rdfs:label ?name` già usato senza problemi nella
// query di importo (nessun salto OPTIONAL prima del filtro) — non lo stesso pattern che aveva fatto
// esplodere lo stimatore di Virtuoso sul filtro regione (quello passava per due OPTIONAL
// concatenati, siteAddress→hasRegion, prima del filtro).
function buildDescribeByNameQuery(name: string): string {
  const escaped = name.replace(/"/g, '')
  return `
PREFIX cis: <http://dati.beniculturali.it/cis/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?cis ?p1 ?o1 ?p2 ?o2 WHERE {
  { SELECT ?cis WHERE {
      ?cis a cis:CulturalInstituteOrSite ; rdfs:label ?name .
      FILTER(CONTAINS(LCASE(?name), LCASE("${escaped}")))
    } LIMIT 1 }
  ?cis ?p1 ?o1 .
  OPTIONAL { ?o1 ?p2 ?o2 . }
}`
}

function buildDescribeSiteByNameQuery(name: string): string {
  const escaped = name.replace(/"/g, '')
  return `
PREFIX cis: <http://dati.beniculturali.it/cis/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?cis ?site ?p1 ?o1 ?p2 ?o2 WHERE {
  { SELECT ?cis WHERE {
      ?cis a cis:CulturalInstituteOrSite ; rdfs:label ?name .
      FILTER(CONTAINS(LCASE(?name), LCASE("${escaped}")))
    } LIMIT 1 }
  ?cis cis:hasSite ?site .
  ?site ?p1 ?o1 .
  OPTIONAL { ?o1 ?p2 ?o2 . }
}`
}

async function runSparqlDiagnostic(label: string, query: string): Promise<void> {
  console.log(`Interrogo ${SPARQL_ENDPOINT} — ${label}…`)
  const data = await fetchSparqlJson(query)
  console.log(JSON.stringify(data, null, 2))
}

async function runDescribe(name: string | null): Promise<void> {
  if (name) {
    console.log(`Cerco un CulturalInstituteOrSite il cui rdfs:label contiene "${name}"…`)
    await runSparqlDiagnostic(`struttura reale di "${name}"`, buildDescribeByNameQuery(name))
    await runSparqlDiagnostic(`proprietà dirette del suo Site (via cis:hasSite)`, buildDescribeSiteByNameQuery(name))
    return
  }
  await runSparqlDiagnostic('struttura reale di un CulturalInstituteOrSite (record arbitrario)', DESCRIBE_QUERY)
  await runSparqlDiagnostic('proprietà dirette del suo Site (via cis:hasSite)', DESCRIBE_SITE_QUERY)
}

async function main() {
  if (process.argv.includes('--describe')) {
    const nameIdx = process.argv.indexOf('--name')
    const name = nameIdx !== -1 ? process.argv[nameIdx + 1] : null
    await runDescribe(name)
    return
  }

  const DRY_RUN = process.argv.includes('--dry-run')
  const regionIdx = process.argv.indexOf('--region')
  const region = regionIdx !== -1 ? process.argv[regionIdx + 1] : 'Lazio'
  const limitIdx = process.argv.indexOf('--limit')
  const limit = limitIdx !== -1 ? parseInt(process.argv[limitIdx + 1], 10) : 5000

  console.log(`Interrogo ${SPARQL_ENDPOINT} (regione: ${region || 'tutte'}, limit ${limit})…`)
  const bindings = region
    ? await querySparql(buildSparqlQuery(region, limit))
    : await fetchAllRegions(limit)
  console.log(`${bindings.length} risultati (con o senza coordinate dirette).`)
  await fillMissingCoordinates(bindings)
  const geocodable = bindings.filter(hasCoordinates)
  console.log(`${geocodable.length} risultati con coordinate valide (dirette o geocodificate).`)
  const candidates = geocodable.map(micBindingToPlaceCandidate)

  if (DRY_RUN) {
    console.log('[DRY RUN] Esempio candidato:', JSON.stringify(candidates[0], null, 2))
    console.log(`[DRY RUN] ${candidates.length} candidati pronti, nessuna scrittura.`)
    return
  }

  const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY) env vars, oppure usa --dry-run.')
    process.exit(1)
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
  const stats = await importPlaceCandidates(supabase, candidates)
  console.log(JSON.stringify(stats, null, 2))
}

const isDirectRun = process.argv[1]?.endsWith('fetch.ts') && process.argv[1]?.includes('mic')
if (isDirectRun) {
  main().catch(err => { console.error(err); process.exit(1) })
}
