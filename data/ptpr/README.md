# PTPR Lazio — Shapefile Data

Place the 3 PTPR Tavola B shapefiles here before running the import script:

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
