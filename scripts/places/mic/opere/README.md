# ArCo → "Opere di questo museo" (diagnostica, nessuna pipeline di import ancora)

Vedi `docs/arco-opere-musei.md` (root del repo) per il report completo: perché serve, cosa esiste
già in Dtrek, cosa dice l'ontologia ArCo, cosa NON è ancora verificato sui dati reali, come
procedere. Questa cartella contiene solo `probe.ts`: query diagnostiche isolate contro
`https://dati.cultura.gov.it/sparql`, nessuna scrittura, nessun Supabase — stesso pattern di
`scripts/places/mic/probe.ts`.

## Perché solo diagnostica

`scripts/places/mic/fetch.ts` collega già i musei MiC a `dtrek_places` (source `mic`,
`source_id` = id numerico ArCo del `CulturalInstituteOrSite`). Per mostrare le opere REALI
conservate in quei musei serve un predicato che colleghi un'opera catalogata
(`arco:CulturalProperty`) al suo museo. Un candidato è stato trovato leggendo l'ontologia reale su
GitHub (`loc:hasCulturalInstituteOrSite`, vedi commenti in `probe.ts`) — ma questo stesso
repository ha già dimostrato più volte (coordinate dei CIS, `MIC_DATA_SOURCES.md`) che un
predicato plausibile dalla sola documentazione può dare 0 risultati contro l'endpoint reale, o
avere una direzione diversa da quella suggerita dal commento. Nessuna scrittura in produzione
finché questo non è verificato con una query reale.

## Uso

```bash
npx tsx scripts/places/mic/opere/probe.ts                        # 4 probe: esistenza classe/predicato, entrambe le direzioni
npx tsx scripts/places/mic/opere/probe.ts --cis 105665            # opere collegate a QUESTO museo già in Dtrek (id ArCo reale, non inventato)
npx tsx scripts/places/mic/opere/probe.ts --describe               # dump a 2 salti di una CulturalProperty arbitraria
npx tsx scripts/places/mic/opere/probe.ts --describe --name "X"    # idem, filtrata per rdfs:label
npx tsx scripts/places/mic/opere/probe.ts --describe --cis 105665  # dump a 2 salti della prima opera collegata a QUESTO museo
npx tsx scripts/places/mic/opere/probe.ts --coverage [--limit 500]  # distribuzione per famiglia di URI museo (nazionale vs regionale) su un campione
npx tsx scripts/places/mic/opere/probe.ts --describe-uri "<uri>"    # dump a 2 salti di un URI qualunque (es. un museo "hash" trovato da --coverage)
```

Nessuna di queste è stata eseguita dal vivo in questa sessione (stesso blocco di rete verso
`dati.cultura.gov.it` di `scripts/places/mic/`, riverificato — vedi `docs/arco-opere-musei.md`
§0). Lanciare `.github/workflows/probe-opere-mic.yml` (manuale, nessun secret richiesto) è l'unico
modo per ottenere un segnale reale.

## Test

`__tests__/probe.test.ts` copre le funzioni pure (costruzione query, nessuna iniezione SPARQL nel
filtro per nome) e la struttura dei probe — non richiede rete.
