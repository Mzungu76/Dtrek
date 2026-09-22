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

## Stato

Solo `probe.ts` esiste, e non è stato ancora eseguito contro gli endpoint reali (serve la GitHub
Action). Nessun `fetch.ts`/importer: va scritto SOLO dopo aver visto un dump reale di almeno una
fonte tra A/B (schema dei campi, CRS reale se serve una trasformazione, licenza confermata) — stesso
principio già applicato a MiC (mai fidarsi della sola documentazione).

## Uso

```bash
npx tsx scripts/places/lombardia/probe.ts                       # tutti i probe
npx tsx scripts/places/lombardia/probe.ts --only socrata-mappa-bella-lombardia
```
