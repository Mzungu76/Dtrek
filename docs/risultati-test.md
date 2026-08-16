# Risultati test — snapshot

Tabella dei risultati di un'esecuzione reale di `npm test` (vitest), non una previsione. Ogni
riga qui sotto corrisponde a un test effettivamente lanciato ed effettivamente andato a buon
fine — nessuno di questi test è solo scritto/predisposto senza essere stato eseguito.

Questo è uno **snapshot**, non un dashboard live: riflette lo stato del codice al commit
indicato sotto, non si aggiorna da solo. Il modo per avere lo stato aggiornato è sempre
`npm test` in locale, o la scheda **Actions** del repository (CI, ad ogni push/PR — vedi
`docs/piano-test.md` §"Come eseguire i test oggi").

- **Commit**: `fabd7f366c581f74822168ca812c11f8db22271c`
- **Data esecuzione**: 2026-08-16
- **Comando**: `npx vitest run --reporter=verbose`
- **Esito complessivo**: 6 file di test, **49/49 test passati**, 0 falliti
- **Durata totale**: 133.29s (quasi tutta spesa nei 3 test che riproducono fix GPS reali in
  tempo quasi-reale — vedi `docs/piano-test.md` §3 per il perché)

## `offRouteEngine.test.ts` (7 test)

| Esito | Test | Durata |
|---|---|---|
| ✅ | OffRouteEngine — adherence › dichiara OFF_ROUTE dopo il dwell di default con accuracy 5m, distanza crescente da 25m | 3ms |
| ✅ | OffRouteEngine — adherence › non dichiara mai OFF_ROUTE se la distanza rientra prima che il dwell trascorra | 1ms |
| ✅ | OffRouteEngine — adherence › resta UNCERTAIN con accuracy 35m e distanza 20m, anche su un solo campione | 0ms |
| ✅ | OffRouteEngine — adherence › non resta UNCERTAIN per sempre se la distanza è troppo grande per essere solo rumore GPS (sanityDistanceM) | 1ms |
| ✅ | OffRouteEngine — wrong_direction › segnala wrong_direction solo dopo il dwell, quando si è sul percorso ma con rotta opposta | 1ms |
| ✅ | OffRouteEngine — wrong_direction › non valuta wrong_direction sotto la soglia minima di velocità (escursionista fermo) | 1ms |
| ✅ | OffRouteEngine — wrong_direction › azzera subito wrong_direction quando si esce da on_route, senza aspettare un dwell | 1ms |

## `escapeEngine.test.ts` (8 test)

| Esito | Test | Durata |
|---|---|---|
| ✅ | computeEscapeOptions › include sempre "torna sul percorso" per prima, anche senza grafo né POI | 3ms |
| ✅ | computeEscapeOptions › genera le 4 tipologie nell'ordine dichiarato dallo spec quando grafo e POI sono disponibili | 1ms |
| ✅ | computeEscapeOptions › ogni opzione porta sempre un motivo non vuoto — invariante esplicito dello spec (§11) | 1ms |
| ✅ | computeEscapeOptions › omette le opzioni che dipendono dal grafo quando il grafo non è disponibile | 0ms |
| ✅ | computeEscapeOptions › omette l'opzione POI sicuro quando nessun POI ha un tipo rilevante (hut/bivouac/shelter) | 0ms |
| ✅ | computeEscapeOptions › la via alternativa preferisce la via di qualità migliore (path/track) rispetto a una strada, a parità di raggiungibilità | 1ms |
| ✅ | computeEscapeOptions › senza elevM sui nodi non menziona il dislivello e non lo usa per declassare la sicurezza (fallback, Fase 7) | 1ms |
| ✅ | computeEscapeOptions › con elevM sui nodi declassa la sicurezza di un'opzione ripida e lo dice nel motivo (Fase 7) | 1ms |

## `locationModeDecider.test.ts` (14 test)

