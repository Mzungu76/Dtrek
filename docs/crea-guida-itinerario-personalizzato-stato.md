# Crea Guida — Modalità A/B di generazione itinerario: stato lavori

Riepilogo per riprendere il lavoro in una nuova chat. Branch
`claude/missing-connections-fallback-xtjikb`, repo `mzungu76/dtrek`.

**Attenzione**: il problema principale di questo filone di lavoro — percorsi non trovati fra
tappe reali, con ripiego su linea d'aria — ha una **causa reale identificata e un fix applicato in
questa sessione** (§3ter), verificata sui dati OSM reali del caso segnalato dall'utente, ma **il
fix stesso non è ancora stato testato nell'app reale** (serve un nuovo fetch Overpass, mai
possibile da questo sandbox — vedi §3ter). Va riverificato con uno screenshot nuovo prima di
considerarlo chiuso.

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

## 3bis. Logging diagnostico aggiunto in questa sessione (punto 2 e parte del punto 3 di §4 sotto)

**`lib/routeBuilder/multiStopRoute.ts`**: `shortestLegPath` ora restituisce, insieme al cammino
trovato, una `LegDiagnostic` (esportata) che distingue con precisione le cause di un ripiego a
linea d'aria (`fallbackReason:'no_path'`):
- `pathSource`: per una tratta reale, se il cammino usato viene dalla ricerca pesata per tipo di
  via (`'preferred'`) o dal ripiego a distanza reale del punto 3 sopra (`'distance_fallback'`) —
  permette di verificare in produzione se quel ripiego scatta davvero, o resta teorico.
- `preferred`/`fallback`: per ciascun tentativo, `nodesVisited` e `budgetExhausted` (vero quando
  la ricerca si è fermata solo perché ha raggiunto `DIJKSTRA_MAX_NODES`/
  `DIJKSTRA_FALLBACK_MAX_NODES`, non perché ha esplorato l'intera rete raggiungibile senza
  trovare il bersaglio) — distingue "una connessione potrebbe comunque esistere, il budget è
  finito prima" da "nessun cammino esiste in quella rete/bbox" (rete davvero disconnessa o dato
  mancante, non un limite di ricerca). Assente (`diagnostic` intero assente) quando il ripiego è
  per `fallbackReason:'too_far_from_network'` (Dijkstra non è nemmeno partito, lo snap alla rete è
  fallito prima).

`MultiStopLeg.diagnostic` porta questo dato fino alla risposta dell'endpoint — MAI usato o
mostrato lato client (`PersonalizeItineraryPanel.tsx` continua a leggere solo `real` e
`fallbackReason`, invariati), solo per il logging server-side.

**`app/api/route-build/multi-stop/route.ts`**: per ogni tratta con `real:false`, un
`console.warn` riporta nome tappe, `fallbackReason`, distanza in linea d'aria, modalità, numero
di nodi della rete scaricata e il dettaglio della diagnostica sopra — leggibile nei log del
deployment quando il sintomo si ripresenta, senza dover riprodurre il problema in un ambiente di
sviluppo.

**`lib/routeBuilder/osmGraph.ts`** (`fetchWalkNetwork`, copre parte del punto 3 di §4): Overpass
può rispondere HTTP 200 con un campo `remark` quando ha interrotto la query prima di finirla (in
genere per il proprio timeout interno) — una rete PARZIALE servita come se fosse completa, mai
stata un errore per `fetchOverpass` (nessuna eccezione, nessun retry). Ora un `console.warn`
segnala bbox e `remark` quando questo accade. Non risolve il problema (la rete incompleta resta
quella su cui si cerca), solo lo rende visibile nei log invece che silenzioso — se un ripiego a
linea d'aria coincide nei log con questo warning per lo stesso bbox, è la causa più probabile, non
un limite dell'algoritmo di ricerca in `multiStopRoute.ts`.

