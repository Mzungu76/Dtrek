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
