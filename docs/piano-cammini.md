# DTREK — Piano di implementazione: Cammini

Quarta tipologia di Meta, dopo Sentieri, Borghi/Città e Siti (`docs/piano-mete-multitipologia.md`).
Un Cammino è un itinerario a piedi di più giorni, composto da **tappe** reali in sequenza.

## 0. Decisioni prese

1. **Una sola Guida per Cammino, con tappe interne.** Niente Guide figlie per tappa (`parent_meta_id`
   resta riservato ai Siti promossi da un Borgo). Il piano delle tappe vive nella Guida.
2. **Cammino pilota: Via Francigena, tratto laziale.** Tutta la pipeline dati è validata su questo
   cammino prima di estenderla.
3. **Cammini ciclabili esclusi** dalla prima versione: l'ETL scarta ogni relazione con
   `route=bicycle`/`mtb`; si importa solo `route=hiking|foot`.

## 1. Cos'è diverso dai Borghi

| | Borgo/Città | Cammino |
|---|---|---|
| Tappa | gruppo di punti di visita, ordinato dall'algoritmo | segmento di traccia reale, con partenza, arrivo, km, D+ |
| Criterio | budget di tempo di visita (mezza giornata/giornata/più giorni) | tappe ufficiali; l'utente le raggruppa o le spezza per giornata |
| Metriche escursionistiche | solo se `trekking_misto` | sempre, calcolate **per tappa** |
| Fermate culturali | le tappe stesse | borghi e siti lungo la traccia |

Il concetto mezza giornata / giornata / più giornate resta: diventa il modo in cui l'utente
pianifica i propri giorni sopra le tappe ufficiali (due tappe corte in un giorno, una lunga in due).

## 2. Architettura

- `MetaType` guadagna `'cammino'` (`hikingMetrics: true`). Niente sistema parallelo.
- **Catalogo.** Riga `dtrek_places` con `meta_type='cammino'` e geometria `MultiLineString`
  semplificata. Nuova tabella `dtrek_cammino_tappe` (cammino, ordinale, nome, da/a, km, D+,
  difficoltà, geometria, fonte). Partenze/arrivi e siti lungo la traccia entrano in
  `dtrek_place_relations` (`near`/`part_of`).
- **Lato utente.** `planned_hikes.meta_type='cammino'` con `cammino_plan` JSONB: tappe incluse,
  raggruppamento per giorno, direzione, date, pernottamenti. Ogni tappa camminata è un'Attività con
  `linked_planned_id` + `tappa_index`.
- **Modulo Tappa condiviso** estratto da `lib/metaSearch/borgoItinerary.ts` (`kind: 'visita' | 'cammino'`).

## 3. Fasi

| # | Fase | Stato |
|---|---|---|
| 0 | Audit (sotto) | fatta |
| 1 | Fondamenta: tipo, config, migrazioni, profili | fatta |
| 2 | ETL dati: OSM relation → linea ordinata → tappe; Via Francigena Lazio | codice e test fatti; **dry-run su dati reali da eseguire** (workflow `import-places-cammini`) |
| 3 | Ricerca: `searchCammini`, chip, mappa con linee, filtri | da fare |
| 4 | Creazione Guida: personalizzazione tappe/giorni/direzione/date | da fare |
| 5 | Guida e Navigator: profilo, sezioni, widget tappe, AI per tappa su richiesta, offline | da fare |
| 6 | Attività, Diari, Reportage: avanzamento, aggregati, sezione per giorno, libro, pubblico, badge | da fare |
| 7 | Test e documentazione | da fare |

### Fase 2 — dettagli ETL (rischio maggiore)
- `scripts/places/osm/fetch.ts` oggi **non legge le relation** (riga ~208): serve un fetcher dedicato
  (`scripts/places/cammini/`), eseguito offline come gli altri import, mai live per-utente.
- Ricomposizione delle way in una linea ordinata; se esistono sotto-relation di tappa si usano,
  altrimenti si calcolano con il budget di giornata (`DAY_BUDGET_MINUTES`) sulla stima di
  percorrenza, tagliando in corrispondenza di borghi del catalogo.
