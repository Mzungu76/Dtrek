# Regione Lombardia → dtrek_places (Siti)

Non ancora implementato: solo `probe.ts` (diagnostica), nessun `fetch.ts` — vedi "Stato" sotto.

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

## Stato (aggiornato dopo il round 1 di probe, eseguito dal vivo dall'utente il 2026-09-22)

Tutti i probe del round 1 hanno risposto 200 tranne il tentativo GeoServer "a costo zero" (404,
atteso — nessuna fonte lo confermava). Risultati reali:

- **B (ArcGIS `cultura/LBL_GEO`) è il candidato migliore, confermato con dati reali**: layer
  `Beni_Culturali`, campi reali `IDBENE, DENOMINAZIONE, TIPOLOGIA, TIPOMUSEO, CATEGORIA, INDIRIZZO,
  COMUNE, PROVINCIA, ABSTRACT, URLFOTOL...`. Interrogato con `outSR=4326`, il server ha
  **riproiettato lui stesso** in WGS84 (`spatialReference` di risposta = 4326) — nessuna
  trasformazione CRS a mano necessaria (a differenza del PTPR Lazio). Esempio reale: "Museo
  Archeologico" di Lecco, `CATEGORIA:"LDC"`.
- **A e B sono la stessa fonte SIRBeC** esposta due volte: il record ArcGIS (`IDBENE:102`) e il
  dataset Socrata base (campo `idbene:"6960"`) condividono nome campo e dominio foto
  (`bellalombardia.regione.lombardia.it`).
- **Rischio reale trovato nei dati (non un'ipotesi)**: il dataset Socrata base (`4mr7-hfsh`)
  cataloga ANCHE oggetti/opere singole (es. "Statuetta fittile di vignaiolo", categoria
  "Capolavori"), non solo luoghi. Se il layer ArcGIS mischia le stesse categorie, un importer
  ingenuo scriverebbe statue come "Siti" — **non ancora verificato se il layer ArcGIS sia già
  filtrato ai soli luoghi** (round 2 di probe verifica i valori distinti di `CATEGORIA` con un
  conteggio reale, non un'assunzione).
- `socrata-mappa-bella-lombardia` (ap3k-i5ip) ha risposto 200 ma con righe **vuote** — probabile
  vista "mappa" non interrogabile via SODA standard (round 2 ne legge la metadata per capire perché).
- **Nessun vero WFS disponibile**: sia il tentativo `WFSServer` su ArcGIS sia il GeoServer generico
  sul dominio del geoportale hanno dato pagine HTML/404 — l'unica via reale è la query REST di
  ArcGIS (`.../MapServer/0/query`), comunque più semplice di un WFS.
- **Licenza — non ancora confermata per questo layer specifico**: il geoportale dichiara (pagina
  "note legali", trovata via WebSearch) che i dati scaricabili sono **IODL 2.0 o CC-BY-NC-SA 3.0
  Italia** a seconda del dataset. Il servizio ArcGIS ha `copyrightText` vuoto. Il dataset Socrata
  gemello (stessa fonte SIRBeC) è confermato IODL 2.0 — ragionevole assumerla anche per questo
  layer, ma da trattare come non confermata finché non si trova la scheda metadato specifica.

Round 2 di probe aggiunto a `probe.ts` (conteggio totale del layer, distribuzione `CATEGORIA`,
conteggio su Milano come prova concreta di copertura, un campione di geometria con pochi campi per
vedere le coordinate reali non troncate, metadata dei due dataset Socrata). **Non ancora eseguito.**

Nessun `fetch.ts`/importer ancora: va scritto SOLO dopo il round 2 (in particolare dopo aver
confermato se serve un filtro `CATEGORIA`) — stesso principio già applicato a MiC (mai fidarsi della
sola documentazione, mai scrivere la logica di filtro prima di un conteggio reale).

## Uso

```bash
npx tsx scripts/places/lombardia/probe.ts                       # tutti i probe
npx tsx scripts/places/lombardia/probe.ts --only socrata-mappa-bella-lombardia
```
