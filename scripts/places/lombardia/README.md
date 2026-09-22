# Regione Lombardia → dtrek_places (Siti)

Implementato: `fetch.ts` (fonte scelta dopo due round di probe reali — vedi "Stato" sotto). Modalità
`--describe`/`--dry-run` disponibili prima di qualunque `write` su scala piena, stesso principio già
applicato a MiC/PTPR.

## Perché serve questa fonte (contesto)

`scripts/places/mic/fetch.ts` (ArCo/MiC) ha già girato su Lombardia con esito verificato in
Supabase: ArCo cataloga solo **6** "Istituti e Luoghi della Cultura" per l'intera regione (stesso
numero a `limit 20` e `limit 5000` — non un limite di query). Di questi solo 2 sono diventati Siti
nuovi taggati Lombardia; gli altri 4 hanno aggiornato righe già esistenti sotto altre regioni. Per
l'utente questo significa: cercare "Siti" vicino a Milano continua a dare quasi nulla. MiC/ArCo non
è la fonte giusta per una copertura vera in Lombardia — serve una fonte regionale con
georeferenziazione reale, non geocodificata.

## Fonti candidate (trovate via WebSearch in questa sessione, 2026-09-22 — NESSUNA verificata con
una richiesta HTTP reale, vedi "Bloccante di rete" sotto)

### A. Socrata "Beni culturali Bella Lombardia" (dati.lombardia.it) — candidato principale

- Dataset "Mappa Beni culturali Bella Lombardia": `ap3k-i5ip` —
  https://www.dati.lombardia.it/Cultura/Mappa-Beni-culturali-Bella-Lombardia/ap3k-i5ip
- Dataset base "Beni culturali Bella Lombardia": `4mr7-hfsh` —
  https://www.dati.lombardia.it/Cultura/Beni-culturali-Bella-Lombardia/4mr7-hfsh
- Descrizione (dalla pagina del dataset): "deriva da una selezione di campi estratti dalle schede di
  catalogazione dedicate alle diverse tipologie di beni culturali nel sistema SIRBeC" — SIRBeC è
  esattamente la fonte che il piano concordato con l'utente identifica per la Lombardia.
- API: SODA di Socrata — JSON nativo su `https://www.dati.lombardia.it/resource/<id>.json`, niente
  da scaricare/parsare come uno shapefile. Le colonne "Location" di Socrata sono normalmente WGS84
  dirette — **da confermare con `probe.ts` sul campo reale**, mai assunto.
- Licenza: **IODL 2.0** (Italian Open Data License) — dichiarata dalla piattaforma dati.lombardia.it
  in generale (pagina FAQ). Obbligo minimo: citare la fonte e il fornitore dei dati. Non ancora
  verificato se questo dataset specifico dichiari una licenza diversa sulla sua pagina — verificare
  al primo `--describe` reale.
- Se questo schema regge ai probe, è una fonte molto più semplice del percorso B qui sotto: nessun
  CRS da trasformare, nessuna sintassi WFS/ArcGIS, solo paginazione `$limit`/`$offset`.

### B. ArcGIS REST "cultura/LBL_GEO" (cartografia.servizirl.it)

- Trovato indicizzato da un motore di ricerca all'interno della cartella `cultura` dei servizi
  ArcGIS della Regione: `https://www.cartografia.servizirl.it/arcgis2/rest/services/cultura/LBL_GEO/MapServer`
- Nome del layer ("LBL_GEO") suggerisce "Lombardia Beni cuLturali — GEOreferenziato", ma è
  un'ipotesi non confermata — non un dato osservato.
- **Attenzione**: un ArcGIS MapServer non è di per sé un WFS — espone nativamente un'API REST/JSON
  propria (`.../query?f=json`), che qui è preferibile a un vero WFS se disponibile (stesso dato,
  meno complessità). Un vero endpoint WFS (`.../WFSServer?service=WFS&request=GetCapabilities`) può
  esistere in aggiunta se abilitato sul servizio specifico — `probe.ts` testa entrambi.
- CRS: **non verificato**. `?f=json` sul MapServer dichiara lo `spatialReference` reale — da leggere
  prima di scrivere qualunque trasformazione (a differenza del PTPR Lazio, qui non c'è un `.prj`
  scaricato da un utente da cui partire: la prima verifica vera è il probe).

### C. Endpoint GeoServer WFS "standard" sul dominio principale — NON verificato, puro tentativo

`https://www.geoportale.regione.lombardia.it/geoserver/wfs` — pattern GeoServer generico, ipotizzato
dal piano originale prima di qualunque verifica reale. Nessuna fonte trovata via WebSearch lo
conferma esplicitamente (le pagine "Servizi OGC" del geoportale non elencano URL espliciti negli
estratti indicizzati). Incluso in `probe.ts` a costo zero, ma **non usare il risultato per scrivere
un importer senza prima averlo confermato con dati reali** — stesso errore già fatto (ed evitato) due
volte con le coordinate MiC prima di usare `--describe` su un record vero.

## Bloccante di rete (più ampio di quanto documentato per MiC/PTPR/ISTAT)

