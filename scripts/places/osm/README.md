# OpenStreetMap (estratto regionale) → dtrek_places

Non ancora implementato per un catalogo persistente. Il piano (§9) è esplicito: **non** fare
query Overpass live per ogni ricerca utente — scaricare un estratto regionale e importarlo.

## Cosa esiste già nel repository (da NON duplicare la logica di mapping)

`lib/pois/overpassSource.ts` interroga live gli endpoint Overpass pubblici (elenco con failover in
cima al file) per popolare i POI attorno a una traccia già pianificata — questo resta corretto per
il suo scopo attuale (piano §18, "mantenere il sistema attuale" per i Sentieri), ma è esattamente
l'uso "live per query utente" che il piano vieta come motore principale per Borghi/Città/Siti
(§9, §21). La mappa tag→tipologia (`HISTORIC_TYPE_MAP` e le altre in quel file) è però un
riferimento diretto e riusabile per classificare le feature di un estratto offline.

Categorie iniziali indicate dal piano (§9), da mappare su `meta_type`/`site_type`
(`lib/metaTypes.ts`):

```
tourism=museum, tourism=gallery, tourism=attraction
historic=castle, historic=archaeological_site, historic=monument, historic=ruins
natural=waterfall, natural=cave_entrance, natural=peak, natural=viewpoint, natural=spring
amenity=place_of_worship
```

## Cosa manca

Un estratto regionale scaricato (es. un provider di estratti regionali OSM in formato .osm.pbf per
il Lazio) e un parser che ne estrae solo i tag sopra, converte in `PlaceCandidate[]` e rispetta
l'attribuzione ODbL (piano §44) — non riportare qui un URL/provider specifico non verificato in
questa sessione (nessun accesso di rete disponibile in questo ambiente). Il file .pbf va parsato
offline (es. con una libreria PBF Node, non ancora una dipendenza di questo progetto) — verificarne
la licenza/dimensione prima di aggiungerla.

## Interfaccia attesa

Un `fetch.ts` che legge l'estratto scaricato in `data/osm/` (gitignored, stesso pattern di
`data/ptpr/`) e produce `PlaceCandidate[]` con `source: 'osm'`, `sourceId` = l'OSM id
(`node/way/relation` + id numerico, univoco solo se include il tipo di elemento), `rawType` = il
tag OSM originale (es. `historic=castle`) per audit.
