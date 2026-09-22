# Piano: la ricerca definitiva (Sentieri + Borghi/Città + Siti)

Piano operativo per me stesso — ordine di esecuzione, file per file, con criterio di "fatto quando"
per ogni fase. Nasce da un audit completo del sistema di ricerca reale (non della documentazione
d'intenti): `lib/metaSearch/*`, `resolvePlace.ts`, `CreaGuidaMapSearch.tsx`, `RouteBuilder.tsx`,
`app/api/route-build/*`, `app/api/route-search/route.ts`, `generateRecommendations.ts`.

**Tesi**: Dtrek ha già 3-4 pezzi che nessun concorrente ha (resolver di toponimi a 4 livelli,
personalizzazione escursionista granulare, ricerca AI con verifica GPX, ranking deterministico
spiegabile) ma li rende inefficaci con frammentazione, un ingresso mancante, testo-match del 2010 e
i tre tipi di Meta trattati come mondi separati invece che come l'unico vero differenziatore
possibile (nessuno unisce sentiero+borgo+sito in una ricerca sola). Il piano risolve in quest'ordine:
debito che confonde → qualità base → ingresso → il differenziatore → scala.

## Vincoli permanenti (da ogni sessione precedente, non negoziabili)

- Mai un LLM decide quali Mete esistono — l'AI fa solo retrieval-augmentation/interpretazione sopra
  un motore deterministico, mai generazione di risultati.
- Mai metriche escursionistiche (distanza/D+/Trail Score/Safety) per Borgo/Città/Sito.
- Mai un valore fabbricato al posto di un dato assente — un campo mancante resta assente in UI.
- Non alterare `route-build`/`route-search`/`generateRecommendations` se non serve: sono
  infrastruttura di produzione con bug reali già risolti (vedi commenti in quei file).
- Ogni modifica al modello dati passa da una migration `ADD COLUMN IF NOT EXISTS`, mai un ALTER
  distruttivo.
- `tsc --noEmit`, eslint, vitest verdi ad ogni fase.

---

## Fase 0 — Debito che confonde (1-2 giorni)

Prima di aggiungere qualunque cosa, decidere il destino di ciò che è già mezzo morto — altrimenti
ogni fase successiva eredita ambiguità.

| # | Intervento | File | Nota |
|---|---|---|---|
| 0.1 | Decidere `RouteBuilder.tsx`/`GiuliaSearchPanel.tsx`: oggi irraggiungibili da qualunque pagina (verificato via grep, solo il tipo `ResultItem` è importato altrove). **Scelta**: portare i suoi parametri (raggio, tipo percorso multi-select, target distanza/dislivello, POI desiderati) dentro un foglio "Opzioni avanzate" di `SentieroGenerationPanel`/`CreaGuidaMapSearch`, poi eliminare `RouteBuilder.tsx` come schermata a sé. `GiuliaSearchPanel` si reinnesta nello stesso foglio avanzato (Livello "ultima risorsa" già previsto). | `components/upload/CreaGuidaMapSearch.tsx`, `components/upload/SentieroGenerationPanel.tsx`, elimina `components/upload/RouteBuilder.tsx` | Non toccare `lib/routeBuilder/runStepBuild.ts` (già riusato altrove) |
| 0.2 | Promuovere `/test-ricerca-mete` da voce "temporanea" in Profilo a punto di ingresso reale (rinominare rotta se necessario in Fase 2) — rimuovere la dicitura "pagina di test" | `app/test-ricerca-mete/page.tsx`, `app/profilo/page.tsx:119` | |
| 0.3 | Correggere il filtro categoria Sito: oggi legge `subtype` grezzo (spesso `'altro'`), mentre esiste già `inferSiteTypeFromName` usata solo in visualizzazione — applicarla anche lato query o denormalizzarla in colonna | `lib/metaSearch/searchSiti.ts`, eventuale migration per colonna calcolata | Bug auto-documentato nel codice stesso |

**Fatto quando**: nessun componente morto in `components/upload/`, `/test-ricerca-mete` è un ingresso vero, cercare "musei" in un Sito con subtype generico lo trova.

## Fase 1 — Qualità del testo libero (3-5 giorni)

| # | Intervento | File |
|---|---|---|
| 1.1 | `CREATE EXTENSION pg_trgm`, indice GIN trigram su `dtrek_places.name` | nuova migration `supabase/migrations/add_places_trgm_search.sql` |
| 1.2 | Sostituire `ILIKE '%q%'` con `similarity(name, q) > soglia` o `%` operator, tokenizzando query multi-parola (AND logico, ordine libero) | `lib/metaSearch/searchBorghi.ts`, `searchSiti.ts` |
| 1.3 | Aggiungere un fattore di ranking "match qualità testo" (score di similarity) invece di un filtro binario — un nome quasi-esatto deve salire in cima, non solo essere incluso | `lib/metaSearch/ranking.ts` |
| 1.4 | Test: refuso singolo carattere, ordine parole invertito, sottostringa parziale | `lib/metaSearch/__tests__/ranking.test.ts` |

**Fatto quando**: "Rmoa" trova Roma, "città vecchia orvieto" trova Orvieto anche se il nome in DB è "Orvieto, centro storico".

## Fase 2 — Ingresso unico reale (4-6 giorni)

Il tentativo precedente (`docs/piano-ricerca-mete.md`) è stato implementato e poi rimosso da un
ripristino — non ripartire dallo stesso design a tre scaffali non validato. Più semplice: un campo
di ricerca persistente, non un hub a pagina intera.

| # | Intervento | File |
|---|---|---|
| 2.1 | Campo di ricerca compatto in `DesktopNav`/`MobileTopBar` (Navbar), sempre visibile, non solo dentro `CreaGuidaMapSearch` | `components/Navbar.tsx` |
| 2.2 | Digitare interroga in parallelo: Mete salvate (client, su `/api/percorsi`, stesso pattern di `GlobalRouteSearch`) + `/api/meta-search` per borgo_citta/sito, debounce 350ms + AbortController | nuovo `components/GlobalSearchBar.tsx` |
| 2.3 | Risultati Sentiero-archivio (non salvati dall'utente) restano fuori dal campo — sono ricerca lunga (wizard), non istantanea, come già deciso nel piano precedente | — |
| 2.4 | Dedup: una Meta salvata che ricompare in archivio compare una sola volta — riusa `lib/metaSearch/mergeArchiveResults.ts` (già scritto e testato, mai wired) | `lib/metaSearch/mergeArchiveResults.ts` |

**Fatto quando**: da qualunque pagina dell'app si trova un borgo, un sito o una propria Meta salvata in un campo sempre visibile, senza sapere che `/test-ricerca-mete` esiste.

## Fase 3 — Personalizzazione estesa a Borghi/Siti (5-7 giorni)

Il modello (`lib/hikerProfile.ts`: concerns, preferenze ambientali, esperienza) oggi alimenta solo
Sentieri. Va esteso — ma senza inventare segnali che non esistono nei dati (principio §48.8).

| # | Intervento | File |
|---|---|---|
| 3.1 | Nuovo fattore `personalFitFactor` in ranking.ts: usa solo segnali già presenti in `dtrek_places.metadata` (es. accessibilità se importata da OSM `wheelchair=yes`, orari se presenti) incrociati con concerns dell'utente (`ginocchia` → penalizza siti con molte scale se il dato esiste; `bambini` → bonus se `metadata.familyFriendly` esiste) | `lib/metaSearch/ranking.ts`, `lib/metaSearch/searchBorghi.ts`, `searchSiti.ts` |
| 3.2 | Se il segnale non esiste per una riga, il fattore è omesso (mai 0 forzato) — stesso pattern già usato da `interestMatchFactor` | stesso file |
| 3.3 | Importer: verificare quali tag OSM/MiC portano già `wheelchair`, `opening_hours` popolati per iniziare a costruire segnale reale | `scripts/places/osm/fetch.ts`, `scripts/places/mic/fetch.ts` |

**Fatto quando**: un utente con `ginocchia` come concern vede, a parità di altri fattori, un sito senza scale segnalate prima di uno con molte — solo dove il dato esiste davvero.

## Fase 4 — Ricerca mista per corridoio (il differenziatore) (10-15 giorni)

Questo è l'unico intervento che rende Dtrek oggettivamente diverso, non solo "migliore" — nessun
concorrente unisce sentiero+borgo+sito in un solo risultato.

| # | Intervento | File |
|---|---|---|
| 4.1 | Nuova funzione `searchCorridor(origin, radiusKm, budgetTime)` in `lib/metaSearch/` — non un quarto `searchX`, ma un orchestratore che chiama `searchBorghi`+`searchSiti` con lo stesso bbox e incrocia con `trails` (cache OSM già esistente, `lib/trailsCache.ts`) per lo stesso raggio | nuovo `lib/metaSearch/searchCorridor.ts` |
| 4.2 | Raggruppamento risultato: non una lista piatta, ma "combinazioni" — un sentiero + i borghi/siti a distanza percorribile dal suo tracciato (riusa `lib/geoUtils.ts minDistToTrack`, già esistente per i POI dei Sentieri) | stesso file |
| 4.3 | UI: nuova vista "Itinerario misto" in `CreaGuidaMapSearch` (quarta pillola oltre Sentiero/Borgo-Città/Sito), stesso pattern mappa+foglio già in produzione | `components/upload/CreaGuidaMapSearch.tsx` |
| 4.4 | Card risultato mostra la combinazione (es. "Anello 8km + Calcata + Museo civico"), azione di salvataggio compone più Mete collegate (nessun nuovo modello dati: riusa `diaryId`/raggruppamento già esistente per collegare Mete tra loro) | `components/RouteResultCard.tsx` o nuovo componente dedicato |

**Fatto quando**: cercando un'area si ottiene almeno una combinazione sentiero+borgo/sito reale, non tre liste separate da unire a mano.

## Fase 5 — Retrieval semantico (5-8 giorni, dopo Fase 4)

Solo come secondo passo sopra il motore deterministico — mai sostituirlo (vincolo §21 del piano
originale: l'AI non decide cosa esiste).

| # | Intervento | File |
|---|---|---|
| 5.1 | Embedding batch delle descrizioni `dtrek_places.description` (job offline, non a ogni ricerca) | nuovo `scripts/places/embed.ts` |
| 5.2 | Colonna `embedding vector` (pgvector) su `dtrek_places`, indice ivfflat | nuova migration |
| 5.3 | Quando la query testuale non produce match trigram sufficienti (soglia), fallback a similarity coseno sulle descrizioni — mai come unico canale, solo come ripiego per query concettuali ("borgo con affreschi medievali vicino al mare") | `lib/metaSearch/searchBorghi.ts`, `searchSiti.ts` |

**Fatto quando**: una query concettuale senza corrispondenza di nome restituisce comunque risultati pertinenti, ordinati dopo (mai prima) quelli con match testuale diretto.

## Fase 6 — Scala e rifiniture (parallelo, a bassa priorità)

| # | Intervento | File |
|---|---|---|
| 6.1 | Sostituire "fetch 3000 righe + sort in JS" con paginazione server reale (cursor su `confidence,id`) prima che l'import nazionale (Lombardia in corso, poi altre regioni) lo rompa | `lib/metaSearch/searchBorghi.ts`, `searchSiti.ts` |
| 6.2 | Correggere alla fonte il bug SPARQL coordinate MiC (non solo quarantena) — testabile solo via GitHub Actions | `scripts/places/mic/fetch.ts` |
| 6.3 | Ricerca vocale nel campo globale — `lib/useSpeechDictation.ts` è già infrastruttura pronta, solo non collegata alla ricerca | `components/GlobalSearchBar.tsx` |
| 6.4 | "Ricerche salvate" come funzionalità utente vera (oggi `log-ricerche` è solo diagnostica) — salvare parametri di una ricerca corridoio/mista per ripeterla | `app/profilo/log-ricerche` → valutare se separare in una vista utente distinta |

---

## Ordine di esecuzione consigliato

Fase 0 → 1 → 2 → 3 → 4 → 5 → 6, ma **0, 1 e 2 sono indipendenti tra loro** (si possono
parallelizzare su sessioni diverse). Fase 4 è il cuore strategico: non iniziarla prima che 0-2 siano
chiuse, altrimenti eredita l'assenza di un ingresso e di testo-match decente. Fase 3 può slittare
dopo la 4 se il segnale di accessibilità nei dati importati risultasse troppo scarso per valerne la
pena subito (verificare in Fase 0 quanto è popolato `wheelchair`/`opening_hours` prima di
impegnarsi).

Verifica ad ogni fase: `tsc --noEmit`, eslint, vitest verdi; nessuna regressione sui test esistenti
di `lib/metaSearch/__tests__/`.