- Attribuzione ODbL in `app/fonti-e-crediti`. Verificare licenza e disponibilità dell'Atlante dei
  Cammini d'Italia prima di usarlo come fonte.

## 4. Audit (Fase 0)

**Vincoli DB da estendere con `'cammino'`:** `planned_hikes.meta_type`, `activities.meta_type`,
`dtrek_places.meta_type` (migrazioni `add_meta_type_columns`, `add_activities_meta_type_columns`,
`add_places_catalog`; replicati in `supabase-schema.sql`).

**`Record<MetaType, …>` che il compilatore obbligherà a completare:** `META_TYPE_CONFIG`,
`GUIDE_PROFILES`, `REPORT_PROFILES`, i tre `GLYPH` (`CreaGuidaMapSearch`, `ManualRouteEditor`,
`MeteSearchMap`), i contatori in `GuidaHub`.

**Punti con `=== 'sentiero'` / `?? 'sentiero'` / `'borgo_citta'` (circa 110 occorrenze)**, da rivedere
uno per uno perché un Cammino deve comportarsi come Sentiero per le metriche e come Borgo per le tappe:
- API: `activity(ies)`, `diaries/[id]`, `guide`, `meta-search(+counts)`, `meta-itinerary`, `mete/qa`,
  `percorsi`, `places/[id]`, `planned`, `questionnaire`, `borgo-itinerary`.
- Guida: `GuidaHub`, `guida/elenco`, `mete/[id]`, `GuideReader`, `SiteGuideOverlay`, `BottomGallery`.
- Ricerca/creazione: `CreaGuidaMapSearch`, `MeteSearchMap`, `ManualRouteEditor`,
  `PersonalizeItineraryPanel`, `useCreateMetaFromSearch`, `metaToPlannedHike`.
- Dominio: `guideCardVariant`, `guideProfiles`, `metaCard`, `plannedStore`, `reportFacts`,
  `reportProfiles`, `reportSections`, `reportStore`, `visitQuestionnaire`, `activitySave`.
- Diari/pubblico: `aggregateDiaries`, `publicProfile`, `sharePublicDiary`, `ReportageCard`,
  `ReportReader`, `ResocontoHub`, `ActiveNavigationView`.

**Rischi:** tratti condivisi tra cammini e varianti; peso delle geometrie lunghe; cammini percorsi
solo in parte o in direzione opposta; coerenza dei dati sui pernottamenti.

## 5. Estensione a tutti i cammini d'Italia

La scoperta è automatica (come per i sentieri) ma con soglia di ammissione: `scripts/places/cammini/discover.ts` + `lib/cammini/discovery.ts`, workflow `discover-cammini.yml`. Passi successivi: (1) tarare le soglie sulla lista reale; (2) import per **id di relazione** al posto della configurazione per cammino; (3) controllo qualità con stato pronto/da rivedere/scartato; solo i pronti sono visibili agli utenti.

## 6. Registro dei cammini approvati (decisioni confermate)