Questo sandbox non ha accesso di rete non solo a `dati.cultura.gov.it`/`regione.*.it`, ma — verificato
dal vivo in questa sessione — anche a `dati.lombardia.it`, `cartografia.servizirl.it`,
`dev.socrata.com` e `inspire-geoportal.ec.europa.eu` (tutti bloccati dal proxy egress con
`EGRESS_BLOCKED` / `CONNECT tunnel failed, response 403`, sia da `WebFetch` sia da `curl` diretto).
In pratica: **nessun dominio esterno a una piccola whitelist infrastrutturale è raggiungibile da
qui**, non un blocco mirato solo ai domini regionali. Solo il runner GitHub Actions ci arriva — vedi
`.github/workflows/import-places-lombardia.yml`, `mode: probe`.

## Stato (aggiornato dopo il round 2 di probe, eseguito dal vivo dall'utente il 2026-09-22)

Entrambi i round di probe hanno risposto 200 su tutti gli endpoint reali (tranne il tentativo
GeoServer "a costo zero", 404 atteso). Fonte scelta e verificata: **B, ArcGIS `cultura/LBL_GEO`**.

- **Copertura reale**: **651** record in tutta la Lombardia (`arcgis-lblgeo-count-totale`) — contro
  i soli 6 di MiC/ArCo — di cui **70** nel solo Comune di Milano (`arcgis-lblgeo-milano-count`), il
  numero concreto che risolve il problema segnalato dall'utente.
- **CRS confermato senza trasformazione manuale**: `outSR=4326` nella query fa riproiettare il
  server stesso — verificato con 3 record reali su Milano (`arcgis-lblgeo-geometry-sample-milano`),
  coordinate plausibili (lon ~9.17-9.18, lat ~45.45-45.47, esattamente Milano). Nessun proj4/EPSG a
  mano come per il PTPR Lazio.
- **Nessun filtro CATEGORIA necessario, verificato con un conteggio esatto**: i valori distinti di
  `CATEGORIA` (`arcgis-lblgeo-categorie-distinte`: `LDC` 110, `B` 146, `A4` 133, `A1` 207, `A3` 40,
  `SA` 10, `A2` 5) sommano ESATTAMENTE a 651 — nessuna categoria residua "oggetto singolo" nascosta,
  a differenza del dataset Socrata gemello (che cataloga anche opere d'arte individuali, es.
  "Statuetta fittile di vignaiolo"). Il layer ArcGIS risulta già curato ai soli luoghi.
- **A e B sono la stessa fonte SIRBeC** esposta due volte: il record ArcGIS (`IDBENE`) e il dataset
  Socrata condividono nome campo (`idbene`) e dominio foto (`bellalombardia.regione.lombardia.it`).
- `socrata-mappa-bella-lombardia` (ap3k-i5ip) spiegato dalla sua metadata (round 2): è una vista
  "mappa" (`assetType: "map"`, `modifyingViewUid: "4mr7-hfsh"`) — non un dataset indipendente,
  motivo delle righe vuote al round 1. Scartata come fonte, non serve altro.
- **Licenza — CC0 1.0 confermata sul dataset gemello, non sul canale ArcGIS**: la metadata Socrata
  di ENTRAMBI i dataset (`4mr7-hfsh` e `ap3k-i5ip`) dichiara `licenseId: "CC0_10"` (pubblico
  dominio), con `attribution: "Regione Lombardia"` come cortesia non obbligatoria. Il servizio
  ArcGIS ha `copyrightText` vuoto — trattato come CC0 per analogia (stessa fonte, stesso `IDBENE`),
  non una conferma indipendente per questo canale specifico. Vedi il commento di licenza in cima a
  `fetch.ts` per il dettaglio.
- **Nessun vero WFS disponibile**: sia il tentativo `WFSServer` su ArcGIS sia il GeoServer generico
  sul dominio del geoportale hanno dato pagine HTML/404 — l'unica via reale è la query REST di
  ArcGIS (`.../MapServer/0/query`), comunque più semplice di un WFS.

`fetch.ts` implementato di conseguenza (`--describe`/`--dry-run`/`write`, stesso pattern di
`mic/fetch.ts`). La mappatura `TIPOLOGIA → SiteType` (`LOMBARDIA_TYPE_MAP`) ha solo 3 valori
verificati dal vivo finora (`anfiteatro`, `Museo, galleria non a scopo di lucro e/o raccolta`,
`convento`) — le altre voci sono per analogia con `MIC_TYPE_MAP`, da rivedere contro la
distribuzione reale stampata da `--dry-run` prima di un `write` su scala piena.

## Uso

```bash
npx tsx scripts/places/lombardia/probe.ts                              # diagnostica fonti candidate (round 1+2)
npx tsx scripts/places/lombardia/fetch.ts --describe                   # dump di un record ArcGIS reale
npx tsx scripts/places/lombardia/fetch.ts --describe --name "Museo"    # stesso, filtrato per nome
npx tsx scripts/places/lombardia/fetch.ts --dry-run                    # tutta la regione, nessuna scrittura
```
