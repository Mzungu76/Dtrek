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

**Non verificato**: il predicato esatto che porta il valore finale di lat/long (la classe
`Coordinates` dell'ontologia location non ha proprietà lat/long proprie, le delega alla classe
esterna CLV `Geometry` — il cui vocabolario non è stato ispezionabile in questa sessione: le pagine
LodView di dati.beniculturali.it/dati.cultura.gov.it sono andate sistematicamente in timeout via
WebFetch, e l'endpoint SPARQL stesso non è raggiungibile dalla shell di questo ambiente per lo
stesso motivo di rete di ISTAT/PTPR — vedi sotto). La query in `fetch.ts` prova la forma più comune
(WGS84 Geo Vocabulary `geo:lat`/`geo:long`) ma **va verificata contro l'endpoint reale prima del
primo uso** (partire con `LIMIT 5` e ispezionare l'output).

## Cosa esisteva già nel repository (riusato come riferimento, non duplicato)

`lib/pois/gnaSource.ts` — fetcher live per il solo layer archeologico MiC via GNA (WFS), non
duplicato qui. `MIC_TYPE_MAP` in `fetch.ts` segue lo stesso approccio a sottostringa di
`GNA_TYPE_MAP` in quel file, applicato però all'**etichetta testuale** del tipo (non a un codice),
perché il thesaurus dei tipi ArCo non è stato verificabile in questa sessione.

## Bloccante di rete

Stesso di ISTAT/PTPR: il proxy di questo ambiente rifiuta la connessione a `dati.cultura.gov.it`
(verificato con `curl -v` — policy dell'organizzazione, non un URL sbagliato). La query SPARQL in
`fetch.ts` non è stata eseguita contro l'endpoint reale in questa sessione. 0 righe importate.

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
