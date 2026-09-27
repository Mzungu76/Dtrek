# Wikidata → "Opere di questo museo" (alternativa ad ArCo)

Vedi `docs/opere-musei-wikidata.md` (root del repo) per il report completo. `docs/arco-opere-musei.md`
documenta perché ArCo è stato scartato per questo obiettivo (copertura reale insufficiente: ~8 musei
ben catalogati su 2.296 già in Dtrek).

## Perché Wikidata

`wdt:P195` (collezione) e `wdt:P276` (ubicazione) collegano un'opera d'arte al museo che la
conserva. Verificato dal vivo (2026-09-27): copertura molto più alta di ArCo per i grandi musei
(Galleria Borghese 240 opere, Musei Capitolini 302, Galleria nazionale d'arte moderna 153 — contro
1/1/0 su ArCo per gli stessi tre). Per musei piccoli/tematici (verificato su Museo civico di
Vignola, Museo civico di San Damiano d'Asti) il museo ha comunque un item Wikidata ma 0 opere
collegate — atteso: sono musei locali/tematici, non gallerie d'arte, non un errore del meccanismo.

`scripts/places/wikidata/enrich.ts` arricchisce già `dtrek_places.wikidata_id` per riga (nome +
prossimità) — non ancora eseguito sui musei (0/2.296 con `wikidata_id`, verificato su Supabase). È
il prerequisito naturale per collegare un museo Dtrek al suo QID senza una nuova ricerca per nome
ogni volta.

## Lezione pagata dal vivo: mai cercare un'entità per nome con SPARQL su Wikidata

Un primo tentativo (`FILTER(CONTAINS(LCASE(?itemLabel), ...))` su tutte le etichette di Wikidata) è
andato in timeout dopo 30s — scansione non indicizzata su centinaia di milioni di trple. La ricerca
per nome usa invece l'API REST dedicata `wbsearchentities` (`buildSearchUrl`), verificata reale e
sub-secondo. Il conteggio/campione opere (`buildWorksCountQuery`/`buildWorksSampleQuery`), una volta
noto il QID, resta SPARQL — lì è una query mirata e indicizzata, non uno scan.

## Uso

```bash
npx tsx scripts/places/wikidata/opere/probe.ts --museo "Galleria Borghese"    # cerca + conta in un comando
npx tsx scripts/places/wikidata/opere/probe.ts --find "Galleria Borghese"     # solo ricerca QID
npx tsx scripts/places/wikidata/opere/probe.ts --count Q841506                # solo conteggio
npx tsx scripts/places/wikidata/opere/probe.ts --sample Q841506 --limit 10    # campione con titolo/autore/anno/immagine
```

Nessuna riga di questo file è stata eseguita contro l'endpoint reale in questa sessione (stesso
blocco di rete di ArCo/ISTAT/PTPR verso `query.wikidata.org`/`www.wikidata.org`) — i test citati
sopra sono stati eseguiti dall'utente via Termux con uno script equivalente incollato in chat.

## Test

`__tests__/probe.test.ts` copre le funzioni pure (costruzione URL/query) — non richiede rete.