| Esito | Test | Durata |
|---|---|---|
| ✅ | decideLocationMode — priorità dichiarata › sceglie trekking quando nessun segnale è urgente | 2ms |
| ✅ | decideLocationMode — priorità dichiarata › off_route vince su ogni altro segnale, inclusa batteria scarica | 0ms |
| ✅ | decideLocationMode — priorità dichiarata › wrong_direction vince su ogni altro segnale | 0ms |
| ✅ | decideLocationMode — priorità dichiarata › un bivio vicino (<100m) sceglie navigation | 0ms |
| ✅ | decideLocationMode — priorità dichiarata › un bivio lontano non scatta navigation da solo | 0ms |
| ✅ | decideLocationMode — priorità dichiarata › velocità sopra il passo da escursione (>2.5 m/s) sceglie navigation | 0ms |
| ✅ | decideLocationMode — priorità dichiarata › accuracy scarsa (>30m) sceglie navigation | 0ms |
| ✅ | decideLocationMode — priorità dichiarata › batteria sotto il 30% e non in carica sceglie battery_save, solo se nient'altro è urgente | 0ms |
| ✅ | decideLocationMode — priorità dichiarata › batteria scarica ma in carica non declassa a battery_save | 0ms |
| ✅ | decideLocationMode — priorità dichiarata › livello batteria sconosciuto (null, es. iOS Safari) non viene mai trattato come scarico | 0ms |
| ✅ | LocationModeDecider — isteresi temporale › passa a emergency immediatamente, senza aspettare il dwell | 0ms |
| ✅ | LocationModeDecider — isteresi temporale › non cambia modalità finché il nuovo segnale non persiste per MODE_CHANGE_DWELL_MS (8s) | 0ms |
| ✅ | LocationModeDecider — isteresi temporale › un blip che rientra prima del dwell non fa scattare il cambio modalità | 0ms |
| ✅ | LocationModeDecider — isteresi temporale › un cambio di segnale desiderato durante l'attesa riparte il conteggio del dwell | 0ms |
| ✅ | LocationModeDecider — isteresi temporale › non ripete lo stesso cambio due volte di seguito una volta applicato | 0ms |

## `weatherLookahead.test.ts` (7 test)

| Esito | Test | Durata |
|---|---|---|
| ✅ | projectWeatherAtEta › nessun avviso se non ci sono dati orari | 6ms |
| ✅ | projectWeatherAtEta › nessun avviso quando ETA e ora ricadono nello stesso bucket orario | 1ms |
| ✅ | projectWeatherAtEta › segnala pioggia in arrivo assente ora ma prevista all'orario di arrivo stimato | 47ms |
| ✅ | projectWeatherAtEta › segnala vento forte in arrivo assente ora ma previsto all'orario di arrivo stimato | 0ms |
| ✅ | projectWeatherAtEta › segnala entrambi quando pioggia e vento peggiorano insieme | 0ms |
| ✅ | projectWeatherAtEta › nessun avviso se la pioggia è già presente ora quanto all'arrivo (non un peggioramento) | 0ms |
| ✅ | projectWeatherAtEta › nessun avviso se le condizioni all'arrivo restano sotto le soglie | 0ms |

## `trailConfidence.test.ts` (7 test)

| Esito | Test | Durata |
|---|---|---|
| ✅ | computeTrailConfidence › restituisce uno stato neutro con motivo esplicito quando non c'è nessun segnale | 3ms |
| ✅ | computeTrailConfidence › un Trail Score alto senza altri segnali produce un punteggio alto | 1ms |
| ✅ | computeTrailConfidence › un Trail Score basso senza altri segnali produce un punteggio basso | 0ms |
| ✅ | computeTrailConfidence › una forte penalità meteo/clima abbassa il punteggio anche con un buon Trail Score | 0ms |
| ✅ | computeTrailConfidence › il segnale community non supera mai un piccolo correttivo, anche al peso massimo | 0ms |
| ✅ | computeTrailConfidence › un segnale community con confidenceWeight 0 non sposta il punteggio | 0ms |
| ✅ | computeTrailConfidence › il punteggio resta sempre entro 0 e 1 anche in condizioni estreme | 0ms |

## `realRouteSimulation.test.ts` (5 test) — dati reali dal database, account owner

L'unica suite che riproduce dati scaricati dal vero database Supabase (escursione "Faggeta del
Cimino", account owner) dentro `NavigationEngine`/`LocationModeDecider` veri, non fixture
sintetiche — vedi `docs/piano-test.md` §3 per i dettagli di ciascuno scenario. Le durate reali
(29-67s per i primi tre) sono il prezzo dichiarato di usare dati e vincoli fisici reali invece
di scenari istantanei: vedi il commento in testa al file di test per il perché.

| Esito | Test | Durata |
|---|---|---|
| ✅ | percorso pulito › non entra mai in off_route sui primi minuti di fix GPS realmente registrati sul campo | 29140ms |
| ✅ | deviazione e rientro › transita da navigating a off_route e torna indietro (scenario §3.2) | 66805ms |
| ✅ | GPS perso e ripristinato › emette gpsLost/gpsRecovered senza corrompere la distanza percorsa (scenario §3.3) | 36404ms |
| ✅ | vie di fuga › "torna sul percorso" è sempre proposta nel punto di massima deviazione (scenario §3.4) | 2ms |
| ✅ | batteria in calo › passa a battery_save una sola volta, senza sfarfallare, sull'intera escursione reale (scenario §3.5) | 1ms |

## Come riprodurre questo risultato

```bash
npm install
npx vitest run --reporter=verbose
```

Nessun setup aggiuntivo richiesto (nessuna variabile d'ambiente, nessun servizio esterno per la
maggior parte dei test — le uniche eccezioni note sono documentate in `docs/piano-test.md`, es.
lo scenario "vie di fuga" usa un grafo sintetico perché Overpass API non è raggiungibile da
alcuni ambienti sandbox).
