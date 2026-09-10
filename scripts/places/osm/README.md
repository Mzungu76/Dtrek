# OpenStreetMap (estratto regionale) → dtrek_places

Implementato: `fetch.ts` in questa cartella (piano `docs/piano-mete-multitipologia.md` §9). Legge
un estratto `.osm.pbf` scaricato UNA VOLTA (mai Overpass live per-ricerca-utente, piano §9/§21/§48.7).

## Fonte (verificata via WebSearch/WebFetch in questa sessione — 2026-08-30)

Geofabrik (https://download.geofabrik.de/europe/italy.html) **non** pubblica estratti per singola
regione italiana — solo 5 macro-aree (Nord-Ovest/Nord-Est/Centro/Sud/Isole; il Lazio è dentro
"Centro" insieme ad altre 5 regioni). Provider alternativo con granularità per-regione, verificato
con un fetch reale della pagina indice (elenca esplicitamente `lazio-latest.osm.pbf`):

```
http://download.openstreetmap.fr/extracts/europe/italy/lazio-latest.osm.pbf   (~120 MB)
```

Mirror comunitario OSM France (https://download.openstreetmap.fr/). Licenza ODbL 1.0.

## Cosa esiste già nel repository (riusato come riferimento, non duplicato)

`lib/pois/overpassSource.ts` — fetcher live per i Sentieri (piano §18, non toccato). `fetch.ts`
riusa lo STILE della sua `HISTORIC_TYPE_MAP` (tag OSM → categoria) ma non i valori: quel file mira
a `PoiType` (icone POI dei Sentieri), qui il bersaglio è `SiteType` (`lib/metaTypes.ts`), un
vocabolario diverso — vedi i commenti in `fetch.ts` per le scelte di mapping quando non c'è un
corrispondente 1:1 (es. `historic=ruins`, `natural=peak`, `natural=spring`).

## Libreria di parsing

`osm-pbf-parser` (MIT/LGPL, pura JS, nessun binario nativo) — aggiunta come devDependency in
questa sessione. La forma degli oggetti restituiti (`scripts/places/osm.d.ts`) è verificata
installando il pacchetto reale e leggendo il suo sorgente pubblicato (non documentazione di terze
parti).

## Categorie (piano §9)

```
tourism=museum, tourism=gallery, tourism=attraction
historic=castle, historic=archaeological_site, historic=monument, historic=ruins
natural=waterfall, natural=cave_entrance, natural=peak, natural=viewpoint, natural=spring
amenity=place_of_worship
```

## Bloccante di rete

Stesso di ISTAT/PTPR/MiC: il proxy di questo ambiente rifiuta la connessione a
download.openstreetmap.fr (policy dell'organizzazione, verificato con `curl -v`). Il file da
~120MB non è stato scaricato né parsato in questa sessione. 0 righe importate.

## Test

`scripts/places/__tests__/osm.test.ts` copre `osmElementToPlaceCandidate` (mapping di tutte le
categorie del piano §9, scarto di elementi senza nome/coordinate/categoria riconosciuta) — non
richiede rete/filesystem.

## Uso

```bash
npx tsx scripts/places/osm/fetch.ts --dry-run
```
