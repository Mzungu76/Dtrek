# Restyling pagina `/percorsi` ("Mete") — 3 direzioni + stato delle tipologie

Mockup mobile (390×844) per il ridisegno di `app/percorsi/page.tsx`, la pagina che elenca
le Mete non ancora camminate. Palette e tipografia sono quelle già in codice
(`lib/taccuinoTokens.tsx`, `tailwind.config.ts` → `botanico.*`): `#F5EDDD` carta, `#EBE0C8`
card, `#C0603D` terracotta, `#7C8F6E` salvia, `#5F7355` barra; Playfair Display / Lora /
DM Sans / Caveat, JetBrains Mono per i numeri. La barra inferiore riprende le tre voci reali
della versione mobile di `components/Navbar.tsx` (Mete, Diari rialzato, Navigator).

Canvas pubblicato: https://claude.ai/code/artifact/5682b210-a754-4200-a823-0efe7abe93c6

| File | Direzione | Idea portante |
|---|---|---|
| `Main.dc.html` | **A — Tre scaffali** | La tipologia è il filtro primario: segmentata Tutte / Sentieri / Borghi / Siti con i conteggi, elenco raggruppato per tipologia, ordinamenti che cambiano con il filtro attivo |
| `OptionB.dc.html` | **B — Registro unico** | Una sola lista cronologica: la tipologia è un timbro sulla riga (non una pagina a parte), righe compatte a due linee, colonna destra sempre con un numero — Trail Score, tappe o durata della visita |
| `OptionC.dc.html` | **C — La carta delle Mete** | La mappa di tutte le Mete in testa, pin di forma diversa per tipologia, foglio che sale con "più vicine a te" e l'elenco — la posizione è l'unico dato che tutte e tre le tipologie possiedono sempre |

Formato `.dc.html` come `docs/mockup-diari-redesign/` e `docs/mockup-taccuino-botanico/`:
richiedono il runtime del canvas editor, non sono codice da incollare nell'app. I titoli sono
Mete reali dell'utente; i valori di Borghi/Siti (tappe, durata visita, orari) sono **di
esempio** — vedi "Cosa manca davvero" sotto: oggi quei dati non esistono.

---

## 1. Cosa non funziona nella pagina di oggi

Osservazioni sul codice, non sul solo screenshot.

1. **Le miniature nere non sono un'immagine mancante, sono un bug di un layer.**
   `app/globals.css:218` — `.torn-filler{ background: #000 }`. I tre layer di `TornFrame`
   (`torn-ao`, `torn-rim`, `torn-cast`) sono neri *per progetto*: servono solo al loro
   `drop-shadow` e devono restare coperti dal contenuto reale in `.torn-content`. Per una Meta
   senza `routePolyline`, `app/percorsi/page.tsx` mette come fallback una sola icona `Mountain`
   senza sfondo → il nero passa. È una riga di CSS (fondo carta su `.torn-content`, o un
   riempimento opaco nel ramo di fallback), non un problema di dati.
2. **Il titolo di riga usa il font a mano a 19,5px con il line-height agganciato alla
   rigatura**: "Centro-Officina Arenaro (Muracciole)" occupa quattro righe e da solo è alto
   quanto un'intera riga di elenco. Tutte e tre le opzioni riportano il titolo su Lora 14–14,5
   con clamp a 1–2 righe, e lasciano il corsivo a mano al titolo di pagina.
3. **La riga di una Meta non-sentiero è vuota per costruzione.** Le pillole dati sono corrette
   nel non mostrare 0 km / 0 m D+ (`metaHasHikingMetrics`, piano §48.9), ma nulla le sostituisce:
   restano titolo e "in programma". Serve uno **slot metriche adattivo** per tipologia, non
   un'assenza.
4. **La tipologia non è visibile da nessuna parte nell'elenco**: non si distingue un borgo da un
   sentiero se non perché al borgo mancano i numeri.
5. **Due ricerche sovrapposte**: il bottone "Cerca un Borgo, una Città o un Sito" (un `Link` a
   `/percorsi/cerca`, `app/percorsi/page.tsx:117`) è graficamente identico a un campo di ricerca
   ed è messo sopra il campo di ricerca vero, che invece filtra solo per titolo fra le Mete già
   salvate. Un solo ingresso, con la tipologia scelta dentro la ricerca.
6. **Gli ordinamenti sono tutti escursionistici** (Data, Km, D+, TS): tre su quattro non
   significano nulla per due tipologie su tre.
7. **L'intestazione verde occupa 200px** (un quarto dello schermo) per titolo e conteggio: nei
   mockup scende a 112px (A, B) o diventa la mappa stessa (C).

## 2. Cosa manca davvero a Borghi/Città e Siti

Letto sul database di produzione (Supabase `sdxlcpxgbkagbxhukehd`), non ipotizzato.

### Il codice c'è quasi tutto
Blocchi A, C ed E del `docs/piano-mete-multitipologia.md` sono in gran parte fatti:
`meta_type`/`site_type` su `planned_hikes` e in `PlannedHike`; `lib/metaTypes.ts` con le 13
sottotipologie di Sito; `dtrek_places` / `dtrek_place_sources` / `dtrek_place_relations` con
PostGIS; `lib/metaSearch/` (searchBorghi, searchSiti, ranking, placeQuery); `/api/meta-search`
e la pagina `/percorsi/cerca`; `lib/metaCard.ts` type-aware; `lib/guideProfiles.ts` collegato a
`/api/guide`; `metaHasHikingMetrics` applicato in GuidaHub, Diario e API. Anche gli script ETL
esistono e sono testati: `scripts/places/{istat,ptpr,mic,osm,wikidata}` + dedupe.

