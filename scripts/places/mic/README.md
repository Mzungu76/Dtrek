# MiC (Ministero della Cultura) → dtrek_places

Non ancora implementato per il dataset generale "Luoghi della cultura" (piano
`docs/piano-mete-multitipologia.md` §8: musei, aree archeologiche, monumenti, castelli/
fortificazioni, palazzi, chiese, abbazie).

## Cosa esiste già nel repository (da NON duplicare)

Il repository ha già un fetcher **live** per il solo layer archeologico MiC via GNA (Geoportale
Nazionale per l'Archeologia): `lib/pois/gnaSource.ts`, che interroga
`https://gna.cultura.gov.it/ogc/wfs` (layer `gna:mosi_puntuali`/`mosi_lineari`/`mosi_poligonali`) —
URL verificato, già in uso nel prodotto per popolare i POI di un percorso. Quel fetcher è pensato
per query live per-bbox attorno a una traccia, non per popolare un catalogo persistente — riusarne
la logica di parsing (`parseGnaFeatures`, `gnaTypologyToPoiType`) per un adapter batch verso
`dtrek_places` è ragionevole; **non serve implementare da zero il client WFS/GNA**.

## Cosa manca

Il dataset "Luoghi della cultura" del piano è più ampio della sola componente archeologica (musei,
monumenti, castelli, palazzi, chiese, abbazie) — non risulta coperto da GNA. Verificare al momento
dell'implementazione se il MiC pubblica quel dataset più ampio come endpoint WFS/OGC separato o
come dataset scaricabile (es. su dati.gov.it) — non riportare qui un URL non verificato in questa
sessione (nessun accesso di rete disponibile in questo ambiente).

## Interfaccia attesa

Un `fetch.ts` che produce `PlaceCandidate[]` con `source: 'mic'`, `sourceId` = l'identificativo
originale del record MiC (mai inventato — piano §48.12), `metaType: 'sito'` e `subtype` uno dei
`SiteType` di `lib/metaTypes.ts` derivato dalla tipologia MiC (vedi `GNA_TYPE_MAP` in
`lib/pois/gnaSource.ts` come riferimento per il mapping tipologia→categoria). Rispettare la
licenza CC BY-SA 4.0 dichiarata dal piano (§44) — non copiare testo descrittivo esteso se la
struttura/licenza della fonte non lo consente esplicitamente (piano §8).
