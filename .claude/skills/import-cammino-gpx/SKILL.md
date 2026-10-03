---
name: import-cammino-gpx
description: Importa un cammino (Via Francigena e simili) da file GPX ufficiali delle tappe in Supabase (dtrek_places + dtrek_cammino_tappe + dtrek_cammino_tappe_varianti). Usa quando l'utente fornisce GPX di un nuovo cammino/tratto da caricare, o chiede di importare/aggiungere tappe/varianti di un cammino.
---

# Importare un cammino da GPX

Questa skill serve a riprodurre, senza bisogno di altro contesto, il lavoro già fatto per la Via
Francigena (vedi `docs/piano-cammini.md` §7.3): caricare le tappe ufficiali di un cammino a partire
dai suoi file GPX e scriverle nel catalogo `dtrek_places`/`dtrek_cammino_tappe`.

**Prerequisito di contesto**: leggi `docs/piano-cammini.md` (in particolare la sezione 7, "Fase 2")
prima di iniziare — qui c'è solo il runbook operativo, lì il perché delle scelte di schema.

## 0. Dove sono i GPX

L'utente fornisce i GPX in uno di questi modi — chiarisci quale se non è ovvio:
- **File allegati alla conversazione**: guarda cosa risulta scaricato/allegato nella working
  directory o in una cartella upload del container; se non è chiaro dove sono finiti, chiedi.
- **Uno zip** con una cartella per tratto (come lo zip ufficiale "Via-Francigena.zip": una cartella
  per tratto, un file `.gpx` per tappa numerata, i file con "variante" nel nome esclusi dalla
  sequenza principale). In questo caso puoi usare `--zip`+`--folder` dello script (sotto).
- **Una cartella già estratta** (es. scaricata e decompressa in un path temporaneo): usa `--dir`.

Non inventare path: se non trovi i file, elenca cosa c'è nella directory indicata e chiedi
conferma all'utente prima di procedere.

## 1. Identità del cammino

Chiedi (o deduci dal nome della cartella/fonte) **id**, **nome** e **tema**:
- `id`: slug stabile, es. `via-francigena-del-sud`, diventa `source_id = 'cammino/<id>'`.
- `name`: nome visualizzato, es. "Via Francigena del Sud".
- `theme`: `religioso` | `storico` | `naturalistico` (default `religioso`).

Se il cammino è diviso in più tratti/varianti regionali (come la Francigena: tratto principale +
Val di Susa + Litoranea + Bradanica), ogni tratto è un cammino a sé con il suo `id` — non unirli.

## 2. Il progetto Supabase

Progetto attivo di Dtrek: **`sdxlcpxgbkagbxhukehd`** ("supabase-teal-cave", regione eu-west-2).
Verificalo sempre con `mcp__Supabase__list_projects` prima di scrivere — se questo ID non compare
più o non è `ACTIVE_HEALTHY`, usa quello che lo è (potrebbe essere cambiato dall'ultima volta).
Non esiste `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` nell'ambiente di queste sessioni cloud: non provare
a lanciare script Node che li richiedono finché non li hai confermati con l'utente — il percorso
pratico in questi container è quello manuale descritto sotto, via tool MCP Supabase.

## 3. Costruisci il cammino dai GPX (senza scrivere nulla)

La logica di parsing/numerazione/orientamento delle tappe vive in `lib/cammini/gpxTappe.ts`
(`buildFromGpxFiles`) — non reimplementarla. Serve anche la lista borghi/città come "ancore" per
risolvere i nomi di partenza/arrivo delle tappe (`from_name`/`to_name`): recuperala fresca ogni
volta (un container nuovo non ha gli scratch della sessione precedente), ma SOLO con le colonne che
servono e SENZA stamparla per intero nel tuo contesto — una query `select *` su `dtrek_places` può
superare il limite di token del tool. Usa un subagent che:
1. interroga `dtrek_places` (`meta_type = 'borgo_citta'`, colonne `id,name,latitude,longitude,population`)
   in pagine da 1000 righe finché non esauriscono, e scrive il risultato in un file JSON nello
   scratchpad (es. `.../scratchpad/anchors.json`);
2. ti riporta solo quante righe ha scritto.

Poi, in uno script temporaneo (`npx tsx` in scratchpad, non nel repo), chiama:

```ts
import { buildFromGpxFiles, type GpxCamminoInfo } from '/home/user/Dtrek/lib/cammini/gpxTappe'
// leggi i file .gpx della cartella, leggi anchors.json, poi:
const { built, variants, skipped } = buildFromGpxFiles(files, { id, name, theme }, anchors)
```

Guarda SEMPRE prima di scrivere:
- `built.quality.status`: `pronto` oppure `da_rivedere` (+ `reasons`).
- `built.diagnostics` e l'elenco `skipped` (file scartati e perché).
- quanti `variants` sono stati salvati e a quale tappa sono agganciati.

### 3a. Se `quality.status !== 'pronto'`

Non scrivere subito. Capisci PRIMA il perché (è già successo con la Via Francigena del Sud: un
disallineamento numero-file/numero-titolo nella fonte GPX stessa, documentato come "da rivedere" —
vedi `docs/piano-cammini.md` riga ~162). Riassumi all'utente cosa non va (salti fra tappe, numeri
contesi, tappe non collegate) e lascia decidere se scrivere comunque con qualità `da_rivedere` — i
cammini non `pronto` non appaiono in ricerca nell'app (`lib/metaSearch/searchCammini.ts` filtra solo
`pronto`), quindi scriverli non è rischioso per gli utenti finali, ma è comunque una scelta loro.

