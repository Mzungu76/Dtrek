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
