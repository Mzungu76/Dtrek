# Crea Guida — Modalità A/B di generazione itinerario: stato lavori

Riepilogo per riprendere il lavoro in una nuova chat. Branch `claude/gifted-mendel-q31uau`,
PR #942 (aperta, non ancora mergiata), repo `mzungu76/dtrek`.

**Attenzione**: il problema principale di questo filone di lavoro — percorsi non trovati fra
tappe reali, con ripiego su linea d'aria — **non è risolto**. È stato tentato un fix (vedi §3),
ma non è stato confermato risolutivo nell'app reale: va riverificato prima di considerarlo chiuso.

---

## 1. Contesto

Nella mappa di ricerca "Crea Guida" (`components/upload/CreaGuidaMapSearch.tsx`) esistono due
modalità di generazione itinerario:

- **Modalità A (Sentieri)**: generazione algoritmica di un anello nel viewport corrente
  (`SentieroGenerationPanel.tsx`, pipeline a step esistente — non toccata in questo filone).
- **Modalità B (personalizza itinerario)**: l'utente sceglie a mano le tappe da toccare sulla
  mappa (Borghi/Città, Siti), l'algoritmo collega le tappe in sequenza con un cammino a piedi
  reale. File principali:
  - `lib/routeBuilder/multiStopRoute.ts` — algoritmo puro (nessun I/O), calcola i tratti fra
    tappe consecutive.
  - `lib/routeBuilder/walkRouting.ts` — Dijkstra condiviso (con `app/api/borgo-itinerary/
    route.ts` e `lib/navigation/escapeEngine.ts`).
  - `app/api/route-build/multi-stop/route.ts` — endpoint che fetcha la rete pedonale OSM e
    chiama `buildMultiStopRoute`.
  - `components/upload/PersonalizeItineraryPanel.tsx` — pannello di controllo (modalità,
    distanza, risultato, salvataggio).

## 2. Cosa è stato fatto in questa sessione (già committato e pushato)

In ordine cronologico (vedi `git log` sul branch per i messaggi completi):

1. **"Scegli le tappe a mano" sempre visibile**, non più nascosto dietro un itinerario
   automatico riuscito.
2. **Fix navigazione mappa bloccata**: rimosso un backdrop a schermo intero nel pannello di
   personalizzazione; il pannello è ora un foglio richiudibile (peek/espanso).
3. **Budget di ricerca proporzionali** invece che fissi (mutuati da un contesto diverso,
   l'itinerario automatico "vicino a un Borgo"): padding di bbox e budget Dijkstra ora scalano
   con la distanza reale fra le tappe scelte.
4. **Mai più un fallimento completo**: `buildMultiStopRoute` non restituisce più `ok:false` —
   un tratto irraggiungibile ripiega su una linea d'aria SOLO per quella tratta (`real:false`),
   segnalato esplicitamente, il resto dell'itinerario resta reale.
5. **Dijkstra passa da min-scan O(n²) a coda a priorità (min-heap)** in `walkRouting.ts` —
   necessario per poter alzare i budget di ricerca senza costi proibitivi.
6. **`WALKABLE_HIGHWAY` allargato** a `tertiary`/`secondary` (`osmGraph.ts`) — le strade
   provinciali che collegano due paesi non erano nemmeno scaricate da Overpass. Bump di
   `WALK_NETWORK_QUERY_VERSION` per invalidare la cache di rete già salvata con il filtro vecchio.
7. **Ricerca verso un target di distanza** (non semplicemente il più breve) quando l'utente
   imposta una distanza — `seekCloserToTarget` in `multiStopRoute.ts`.
8. **Preferenza per tipo di via**: 3 livelli (`quiet` = strade bianche/track, `trail` = sentieri,
   `road` = strade urbane/provinciali), pesati per modalità:
   - `urbano`: solo `road`/`quiet` (sentieri esclusi del tutto, mai un compromesso di sicurezza).
   - `misto`: quiet → trail → road.
   - `naturalistico` (nuovo): trail → quiet → road.
9. **Campo dislivello rimosso** dagli input di Modalità B (non ha alcuna leva sul risultato con
   tappe fisse — resta visibile solo come stima in output).
10. **Ingresso autonomo** alla Modalità B dal FAB della mappa (chooser "Genera un sentiero qui" /
    "Personalizza un itinerario"), oltre a quello già esistente dal popup di un Borgo/Città.
    `PersonalizeState` non ha più un "anchor" fisso — ogni tappa è ugualmente rimovibile.
11. **Punti di interesse opzionali**: toggle per-tappa "Includi i punti di interesse di {Borgo}"
    (solo per tappe `metaType:'borgo_citta'`) — riusa la stessa scoperta dell'itinerario
    automatico (`lib/metaSearch/borgoItinerary.ts`: archivio + geosearch Wikipedia) per inserire
    i punti salienti del Borgo subito dopo di esso nella sequenza, solo su richiesta esplicita.
    La risposta di `/api/route-build/multi-stop` ora include `stops` (la sequenza COMPLETA
    effettivamente percorsa, tappe scelte + punti inseriti), che `legs[].fromStopIdx/toStopIdx`
    indicizza — il client deve leggere i nomi da lì dopo la generazione, non dalle sole tappe
    inviate.

## 3. Tentativo di fix per i collegamenti mancati (NON confermato risolutivo)

**Sintomo segnalato dall'utente** (screenshot, dopo il punto 8 sopra): coppie di tappe reali e
vicine (es. Civita Castellana ↔ Castel Sant'Elia, ~9km; Ronciglione ↔ Capranica, attraverso la
Riserva Naturale Lago di Vico) restano in ripiego a linea d'aria con motivo "nessun cammino
trovato nella rete pedonale disponibile" — nonostante l'utente sia certo che esista almeno un
collegamento su strada provinciale.

**Ipotesi di causa** (verificata solo su un caso sintetico, non sul caso reale): dal punto 8, la
ricerca usa un `edgeCost` (moltiplicatore di costo per tipo di via) — Dijkstra esplora quindi in
ordine di COSTO crescente, non di distanza reale. In una zona con una rete fitta del tipo
preferito ma non collegata alla tappa successiva (es. i sentieri/tracciati di una riserva
naturale, tutti a costo basso), la ricerca può esaurire `DIJKSTRA_MAX_NODES` restando dentro
quella zona, senza mai raggiungere il nodo — magari vicinissimo in metri reali — che porta
davvero fuori verso la strada di collegamento.

**Fix tentato** (`lib/routeBuilder/multiStopRoute.ts`, funzione `shortestLegPath`): se la
ricerca pesata per tipo di via fallisce, `shortestLegPath` ora ritenta con una seconda
ricerca a distanza reale pura (nessun peso, `DIJKSTRA_FALLBACK_MAX_NODES = 60000` invece di
25000) prima di ripiegare sulla linea d'aria. Verificato con un test sintetico che riproduce
l'esaurimento del budget di nodi (`lib/routeBuilder/__tests__/multiStopRoute.test.ts`, ultimo
test) — **confermato che il test fallisce senza il fix e passa con il fix**, ma:

