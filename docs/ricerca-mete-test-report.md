# Report: ricerca Borghi/Città e Siti — implementazione di test

Branch `claude/search-borghi-citta-siti-pcqo05` (11 commit, `e21a5ba`..`2b3137a`, sopra la punta
di `main` a `0d5cb39`). Costruita come **banco di prova**, deliberatamente fuori dalla navigazione
principale — l'unico ingresso è un link "Test ricerca Borghi/Siti" in `/profilo`.

**Decisione presa a valle di questo report** (dall'utente, in chat): la ricerca funziona bene e va
promossa a sistema di ricerca vero dell'app, spostandola dal flusso "Crea una guida" → Importazioni
(`/upload`, GPX/percorso) alla pagina Crea Guida stessa, come modo alternativo di creare una Guida
(per un Borgo/Città o un Sito, non solo per un Sentiero). Quel lavoro è la prossima sessione,
insieme alla revisione del layout di Crea Guida — questo file è il punto di partenza: cosa esiste
già, dove, e con quali limiti.

## Cosa c'è oggi, e dove

| Cosa | File | Note |
|---|---|---|
| Pagina di test (Lista/Mappa) | `app/test-ricerca-mete/page.tsx` | Ricerca per tipo/regione/categoria/testo su `/api/meta-search` (già esistente prima di questa sessione) + tab Mappa |
| Mappa multi-tipologia | `components/mete/MeteSearchMap.tsx` | Borghi/Città + Siti (Supabase) + Sentieri salvati (`/api/percorsi`) + Sentieri da cache OSM (`/api/trails-nearby`, nuovo) sulla stessa mappa Leaflet, pin/tracciati colorati per tipologia, pattern "Cerca in quest'area" |
| Scheda di dettaglio | `app/mete/[id]/page.tsx` + `app/api/places/[id]/route.ts` (nuovo) | Copertina, pillole, descrizione (+ arricchimento Wikipedia per un Sito senza descrizione), mappa a singolo pin, informazioni, fonti |
| Itinerario a piedi (solo Borgo/Città) | `app/api/borgo-itinerary/route.ts`, `lib/metaSearch/borgoItinerary.ts`, `components/mete/ItineraryMap.tsx` | Tappe da archivio + Wikipedia dal vivo, cammino reale sulla rete pedonale OSM (non linee dritte) |
| "Chiedi a Giulia" su una Meta | `app/api/mete/qa/route.ts`, `components/mete/PlaceQA.tsx` | Stesso pattern di `app/api/guide/qa/route.ts` (Percorsi), scoped su un `placeId` |
| Instradamento pedonale condiviso | `lib/routeBuilder/walkRouting.ts` | Dijkstra + ricostruzione percorso, estratto da `lib/navigation/escapeEngine.ts` per essere riusato anche qui |
| Cache trails OSM (già esistente) | `lib/trailsCache.ts`, esposta ora anche via `app/api/trails-nearby/route.ts` (nuovo) | Stessa fonte della ricerca "Esistenti" del wizard Costruisci-o-trova |

Tutte le pagine/endpoint sopra sono nuovi in questa sessione, tranne dove segnato "già esistente".

## Come si arriva lì oggi (provvisorio)

`/profilo` → "Test ricerca Borghi/Siti" → `/test-ricerca-mete` (Lista o Mappa) → tocca un
risultato/pin → `/mete/[id]` (scheda, itinerario se Borgo, Giulia).

## Cosa riusa (infrastruttura già esistente, non toccata)

- **Ricerca/ranking**: `lib/metaSearch/searchBorghi.ts`, `searchSiti.ts`, `index.ts` (`searchMeta`),
  dietro `POST /api/meta-search` — query + ranking deterministico su `dtrek_places`, mai un LLM a
  decidere quali Mete esistono (piano `docs/piano-mete-multitipologia.md` §21).
- **Rete pedonale OSM**: `lib/routeBuilder/osmGraph.ts` + `walkNetworkCache.ts` — la stessa identica
  infrastruttura (fetch Overpass + cache Supabase) già in produzione per generare i Sentieri.
  L'itinerario Borgo la riusa per un cammino reale, non linee d'aria.
- **Wikipedia**: `lib/wikipedia.ts` (`searchAndFetch`, `fetchNearbyWiki`) — fetch dal vivo, MAI
  cachata in Supabase. Già usata altrove (POI dei Sentieri).
- **Pattern "Chiedi a Giulia"**: `app/api/guide/qa/route.ts` + `components/guida/widgets/GuideQA.tsx`
  — persona, streaming NDJSON, tag `[pertinenza]`, cronologia persistita, ricerca web opzionale,
  chiave AI/modalità degradata. Replicato 1:1 per le Mete, non generalizzato nello stesso file (un
  Sito/Borgo non ha metriche di percorso da passare come fallback).
- **Mete salvate dell'utente**: `GET /api/percorsi` — tutte le Mete (Sentiero/Borgo/Sito) già
  salvate dall'utente, con `latitude`/`longitude` sempre valorizzate (colonna o primo punto della
  traccia). La mappa di test lo filtra a `metaType === 'sentiero'` per i pin "Percorso".

## Database — migration applicate (produzione, via Supabase MCP in questa sessione)

- `supabase/migrations/add_place_questions_table.sql` — tabella `place_questions` (stesso
  schema/RLS di `guide_questions`), per la cronologia di Giulia su una Meta.
- `supabase/migrations/flag_mic_sito_duplicate_coordinates.sql` — marca 391 Siti da MiC/ArCo con
  coordinate identiche condivise fra loro (bug sospetto nella query SPARQL d'importazione, vedi
  sotto) come `metadata.coordinatesUnreliable = true`, esclusi dalla ricerca.
