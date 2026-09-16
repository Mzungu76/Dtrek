# MiC (Ministero della Cultura) → dtrek_places

Implementato: `fetch.ts` in questa cartella (piano `docs/piano-mete-multitipologia.md` §8).

## Fonte (verificata via WebSearch/WebFetch in questa sessione — 2026-08-30)

Il dataset "Luoghi della cultura" del piano corrisponde ad **ArCo** ("Architettura della
Conoscenza"), il knowledge graph ufficiale del MiC:

- Progetto: https://github.com/ICCD-MiBACT/ArCo — endpoint SPARQL pubblico dichiarato dalla home
  ufficiale (https://dati.beniculturali.it/arco/index.php?lang=en): `https://dati.cultura.gov.it/sparql`
- Classe RDF (verificata leggendo il file ontologia da GitHub, non un URL indovinato):
  `http://dati.beniculturali.it/cis/CulturalInstituteOrSite` — proprietà
  `hasCulturalInstituteOrSiteType` per la tipologia, `hasTimeIndexedTypedLocation` →
  `atSite`/`atLocation` per la geolocalizzazione (pattern "time indexed location" tipico di ArCo).
- ID reali osservati in risultati di ricerca pubblici (es.
  `http://dati.beniculturali.it/mibact/luoghi/resource/CulturalInstituteOrSite/104060`) — usati
  come `sourceId`.

**Coordinate — corretto dopo un primo dry-run reale (2026-09-16, GitHub Actions, --limit 20,
regione Lazio → 0 risultati)**: la prima versione della query usava `geo:lat`/`geo:long` (WGS84
Basic Geo Vocabulary) su `?site`, un'ipotesi mai eseguita contro l'endpoint reale (nessun ambiente
di sviluppo qui raggiunge `dati.cultura.gov.it`, solo il runner GitHub Actions ci arriva). Predicati
reali, verificati leggendo i file OWL/RDF ufficiali:
- `location.owl` (ICCD-MiBACT/ArCo su GitHub): `loc:hasCoordinates` collega una `clv:Geometry` alla
  sua `loc:Coordinates`, ma i valori numerici sono proprietà della `clv:Geometry` stessa, non di
  `loc:Coordinates`.
- `CLV-AP_IT.rdf` (italia/daf-ontologie-vocabolari-controllati su GitHub, l'ontologia AgID che ArCo
  importa per Geometry/Address): `clv:lat`/`clv:long` sono proprietà dirette di `clv:Geometry`;
  `clv:hasGeometry` (domain `owl:Thing`) collega una risorsa qualsiasi alla sua Geometry.

Non essendo certo se `clv:hasGeometry` sia attaccata al CIS, al `Site` (via `atSite`) o al
`Feature` indirizzo (via `atLocation`), la query in `fetch.ts` prova tutti e tre i percorsi con un
path SPARQL `|`. **Ancora da confermare con un nuovo dry-run `--limit` piccolo** prima di alzarlo —
questa correzione non è stata eseguita contro l'endpoint reale, solo derivata dalle ontologie.

## Cosa esisteva già nel repository (riusato come riferimento, non duplicato)

`lib/pois/gnaSource.ts` — fetcher live per il solo layer archeologico MiC via GNA (WFS), non
duplicato qui. `MIC_TYPE_MAP` in `fetch.ts` segue lo stesso approccio a sottostringa di
`GNA_TYPE_MAP` in quel file, applicato però all'**etichetta testuale** del tipo (non a un codice),
perché il thesaurus dei tipi ArCo non è stato verificabile in questa sessione.

## Bloccante di rete

Nessun ambiente di sviluppo usato finora (sandbox Claude Code, incluse sessioni successive)
raggiunge `dati.cultura.gov.it` — stesso blocco di rete di ISTAT/PTPR. Solo il runner GitHub
Actions (`.github/workflows/import-places-mic.yml`) ci arriva: il primo dry-run reale lì (2026-09-16)
ha eseguito la query con successo (nessun errore HTTP/rete) ma **0 risultati con coordinate
valide**, per il predicato sbagliato ora corretto sopra — non ancora riverificato contro l'endpoint
reale dopo la correzione.

## Licenza (piano §8/§44 — CC BY-SA 4.0)

`fetch.ts` non richiede/usa nessun campo di descrizione testuale estesa — solo dati strutturati
(nome, tipologia, indirizzo/comune, coordinate). `description` resta sempre `undefined` per questa
fonte.

## Test

`scripts/places/__tests__/mic.test.ts` copre `micTypeLabelToSiteType` (mapping tipologia→SiteType)
e `micBindingToPlaceCandidate` (costruzione del candidato, licenza, sourceId/sourceUrl reali) — non
richiede rete.

## Uso

```bash
npx tsx scripts/places/mic/fetch.ts --dry-run --region Lazio
```