- **Non è stato testato sul caso reale** (Civita Castellana/Castel Sant'Elia, Ronciglione/
  Capranica) — questo sandbox non ha accesso a un Supabase live né a Overpass in produzione per
  riprodurre la rete OSM reale di quelle zone.
- Il sintomo osservato aveva ANCHE un secondo caso sospetto nello screenshot (Ronciglione → una
  Chiesa appena inserita dal nuovo toggle "punti di interesse", entrambe nello stesso centro
  storico, distanza minima) che potrebbe avere una causa diversa e non coperta da questo fix —
  es. coordinate imprecise di un punto scoperto via Wikipedia, o un nodo isolato nella rete OSM
  scaricata per quell'area specifica (un problema di dati, non di algoritmo di ricerca).
- Non è escluso che, anche con il ripiego a distanza reale, aree molto estese e dense possano
  ancora esaurire pure il budget più ampio (60000 nodi) — non è stato provato un limite
  superiore realistico.

## 4. Prossimi passi consigliati (per la nuova chat)

1. **Riverificare in staging/produzione** le due coppie di tappe degli screenshot originali dopo
   il fix del punto 3, per confermare (o smentire) l'ipotesi.
2. Se il problema persiste, aggiungere **logging diagnostico** lato server
   (`app/api/route-build/multi-stop/route.ts` o dentro `multiStopRoute.ts`) per distinguere, per
   ogni tratta in ripiego: fallito lo snap alla rete (`too_far_from_network`) vs. nessun cammino
   nella ricerca pesata ma trovato nel ripiego vs. nessun cammino nemmeno nel ripiego (rete
   davvero disconnessa in quel bbox) — oggi il client vede solo il motivo finale, non se il
   ripiego a distanza reale è mai scattato o con che esito.
3. Verificare se il fetch della rete pedonale (`fetchWalkNetworkCached`,
   `WALK_NETWORK_TIMEOUT_MS`) per bbox grandi (tappe distanti, o con una riserva naturale densa
   in mezzo) va in timeout o restituisce una rete parziale in silenzio — un'altra causa
   plausibile di "nessun cammino trovato" che il fix del punto 3 non risolverebbe.
4. Valutare se le coordinate dei punti scoperti via Wikipedia (usati sia dall'itinerario
   automatico sia dal nuovo toggle "punti di interesse", punto 11 sopra) sono abbastanza precise
   da agganciarsi correttamente alla rete pedonale — un punto con coordinate leggermente sbagliate
   potrebbe agganciarsi a un nodo isolato o dal lato sbagliato di un ostacolo (fiume, dislivello).
5. Solo dopo aver risolto/confermato questo, riprendere gli altri task rimasti aperti da sessioni
   precedenti (se non già coperti): nessuno di rilievo aperto oltre a questo al momento della
   stesura.

## 5. Verifica eseguita in questa sessione

`npx tsc --noEmit` pulito, `npx next lint` senza nuovi errori, `npx vitest run
lib/routeBuilder/__tests__/` verde (51 test), `npm run build` compila con successo e si ferma al
limite noto del sandbox (assenza di env Supabase in questo ambiente, non una regressione — va
verificato con un ambiente con Supabase configurato). Nessun test manuale end-to-end nell'app
reale è stato possibile in questo sandbox.