- `supabase/migrations/recover_mic_sito_duplicate_coordinates_to_municipality_centroid.sql` —
  riposiziona quelle 391 righe sul centroide del loro Comune (preso dal `borgo_citta`
  corrispondente, sempre trovato senza ambiguità), le rimette in ricerca con
  `metadata.coordinatesApproximate = true`. Confidenza abbassata a 0.4.

## Bug trovati e corretti in questa sessione

1. **Crash aprendo la scheda di un Borgo/Città** (`app/api/places/[id]/route.ts`, ora corretto) —
   `dtrek_places.subtype` ha significato diverso per tipologia (categoria per un `borgo_citta`,
   `SiteType` per un `sito`); leggerlo sempre come `SiteType` mandava
   `SITE_TYPE_CONFIG['borgo']` (chiave inesistente) in crash al primo `.label`.
2. **Centroide impreciso per un Sito OSM da poligono** (`scripts/places/osm/fetch.ts`, funzione
   `wayCentroid`, ora corretta) — la media semplice dei vertici di un poligono (perimetro di un
   castello/area archeologica) pesa di più i tratti con nodi più fitti, spostando il punto dal
   vero centro. Ora un vero centroide d'area (formula dello shoelace). **Non retroattivo**: vale
   solo per i prossimi import OSM, non per righe già importate.
3. **391 Siti MiC/ArCo con coordinate duplicate** — un punto (centro Roma) condiviso da 20 luoghi
   scollegati sparsi in tutta Italia. Causa sospetta (non verificabile da un sandbox senza accesso
   a `dati.cultura.gov.it`, solo GitHub Actions ci arriva): nella query SPARQL di
   `scripts/places/mic/fetch.ts`, `?site` può restare una variabile libera invece che assente
   quando un record non ha un `cis:hasSite`, legandosi a una risorsa arbitraria del grafo
   (prodotto incrociato SPARQL). **Non ancora corretto alla fonte** — solo quarantena + recupero
   dati (vedi migration sopra). Il fix alla query resta da fare, testabile solo via GitHub Actions.

## Limiti onesti da sapere prima di integrare in Crea Guida

- **Nessun salvataggio**: un itinerario Borgo è generato al momento, ogni volta, non persistito
  come Guida. Il ponte esistente `lib/useCreateMetaFromSearch.ts` (già in repo, crea una Meta da un
  risultato di ricerca e apre `/guida/{id}/prima_di_partire`) non è ancora collegato a questo
  flusso — per un Sentiero `metaSearchResultToPlannedHike` rifiuta esplicitamente un `metaType`
  diverso da `'borgo_citta'`/`'sito'` (vedi `lib/metaToPlannedHike.ts`), quindi il ponte funziona
  già per Borgo/Sito, ma per l'itinerario stesso (tappe + tracciato) serve un nuovo passo di
  salvataggio non ancora scritto.
- **Ordine delle tappe**: vicino-più-vicino (greedy nearest-neighbor), non un vero TSP ottimizzato
  — per poche tappe in un centro storico la differenza è trascurabile, ma non è "il giro migliore
  in assoluto".
- **391 Siti restano a precisione di Comune**, non il punto esatto — `metadata.coordinatesApproximate`
  lo segnala, la UI lo mostra esplicitamente. Una geocodifica precisa resta da fare.
- **Bug SPARQL MiC non corretto alla fonte** — vedi sopra, punto 3.
- **`GuidaHub.tsx`/`RouteHub.tsx` non toccati** — la scheda `app/mete/[id]/page.tsx` è un
  componente a sé, non integrato nel carosello/gesture della Guida di un Sentiero. Portare la
  ricerca dentro Crea Guida significherà decidere se questa scheda resta separata (un secondo
  "tipo" di risultato da Crea Guida) o se una parte confluisce in `RouteHub`/`GuidaHub`.
  `metaHasHikingMetrics`/`metaCardStats` (`lib/metaTypes.ts`, `lib/metaCard.ts`) esistono già
  apposta per rendere condizionali le metriche escursionistiche per tipologia, non ancora
  applicati dentro `GuidaHub.tsx`.
- **Nessuna azione "crea/salva questa Meta"** dalla mappa o dalla lista di `/test-ricerca-mete` —
  solo consultazione. Il ponte `useCreateMetaFromSearch` esiste ma non è collegato qui.

## Riferimenti di contesto già in repo

- `docs/piano-mete-multitipologia.md` — piano originale multi-tipologia (Borgo/Città/Sito/Sentiero),
  §48 vincoli tuttora validi (mai metriche escursionistiche per una tipologia non-sentiero, mai
  dedurre `metaType`, niente valori fabbricati, migration per ogni modifica al modello dati).
- `docs/piano-ricerca-mete.md` — piano di un hub di ricerca unico (`/percorsi/cerca`), implementato
  in una sessione precedente e poi **rimosso** da un commit di ripristino (`73b2efa`, "layout
  dell'app allo stato PR #741") insieme a `/atlante`. Il backend che quel piano descrive
  (`searchMeta`, `searchBorghi`, `searchSiti`) è sopravvissuto al ripristino ed è ciò che questa
  sessione ha riusato — utile leggerlo per capire le decisioni di design già prese e il perché di
  alcuni vincoli (es. Sentieri mai gestiti da `/api/meta-search`).
- `lib/metaTypes.ts` — `META_TYPE_CONFIG` (colori/icone/etichette per tipologia, usati ovunque in
  questa sessione) e `SITE_TYPE_CONFIG`.