Copre punto 2 di §4 per intero. Copre SOLO la parte "silenziosa" del punto 3 (rete parziale non
segnalata) — non copre ancora un timeout che fa fallire l'intera richiesta con un errore esplicito
(già gestito, l'utente vede "Rete pedonale non disponibile"), né misura quanto spesso accade in
produzione (serve osservare i log dopo il deploy). Punto 1 e punto 4 restano non affrontati in
questa sessione (nessun accesso a staging/produzione o a Wikipedia dal sandbox).

## 3ter. Causa reale trovata e fix applicato: piazze/vicoli pedonali mai scaricati (stessa sessione)

L'utente ha fornito accesso diretto al progetto Supabase di produzione (`sdxlcpxgbkagbxhukehd`,
`supabase-teal-cave`) e uno screenshot dell'app reale — entrambi hanno permesso, per la prima
volta in questo filone, una verifica sui dati veri invece che su una rete sintetica.

**Verifica su dati reali (Ronciglione ↔ Capranica)**: `walk_network_cache` conteneva già una rete
fresca (v2, con le strade provinciali del fix precedente) per quella zona. Ho ricostruito il grafo
in Postgres (tabelle di scratch + estensione `pgRouting`, poi rimosse/pulite a fine verifica) e
rieseguito l'identica logica pesata di `shortestLegPath` sui dati reali: il nodo più vicino a
Ronciglione e quello più vicino a Capranica sono nello stesso componente connesso (25 861 nodi su
27 165), il costo del cammino pesato "misto" è 23 576 (budget disponibile 50 000) e servono ~18 706
nodi visitati per raggiungerlo — sotto il tetto di 25 000 (`DIJKSTRA_MAX_NODES`). **Per questa
coppia, con la rete e il codice già in produzione, la ricerca pesata dovrebbe riuscire da sola**,
senza nemmeno il ripiego del punto 3 — l'ipotesi originale di quel punto (budget di nodi esaurito
in un'area densa) non è la causa per questa coppia specifica.

**Lo screenshot ha rivelato la causa vera**: le due tratte che falliscono davvero non sono
Ronciglione→Capranica, ma Ronciglione→**Chiesa dei Santi Pietro e Caterina** (un punto di interesse
inserito automaticamente dal toggle "punti di interesse", punto 11 di §2) e Chiesa→Capranica. La
prima tratta collega due punti nello STESSO centro storico, a distanza minima — eppure fallisce con
"nessun cammino trovato" (non "troppo lontano dalla rete": l'aggancio riesce). Con una distanza così
piccola il budget di ricerca (minimo 8km) è enormemente abbondante: non può essere un esaurimento
di budget. L'unica spiegazione coerente con ENTRAMBE le tratte è che il nodo della Chiesa sia in una
porzione di rete isolata dal resto — non perché il collegamento reale non esista, ma perché non è
mai stato scaricato.

**Causa identificata**: `WALKABLE_HIGHWAY` (`lib/routeBuilder/osmGraph.ts`) non includeva i tag
OSM `pedestrian` (piazze pedonali) né `living_street` (vicoli/zone a traffico limitato) — i tag più
comuni per il tessuto di un centro storico italiano, mai `residential`/`unclassified`. Una Chiesa
affacciata su una piazza pedonale restava con l'aggancio riuscito (un nodo vicino esiste) ma isolata
da tutto il resto, perché la via che la collegava al resto del paese non era proprio nel grafo
scaricato — stesso identico sintomo, in scala più piccola, del buco tertiary/secondary già risolto
nella sessione precedente. Causa secondaria correlata: il filtro `access!~private|no` escludeva in
blocco anche le vie di una ZTL taggate `access=private` (comune nei centri storici italiani), pur
essendo per convenzione OSM un tag che riguarda in primis i veicoli — un router pedonale dovrebbe
guardare il tag `foot` quando presente.

**Fix applicato** (bump `WALK_NETWORK_QUERY_VERSION` 2→3, invalida la cache di rete già salvata):
- `lib/routeBuilder/osmGraph.ts`: `WALKABLE_HIGHWAY` include ora `pedestrian`/`living_street`; la
  query Overpass è diventata una union di due filtri (`WALKABLE_ACCESS_FILTER` +
  `WALKABLE_FOOT_OVERRIDE_FILTER`) — il secondo recupera le vie escluse da `access` generico ma
  permesse esplicitamente dal tag `foot`.
- `lib/routeBuilder/multiStopRoute.ts`: `highwayTier` classifica `pedestrian`/`living_street` come
  `'quiet'` (sicure quanto una strada bianca, niente traffico veicolare vero); `URBAN_ALLOWED_HIGHWAY`
  (modalità "urbano") le include — sono l'essenza stessa del trekking urbano, mai un compromesso
  come i sentieri.
- Nuovo test in `multiStopRoute.test.ts` che riproduce il bug esatto dello screenshot (due punti
  collegati solo da una via `pedestrian`, sia in "misto" sia in "urbano").

**Non ancora verificato**: il fix stesso NON è stato testato sul caso reale — richiede un nuovo
fetch Overpass (bump di versione invalida la cache esistente), mai possibile da questo sandbox
(accesso a `overpass-api.de` bloccato dal proxy di rete). Il prossimo test nell'app reale (stessa
coppia Ronciglione + Chiesa + Capranica, dopo il deploy) è la vera verifica.

