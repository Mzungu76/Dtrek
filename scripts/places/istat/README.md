# ISTAT → dtrek_places

Implementato: `fetch.ts` in questa cartella (piano `docs/piano-mete-multitipologia.md` §4.1).

## Fonti (verificate via WebSearch/WebFetch in questa sessione — 2026-08-30)

- Dataset: **"Confini delle unità amministrative a fini statistici"** (pagina
  https://www.istat.it/it/archivio/222527) — non "Basi territoriali e variabili censuarie" (quel
  dataset è a livello di sezione di censimento, molto più granulare e pesante di quanto serva per
  un centroide comunale; il piano lo cita come riferimento generico ma l'obiettivo dichiarato,
  "base geografica stabile per Borghi/Città" con nome/codice/provincia/regione/centroide, è
  esattamente quello che "Confini delle unità amministrative" fornisce).
- Shapefile Comuni: `Com0101<ANNO>_g.shp`, campi `PRO_COM`/`PRO_COM_T`/`COMUNE`/`COD_PROV`/
  `COD_REG`/`COD_RIP`, proiezione WGS84 UTM32N (EPSG:32632). Fonte:
  https://www.istat.it/wp-content/uploads/2024/04/Descrizione-dati-Confini-unita-amministrative-fini-statistici.pdf
- Tabella di codifica (nomi Provincia/Regione, assenti dallo shapefile): permalink dichiarato
  stabile https://www.istat.it/storage/codici-unita-amministrative/Elenco-comuni-italiani.xlsx,
  raggiungibile da https://www.istat.it/classificazione/codici-dei-comuni-delle-province-e-delle-regioni/

**Non verificato byte-per-byte**: il contenuto binario di questi file. Il proxy di rete di questo
ambiente rifiuta la connessione a istat.it per policy dell'organizzazione (`curl -v` → "CONNECT
tunnel failed, response 403, policy denial" — non un URL sbagliato: la connessione viene negata
esplicitamente, verificato in questa sessione). WebSearch/WebFetch usano un canale diverso e hanno
permesso di confermare che le pagine/URL sopra esistono e descrivono questa struttura, ma non di
scaricare i file per ispezionarli riga per riga.

## Cosa fa `fetch.ts`

Legge `data/istat/Com0101<ANNO>_g.shp` (+`.dbf`) e `data/istat/Elenco-comuni-italiani.xlsx` (vedi
`data/istat/README.md` per dove scaricarli), unisce le due tabelle su `PRO_COM`, converte le
coordinate da EPSG:32632 a EPSG:4326 e produce `PlaceCandidate[]` con:

```ts
{
  metaType: 'borgo_citta',
  subtype: undefined,   // piano §6 — mai dedotto da ISTAT
  municipality, municipalityIstatCode: PRO_COM, province, region,
  source: 'istat',
  sourceId: PRO_COM,
  confidence: 1,
}
```

La lettura della tabella di codifica individua le colonne per fuzzy-match sull'intestazione
(contiene "regione"/"comune"/ecc.) invece che per nome esatto, proprio perché l'intestazione reale
non è stata verificata byte-per-byte in questa sessione — vedi i commenti in `fetch.ts`.

## Test

`scripts/places/__tests__/istat.test.ts` copre `istatRowToPlaceCandidate` (join, fallback quando
manca la tabella di codifica, mapping dei campi) con fixture coerenti con lo schema sopra — non
richiede rete/filesystem.

## Uso

```bash
npx tsx scripts/places/istat/fetch.ts --dry-run
npx tsx scripts/places/istat/fetch.ts --dry-run --region Lazio   # pilota Lazio, piano §42
# poi, con SUPABASE_URL/SUPABASE_SERVICE_KEY impostate:
npx tsx scripts/places/istat/fetch.ts --region Lazio
```

Non eseguito contro dati reali in questa sessione (file non scaricabili, vedi sopra) — chi ha
accesso di rete a istat.it deve scaricare i file in `data/istat/` e lanciare lo script.