## 4. Scrivi in Supabase

Usa **`scripts/places/cammini/importFromGpx.ts`** come riferimento della logica esatta di scrittura
(place upsert, tappe upsert con pulizia code vecchie, varianti upsert, relazioni verso i borghi) —
`importCammino` + `importCamminoVarianti` in `scripts/places/cammini/import.ts`. Se l'ambiente ha
`SUPABASE_URL`/`SUPABASE_SERVICE_KEY`, puoi lanciarlo direttamente:

```bash
npx tsx scripts/places/cammini/importFromGpx.ts --dir "<cartella>" \
  --id <id> --name "<Nome>" --theme religioso --write [--min-status da_rivedere]
```

Se NON li hai (il caso tipico in queste sessioni cloud), riproduci lo stesso risultato a mano:
1. Genera l'SQL (place upsert in `dtrek_places`+`dtrek_place_sources`, poi tappe in
   `dtrek_cammino_tappe` con `on conflict (cammino_id, ordinal)`, poi varianti in
   `dtrek_cammino_tappe_varianti` con `on conflict (cammino_id, source_filename)` — stessa forma
   usata da `import.ts`) in uno script temporaneo, scrivendolo su file nello scratchpad.
2. **Non stampare l'SQL generato nel tuo contesto** (può superare 100KB per cammini grandi): fai
   eseguire gli statement a un **subagent** con accesso a `mcp__Supabase__execute_sql`
   (`project_id` del punto 2), uno statement alla volta, nell'ordine place→tappe→varianti, con una
   query di verifica finale (conteggio tappe/varianti per `source_id`) prima di chiudere.
3. Un eventuale `DELETE` di pulizia (tappe con `ordinal` oltre il nuovo totale, per i re-import) può
   tornare `status: "cancelled"` dal tool se percepito come distruttivo — è normale, non insistere:
   su un cammino nuovo non c'è nulla da eliminare, verificalo con una query `count`/`max(ordinal)` e
   salta lo step se non serve; se serve davvero (re-import con meno tappe), eseguilo tu nella
   sessione principale così l'utente può approvarlo, non forzarlo da un subagent.

## 5. Dopo la scrittura

- Verifica con una query di conteggio (`dtrek_places` + join `dtrek_cammino_tappe` +
  sub-select su `dtrek_cammino_tappe_varianti`) che tappe/varianti scritte combacino con quanto
  costruito al punto 3.
- Riporta all'utente: tappe, varianti, km totali, stato qualità, eventuali scarti/numeri contesi.
- Se emergono script scratch (`.ts` di test, file SQL temporanei) finiti per errore nella working
  directory del repo invece che nello scratchpad: rimuovili, non committarli.
