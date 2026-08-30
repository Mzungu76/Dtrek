# PTPR Lazio — Shapefile Data

Place the 3 PTPR Tavola B (archaeology) shapefiles here before running the import script:

- `puntiarcheologici.shp` + `.dbf` + `.shx`
- `aree_archeologiche.shp` + `.dbf` + `.shx`
- `linee_archeologiche.shp` + `.dbf` + `.shx`

Source: dati.lazio.it / geoportale.regione.lazio.it — CC BY 4.0
Projection: ED50 fuso 33N (EPSG:23033) — the script converts to WGS84 automatically.

To run the import (requires SUPABASE_SERVICE_KEY):

```bash
SUPABASE_URL=https://sdxlcpxgbkagbxhukehd.supabase.co \
SUPABASE_SERVICE_KEY=eyJ... \
npx tsx scripts/import-ptpr.ts
```

Use `--dry-run` to preview without writing to Supabase.

## Layer aggiuntivi (piano §5 — Borghi identitari, Centri storici)

Per `scripts/places/ptpr/extra-layers.ts`, metti qui anche (opzionali indipendentemente l'uno
dall'altro — lo script salta quello mancante):

- `borghi_identitari.shp` + `.dbf` + `.shx` — dataset "PTPR - Tav. B - Aree borghi identitari":
  https://dati.lazio.it/dataset/ptpr-tav-b-aree-borghi-identitari (risorsa SHP,
  `resource/1f1e7146-e8ff-47a9-9690-bca47383f3b3`)
- `centri_storici.shp` + `.dbf` + `.shx` — dataset "PTPR - Tav. B - Centri storici":
  https://dati.lazio.it/dataset/ptpr-tav-b-centri-storici (risorsa SHP,
  `resource/b4699415-5e31-4165-a6b7-a45c0b6f79f8`)

Stessa proiezione ED50 fuso 33N (EPSG:23033) dichiarata dalle pagine dataset. URL verificati via
WebSearch/WebFetch in questa sessione (2026-08-30) — il download effettivo non è stato possibile
qui (rete di questo ambiente bloccata verso dati.lazio.it per policy dell'organizzazione, vedi
commento in cima a `scripts/places/ptpr/extra-layers.ts`).

"Città di fondazione" (terzo layer del piano §5) non ha un dataset GIS scaricabile a parte — è
gestito come tabella statica curata direttamente in `extra-layers.ts` (5 comuni noti dell'Agro
Pontino), nessun file da scaricare per quella parte.

```bash
npx tsx scripts/places/ptpr/extra-layers.ts --dry-run
npx tsx scripts/places/ptpr/extra-layers.ts --dry-run --only fondazione   # solo la tabella statica
```