`lib/cammini/registry.ts`: 34 voci scelte a mano dopo la scoperta nazionale. Decisioni:
- **Struttura**: `cammino` (si percorre intero) o `rete` (Via Alpina, GTA, Romea Strata, Sentiero Italia: l'utente sceglie un tratto, niente testi AI su tutte le tappe).
- **Via di Francesco**: un cammino solo con le varianti (Via di Roma, Via del Sud, Cammino di Francesco).
- **Via Francigena**: due cammini, divisi a Roma (San Pietro): Canterbury–Roma e Roma–Leuca (la relazione OSM "07 Lazio" li contiene entrambi).
- **Via Romea / Romea Strata**: sovrapposizione da verificare con la geometria prima di tenerli entrambi.
- **Alte Vie, Via Alpina, GTA, Sentiero Italia**: tappe chiuse nei **rifugi** (non nei paesi) — vedi `docs/rifugi-progettazione.md`.
- **Ondate**: 1 = tappe ufficiali già in OSM (Francigena, Sant'Antonio, San Benedetto, Matildica, Abati, Vandelli, Alpe Adria, San Jacopo); 2 = relazione sola, tappe calcolate; 3 = Alte Vie e reti.
- Il workflow di scoperta riporta per ogni voce *trovato / solo da rivedere / NON TROVATO* e cerca per nome quelle mancanti.

## 7. Import dei cammini del registro

`scripts/places/cammini/import-registry.ts` + workflow `import-cammini-registry.yml`. Ordine geometrico delle tappe, tappe ufficiali o calcolate (mista), divisione a Roma per la Francigena, filtro Italia, controllo di qualità pronto/da rivedere (solo i pronti vengono scritti). Stato: ondata 1 e 2 implementate e testate su fixture; **da provare su dati reali** (dry-run per cammino). Ondata 3 (rifugi, reti) da fare.

### 7.1 Importare tutti i cammini con un solo run

Workflow `Import Cammini del registro`, campo `registryId`: un id (`via-francigena`), il **nome** (`Via Francigena`: senza maiuscole/accenti, `-` e spazi equivalenti; se non c'è corrispondenza l'errore elenca gli id validi), oppure `tutti` / `ondata-1|2|3`.

- `tutti` esclude le voci con tappe in rifugio (Alte Vie, Via Alpina, GTA, Sentiero Italia) e, tra due voci sovrapposte (`overlapsWith`), tiene la prima del registro (Via Romea sì, Romea Strata no). Un job per ondata, uno alla volta (`max-parallel: 1`), nel gruppo `import-places`.
- Per cammino: un errore non ferma gli altri, i falliti si riprovano una volta in coda, pausa di 20 s tra un cammino e l'altro; il job si ferma per tempo a 330 min (i cammini non raggiunti risultano «rimandato»).
- `mode=write` scrive solo i cammini **PRONTI** (`minStatus=pronto`); i `DA_RIVEDERE` non si scrivono e sono elencati con i motivi. Re-import idempotente (upsert su `(source, source_id)` e `(cammino_id, ordinal)`; dislivelli e POI già calcolati restano).
- Il **riepilogo** (Summary del run) ha una riga per cammino: scritto / pronto (dry-run) / da rivedere / saltato / errore / rimandato, con km, tappe, durata ed errore. Exit ≠ 0 solo per errori o «rimandato», non per i «da rivedere».
- Download Overpass a stadi, leggero: radici per nome (`out body`) → sotto-relazioni per id a blocchi → filtro Italia (bbox, solo id) → geometria delle way a blocchi, con `[timeout:300]`, endpoint a rotazione e attese crescenti con jitter. Ogni blocco finisce nella **cache** `.cache/cammini/<id>.json`, salvata anche tra un run e l'altro con `actions/cache`.

**Se un cammino cade**: rilancia lo stesso workflow (stesso `registryId`, o solo l'id del cammino): riparte dalla cache, non da zero. Se Overpass è giù per ore, riprova più tardi; per un cammino enorme usa direttamente il suo id. I cammini «da rivedere» non sono errori: leggi i motivi nel riepilogo.

## 8. Fase 3 — ricerca e scheda (in app)

- `lib/metaSearch/searchCammini.ts` (+ `meta-search` accetta `metaType: 'cammino'`): solo cammini con qualità **pronto**; con un'origine conta il **tracciato** entro il raggio, non il pin.
- `GET /api/cammini/[id]`: scheda con le tappe (da → a, km, origine ufficiale/calcolata, dislivello solo se calcolato).
- Mappa di ricerca (`CreaGuidaMapSearch`): filtro **Cammini**, tracciato come linea, tappa evidenziata, scheda `CamminoDetailCard`. "Crea guida" è volutamente disattivato: arriva con la Fase 4 (scelta tappe/date → `cammino_plan`).

## 9. Fase 4 — pianificazione e creazione della guida

`lib/cammini/plan.ts` (`CamminoPlan` in `planned_hikes.cammino_plan`): tappe incluse (da…a), verso (come nel catalogo / al contrario), giornate (una tappa al giorno, oppure accorpate fino a N km: le tappe non si spezzano), date consecutive dalla partenza. La Meta (`metaType: 'cammino'`) porta la polilinea della selezione, i km sommati e **nessuna quota inventata** (D+ per tappa: Fase 5, dal DTM). UI: `CamminoPlanner` dentro il foglio del cammino, con anteprima della selezione sulla mappa. La guida non chiede più "andata o andata e ritorno" per un cammino.

## 10. Fase 5 — la guida del cammino

- **Dati**: la guida legge `planned_hikes.cammino_plan` (il server la include nel prompt: `lib/cammini/guideBlocks.ts`, blocchi `CAMMINO`/`TAPPA n (giornata g)`); niente D+/quota a zero.
- **Barra cifre**: `GuideCamminoStatsStrip` (distanza, tappe, giorni, ore di cammino a 4 km/h).
- **Tappa per tappa**: `CamminoTappeWidget` nella sezione `luoghi` — giornate con le tappe dentro, tempi, dislivello per tappa.
- **Dislivello**: `GET /api/cammini/[id]/elevation?ordinal=N` lo calcola dal DTM al primo bisogno e lo salva in `dtrek_cammino_tappe` (una volta per tutti). Valore indicativo: usa i vertici della tappa semplificata.
- Da fare: testo AI per singola tappa su richiesta, Navigator per tappa/offline.

### Fase 5b — tappe espandibili e testo su richiesta
- Un'unica sezione AI "Tappa per tappa" su 16 tappe superava il budget di token (si troncava a metà, errore "Risposta non riconosciuta"): per i cammini `luoghi`, `dati_sicurezza` e `comfort` non si generano più in blocco (`CAMMINO_PER_TAPPA_SECTIONS`).
- Ogni tappa è espandibile (`CamminoTappeWidget`): profilo altimetrico (DTM, passo 100 m, lisciato), salita/discesa/quota max, CTS stimato (solo dal profilo, senza POI lungo la strada) e racconto di Giulia su richiesta (`POST /api/cammini/tappa-text`, salvato in `cammino_plan.tappe[].text`).
- Da valutare: sezioni per tappa anche per natura / sapori / consigli; CTS con i POI lungo la tappa.

### Fase 5c — la guida durante il cammino
Struttura: la guida generale resta snella (Prima di partire, Il cammino con la **mappa d'insieme**, Verificato, Consigli); tutto il resto vive **per tappa** (`CamminoTappeWidget`), nell'ordine in cui serve a chi cammina.
- Giornate con la tappa di **oggi** aperta da sola (se c'è una data di partenza) e badge "Oggi".
- Tappa aperta: racconto di Giulia + 4 schede — **Percorso** (mappa della tappa con i luoghi, salita/discesa/quota max, **CTS** con profilo e luoghi OSM, grafico altimetrico), **Luoghi** (POI OpenStreetMap lungo la tappa, in cache nel catalogo: `dtrek_cammino_tappe.pois`), **Natura** e **Sapori** (testi su richiesta; la natura usa i dati reali flora/GBIF della tappa).
- `POST /api/cammini/tappa-text` con `kind: racconto|natura|sapori`; testi in `cammino_plan.tappe[].text|natura|sapori`.
- `CAMMINO_PER_TAPPA_SECTIONS` ora comprende anche natura e sapori.
- Da fare: CTS personalizzato con lo storico dell'utente, Navigator per tappa/offline, sicurezza per tappa.

## 11. Riorganizzazione della guida del cammino (Fase 5d–7)

Problema: la guida a elenco di tappe espandibili è lunga e poco usabile durante il cammino. Soluzione: **la guida diventa un percorso a schede orizzontali**, agganciate al tracciato generale.

- **Scheda 0 — Il cammino**: mappa d'insieme, prima di partire, il cammino, consigli, verificato.
- **Schede 1…N — una per tappa** (scorri a destra/sinistra, scroll-snap). Ogni scheda: intestazione (da → a, km, ore, D+, CTS), mappa della tappa con i luoghi, profilo, **luoghi in ordine di cammino** (con distanza progressiva), racconto/natura/sapori, azione "Segna come fatta" / "Registra la tappa".
- **Binario del cammino** fisso in alto: profilo altimetrico d'insieme con un punto per tappa, tappa corrente evidenziata, tocco per saltare; lo swipe delle schede lo sincronizza. Fatte = piene, oggi = anello, mancanti = vuote.
- **Avanzamento** in `cammino_plan.progress[ordinal]`: `todo|doing|done|skipped`, data, nota, voto, `activityId` se registrata.
- **Attività**: `activities.tappa_index` + `linked_planned_id` (già nel DB). La tappa si chiude a mano o registrando col Navigator.
- **Reportage del cammino**: uno solo, vivo. Capitolo introduttivo + un capitolo per ogni tappa conclusa, che si aggiunge man mano (Giulia scrive solo il capitolo nuovo, usando nota, foto, voto e dati reali della tappa); epilogo quando il cammino è finito. Nel Reportage hub come gli altri.
- **Durante il cammino**: scheda di oggi aperta all'avvio, "prossimi luoghi" davanti a te, dati scaricabili per l'offline.

Ordine: 5d schede + binario + stato avanzamento → 6 attività e diario per tappa → 6b reportage incrementale → 7 offline e Navigator per tappa.

### Fase 5d — schede orizzontali, binario, avanzamento (fatto)
- `CamminoTappeWidget`: avanzamento (tappe/km percorsi), **binario** con un punto per tappa (piena = percorsa, anello = oggi/corrente) agganciato al **carosello a schede** (scroll-snap, `data-hscroll`); parte dalla tappa di oggi o dalla prima non percorsa.
- Una tappa è **percorsa** solo se esiste un'attività collegata (`activities.linked_planned_id` + `tappa_index`): registrata col Navigator (`/guida/[id]/naviga?tappa=<ordinale>`, tracciato di catalogo nel verso del piano, `ActiveNavigationView.tappaOrdinal`) o importata da file (`/upload?planned=<id>&tappa=<n>`; scelta della tappa se si collega a mano). Mai dichiarata a mano.
- Da fare: reportage unico del cammino (capitolo per tappa percorsa), offline/Navigator per tappa con dati scaricati, binario fisso (sticky) sotto l'intestazione della guida.

### Fase 6a — reportage unico del cammino (fatto)
- Un solo reportage per cammino, **dentro il piano** (`cammino_plan.report`: introduzione, capitoli per tappa, conclusione): cresce una tappa percorsa alla volta e si sincronizza come il resto del piano. Nessuna nuova tabella; non interferisce con i reportage delle singole attività (restano per foto e dettagli di ogni tappa).
- `POST /api/cammini/reportage` — `kind: tappa` (capitolo dai dati reali dell'attività della tappa: distanza, tempo, dislivello, meteo, CTS, FC se consentita, luoghi, note del camminatore e stile di scrittura; al primo capitolo scrive anche l'introduzione) e `kind: epilogue` (solo a tutte le tappe scritte). `PUT` per correggere un testo a mano.
- Pagina `/resoconto/cammino/[id]`: cifre totali, mappa (tappe percorse colorate, le altre in grigio), capitoli, tappe ancora da percorrere, conclusione. Dopo aver registrato o importato una tappa si arriva qui. Elenco Reportage: riga per ogni cammino con capitoli. Guida: "Leggi/Scrivi il capitolo nel reportage" su ogni tappa percorsa.
- Da fare: foto del cammino nel reportage unico, PDF/condivisione, offline e Navigator per tappa con dati scaricati.

### Fase 5e — guida B (Oggi + diario di marcia) e reportage contenitore
Scelta dopo i mockup (concept B), con queste regole:
- **Un solo reportage per cammino**, contenitore dei reportage delle tappe: nell'elenco Reportage c'è una voce per cammino (tappe percorse, km, capitoli); le attività delle tappe non sono voci a sé (nemmeno nella galleria) e si aprono solo dal reportage del cammino ("Apri il reportage della tappa"); dalla tappa un banner riporta al contenitore.
- **Guida**: sotto le cifre, `CamminoOggiCard` (tappa di oggi o prossima: CTS, luoghi sulla strada con km progressivi, **Naviga** / **Importa**); nella sezione "Tappa per tappa", `CamminoDiario` (diario di marcia con tutte le tappe, percorse e da percorrere, CTS dove noto).
- **Dettaglio tappa** `/guida/[id]/tappa/[ordinal]` — uguale per tappe percorse e non, per sapere cosa si affronta: titolo, dati, **CTS in evidenza** (calcolato nel browser, salvato nel piano via `PUT /api/cammini/tappa-cts`), capitolo del reportage, mappa, profilo, luoghi in ordine di cammino (`tappaPois.ts`), racconto/natura/sapori su richiesta; precedente/successiva.
- Etichette allineate all'app: "Naviga", "Importa" (non GPX: l'import accetta più formati). Per i cammini non c'è più il pulsante "Naviga" generale in basso: si naviga una tappa alla volta.

### Fase 5f — allineamento allo stile dell'app e reportage in galleria
- Mappe dei cammini = `RouteMapSection` dell'app (schermo intero, lucchetto, frecce, inquadra, 3D, luoghi con le icone `POI_ICON` e i colori `POI_META`); rimosso il Leaflet dedicato.
- Badge CTS = `MiniScoreRing`/`tsColor` (come nelle gallerie); stesso anello in tappa di oggi, diario, dettaglio e reportage.
- Il reportage contenitore è una voce della **galleria Reportage** (`/resoconto`): sintetizzata dalle attività delle tappe (cifre sommate, tracciato unito, data dell'ultima), apre `/resoconto/cammino/[id]`; la pagina spiega la struttura (introduzione, schede-tappa con CTS e link al reportage della tappa, conclusione).

### Fase 5g — reportage coerente col resto e dentro il padre
- Nessuna pagina intermedia: scegliendo il cammino nella galleria Reportage si apre direttamente il suo reportage.
- Pagina del reportage del cammino = stesso impianto degli altri reportage (`ReportHero`, `ReportStatsStrip`, `SectionCard`: stessi colori e caratteri); introduzione, capitoli per tappa (con badge Trail Score + Sicurezza), conclusione.
- Il reportage di una tappa si apre **sotto il padre** (`/resoconto/cammino/[id]/tappa/[activityId]`): galleria con le sole tappe di quel cammino, ogni uscita riporta al reportage del cammino, mai all'elenco generale.
- **Sicurezza nel CTS di tappa**: `computeSafetyCore` (fauna GBIF, cani da guardia, scala SAC, quota, tempo) + Trail Score v2 (`computeTrailScoreV2`); badge `TrailScoreGaugeBadge` (anello Trail Score + anello Sicurezza), salvati in `cammino_plan.tappe[].cts`.

## 5h. Il cammino nei Diari e nel sito pubblico

- **Una sola voce per cammino.** Le attività delle tappe non sono mai voci a sé nei Diari, nel libro, nelle Raccolte e nel sito
  pubblico: il cammino è una voce (la sua prima tappa percorsa la "regge", ma con i numeri, il tracciato e le foto di tutte le
  tappe) e il testo è il reportage del cammino, con le tappe come sezioni `## Tappa N · da → a` (`lib/cammini/diaryEntries.ts`).
- **Dove vale.** Sommario del Diario (`/api/diaries/[id]`, riga che apre il reportage del cammino), libro del Diario
  (`/api/diaries/[id]/entries`), Diario pubblico e Raccolte (`lib/sharePublicDiary.ts`), sito dell'utente (`lib/publicProfile.ts`).
- **Rotella** nel reportage del cammino: titolo e Diario passano dalla Meta (`planned_hikes.diary_id`), come per ogni reportage.
- **Link pubblico del reportage del cammino**: `POST /api/cammini/reportage/share` salva il token in `cammino_plan.report.shareToken`;
  `/leggi/p/<token>` lo legge (`lib/sharePublicReport.ts`). Si crea e si ritira dalla pagina del reportage.
- **Conteggi**: le tappe contano un solo reportage nelle card dei Diari (`lib/diari/aggregateDiaries.ts`) e i loro km si sommano.
- **Libro**: la voce del cammino usa foto e traccia di tutte le tappe; il testo scritto nel reportage di ogni tappa va sotto il suo capitolo e le foto di ogni tappa sotto il capitolo della tappa.

## 12. Offline e Navigator per tappa

- **Dati locali per tappa** (`lib/navigation/navKey.ts`): le tappe di un cammino condividono l'id del piano, quindi pacchetto offline, grafo sentieri, sessione, traccia registrata e parcheggio usano `<id>#t<ordinale>`. Attività collegata, note di campo e sessione sul server restano sull'id del piano.
- **Copia locale della tappa** (`lib/cammini/offlineTappa.ts`): tracciato nel verso del piano, nome, lunghezza e luoghi, con il verso nella chiave. Il Navigator parte da qui e, se manca, dal catalogo (poi la salva). I luoghi arrivano al Navigator via `cachedPois`.
- **Scarico**: `CamminoOfflineButton` (una tappa, nella card Oggi e nel dettaglio) e `CamminoOfflineBulk` (prossime 3 o tutte le restanti, dal diario di marcia; `lib/cammini/offlineBulk.ts`).
- **Contesto nel Navigator** (`lib/cammini/navContext.ts`): "Tappa N di M · giorno g di G" in alto; salvata una tappa, se ce n'è una dopo, `CamminoNextTappaDialog` propone di navigarla (con lo stato della mappa offline) o di andare al reportage. Cambiando `?tappa=` la pagina ricarica da zero.
- **"Davanti a te"** (`lib/cammini/ahead.ts`, `CamminoAheadCard`): i prossimi luoghi della tappa a distanza di strada dalla posizione GPS (proiezione sulla traccia, non in linea d'aria; scartati quelli a più di 400 m dal sentiero), con ora di arrivo proporzionale al tempo residuo e scarto dal piano (tempo in cammino + residuo contro il tempo di piano; mostrato oltre 5 min).
- Da fare: racconti AI e CTS nel pacchetto, aggiornamento della copia locale se il catalogo cambia.

## 13. Fase E — acqua, alloggi e servizi

- **Dati** (`lib/cammini/services.ts`, `servicesServer.ts`): categorie `water | food | shop | lodging | transport | pharmacy` da tag OSM (Overpass), entro 600 m dalla traccia. Ogni servizio dichiara l'**affidabilità** (`alta` solo con `check_date` recente, `media` con nome e almeno due dettagli, `bassa` altrimenti; l'acqua è sempre `bassa`): OSM dice dove un servizio è mappato, non se è attivo oggi. Una fontana senza `drinking_water=yes` non conta come acqua.
- **Cache**: `GET /api/cammini/[id]/services?ordinal=N` → colonne `dtrek_cammino_tappe.services/services_at` (migrazione `add_cammino_tappe_services.sql`, **da applicare**); ricalcolo dopo 90 giorni, un errore di rete non si salva come "nessun servizio" e si serve il dato vecchio se c'è.
- **Guida**: `CamminoServicesStrip` nel dettaglio tappa — conteggi per categoria, avvisi "nessuna acqua mappata" / "prima acqua a X km" / "nessun servizio per N km" (`lib/cammini/serviceGaps.ts`).
- **Navigator**: `CamminoAheadCard` mostra la prossima acqua, cibo, negozio, alloggio e trasporto con la distanza di strada, e avvisa "Dopo questa acqua niente per N km: riempi qui". I servizi entrano nella copia locale della tappa (`OfflineTappa.services`, scaricati anche dal pulsante e dallo scarico multiplo); aprendo una tappa senza servizi si leggono in sottofondo.
- **Vie d'uscita** (`lib/cammini/escapeServices.ts`): si aggiungono a quelle del Navigator "Accorcia la tappa" (primo alloggio/trasporto davanti, entro 800 m dal sentiero, con i km risparmiati), "Dormi a…", "Esci con il bus/treno", "Rifornisciti". Distanze in linea d'aria o lungo la traccia, sempre dichiarate; orari non noti.
- **Servizi sulla mappa della guida**: nel dettaglio tappa la scheda "Acqua e servizi sulla mappa" sta sopra la mappa e le sue categorie sono i **filtri** (chip con l'icona del servizio, accesi di default). I servizi sono marcatori con **icone dedicate** (`components/guida/serviceIcons.tsx`: riquadro arrotondato per distinguerli dai luoghi, tondi; icona per tipo — goccia, coltello/forchetta, tazza, cestino, croissant, letto, tenda, bus, treno, pillola; bordo tratteggiato = non verificato), in uno strato separato dai POI (`MapView.extraMarkers`). Il tocco apre la scheda (nome, tipo, distanza dal sentiero, orari, telefono, sito, affidabilità; testi di OSM escapati). Non ancora nella mappa 3D né nel Navigator.
- **Servizi precaricati**: come i luoghi, vivono in `dtrek_cammino_tappe.services` e la guida li legge da lì. Per non far aspettare la prima lettura (fino a 25 s) c'è il workflow manuale `prefetch-cammini-services.yml` (`scripts/places/cammini/prefetch-services.ts`): legge da OpenStreetMap tutte le tappe, una alla volta con pausa, e salva; dry-run di default, salta le tappe lette da meno di 90 giorni, `--refresh` per rileggere. Le tappe nuove continuano a leggersi alla prima apertura.
- **Mappa**: `MapView` ricostruisce la mappa quando cambia l'identità di `trackPoints` e i livelli di marcatori (POI, servizi, wiki, flora, ecc.) ora si rifanno anche a ogni ricostruzione (`mapGen`); in `CamminoTappaDetail` `trackPoints` è memoizzato. Prima, accendere/spegnere un filtro dei servizi faceva sparire tutte le icone.
- Da fare: fonte dedicata per gli alloggi (cammini con ostelli del pellegrino, rifugi: `docs/rifugi-progettazione.md`), segnalazioni della community per confermare/segnalare, percorsi a piedi reali verso i servizi (oggi linea d'aria), orari dei mezzi.

## Import da tracce GPX/KML degli enti

Per i cammini di cui l'ente fornisce le tracce (non presenti o incomplete su OSM) c'è una pipeline separata da quella OSM:

- `scripts/places/cammini/tracks-manifest.ts`: per ogni cammino, quali file/tracce sono le tappe, nomi dei capi, `structure` (`cammino` = sequenza, `rete` = varianti/percorsi alternativi). Origine `source = 'gpx'`, `source_id = cammino/<id>`.
- `scripts/places/cammini/import-tracks.ts --src <zip scompattati> [--only <id>] --sql supabase/data/cammini-gpx`: legge GPX/KML, orienta le tappe lungo la sequenza (alcune tracce sono registrate al contrario), controlla la continuità (tappe a più di 2 km → «da rivedere»), semplifica a 15 m e scrive uno `.sql` per cammino.
- `supabase/data/cammini-gpx/*.sql`: idempotenti e autosufficienti (decodifica delle polilinee con una funzione temporanea). Eseguirli, poi `zz-anchors.sql` (aggancia i capi tappa ai borghi entro 1,5 km, riempie i nomi mancanti, crea le relazioni `near`). Quote e POI/servizi si calcolano al primo bisogno, come per i cammini OSM.
- Le tappe «da rivedere» (es. Cammino dei Francescani, 11 tratti senza ordine) non compaiono nella ricerca finché `metadata.quality.status` non viene portato a `pronto`.
