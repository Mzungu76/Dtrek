# Wikidata → arricchimento di dtrek_places (NON una fonte primaria)

Non ancora implementato. Diversamente dalle altre cartelle in `scripts/places/`, questo NON è un
importer che crea nuove righe in `dtrek_places` da zero — il piano è esplicito (§11): "Wikidata
NON è fonte primaria dell'anagrafe... NON rendere Wikidata obbligatorio". Il suo ruolo è
knowledge layer: arricchire una Meta già esistente (creata da ISTAT/PTPR/MiC/OSM) con
`wikidata_id`, periodo storico, persone/eventi collegati, immagini.

## Cosa esiste già nel repository (endpoint verificato, riusabile)

`lib/pois/wikidataSource.ts` interroga già dal vivo l'endpoint SPARQL pubblico ufficiale
`https://query.wikidata.org/sparql` (query POST, header `Accept: application/sparql-results+json`)
per popolare POI attorno a una traccia — endpoint reale e verificato (già in produzione in questo
repository, non un URL indovinato in questa sessione). La mappa `WD_TYPE` (QID → tipologia) in
quel file è un riferimento diretto per la classificazione, anche se qui il bersaglio finale è
`SiteType`/`PlaceCategory` (`lib/metaTypes.ts`) invece del `PoiType` interno ai Sentieri.

## Interfaccia attesa

Uno script batch (non un `fetch.ts` isolato come le altre fonti, perché opera SU righe già in
`dtrek_places`, non produce `PlaceCandidate[]` indipendenti) che:

1. Legge le righe `dtrek_places` con `wikidata_id IS NULL` in un'area/regione.
2. Per ciascuna, prova un match SPARQL per nome + coordinate (raggio piccolo, es. 200m) +
   eventualmente `municipality_istat_code` se il Comune ha un QID noto.
3. Su match ad alta confidenza, fa un `UPDATE dtrek_places SET wikidata_id = ...` — mai un
   `INSERT`: questo script non crea Mete.

Non implementato in questo blocco perché richiede accesso di rete non disponibile in questo
ambiente per essere scritto e verificato con query reali, non per incertezza sull'endpoint.
