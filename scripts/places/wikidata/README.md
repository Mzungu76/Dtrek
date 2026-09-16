# Wikidata → arricchimento di dtrek_places (NON una fonte primaria)

Implementato: `enrich.ts` in questa cartella (piano `docs/piano-mete-multitipologia.md` §11).

Diversamente dalle altre cartelle in `scripts/places/`, questo NON è un fetcher che produce
`PlaceCandidate[]` — il piano è esplicito (§11): "Wikidata NON è fonte primaria dell'anagrafe...
NON rendere Wikidata obbligatorio". `enrich.ts` legge righe `dtrek_places` già esistenti con
`wikidata_id IS NULL`, cerca un match per nome+prossimità via SPARQL, e su match ad alta confidenza
fa un `UPDATE dtrek_places SET wikidata_id = ...` — **mai un INSERT**.

## Fonte (già verificata e in produzione in questo repository)

`lib/pois/wikidataSource.ts` interroga già dal vivo l'endpoint SPARQL pubblico ufficiale
`https://query.wikidata.org/sparql` — stesso endpoint riusato qui, non un URL indovinato in questa
sessione. La query usa `wikibase:around` (centro+raggio) invece del bbox di quel file, più adatto
ad arricchire righe puntuali già note.

## Bloccante di rete

Stesso di ISTAT/PTPR/MiC/OSM: query.wikidata.org rifiutato dal proxy di ogni sandbox di sviluppo
usata finora — solo il runner GitHub Actions (`.github/workflows/import-places-wikidata.yml`) ci
arriva.

## Resilienza — 502 transitorio visto dal vivo (2026-09-16)

Primo run reale, tutto il Lazio (1425 righe, `--limit 1500`): 10 righe arricchite, poi
`Error: Wikidata SPARQL 502` alla riga 11 — l'intero processo interrotto (nessun retry, nessun
try/catch nel loop). Le 10 UPDATE già fatte restano valide (idempotente, per-riga), ma senza
correzione ogni run lungo rischia di fermarsi al primo blip transitorio dell'endpoint pubblico
condiviso. Aggiunto in `enrich.ts`:
- retry con backoff esponenziale (1s/2s/4s/8s, fino a 4 tentativi) solo per status transitori
  (429/500/502/503/504) o errori di rete/timeout — un 4xx diverso da 429 (query malformata) fallisce
  subito;
- una pausa di 150ms fra una riga e la successiva, per non contribuire noi stessi al carico;
- il loop principale non si interrompe più su una singola riga fallita dopo i retry: la logga come
  errore e prosegue — quella riga resta `wikidata_id IS NULL` e verrà ritentata al prossimo lancio.

Non ancora riverificato con un nuovo run reale dopo questa correzione.

## Logica di matching

`pickBestWikidataMatch` (pura, testata in `scripts/places/__tests__/wikidata-enrich.test.ts`)
sceglie, tra i candidati Wikidata già filtrati per raggio (200m di default) dalla query SPARQL, il
nome con la similarità più alta sopra soglia — nessun candidato sopra soglia → nessun match, mai un
fallback "il più vicino a prescindere dal nome" (piano §14, stesso principio del dedup multi-fonte:
un match incerto non va fuso).

## Uso

```bash
SUPABASE_URL=... SUPABASE_SERVICE_KEY=... npx tsx scripts/places/wikidata/enrich.ts --dry-run --region Lazio
```
