# Report di ricognizione — Sorgenti dati MiC per "Luoghi della Cultura"

Data: 2026-09-21. Sessione: reverse engineering delle sorgenti dati ufficiali del Ministero
della Cultura per l'import dei Luoghi della Cultura in Dtrek. Caso di test: **Museo delle
tradizioni popolari di Canepina** (`https://cultura.gov.it/luogo/museo-delle-tradizioni-popolari-di-canepina`).

**Prima di leggere il resto**: sezione 0 spiega un vincolo tecnico di questa sessione che limita
cosa ho potuto verificare *io stesso, ora* — non inventato, dimostrato con i test sotto — e cosa
invece è già stato verificato dal vivo in sessioni precedenti di questo stesso repository
(tramite GitHub Actions, l'unico ambiente con accesso alla rete MiC).

---

## 0. Vincolo di rete di questa sessione (prova tecnica)

Questo ambiente (sandbox Claude Code) blocca l'accesso diretto in uscita a `cultura.gov.it`,
`dati.cultura.gov.it`, `beniculturali.it` e sottodomini, e in pratica alla quasi totalità dei
domini istituzionali italiani testati (persino `en.wikipedia.org`, `www.wikidata.org`,
`developers.italia.it`, `www.dati.gov.it`, `ondata.github.io`, `wiki.wikimedia.it`) — una policy
di egress molto restrittiva, non specifica a questo progetto. Prova:

```
$ curl -sS "$HTTPS_PROXY/__agentproxy/status"
"recentRelayFailures": [
  {"kind":"connect_rejected","detail":"gateway answered 403 to CONNECT (policy denial...)","host":"dati.cultura.gov.it:443"},
  {"kind":"connect_rejected","detail":"gateway answered 403 to CONNECT (policy denial...)","host":"cultura.gov.it:443"},
  {"kind":"connect_rejected","detail":"gateway answered 403 to CONNECT (policy denial...)","host":"opendata.cultura.gov.it:443"},
  {"kind":"connect_rejected","detail":"gateway answered 403 to CONNECT (policy denial...)","host":"trasparenza.cultura.gov.it:443"}
]
```

WebFetch (strumento separato) dà lo stesso esito (`EGRESS_BLOCKED`) su ogni dominio
`*.cultura.gov.it` / `*.beniculturali.it` provato, oltre a `media.beniculturali.it`,
`retemusei.regione.lazio.it`, `comune.canepina.vt.it`, `museidemos.it`. Funzionano invece
`raw.githubusercontent.com` (verificato) e lo strumento WebSearch (infrastruttura separata,
non passa da questo proxy). Ho anche provato a lanciare il workflow GitHub Actions già presente
in questo repo per l'import MiC (che **ha** accesso alla rete — vedi §3) direttamente da questa
sessione: **negato**, `403 Resource not accessible by integration` — l'integrazione GitHub di
questa sessione non ha il permesso `workflow_dispatch`.

**Conseguenza pratica**: non ho potuto eseguire IO STESSO, in questa sessione, una richiesta HTTP
reale contro `dati.cultura.gov.it`, il manuale REST OPENDATA, o Ecomic/I.PaC. Dove il report sotto
dice "verificato dal vivo", specifico sempre SE è stato verificato da questa sessione (via
WebSearch, unico canale disponibile) o da una sessione precedente di questo stesso repository
(via GitHub Actions, con log reali citati) — mai un'invenzione. Dove non è stato possibile
verificare nulla, lo dico esplicitamente invece di dedurre. **Sezione 15** propone come sbloccare
la verifica live di quanto resta aperto (REST OPENDATA, Ecomic/I.PaC, describe SPARQL mirato su
Canepina).

---

## 1. Cosa esiste già in Dtrek (per non duplicare/confliggere)

`scripts/places/mic/` (README, `fetch.ts`, `probe.ts`) implementa **già** la sorgente 3 della
lista del compito (LOD/SPARQL) — non partendo da zero:

- Sorgente identificata e verificata in sessioni precedenti: **ArCo** (Architettura della
  Conoscenza, progetto ICCD-MiBACT/CNR-ISTC), endpoint SPARQL `https://dati.cultura.gov.it/sparql`.
- Classe RDF verificata leggendo l'ontologia reale: `cis:CulturalInstituteOrSite`. Collegamento al
  Site verificato sui dati reali: `cis:hasSite` (non `hasTimeIndexedTypedLocation`, come invece
  suggerisce l'ontologia "location" — smentito da `--describe` su un record vero).
- Modalità diagnostiche già esistenti, **nessun Supabase richiesto**: `--describe` (dump 2-hop di
  un record arbitrario o, con `--name`, del primo record il cui `rdfs:label` contiene il testo
  dato) e `probe.ts` (test isolato per singolo predicato).
- Pipeline: `dtrek_places` (una riga per Meta deduplicata) + `dtrek_place_sources` (tutte le fonti
  che confermano la stessa Meta) — **provenienza per FONTE**, non ancora per CAMPO (vedi §14, è il
  gap principale rispetto a quanto richiesto in questo compito).
- Import **offline/batch**, mai live per-richiesta-utente (`docs/piano-mete-multitipologia.md`
  §9/§21) — un vincolo architetturale esplicito che qualunque nuova sorgente deve rispettare.
- **Limite noto e dichiarato**: `fetch.ts` non popola MAI `description` (per prudenza sulla
  licenza CC BY-SA 4.0 su contenuto editoriale) né orari/prezzi/contatti — solo dati anagrafici
  strutturati (nome, tipo, indirizzo, comune, coordinate, sito web).
- Workflow GitHub Actions `import-places-mic.yml` — **unico ambiente che raggiunge l'endpoint**
  (vedi §0). Home per la diagnostica dal vivo di questo dominio.

**Nessun conflitto**: il compito richiesto (provenienza per campo, orari/prezzi strutturati,
sorgenti aggiuntive REST/Ecomic/pagina) è un'estensione di questa pipeline esistente, non una
sostituzione. In questa sessione ho aggiunto solo un input diagnostico opzionale al workflow
(`describe_name`, per puntare `--describe --name` a "Canepina" invece che a un record arbitrario)
— nessun cambio allo schema o all'importer. Non ho ancora potuto eseguirlo (§0).

---

## 2. Le 8 sorgenti richieste — stato di verifica

| # | Sorgente | URL | Stato | Come verificato |
|---|----------|-----|-------|------------------|
| 1 | OPENDATA / ex DBUnico | `trasparenza.cultura.gov.it/pagina771_...` | Esiste, documentata pubblicamente | WebSearch (non fetch diretto, §0) |
| 2 | Web Services REST (manuale) | PDF `media.beniculturali.it/.../ex%20DBUnico20_Servizi_Rest_rev_1.7_Redacted.pdf` | Esiste, **contenuto non leggibile in questa sessione** | Trovato via WebSearch, dominio bloccato per il fetch (§0) |
| 3 | LOD "dg-org_luoghi" | `dati.beniculturali.it/lodview/resource/datasetLuoghiDellaCultura.html` | Esiste | WebSearch; già usato in Dtrek come ArCo (§1) |
| 4 | SPARQL `dati.cultura.gov.it/sparql` | — | **Attivo, verificato dal vivo** (Virtuoso 07.20.3239) | GitHub Actions di sessioni precedenti (log reali, §3) + WebSearch conferma stato attivo |
| 5 | JSON-LD/RDF del dataset | formati JSON-LD/Turtle/RDF-XML su `dati.beniculturali.it` | Documentato | WebSearch |
| 6 | Ecomic / I.PaC | `ecomic.cultura.gov.it/ipac/` | Esiste, **richiede registrazione/PDND** | WebSearch (§6) |
| 7 | API/endpoint usati dal sito cultura.gov.it | — | **Non tracciabile in questa sessione** (nessun accesso di rete al sito, §0) | Non verificato |
| 8 | Scraping HTML (ultima risorsa) | pagina luogo | Solo come fallback, non implementato | — |

---

## 3. SPARQL / LOD (ArCo) — quanto è verificato dal vivo

Prova reale, non dedotta, da un run GitHub Actions completato in una sessione precedente di
questo repository (`run_id 35255871436`, 2026-09-17, job "import", modalità `write`,
`ALL_ITALY=true`, `LIMIT=3000` — log recuperato in questa sessione via l'API GitHub):

```
Interrogo https://dati.cultura.gov.it/sparql (regione: tutte, limit 3000)…
19 regioni valide trovate nel grafo — interrogo una alla volta.
  Lazio: 495 risultati con coordinate valide.
  Sardegna: 260 risultati con coordinate valide.
  Toscana: 0 risultati con coordinate valide.
  Lombardia: 0 risultati con coordinate valide.
  Abruzzo: 235 risultati con coordinate valide.
  Basilicata: 82 risultati con coordinate valide.
  Campania: 348 risultati con coordinate valide.
  Liguria: 277 risultati con coordinate valide.
  Puglia: 221 risultati con coordinate valide.
  Sicilia: 3 risultati con coordinate valide.
  Umbria: 265 risultati con coordinate valide.
  Marche: 282 risultati con coordinate valide.
  Piemonte: 532 risultati con coordinate valide.
3000 risultati con coordinate valide.
{ "processed": 3000, "linkedToExisting": 510, "createdNew": 2488, "flaggedForReview": 971, "skippedInvalidCoordinates": 2, "errors": [] }
```

**Osservazioni verificate, non ipotesi**:
- L'endpoint è vivo e scrive dati reali in Supabase — questo NON è un test, è un'importazione di
  produzione realmente avvenuta.
- **Copertura molto disomogenea**: Toscana e Lombardia hanno dato **0** risultati con coordinate
  valide nello stesso run in cui Lazio ne ha dati 495 — o quelle regioni hanno pochissime
  coordinate popolate in ArCo, o la query fallisce silenziosamente su etichette/nodi diversi per
  quelle regioni (non ancora isolato — nessun `--describe --name` è mai stato eseguito su un
  record toscano o lombardo). **Da segnalare come limite di qualità della fonte**, non un bug
  certo di `fetch.ts`.
- Lazio (dove si trova Canepina) ha una copertura buona (495 record con coordinate).

**Cosa NON è ancora stato verificato dal vivo, nemmeno da sessioni precedenti**: nessun
`--describe --name` è mai stato eseguito puntando esplicitamente a "Canepina" — le uniche due
diagnostiche `--describe` reali fin qui sono su record diversi (CulturalInstituteOrSite/7275,
"Archivio di Stato di Firenze", e 100005, "Museo civico aufidenate", quest'ultimo trovato
dall'utente su LodView, non dall'endpoint). Ho preparato l'input del workflow per farlo
(`describe_name: Canepina`, §1) ma non ho i permessi per lanciarlo da questa sessione (§0/§15).

**Predicati confermati REALI sui due record esaminati finora** (dump a 2 salti,
`?cis ?p1 ?o1 . OPTIONAL { ?o1 ?p2 ?o2 }`): `rdfs:label`, `cis:hasSite`,
`loc:hasCulturalInstituteOrSiteType` → tipo con `rdfs:label`, `cis:siteAddress` →
`clvapit:fullAddress`/`hasCity`/`hasRegion`, coordinate su **due vocabolari diversi** a seconda del
record (`geo:lat`/`geo:long` diretti, oppure `clvapit:hasGeometry` → `clvapit:lat`/`clvapit:long`).
**Nessuna proprietà `description`, `OpeningHoursSpecification`, `Ticket`, `Offer`, o
`PriceSpecification` è mai comparsa in nessuno dei due dump reali finora esaminati** — ma
attenzione: il compito chiede esplicitamente di non assumere che l'assenza dalla prima query
significhi che il dato non esista altrove nel grafo. I due dump sono un campionamento di 2
record su un catalogo di ~25.000 (cifra da WebSearch, progetto Wikidata/Synapta che ha
sincronizzato dati MiBACT — non verificata con una COUNT reale in questa sessione) — non è una
prova di assenza generale, solo di assenza su QUEI due record. **La verifica specifica su
Canepina è la richiesta esplicita del compito e resta il passo mancante più importante** (§15).

---

## 4. REST OPENDATA / ex DBUnico — cosa si sa, cosa manca

Confermato via WebSearch (il MiC descrive pubblicamente questo sistema in questi termini):

- L'ex DBUnico, ora **OPENDATA**, è "una banca dati pensata per contenere le informazioni
  strategiche del MiC: luoghi della cultura, eventi, comunicati stampa, notizie" e funge anche da
  "content provider" per i siti web del Ministero.
- Manuale ufficiale: **"Servizi Rest Web Services - Manuale"**, pubblicato su
  `trasparenza.cultura.gov.it/pagina771_accessibilit-e-catalogo-dei-dati-metadati-e-banche-dati.html`,
  con il PDF effettivo su
  `media.beniculturali.it/mibac/files/boards/be78e33bc8ca0c99bff70aa174035096/PDF/OpenData/ex%20DBUnico20_Servizi_Rest_rev_1.7_Redacted.pdf`
  (rev 1.7; esiste anche una rev 1.6 non "Redacted" allo stesso path). Una copia più vecchia
  (DBUnico 2.0, non OPENDATA) risulta indicizzata anche su `docplayer.it` (non raggiungibile da
  questa sessione per un problema di risoluzione DNS lato strumento, non della policy di rete).
- I servizi di ricerca "si invocano con una chiamata HTTP in cui si specificano i parametri di
  filtro dei record (query-string) e restituiscono un file XML" conforme allo schema
  `MibacSchema.xsd`, scaricabile (secondo una fonte storica indicizzata) da
  `http://storico.beniculturali.it/mibac/xsd/MibacSchema.xsd`.
- Parametri di ricerca per il modulo "Luoghi": includono almeno **Regione** e **Provincia**
  (nessun parametro dichiarato come obbligatorio).

**Cosa NON sono riuscito a determinare con certezza, e quindi NON riporto come fatto** (per non
violare il vincolo "non inventare URL/endpoint/campi" del compito):
- L'URL base esatto del servizio REST (dominio/path di invocazione, es. qualcosa come
  `dbunicoweb`/`.asmx`/`.php` — nessuna fonte raggiungibile in questa sessione lo cita
  testualmente).
- Se esiste una ricerca per **ID** oltre che per Regione/Provincia/nome.
- Se e quali campi tra descrizione, orari, prezzo, biglietti, contatti, sito web, coordinate sono
  effettivamente nello schema XML — il manuale (unica fonte primaria) non è leggibile da qui.
- Se il servizio è ancora **operativo** oggi (2026) o è stato dismesso a favore di
  OPENDATA/Ecomic — nessuna fonte indicizzata lo conferma o smentisce esplicitamente per il 2026.

**Nessuna richiesta reale contro questo servizio è stata eseguita in questa sessione né, per
quanto risulta dalla history del repository, in nessuna sessione precedente** — a differenza del
SPARQL endpoint (§3), qui non esiste ancora né uno script né un run GitHub Actions. Riportato
esplicitamente come "non verificato", non taciuto.

---

## 5. Pagina cultura.gov.it — analisi tecnica

**Non è stato possibile intercettare traffico di rete o ispezionare l'HTML/JS della pagina in
questa sessione** (dominio bloccato, §0; nessun accesso a browser headless con rete verso quel
dominio). Quanto segue è tutto e solo ciò che WebSearch (sintesi di contenuto indicizzato, non un
fetch della pagina) ha restituito, con relativa cautela:

- Il sito ha una sezione di ricerca strutturata, `cultura.gov.it/luoghi/cerca-luogo`, e un
  sotto-progetto "Luoghi del contemporaneo" (`luoghidelcontemporaneo.cultura.gov.it`) che espone
  **export CSV/JSON** scaricabili dai risultati di ricerca — indizio che almeno una parte del sito
  MiC ha già un'interfaccia dati strutturata pubblica, separata dal LOD/SPARQL.
- **Nessuna conferma indipendente** di framework (Next.js o altro), di chiamate XHR/fetch/GraphQL,
  di JSON-LD/schema.org in pagina, o di un riferimento diretto a OPENDATA/DBUnico nel markup della
  scheda luogo — WebSearch non ha materiale su questo livello di dettaglio tecnico.
- **Confermato via WebSearch con una data precisa**: la pagina di Canepina mostra "Chiuso" per
  tutti i giorni della settimana, e l'ultimo aggiornamento dichiarato sulla pagina risale al
  **23 giugno 2020** — coerente con l'osservazione del committente che la pagina MiC "non va
  scelta automaticamente solo perché è MiC" (§10). Questo è il conflitto orari discusso al §10.

---

## 6. Ecomic / I.PaC

Confermato via WebSearch:

- **I.PaC** ("Infrastruttura e servizi digitali per il Patrimonio Culturale") è il "motore
  tecnologico" del nuovo ecosistema **Ecomic**, progetto della Direzione Generale Digitalizzazione
  e Comunicazione del MiC, gestito operativamente dall'Istituto Centrale per la Digitalizzazione
  del Patrimonio Culturale (ICDP, ex Digital Library).
- Espone servizi tramite **API pubbliche** e widget, organizzate come knowledge graph (relazioni
  beni–persone–luoghi–concetti).
- Esiste un **"Playground"** (`ecomic.cultura.gov.it/ipac/.../playground-...`) che permette di
  "esplorare il catalogo dei servizi API pubblicato tramite la **PDND** (Piattaforma Digitale
  Nazionale Dati), consultarne la documentazione, testare l'integrazione" — con registrazione
  richiesta nella sezione "Playground API" del sito, e documentazione Swagger accessibile tramite
  un **3Scale Developer Portal**.
- Esiste un "Manuale tecnico API CPA" (gennaio 2026) e "Linee Guida di Cooperazione con I.PaC v5.0"
  (dicembre 2025) — entrambi PDF non raggiungibili da questa sessione.

**Valutazione, senza inventare dettagli non confermati**: I.PaC/Ecomic sembra orientato a
istituzioni culturali come **fornitori** di contenuti digitalizzati (metadati, risorse digitali)
tramite la PDND, non necessariamente un catalogo pubblico e anonimo di "Luoghi della Cultura"
consultabile senza registrazione — la richiesta di iscrizione al Playground e l'accesso via PDND
suggeriscono un modello ad **autenticazione tecnica formale** (probabile OAuth2/PDND
Interoperabilità), diverso dal SPARQL/REST OPENDATA aperti. **Nessuna richiesta reale è stata
eseguita** — né in questa sessione (dominio bloccato) né risulta da alcuna sessione precedente.
Non è quindi possibile oggi dire con certezza se e come esponga i "Luoghi della Cultura" con lo
stesso identificativo di ArCo/OPENDATA. Da trattare come **sorgente da rivalutare in futuro**, non
da scartare né da usare ora.

---

## 7. Museo delle tradizioni popolari di Canepina — tabella di confronto

Fonti raggiungibili per questo confronto (via WebSearch, dominio non bloccato per quelle usate):
pagina MiC (sintesi via WebSearch, non fetch diretto — §0/§5), Rete Musei Lazio, Comune di
Canepina, Musei DEMOS/Comunità Montana dei Cimini. **Nessuna di queste è stata fetchata
direttamente in questa sessione** (tutte bloccate, §0) — i valori sotto sono quanto WebSearch ha
restituito come sintesi di quelle pagine, non una lettura diretta dell'HTML. Trattare come
attendibile per il confronto qualitativo, non come citazione letterale.

| Campo | OPENDATA REST | LOD/SPARQL (ArCo) | Ecomic/I.PaC | Pagina MiC | Altre fonti istituzionali | Valore finale proposto |
|---|---|---|---|---|---|---|
| Nome | non testato | non ancora cercato per nome (§3) | non testato | "Museo delle tradizioni popolari di Canepina" | idem (Rete Musei Lazio, Comune) | MiC/LOD (concordi) |
| Identificativo | non testato | ID numerico CulturalInstituteOrSite non ancora trovato per Canepina | non testato | slug URL, non un ID numerico | "DBUnico MIBACT ID" esiste come proprietà Wikidata (P5782) ma valore per Canepina non recuperato | **da recuperare** — ArCo via `--describe --name Canepina` (§15) |
| Tipologia | non testato | non ancora verificato (probabile "Museo etnografico"/museo) | non testato | "Museo" (categoria sito) | "museo" | concorde, bassa priorità |
| Descrizione | schema non confermato | **assente per design in Dtrek** (§1), non confermato nel grafo | non testato | presente (testo su convento carmelitano, 20 sezioni tematiche) | presente e più dettagliata (Comune/DEMOS: 1988, ex convento Carmelitani, vita rurale Alto Lazio) | **fonte istituzionale (Comune/DEMOS)**, non MiC (licenza contenuto da verificare) |
| Indirizzo | non testato | presente ma non verificato per Canepina | non testato | non confermato dal fetch (§5) | **Largo Maria de Mattias, 7 — 01030 Canepina (VT)** | fonte istituzionale |
| Comune | non testato | campo esistente in `fetch.ts` (`comune`) | non testato | Canepina | Canepina | concorde |
| Provincia | dichiarato come parametro di ricerca (§4) | non esposto direttamente da `fetch.ts` (solo comune/regione) | non testato | Viterbo | Viterbo | concorde |
| Regione | dichiarato come parametro di ricerca (§4) | campo esistente (`regionLabel`) | non testato | Lazio | Lazio | concorde |
| Coordinate | schema non confermato | copertura non garantita (§3) — da verificare per questo record specifico | non testato | non confermato dal fetch | non recuperate in questa sessione | **da verificare con `--describe --name Canepina`** |
| Telefono | non testato | non previsto dal modello attuale (§1) | non testato | non confermato dal fetch | **0761-327677** | fonte istituzionale |
| Email | non testato | non previsto | non testato | non confermato dal fetch | **info@cmcimini.it** | fonte istituzionale |
| Sito web | schema non confermato | campo esistente (`website`), non popolato per questo record | non testato | non confermato dal fetch | **www.cmcimini.it** | fonte istituzionale |
| Prenotazione | non testato | non previsto | non testato | non confermato dal fetch | non trovata esplicitamente | nessuna fonte disponibile |
| Giorni apertura / orari | schema non confermato | **non previsto dal modello attuale** — nessun predicato `OpeningHoursSpecification` osservato sui 2 record esaminati (§3), MAI cercato per Canepina | non testato | **"Chiuso" tutti i giorni, aggiornato 2020-06-23** (WebSearch) | nessun orario aggiornato trovato con certezza (recensioni non ufficiali parlano di apertura pomeridiana) | **CONFLITTO APERTO — nessuna fonte fornisce un orario corrente affidabile**, vedi §10 |
| Prezzo | schema non confermato | non previsto | non testato | non confermato dal fetch | non trovato con certezza | **dato mancante ovunque**, da verificare telefonicamente/con fonte 2025-2026 |
| Biglietti | non testato | non previsto | non testato | non confermato dal fetch | non trovato | dato mancante |
| Accessibilità | non testato | non previsto | non testato | non confermato dal fetch | non trovato | dato mancante |
| URL scheda MiC | — | — | — | `cultura.gov.it/luogo/museo-delle-tradizioni-popolari-di-canepina` | — | riferimento fisso |
| Data aggiornamento | non testato | non esposto da `fetch.ts` (nessun predicato di data cercato finora) | non testato | **2020-06-23** (via WebSearch) | non datata esplicitamente | MiC è l'unica fonte con una data dichiarata, ma è vecchia — non usarla come garanzia di attualità (§9) |

---

## 8. Il conflitto sugli orari — perché non scegliere MiC di default

Prova raccolta (§5, §7): la scheda MiC di Canepina mostra "Chiuso" tutti i giorni con un
aggiornamento dichiarato del 2020-06-23. Nessuna fonte alternativa raggiungibile in questa sessione
fornisce un orario corrente **verificato e datato** in modo affidabile — le uniche informazioni su
"apertura pomeridiana" trovate provengono da recensioni turistiche non ufficiali (TripAdvisor),
non da un ente terzo con una data di verifica propria. Questo è esattamente il caso descritto dal
compito: **un'assenza-di-dato dichiarata da MiC non va trattata come "il museo è chiuso", va
trattata come "MiC non ha aggiornato il dato dal 2020"**, e va marcata come tale (bassa confidenza,
`sourceUpdatedAt` vecchio) invece di essere silenziosamente accettata come verità.

Non essendo raggiungibile in questa sessione né il Comune di Canepina né Musei DEMOS/Comunità
Montana dei Cimini (il gestore reale, stando ai contatti trovati) direttamente, **non posso oggi
fornire un orario alternativo verificato con la stessa cautela richiesta dal compito** — riportarne
uno dedotto da recensioni turistiche violerebbe "non inventare campi/dati". Questo resta un action
item per la sezione 15.

---

## 9. Cosa NON è stato possibile fare in questa sessione (elenco esplicito, per trasparenza)

- Nessuna richiesta HTTP reale contro `dati.cultura.gov.it/sparql` eseguita da questa sessione
  (bloccato, §0) — mi appoggio a run reali di sessioni precedenti (§3), che però non hanno mai
  cercato Canepina specificamente.
- Nessuna richiesta reale contro il manuale REST OPENDATA/DBUnico o il suo endpoint (URL non
  determinato con certezza, §4).
- Nessuna richiesta reale contro Ecomic/I.PaC (§6).
- Nessuna ispezione di rete/HTML della pagina cultura.gov.it di Canepina (§5).
- Nessun trigger del workflow GitHub Actions esistente da questa sessione (permesso negato, §0) —
  ho preparato l'input (`describe_name`) ma non potuto usarlo.

Questo NON significa che queste fonti "non esistono" o "non sono raggiungibili in assoluto" — vedi
§3 (il SPARQL endpoint è dimostrabilmente raggiungibile e funzionante dal runner GitHub Actions).
Significa solo che **questa specifica sessione conversazionale** non ha i permessi/la rete per
completarle da sola.

---

## 10. Architettura proposta per Dtrek (provenienza per campo)

Estende, senza sostituire, `dtrek_places`/`dtrek_place_sources`/`PlaceCandidate` (§1). Non
implementata in questa sessione (il compito chiede di completare prima il report) — proposta per
approvazione.

**Problema attuale**: `dtrek_place_sources` traccia le fonti che confermano una Meta, ma non QUALE
fonte ha fornito QUALE valore per QUALE campo — un requisito esplicito del compito (§8/§9/§10/§11)
che oggi non è soddisfatto da nessuna tabella esistente.

**Proposta minimale, coerente con lo stile del repo** (jsonb, non un nuovo sistema di tipi):
aggiungere a `dtrek_places.metadata` (già `jsonb`, già usata per "informazione che il modello
comune non cattura", vedi `scripts/places/types.ts`) una chiave `fieldProvenance`, popolata
dall'importer per i soli campi che una fonte arricchente (non anagrafica) fornisce:

```json
{
  "fieldProvenance": {
    "openingHours": {
      "value": "...",
      "source": "mic_pagina",
      "sourceUrl": "https://cultura.gov.it/luogo/museo-delle-tradizioni-popolari-di-canepina",
      "retrievedAt": "2026-09-21T12:00:00Z",
      "sourceUpdatedAt": "2020-06-23",
      "confidence": "low",
      "status": "stale"
    },
    "price": {
      "value": null,
      "source": null,
      "status": "missing"
    }
  }
}
```

Per gli orari (richiesta esplicita §10 del compito, struttura più ricca di un singolo valore),
`opening_hours` (già `jsonb` in `dtrek_places`, oggi mai popolato dalla fonte MiC, §1) diventa un
array di occorrenze `{giorno, apertura, chiusura, pausa?, periodoValidità?, note?, source,
verifiedAt}` invece di un singolo blob — non un nuovo campo, solo popolare quello che già esiste
con questa struttura.

Per i prezzi (§11), stessa logica in una nuova chiave di `metadata` (`pricing`), mai un numero
nudo: `{tipo: "intero"|"ridotto"|"gratuito"|categoria, valore, valuta, validità, descrizione,
source, verifiedAt}[]`.

**Nessuna sorgente sceglie il record intero**: il merge in `import.ts`/`deduplicate.ts` resta
per-Meta (§1), ma la scrittura dei campi arricchenti userebbe un confronto per-campo (fonte con
`sourceUpdatedAt` più recente e/o `confidence` più alta vince PER QUEL CAMPO, non per l'intera
riga) — esattamente il comportamento richiesto per il caso Canepina (§8).

---

## 11. Sorgente raccomandata per categoria di dato (allo stato attuale delle verifiche)

| Categoria | Raccomandazione | Motivo |
|---|---|---|
| Nome, tipologia, comune/provincia/regione, indirizzo | LOD/SPARQL (ArCo), già in Dtrek | Unica fonte verificata dal vivo con scrittura di produzione riuscita (§3); struttura chiusa e stabile |
| Coordinate | LOD/SPARQL, con fallback a geocodifica dell'indirizzo quando assenti | Copertura reale disomogenea (§3) — non affidarsi ciecamente |
| Descrizione | Fonte istituzionale locale (Comune/sistema museale), MAI MiC per questo campo | Il modello Dtrek esclude description da ArCo per licenza (§1); MiC non è stato verificabile qui; le fonti locali (Comune, DEMOS) sono risultate più ricche nel confronto (§7) |
| Contatti (telefono/email/sito) | Fonte istituzionale locale | Nessuna fonte MiC testata li espone in modo confermato; le fonti locali li hanno dati direttamente e in modo coerente tra loro |
| Orari | **Nessuna fonte oggi affidabile senza verifica puntuale** — mai accettare MiC senza controllare `sourceUpdatedAt` (§8/§10) | Prova diretta di un dato MiC scaduto di 6 anni su Canepina |
| Prezzo/biglietti | Da verificare caso per caso con fonte locale/regionale aggiornata | Non trovato con certezza per Canepina in nessuna fonte in questa sessione |
| Ecomic/I.PaC | Da rivalutare quando si conoscerà il reale modello di autenticazione/copertura | Non testabile oggi (§6) |

---

## 12. Prossimi passi proposti (non eseguiti — in attesa di decisione, §14 del compito)

1. **Sbloccare la verifica live** (§0/§9) — una di queste:
   - l'utente lancia manualmente il workflow `Import Places — MiC` già presente
     (`.github/workflows/import-places-mic.yml`, aggiornato in questa sessione con l'input
     `describe_name`) con `mode: describe`, `describe_name: Canepina`, e incolla qui l'output
     (`GITHUB_STEP_SUMMARY` del job) — copre la richiesta del §3 del compito (triple RDF reali di
     Canepina, verifica esplicita di descrizione/orari/prezzi);
   - oppure l'utente concede il permesso Actions al connettore GitHub di questa sessione;
   - oppure l'utente scarica il PDF del manuale REST OPENDATA (§4, link nel report) e lo incolla/
     allega qui, dato che il dominio è bloccato per il fetch automatico.
2. Solo dopo aver visto un dump RDF reale di Canepina: decidere se estendere `fetch.ts` per
   catturare eventuali predicati aggiuntivi trovati (mai aggiungerne uno "per simmetria" con altre
   ontologie se non osservato nei dati reali — stessa disciplina già seguita nel file, §1).
2bis. Se il manuale REST OPENDATA risulta leggibile, verificarne endpoint/campi con una richiesta
   reale (curl/script dedicato), poi decidere se e come integrarlo.
3. Implementare lo schema di provenienza per campo (§10) — richiede una migration additiva, non
   distruttiva, coerente con `add_places_catalog.sql`.
4. Per Canepina specificamente: contattare la fonte locale (Comunità Montana dei Cimini/Musei
   DEMOS, unico gestore reale trovato) per un orario/prezzo verificato con data, invece di dedurlo
   da recensioni turistiche.

Nessuno scraper "definitivo" è stato scritto, per istruzione esplicita del compito.