## 4. Prossimi passi consigliati (per la nuova chat)

1. **PRIORITÀ: riverificare nell'app reale il fix di §3ter** — stessa coppia dello screenshot
   (Ronciglione, tappa "Chiesa dei Santi Pietro e Caterina" via toggle punti di interesse,
   Capranica), modalità "misto". Il bump di `WALK_NETWORK_QUERY_VERSION` invalida la cache: la
   prima richiesta dopo il deploy rifà un fetch Overpass a freddo (più lento del solito, normale).
   Se il sintomo persiste, usare il logging di §3bis per vedere il `fallbackReason`/diagnostica
   esatti di quella tratta, e controllare se compare il warning `remark` di §3bis per lo stesso
   bbox (rete Overpass parziale, causa diversa non coperta da questo fix).
2. Se punto 1 conferma il fix, **verificare anche Civita Castellana ↔ Castel Sant'Elia** (l'altra
   coppia originale) — non testata con dati reali in questa sessione (nessuna cache v2 disponibile
   per quella zona, Overpass irraggiungibile da questo sandbox).
3. ~~Aggiungere logging diagnostico~~ — fatto, vedi §3bis. ~~Verificare rete parziale in
   silenzio~~ — fatto, vedi §3bis (resta da osservare QUANTO SPESSO accade in produzione).
4. Valutare se le coordinate dei punti scoperti via Wikipedia (usati sia dall'itinerario
   automatico sia dal nuovo toggle "punti di interesse", punto 11 di §2) sono abbastanza precise
   da agganciarsi correttamente alla rete pedonale — non più la causa più probabile dopo §3ter
   (il caso reale osservato era un buco di dati, non una coordinata imprecisa), ma resta un
   sospetto residuo per casi futuri diversi. Non affrontato in questa sessione.
5. Solo dopo aver confermato questo, riprendere gli altri task rimasti aperti da sessioni
   precedenti (se non già coperti): nessuno di rilievo aperto oltre a questo al momento della
   stesura.

## 5. Verifica eseguita in questa sessione

`npx tsc --noEmit` pulito (progetto intero, dopo `npm install` — `node_modules` non era presente
all'avvio del sandbox), `npx next lint` senza nuovi errori/warning (solo warning preesistenti non
toccati da questa sessione), `npx vitest run` verde (465 test, l'intera suite — inclusi 4 nuovi
test in `lib/routeBuilder/__tests__/multiStopRoute.test.ts`: 3 per la diagnostica di §3bis, 1 per
il fix pedestrian/living_street di §3ter). `npm run build` non rieseguito in questa sessione
(nessuna modifica a route/pagine che ne richiedesse una verifica oltre a tsc/lint/vitest, già
verde). La verifica di §3ter (query Overpass ricostruita a mano, sintassi non eseguibile da
questo sandbox) è stata fatta leggendo attentamente la sintassi Overpass QL prodotta, non
eseguendola contro Overpass — un margine di rischio residuo rispetto a un test end-to-end reale,
da chiudere col punto 1 di §4. Nessun altro test manuale end-to-end nell'app reale è stato
possibile in questo sandbox.
