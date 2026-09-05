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

## Fase 2 — Riscrittura dell'elenco (2-3 giorni) — il grosso del mockup ✅ fatta

Sostituisce il corpo di `app/percorsi/page.tsx` con il "registro unico" approvato:

1. ✅ **Intestazione su carta** al posto del banner verde da 200px — titolo a mano, conteggio per
   tipologia. Niente link ai Diari (già l'icona centrale della barra inferiore) né avatar (non
   nel mockup finale approvato).
2. ⚠️ **Riga tipizzata** — implementata come miniatura 100px (non 52px: richiesta esplicita
   dell'utente "miniature più grandi", vedi commit precedenti) + badge Trail Score sotto la
   miniatura, non un "timbro tipologia" separato a sinistra: l'emblema per tipologia (punto 3) e
   lo slot metriche adattivo (punto 4) bastano a distinguere la tipologia senza un badge in più.
3. ⚠️ **Miniatura per tipologia** — niente nuovo componente `MetaThumb.tsx` dedicato (sarebbe
   stato prematuro estrarlo per un solo punto di utilizzo): traccia reale per `sentiero`
   (`GalleryMapThumb`, invariato), `imageUrl` quando c'è (ramo scritto e pronto, 0 righe la
   valorizzano oggi), altrimenti un'icona per tipologia (`Building2`/`Landmark`/`Mountain`) su
   fondo carta — non ancora l'emblema disegnato a mano (skyline/tempio) dei mockup, rimandato:
   un'icona chiara è già la correzione del bug (fondo nero), l'emblema è rifinitura estetica.
4. ✅ **Slot metriche adattivo** — `lib/metaCard.ts`'s `metaRowLocationStats()`: comune/regione
   per borgo_citta, categoria + comune/regione per sito (mai un valore fabbricato quando mancano).
   6 test in `lib/__tests__/metaCard.test.ts`.
5. ✅ **Chip di tipologia** con i conteggi (Tutte/Sentieri/Borghi/Città/Siti), filtrano l'elenco.
6. ✅ **Ordinamenti per tipologia**: Data sempre; Km/D+/TS solo con filtro Tutte/Sentieri attivo
   (tornano a "Data" da soli se il filtro li nasconde). "Vicinanza" rimandata alla Fase 3 (richiede
   la posizione dell'utente, che arriva con la carta).
7. ✅ **Un solo ingresso di ricerca** — tolto il bottone a piena larghezza identico al campo di
   ricerca; resta il campo (filtra le Mete già salvate) più un bottone compatto a icona verso
   `/percorsi/cerca` (Borgo/Città/Sito), sempre raggiungibile — non solo quando la ricerca locale
   non trova nulla. Quando la ricerca locale non trova nulla ma c'è del testo, compare anche un
   link diretto "Cerca «testo» fra Borghi, Città e Siti" verso `/percorsi/cerca?q=...` (nuovo
   supporto per `?q=` in quella pagina, stesso pattern Suspense/`useSearchParams` di
   `app/upload/page.tsx`).

Verificato: `tsc --noEmit` pulito, eslint pulito, vitest 389/389 (383 + 6 nuovi).

**Rimandato ad-hoc, non nel piano originale**: emblema disegnato a mano (skyline/tempio) al posto
dell'icona lucide di fallback — miglioria estetica, non blocca nulla a valle.

## Fase 3 — La carta espandibile (1-2 giorni) ✅ fatta

`components/mete/MeteMap.tsx`, nuovo, non costruito direttamente su `TerritoryMap.tsx` (quello
resta specifico per i POI di Bacheca, badge/colore per `PoiType`) ma sulla stessa **infrastruttura**
Leaflet+cluster — il loader condiviso è stato estratto in `lib/loadLeafletCluster.ts` (usato ora da
entrambi i componenti): `leaflet.markercluster` patcha `window.L` una volta sola per processo, due
copie indipendenti del loader avrebbero rotto silenziosamente il secondo mount (vedi il commento nel
file).

- ✅ Chiusa di default: striscia statica 70px (`MapStripPreview`, solo SVG — nessun Leaflet) con un
  pin colorato per Meta in posizione pseudo-casuale ma stabile (derivata dall'id) e il conteggio;
  aperta: 260px con la mappa vera, pin per tipologia raggruppati (`markerClusterGroup`), fumetto sul
  pin toccato con titolo + link alla Meta (non l'intera riga React — popup Leaflet in HTML semplice,
  scelta di scope: un portale React dentro un popup Leaflet per un guadagno marginale non valeva la
  complessità in più).
- ✅ **Leaflet montata solo all'apertura**: `next/dynamic(..., { ssr: false })` in cima al file (mai
  un `import` statico), e comunque il componente non è nell'albero finché `mapOpen` non è vero.
- ✅ Forma del pin per tipologia: goccia (sentiero) / quadrato (borgo_città) / cerchio (sito), stessi
  colori sia nella striscia statica sia nella carta vera.
- ✅ Ordinamento "Vicinanza": richiede `navigator.geolocation`, chiesta solo al primo tocco sulla
  carta (mai al caricamento pagina); se negata/assente, chip "Vicinanza" e colonna "km da te" restano
  assenti — mai un valore fabbricato — e compare un bottone "Vicino a me" per ritentare. Alla prima
  posizione ottenuta l'ordinamento passa da solo a "Vicinanza" se l'utente non ne aveva già scelto un
  altro esplicitamente.
- ✅ I chip di tipologia/ricerca/preferiti filtrano insieme pin della carta ed elenco (stesso array
  `filtered`, i pin sono solo il sottoinsieme con lat/lon nota).
- ✅ Stato: chiusa a ogni ingresso (deciso), mai persistita, riapribile con un tocco.

Verificato: `tsc --noEmit` pulito, eslint pulito, vitest 389/389 (nessuna regressione — Fase 3 non
tocca dati testabili in isolamento, solo UI/Leaflet).

**Fatto quando**: aprendo la carta i pin compaiono raggruppati per vicinanza a schermate strette, i
chip filtrano insieme pin ed elenco, e il primo caricamento della pagina non scarica Leaflet (verifica
manuale del bundle/network rimandata — nessun accesso a un browser autenticato in questo ambiente,
vedi le note di verifica nei commit precedenti).

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
