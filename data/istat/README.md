# ISTAT — Confini delle unità amministrative a fini statistici

Metti qui i 2 file richiesti da `scripts/places/istat/fetch.ts` prima di eseguirlo:

1. Shapefile Comuni (confini/centroidi), edizione più recente:
   - Pagina prodotto: https://www.istat.it/it/archivio/222527
   - Download (versione generalizzata, più leggera — sufficiente per un centroide):
     `https://www.istat.it/storage/cartografia/confini_amministrativi/generalizzati/<ANNO>/Limiti0101<ANNO>_g.zip`
   - Decomprimi e copia qui `Com0101<ANNO>_g.shp` + `.dbf` + `.shx` (+ eventuali `.prj`/`.cpg`)
   - Proiezione dichiarata: WGS84 UTM32N (EPSG:32632) — il fetch la converte automaticamente

2. Tabella di codifica (nomi Comune/Provincia/Regione — lo shapefile ha solo i codici numerici):
   - Pagina prodotto: https://www.istat.it/classificazione/codici-dei-comuni-delle-province-e-delle-regioni/
   - Download (permalink dichiarato stabile dalla pagina stessa):
     `https://www.istat.it/storage/codici-unita-amministrative/Elenco-comuni-italiani.xlsx`
   - Copia qui come `Elenco-comuni-italiani.xlsx`

## Perché questi file non sono nel commit

Questo ambiente non ha accesso di rete a istat.it (policy di rete dell'organizzazione — verificato
con `curl -v` in questa sessione: la connessione viene rifiutata esplicitamente dal proxy con
"policy denial", non un errore di dominio/URL). Gli URL sopra sono stati verificati mediante
WebSearch/WebFetch (che usano un canale di rete diverso da quello disponibile alla shell) — sono
le pagine e i permalink reali pubblicati da ISTAT al momento di questa sessione (2026-08-30), ma
il contenuto binario dei file non è stato scaricato/ispezionato byte-per-byte qui.

Scarica i due file da una macchina con accesso di rete normale e mettili in questa cartella, poi:

```bash
npx tsx scripts/places/istat/fetch.ts --dry-run              # tutta Italia, anteprima
npx tsx scripts/places/istat/fetch.ts --dry-run --region Lazio  # solo il pilota Lazio (piano §42)
```
