# OpenStreetMap — estratto Lazio

Metti qui il file richiesto da `scripts/places/osm/fetch.ts`:

- `lazio-latest.osm.pbf` (~120 MB)

Download (verificato in questa sessione — Geofabrik non pubblica estratti per singola regione
italiana, solo 5 macro-aree; questo è un mirror comunitario con granularità per regione):

```
http://download.openstreetmap.fr/extracts/europe/italy/lazio-latest.osm.pbf
```

Licenza: **ODbL 1.0** — © OpenStreetMap contributors (https://www.openstreetmap.org/copyright).
Attribuzione richiesta ovunque i dati vengano mostrati (piano §44).

## Perché il file non è nel commit

Questo ambiente non ha accesso di rete a download.openstreetmap.fr (stessa policy di rete
dell'organizzazione che blocca istat.it/dati.lazio.it/dati.cultura.gov.it — verificato con
`curl -v` in questa sessione). L'URL sopra è stato verificato via WebFetch (fetch reale della
pagina indice della directory, che elenca `lazio-latest.osm.pbf`), non indovinato.

```bash
npx tsx scripts/places/osm/fetch.ts --dry-run
```
