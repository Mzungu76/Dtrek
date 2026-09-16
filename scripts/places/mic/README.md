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

**Coordinate — due tentativi falliti, serve la struttura reale.**
- Tentativo 1 (2026-09-16): `geo:lat`/`geo:long` (WGS84) su `?site` → 0 risultati contro l'endpoint
  reale (`--limit 20`, regione Lazio).
- Tentativo 2, stesso giorno: dedotto leggendo `location.owl` e `CLV-AP_IT.rdf` (ICCD-MiBACT/ArCo e
  AgID su GitHub, non un blog di terzi) — `clv:lat`/`clv:long` come proprietà dirette di una
  `clv:Geometry`, raggiunta da CIS/Site/Feature via `clv:hasGeometry` (path SPARQL `|` su tutti e
  tre) → di nuovo **0 risultati** (`--limit 1500`, regione Lazio).

Nessuno dei due tentativi è stato verificato contro un dato reale prima di essere eseguito — solo
dedotti dalla documentazione. Invece di un terzo tentativo alla cieca, `fetch.ts` supporta ora
`--describe`: interroga l'endpoint per UN `CulturalInstituteOrSite` vero e dumpa tutte le sue triple
dirette più un salto in più (per attraversare `TimeIndexedTypedLocation`/`Site` senza già sapere
quale proprietà cercare). Il prossimo fix a `buildSparqlQuery` va scritto leggendo quell'output —
la struttura reale, non altra documentazione. Workflow: `mode: describe` in
`import-places-mic.yml`, nessun secret Supabase richiesto.

## Cosa esisteva già nel repository (riusato come riferimento, non duplicato)

`lib/pois/gnaSource.ts` — fetcher live per il solo layer archeologico MiC via GNA (WFS), non
duplicato qui. `MIC_TYPE_MAP` in `fetch.ts` segue lo stesso approccio a sottostringa di
`GNA_TYPE_MAP` in quel file, applicato però all'**etichetta testuale** del tipo (non a un codice),
perché il thesaurus dei tipi ArCo non è stato verificabile in questa sessione.

## Bloccante di rete

Nessun ambiente di sviluppo usato finora (sandbox Claude Code, incluse sessioni successive)
raggiunge `dati.cultura.gov.it` — stesso blocco di rete di ISTAT/PTPR. Solo il runner GitHub
Actions (`.github/workflows/import-places-mic.yml`) ci arriva: entrambi i tentativi sopra hanno
eseguito la query con successo (nessun errore HTTP/rete, query sintatticamente valida) ma con 0
risultati — il problema è il predicato usato, non la raggiungibilità dell'endpoint.

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
npx tsx scripts/places/mic/fetch.ts --describe                       # diagnostica (nessun Supabase)
npx tsx scripts/places/mic/fetch.ts --dry-run --region Lazio --limit 20
```
