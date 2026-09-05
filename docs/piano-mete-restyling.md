# Piano: restyling pagina Mete + completamento Borghi/Città e Siti

Piano operativo sintetico, esito dell'analisi in `docs/mockup-mete-redesign/README.md` (stato del
codice e dei dati) e del mockup approvato (`Main.dc.html` = carta chiusa, `MappaAperta.dc.html` =
carta aperta — canvas https://claude.ai/code/artifact/5682b210-a754-4200-a823-0efe7abe93c6).

**Modifica approvata dopo il mockup**: nell'intestazione **non** va il link "I miei Diari" — i
Diari sono già raggiungibili dall'icona centrale della barra inferiore. Restano titolo,
sottotitolo con i conteggi e avatar.

Vale in tutto il piano il §48 di `docs/piano-mete-multitipologia.md`, in particolare: non rompere
Sentieri (§48.4), mai metriche escursionistiche per le altre tipologie (§48.9), mai dedurre
`metaType` (§48.11), niente valori fabbricati al posto di un dato assente (§48.8), migration per
ogni modifica al modello dati (§48.13).

---

## Fase 0 — Correzioni immediate (mezza giornata, nessuna dipendenza)

| # | Intervento | File |
|---|---|---|
| 0.1 | Miniature nere: dare a `.torn-content` un fondo carta (o un riempimento opaco nel ramo di fallback), così il nero di `.torn-filler` non traspare quando manca la traccia | `app/globals.css:217-227`, `app/percorsi/page.tsx` |
| 0.2 | Titolo di riga da Caveat 19,5 + `TACCUINO_RULED_TEXT_STYLE` a Lora 14, `line-clamp: 1` | `app/percorsi/page.tsx` |
| 0.3 | Togliere il link "I miei Diari" dall'intestazione | `app/percorsi/page.tsx` |

**Fatto quando**: una Meta borgo/sito nell'elenco mostra un riquadro chiaro (non nero) e un titolo
su una riga sola.

## Fase 1 — Dati in `/api/percorsi` (mezza giornata)

Estendere `AllPercorsiRow` con `siteType`, `placeId`, `latitude`, `longitude`, `municipality`,
`region`, `imageUrl`. Sorgenti: colonne di `planned_hikes` per lat/lon delle Mete non-sentiero;
primo punto di `route_polyline` per i sentieri (nessuna colonna nuova); LEFT JOIN su
`dtrek_places` (via `place_id`) per comune/regione/immagine.

- File: `app/api/percorsi/route.ts` (`AllPercorsiRow` + la SELECT), eventuale migration solo se
  `latitude`/`longitude` mancano su `planned_hikes` (verificare: `add_planned_hikes_place_link.sql`).
- **Fatto quando**: `GET /api/percorsi` restituisce comune e coordinate per le 4 Mete borgo
  esistenti, e i sentieri restano invariati byte per byte negli altri campi.
- Test: un caso in `app/api/percorsi/__tests__` (o nuovo) per riga sentiero e riga borgo.

## Fase 2 — Riscrittura dell'elenco (2-3 giorni) — il grosso del mockup

Sostituisce il corpo di `app/percorsi/page.tsx` con il "registro unico" approvato:

1. **Intestazione su carta** al posto del banner verde da 200px (titolo, conteggi per tipologia,
   avatar). Niente link ai Diari.
2. **Riga tipizzata**: timbro tipologia a sinistra, miniatura 52px, titolo Lora, riga meta,
   colonna destra con un solo numero (Trail Score / tappe / durata visita).
3. **Miniatura per tipologia** — nuovo componente `components/mete/MetaThumb.tsx`: traccia reale
   per `sentiero` (`GalleryMapThumb`, invariato), `imageUrl` quando c'è, altrimenti **emblema
   disegnato** (skyline per borgo/città, tempio per sito). Mai un riquadro vuoto.
4. **Slot metriche adattivo** — estendere `lib/metaCard.ts` (non condizioni sparse nei componenti,
   §48.17) con una funzione per la riga d'elenco che prende una `AllPercorsiRow`.
5. **Chip di tipologia** con i conteggi (Tutte / Sentieri / Borghi / Siti), che filtrano l'elenco.
6. **Ordinamenti per tipologia**: Data e Vicinanza sempre; Km / D+ / TS solo con filtro Sentieri
   attivo (o "Tutte", applicati ai soli sentieri).
7. **Un solo ingresso di ricerca**: il bottone "Cerca un Borgo, una Città o un Sito" sparisce; il
   campo di ricerca porta a `/percorsi/cerca` quando non trova nulla fra le Mete salvate — la
   tipologia si sceglie lì, come oggi.

- **Fatto quando**: con i dati attuali (47 sentieri, 4 borghi, 0 siti) la pagina mostra ~6 righe
  senza scorrere, nessuna riga vuota e nessun "0 km".
- Test: `metaCard` (righe per le tre tipologie), più un render dell'elenco con una riga per tipo.

## Fase 3 — La carta espandibile (1-2 giorni)

Nuovo `components/mete/MeteMap.tsx` costruito su **`components/bacheca/TerritoryMap.tsx`**, che ha
già Leaflet + `markercluster` + overlay tracce e oggi non è usato da nessuna pagina.

- Chiusa di default: striscia 70px con pin e legenda; aperta: 314px con "Vicino a me", fumetto sul
  pin toccato (la stessa riga dell'elenco) e ordinamento per distanza.
- **Leaflet montata solo all'apertura** (`dynamic(..., { ssr: false })` + mount lazy), mai al
  caricamento della pagina; la striscia chiusa è un'anteprima statica.
- Forma del pin per tipologia (goccia / quadrato / cerchio), non solo colore.
- Se la posizione dell'utente manca: niente colonna "km da te" e ordinamento per data — nessun
  valore fabbricato.
- Stato: chiusa a ogni ingresso (deciso), riapribile con un tocco.
- **Fatto quando**: aprendo la carta i 4 borghi e i sentieri compaiono come pin, i chip filtrano
  insieme pin ed elenco, e il primo caricamento della pagina non scarica Leaflet.

## Fase 4 — Borghi/Città: rendere utile il catalogo (1-2 giorni + tempo macchina)

1. **`subtype`** (`borgo` | `citta`) sulle 425 righe: regola esplicita Dtrek, scritta e
   documentata (non "Comune = Borgo", §6 del piano). Migration di backfill + campo nel filtro.
2. **Arricchimento Wikidata/Commons**: eseguire `scripts/places/wikidata/enrich.ts` per popolare
   `description`, `image_url`, `wikidata_id`, `official_url`.
3. **Estensione oltre il Lazio**: rieseguire `scripts/places/istat/fetch.ts` sulle altre regioni.
4. `borgoCardStats()` in `lib/metaCard.ts` torna a restituire dati veri (comune, provincia,
   categoria) appena esistono.

**Nota di ambiente**: i README di `scripts/places/*` segnalano che ISTAT/PTPR/MiC non erano
raggiungibili dalla shell in cui gli script sono stati scritti. Vanno lanciati da una macchina con
rete verso quelle fonti, su un branch, verificando i conteggi prima e dopo.

## Fase 5 — Siti: il vuoto vero (2-3 giorni + tempo macchina)

Oggi `dtrek_places` ha **0 righe** con `meta_type='sito'`: la ricerca Siti funziona ma non può
restituire nulla. Da eseguire, in quest'ordine:

1. `scripts/places/mic/fetch.ts` (ArCo/MiC) — **prima** verificare il predicato delle coordinate,
   dichiarato non verificato nel suo README: un import senza lat/lon è inutilizzabile.
2. `scripts/places/osm/fetch.ts` sull'estratto regionale `.osm.pbf` (mai Overpass live, §48.7).
3. `scripts/places/ptpr/import.ts` + `extra-layers.ts` per il Lazio.
4. `scripts/places/deduplicate.ts` e controllo di `dtrek_place_sources`.
5. Mappatura fonte → `SiteType` (13 sottotipologie di `lib/metaTypes.ts`) verificata a campione.

**Fatto quando**: cercando "Colosseo" o filtrando "Castello" in `/percorsi/cerca` compaiono
risultati con coordinate corrette, e una scheda Sito creata mostra categoria e comune.

## Fase 6 — Itinerari dentro un Borgo (3-4 giorni) — sblocca "6 tappe · 2h"

`dtrek_place_relations` ha 0 righe e `/api/meta-itinerary` non è chiamato da nessuna schermata.

1. Popolare le relazioni `contains` (Sito dentro il perimetro/raggio di un Borgo) —
   `lib/metaSearch/placeRelations.ts` come lettura, uno script ETL come scrittura.
2. Collegare `/api/meta-itinerary` alla scheda di una Meta borgo (bottone "Genera itinerario").
3. Solo allora le pillole "6 tappe / 2h consigliate" del mockup diventano dati reali; fino a quel
   momento la riga mostra "itinerario da generare", come disegnato.

---

## Ordine e dipendenze

```
Fase 0 ──┐
Fase 1 ──┼──> Fase 2 ──> Fase 3
         │
Fase 4 ──┴──> (dati per le righe borgo)
Fase 5 ──────> (dati per le righe sito)
Fase 6 ──────> (tappe e durata itinerario)
```

Fasi 0-3 sono indipendenti dai dati: la pagina nuova funziona anche con 0 siti e senza immagini —
mostra semplicemente meno cose, mai valori inventati. Fasi 4-6 riempiono progressivamente gli slot
già predisposti. Fase 5 può procedere in parallelo alle Fasi 2-3 (tocca solo la pipeline ETL).

## Rischi e decisioni ancora aperte

- **MiC/ArCo**: predicato delle coordinate non verificato — se l'endpoint non lo espone come atteso,
  la fonte principale dei Siti va sostituita da OSM + PTPR, con un impatto sulla copertura.
- **Rete verso le fonti** (ISTAT, PTPR, ArCo, estratti OSM): gli import vanno eseguiti dove
  quelle fonti sono raggiungibili, non da qualunque ambiente.
- **Classificazione borgo/città**: serve una regola dichiarata (popolazione? elenco "Borghi più
  belli"? classificazione propria?) — è una decisione di prodotto, non tecnica.
- **Peso della carta**: oltre qualche centinaio di Mete servirà il clustering di `TerritoryMap`
  già presente; da verificare con dati reali quando i Siti saranno importati.
