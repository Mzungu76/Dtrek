# Cammini (OpenStreetMap) → dtrek_places + dtrek_cammino_tappe

Fase 2 di `docs/piano-cammini.md`. Un cammino è una riga `dtrek_places` con `meta_type='cammino'`
(pin a metà tracciato, `metadata.overviewPolyline` per la mappa) più le sue tappe in
`dtrek_cammino_tappe`.

## Decisioni

- **Solo a piedi.** La query Overpass chiede `route=hiking|foot`; i cammini ciclabili sono esclusi per
  decisione di prodotto, non per filtro a valle.
- **Un tratto regionale alla volta** (`config.ts`): oggi `via-francigena-lazio`, da Acquapendente a
  San Pietro. Ritaglio per bbox, non per confine amministrativo — approssimazione dichiarata.
- **Tappe ufficiali o calcolate.** Se la fonte ha ≥3 sotto-relazioni numerate ("Tappa 3: A - B") si
  usano; altrimenti si taglia a ~20 km (finestra 12–28 km) chiudendo su un borgo del catalogo
  (`borgo_citta`, ≥300 abitanti, entro 1,5 km dalla linea). `source` e `ends_at_anchor` lo dicono:
  la UI non deve mai presentare come ufficiale una tappa calcolata.
- **Niente dislivello.** OSM non ha quote: `elevation_*` restano NULL, si calcolano dal DTM (Fase 5)
  e un re-import non li azzera.
- **Polilinee in `jsonb` `[lat, lon][]`**, non PostGIS: stesso formato di `route_polyline`.
- **Query leggera.** Le relazioni escono con i soli membri (`out body`), la geometria è emessa a parte per le way dentro il ritaglio. La prima versione chiedeva la geometria dell'intera relazione europea e andava in 504 su tutti i server. Il fetch riprova 3 giri su 4 endpoint, con attesa crescente.
- **Rete.** Overpass è irraggiungibile da alcuni ambienti di sviluppo: il fetch gira nel workflow
  `import-places-cammini.yml`. `--fixture <file>` rifà il build da una risposta già salvata.

## Cosa NON è verificato

Il codice è testato su fixture sintetiche (`scripts/places/__tests__/cammini.test.ts`), **non** sui
dati reali della Via Francigena: la struttura delle sue relazioni OSM (se le tappe laziali sono
sotto-relazioni numerate, quante varianti, se ci sono interruzioni) si conosce solo alla prima
esecuzione. Lanciare prima il workflow in `dry-run`, leggere il riepilogo, poi eventualmente:
- ritoccare `bbox`/`excludeNameRegex` in `config.ts`;
- forzare `stages=computed` se le tappe ufficiali risultano incomplete;
- se le catene scartate sono molte, serve una ricomposizione con interruzioni (oggi si tiene la
  catena più lunga e si riporta il resto in diagnostica).

## Uso

```bash
npx tsx scripts/places/cammini/fetch.ts --id via-francigena-lazio --dry-run
npx tsx scripts/places/cammini/fetch.ts --id via-francigena-lazio --fixture /tmp/raw-overpass.json --dry-run
```
Licenza dei dati: ODbL 1.0 (© OpenStreetMap contributors) — attribuzione in `/fonti-e-crediti`.

## Scoperta nazionale (`discover.ts`)

Per non scrivere a mano l'elenco dei cammini d'Italia: `discover.ts` interroga Overpass (4 fasce di
latitudine, solo tag e membri, **nessuna geometria**) per le relazioni a piedi di rete `iwn`/`nwn`
(più le `rwn` con nome da cammino) e le valuta con `lib/cammini/discovery.ts`:

| Segnale | Punti |
|---|---|
| rete iwn / nwn / rwn | +40 / +30 / +10 |
| lunghezza dichiarata ≥100 / ≥50 / ≥25 km; <15 km | +30 / +20 / +8; −30 |
| nome da cammino (Cammino, Via…, Alta Via, Romea, Francigena…) | +15 |
| ≥3 sotto-relazioni (tappe) | +20 |
| scheda Wikidata | +10 |

≥60 **ammesso**, 35–59 **da rivedere**, sotto **scartato**. Una relazione figlia di un'altra candidata
è una tappa o una parte, non un cammino a sé; una variante va rivista. Eccezioni a mano in
`overrides.json` (`include`/`exclude` per id di relazione).

Workflow `discover-cammini.yml` (manuale, non scrive nulla): lista nel riepilogo del job e negli
artifact `cammini-candidates` (JSON) e `raw-discovery` (risposta grezza, per rifare la valutazione
con `--fixture` dopo aver cambiato le regole). Le soglie sono una prima stima: vanno tarate sulla
lista reale.

## Import del registro (`import-registry.ts`)

Per i cammini approvati in `lib/cammini/registry.ts` (workflow `import-cammini-registry.yml`, parte
sempre in dry-run). Per **gruppo di relazioni**, non per nome+bbox:

1. relazioni col nome del cammino + sotto-relazioni (2 livelli), a piedi, filtro Italia sul centro;
2. geometria delle way in blocchi da 250 per id;
3. foglie = tappe ufficiali (nome "Tappa N"/ref numerico) oppure pezzi senza tappe → tappe calcolate
   (borghi come punti di sosta); i pezzi non-tappa già coperti ≥70% dalle tappe ufficiali sono ignorati;
4. **ordine geometrico** (`orderAlongRoute`): i numeri di tappa ripartono da 1 in ogni regione, non
   servono all'ordine; si parte dal capo più a nord, un tratto oltre 3 km non si aggancia (resta fuori);
5. divisione a un punto (`splitAt`: Francigena a Roma → Canterbury–Roma / Roma–Leuca);
6. **controllo di qualità** (`assessQuality`): collegato, ≥3 tappe, ≤10% di tappe >45 km o <2 km,
   pochi salti. **PRONTO** o **DA_RIVEDERE**: con `--write` si scrivono solo i pronti
   (`--min-status da_rivedere` per forzare). Lo stato finisce in `dtrek_places.metadata.quality`.

Non supportati: ondata 3 (tappe in rifugio) e import di reti.
