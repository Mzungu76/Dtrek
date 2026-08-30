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
  `resource/1f1e7146-e8ff-47a9-9690-bca47383f3b3`). **Verificato con un file reale in questa
  sessione** (l'utente ha caricato `areeborghiidentitari.zip`) — dentro lo zip i file si chiamano
  `Aree_borghi_identitari.shp`/`.dbf`/`.shx`/`.prj`/`.cpg`: rinominali in `borghi_identitari.*` a
  questo copia-incolla, oppure copiali qui e rinominali dopo. 47 record, campi OGGETTO/LOCALITA_/
  INDIRIZZO/DESTINAZIO/USO_ATTUAL/AMBITO/ID_RL (non NOME/COMUNE/VINCOLO — schema diverso dai layer
  archeologici gemelli), `.cpg` UTF-8, `.prj` `ED_1950_UTM_Zone_33N` (EPSG:23033, confermato).
- `centri_storici.shp` + `.dbf` + `.shx` — dataset "PTPR - Tav. B - Centri storici":
  https://dati.lazio.it/dataset/ptpr-tav-b-centri-storici (risorsa SHP,
  `resource/b4699415-5e31-4165-a6b7-a45c0b6f79f8`). **Non ancora verificato con un file reale** —
  nessun file per questo layer è stato caricato finora; lo schema di campi assunto nel codice
  (ID_RL/NOME/COMUNE/VINCOLO, preso dai layer archeologici gemelli) è una congettura da confermare
  al primo uso.

URL verificati via WebSearch/WebFetch in questa sessione (2026-08-30). Rete di questo ambiente
bloccata verso dati.lazio.it per policy dell'organizzazione (vedi commento in cima a
`scripts/places/ptpr/extra-layers.ts`) — per questo il layer borghi identitari è stato scaricato
dall'utente su una macchina con accesso di rete normale e caricato in sessione, non scaricato qui.

"Città di fondazione" (terzo layer del piano §5) non ha un dataset GIS scaricabile a parte — è
gestito come tabella statica curata direttamente in `extra-layers.ts` (5 comuni noti dell'Agro
Pontino), nessun file da scaricare per quella parte.

```bash
npx tsx scripts/places/ptpr/extra-layers.ts --dry-run
npx tsx scripts/places/ptpr/extra-layers.ts --dry-run --only fondazione   # solo la tabella statica
```