### Quello che manca è il **contenuto**

| | Atteso | Reale |
|---|---|---|
| `dtrek_places` righe | Italia | **425**, tutte **Lazio** |
| di cui `meta_type='sito'` | ~decine di migliaia (MiC/PTPR/OSM) | **0** |
| `subtype` (borgo/città, museo/castello/…) | valorizzato | **NULL su tutte** |
| `image_url` | copertura parziale | **0** |
| `description` | da Wikidata/Wikipedia | **0** |
| `wikidata_id` / `official_url` | knowledge layer | **0 / 0** |
| `dtrek_place_relations` | tappe dentro un borgo | **0 righe** |
| Mete non-sentiero dell'utente | — | **4** (`route_polyline = []`, tutte le metriche 0) |

Conseguenze dirette, in ordine di peso:

1. **Nessun Sito è cercabile.** `/percorsi/cerca` con tipologia "Sito" interroga una tabella che
   per `meta_type='sito'` è vuota: la ricerca funziona, i risultati non esistono. È il solo
   import ancora da lanciare (`scripts/places/mic/fetch.ts`, `osm/fetch.ts`, `ptpr/`).
2. **Nessun itinerario è generabile.** `/api/meta-itinerary` esiste, è corretto e non è chiamato
   da nessuna schermata (`grep` su `.tsx` → zero) — e comunque `fetchContainedStops` leggerebbe
   `dtrek_place_relations`, che ha 0 righe. Il "6 tappe · 2h" dei mockup è quindi **il dato che
   andrà popolato**, non un dato esistente: è il primo pezzo di Blocco D.
3. **Nessuna immagine, nessuna descrizione.** `metaCardStats()` per un borgo restituisce oggi un
   array vuoto *per scelta corretta* (`borgoCardStats()` — niente valori fabbricati): finché
   Wikidata/Commons non è passato (`scripts/places/wikidata/enrich.ts`), la scheda di un borgo
   non ha nulla da dire. L'emblema disegnato nei mockup (skyline/tempio) è la risposta a
   `image_url = NULL` che regge anche a copertura completa.
4. **Borgo e Città non sono distinguibili**: `subtype` è NULL su tutte le 425 righe — l'import
   ISTAT lascia il campo vuoto di proposito (nota in `lib/metaTypes.ts`, la classificazione Dtrek
   è separata dall'anagrafe ISTAT e non è mai stata scritta).
5. **`/api/percorsi` non porta abbastanza dati per disegnare le tre opzioni**: `AllPercorsiRow`
   ha `metaType` ma non `siteType`, `placeId`, `imageUrl`, `municipality`/`region`, né lat/lon.
   Senza queste colonne nessuno dei tre mockup è implementabile (C ha bisogno di lat/lon per i
   pin, A e B della sottotipologia e del comune per la riga sotto il titolo).

## 3. Ordine di lavoro suggerito

Prima i costi bassi che si vedono subito, poi i dati, poi l'esperienza.

1. Fondo carta su `.torn-content` → spariscono le miniature nere (1 riga).
2. Titolo di riga su Lora + clamp → spariscono le righe alte quattro linee.
3. `/api/percorsi`: aggiungere `siteType`, `placeId`, `latitude`, `longitude`, `municipality`,
   `region`, `imageUrl` (join su `dtrek_places`).
4. Riscrivere l'elenco secondo l'opzione scelta: emblema per tipologia, timbro, slot metriche
   adattivo, ordinamenti per tipologia, un solo ingresso di ricerca.
5. Lanciare gli import dei Siti (MiC, OSM, PTPR) e l'arricchimento Wikidata (immagini,
   descrizioni), e assegnare `subtype` borgo/città.
6. Popolare `dtrek_place_relations` (tappe dentro un borgo) e collegare `/api/meta-itinerary` a
   una schermata: è la condizione perché "6 tappe · 2h consigliate" diventi un dato vero.

## 4. Come scegliere fra le tre

- **A — Tre scaffali** è la più onesta rispetto ai dati di oggi: mostrando i gruppi separati,
  47 sentieri e 4 borghi non si contendono la stessa griglia, e ogni gruppo può avere le sue
  colonne. Costo: la tipologia diventa un livello di navigazione in più.
- **B — Registro unico** è la più vicina al codice attuale (resta una `flex-col` di righe) ed è
  quella che invecchia meglio quando le Mete diventano centinaia e miste. Costo: con 47 sentieri
  su 53 Mete, borghi e siti restano sepolti finché non si filtra.
- **C — La carta delle Mete** è l'unica che dà a Borghi e Siti un dato forte da mostrare oggi —
  la posizione, che nel database c'è sempre (`latitude`/`longitude` NOT NULL) — e trasforma
  l'elenco in una scelta di gita. Costo: è la più lontana dall'attuale, richiede lat/lon in API,
  una mappa in testa alla pagina e prestazioni su 53+ pin.

Nessuna delle tre esclude le altre: la fascia di filtri per tipologia è la stessa in tutte e tre
e va comunque implementata; A e C possono convivere come due viste dello stesso elenco.
