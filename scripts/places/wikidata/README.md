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

Stesso di ISTAT/PTPR/MiC/OSM: query.wikidata.org rifiutato dal proxy di questo ambiente (policy
dell'organizzazione, verificato con `curl -v`). Non eseguito contro l'endpoint reale in questa
sessione — e comunque non avrebbe righe da arricchire finché le altre fonti non hanno scritto in
`dtrek_places` (nessuna scrittura reale avvenuta in nessuna fonte in questa sessione, vedi le altre
cartelle).

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
