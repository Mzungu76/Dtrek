# Rifugi — nota di progettazione (nessun codice in questa fase)

## Stato attuale

Oggi i rifugi esistono solo come **categoria POI live da Overpass** (`lib/overpass.ts`):
`hut` (rifugio, OSM `amenity=alpine_hut`), `bivouac` (bivacco, `tourism=wilderness_hut`),
`shelter` (riparo). Nessuna persistenza propria, nessun campo oltre nome/posizione/tipo — non
c'è quota "propria" del rifugio (si stima dal DTM del percorso), non orari, non posti letto,
non contatti. `supabase-schema.sql` non ha nessuna tabella dedicata.

## Decisioni prese con l'utente

- **Portata di questa sessione**: solo progettazione — l'implementazione parte come task a sé.
- **Fonti dati**: OSM/Overpass (già integrato, gratuito, copertura buona ma dati di
  apertura/posti letto spesso mancanti o non aggiornati) **+ una fonte esterna dedicata**
  (CAI/Rifugi.net o simili) per i campi che OSM tipicamente non ha.
- **Campi minimi da mostrare fin dalla prima implementazione**: posizione, quota, tipo
  (custodito/incustodito/bivacco), periodo/orari di apertura, posti letto e servizi
  (acqua, ristoro), contatti e prenotazione.
- **Quando mostrarli**: sempre, quando presenti lungo/vicino al percorso — non filtrati per
  quota o difficoltà minima (a differenza di quanto inizialmente ipotizzato: niente soglia
  "solo percorsi alta quota", il segnale è "c'è un rifugio nei paraggi", non "il percorso è
  impegnativo abbastanza da giustificarlo").

## Il problema delle due fonti

OSM copre bene *dove* si trova un rifugio ma quasi mai *se è aperto adesso* o *quanti posti
letto ha disponibili*. Una fonte "gestionale" (CAI/Rifugi.net) copre l'opposto: dati di
esercizio affidabili ma solo per i rifugi che aderiscono a quel circuito (in pratica quasi
tutti i rifugi CAI, non tutti i bivacchi/rifugi privati che invece OSM censisce). Non esiste
oggi una verifica che una fonte "CAI/Rifugi.net" abbia un'API pubblica stabile e comoda da
integrare (a differenza di Overpass, già in uso e verificato) — **il primo passo tecnico reale,
prima di scrivere qualunque riga, è verificare cosa espone concretamente quella fonte** (API
strutturata? solo scraping HTML? licenza dei dati? rate limit?). Fino a quel momento il piano
sotto tratta quella fonte come "arricchimento opzionale", con OSM come base sempre presente.

## Modello dati proposto (schema di riferimento, non ancora creato)

Tabella cache "arricchita", stesso pattern di `ptpr_pois`/`dtm_cache` (persistita, chiave sulla
sorgente, refresh applicativo invece di TTL Postgres):

```sql
CREATE TABLE IF NOT EXISTS rifugi (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  osm_id            text,                    -- amenity=alpine_hut / tourism=wilderness_hut, se noto
  external_id       text,                    -- id nella fonte dedicata (CAI/Rifugi.net), se disponibile
  name              text NOT NULL,
  tipo              text NOT NULL,           -- 'custodito' | 'incustodito' | 'bivacco'
  lat               float8 NOT NULL,
  lon               float8 NOT NULL,
  altitude_m        integer,
  posti_letto       integer,
  acqua             boolean,
  ristoro           boolean,
  periodo_apertura  text,                    -- testo libero inizialmente (es. "giugno-settembre"),
                                              -- una struttura per stagione è un affinamento successivo
  telefono          text,
  sito_url          text,
  prenotazione_url  text,
  source            text NOT NULL,           -- 'osm' | 'cai' | 'manuale'
  raw_props         jsonb,
  updated_at        timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rifugi_lat_lon ON rifugi (lat, lon);
```

Punti aperti sullo schema (da chiudere prima di implementare):
- Un rifugio può avere sia `osm_id` sia `external_id` (stesso rifugio, due fonti) — serve una
  chiave di dedup (nome + distanza < soglia?) per non duplicare la card in UI.
- `periodo_apertura` come testo libero è pragmatico per la v1, ma impedisce un filtro tipo
  "aperto nel weekend che ho scelto" — rimandato apposta, serve prima capire che struttura dati
  offre davvero la fonte esterna.

## UX proposta

- **Nella scheda Guida**, un widget "Rifugi lungo il percorso" (stessa famiglia di
  `PoiListWidget`/`PoiMap` — coerente con il trattamento POI già esistente, non un pattern
  nuovo), con card per rifugio: nome, quota, tipo, badge aperto/chiuso se il periodo è noto,
  posti letto, pulsante chiamata/prenotazione se presente il contatto.
- Sulla mappa, marker dedicato (icona diversa da `hut`/`bivouac` generici — riuso
  `components/poiIcons.tsx`, stesso trattamento evidenzia/oscura degli altri POI del punto 2).
- Nessuna soglia di quota/difficoltà per mostrarli (deciso sopra) — quindi il widget compare
  anche su un'escursione facile se capita che passi vicino a un rifugio.

## Piano a fasi (proposta, da confermare quando si passa all'implementazione)

1. **Verifica fonte esterna**: cosa espone davvero CAI/Rifugi.net (o equivalente) — API,
   licenza, rate limit. Blocca/sblocca la fase 3.
2. **v1 solo-OSM**: tabella `rifugi` popolata/arricchita solo da Overpass (stessi campi di
   `hut`/`bivouac`/`shelter` di oggi + quota dal DTM del percorso), widget in scheda Guida
   con i soli campi che OSM realmente offre (spesso: nome, posizione, a volte `opening_hours`
   OSM già strutturato). Valore immediato, zero rischio di integrazione esterna.
3. **v2 arricchimento fonte dedicata**: solo se la fase 1 conferma un'integrazione fattibile —
   posti letto/prenotazione/contatti affidabili per i rifugi CAI, mantenendo OSM come fallback
   per tutto il resto.
4. **Eventuale inserimento manuale/curato**: per colmare buchi specifici (rifugi privati non
   coperti da nessuna delle due fonti) — solo se dopo le fasi 1-2 emerge che serve davvero,
   non pianificato a priori.

## Cosa NON è ancora deciso (da chiarire quando si riparte da qui)

- Nome/URL esatto della fonte esterna da integrare, e se ha un'API utilizzabile.
- Se un rifugio "vicino ma non sul tracciato" (es. una variante di 500m) va incluso — stessa
  logica di raggio già usata per i POI generici (`fetchPoisNearPolyline`), o un raggio diverso
  più ampio perché un rifugio vale la deviazione anche se un po' più lontano di un punto di
  interesse qualsiasi?
- Se la card rifugio deve integrarsi col GPX export (punto 8, già implementato per la sola
  traccia) come waypoint opzionale — coerente con la domanda già posta e risolta per i POI
  generici (in quel caso: "solo traccia", nessun waypoint).
