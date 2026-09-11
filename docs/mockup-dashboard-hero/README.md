# Dashboard in armonia col resto dell'app — 3 direzioni

Seguito di `docs/mockup-bacheca-dashboard/` (Direzioni A/B/C, già implementate come la Dashboard
personalizzabile attuale — schede + widget a card chiare su `bg-stone-50`). L'utente ha confrontato
quella pagina con Resoconti/Diari/Guida — tutte pagine "hero a schermo intero" con una foto o mappa
a piena pagina e overlay scuro — e l'ha trovata stonata: un elenco di card bianche isolato in mezzo
a pagine immersive. Queste 3 nuove direzioni (D, E, F — lettera diversa dalle precedenti, non
sostituiscono i widget/le schede già costruiti, solo l'ambientazione) esplorano come portare la
stessa identità hero anche qui, in particolare l'idea dell'utente di usare la mappa aggregata di
tutti i percorsi (già esiste come `AllRoutesMap.tsx`, oggi in `/statistiche`) come sfondo a piena
pagina, con i widget mostrati come card semi-trasparenti sopra.

Canvas pubblicato: https://claude.ai/code/artifact/91b5a4ac-4897-442c-bdca-311ee17fd6cb

| File | Direzione | Idea portante |
|---|---|---|
| `Main.dc.html` | **D — Mappa viva** | La mappa aggregata di TUTTI i percorsi resta ferma a piena pagina come sfondo; titolo, pillole aggregate ("12 percorsi · 348 km") e schede-pillola flottano sopra; i widget vivono in un pannello di vetro (blur) ancorato in basso che scorre in verticale — la mappa non si muove mai, solo il pannello. La più immersiva delle tre. |
| `DirezioneE.dc.html` | **E — Traccia in evidenza** | Non tutte le tracce insieme (che con molti percorsi diventano un groviglio illeggibile) ma UNA sola, quella dell'ultima uscita (o della prossima in programma) come hero a pagina intera — ruota fra un piccolo gruppo di uscite recenti, stesso principio delle vecchie foto "ambient" della Bacheca. Solo 2 widget chiave restano fissi in basso; il resto si raggiunge trascinando verso l'alto — lo STESSO gesto già usato per aprire Guida/Resoconto/Diari (RouteCarousel → RoutePage), che renderebbe la Dashboard un membro a pieno titolo della stessa famiglia di pagine invece di un'imitazione visiva. |
| `DirezioneF.dc.html` | **F — Pannello ibrido** | Via di mezzo più prudente: la mappa aggregata occupa solo una fascia "letterbox" superiore (~40% di schermo, non tutta la pagina), con lo stesso titolo/pillole/schede in overlay; sotto, un pannello chiaro separato ospita gli stessi widget già implementati oggi (card bianche, grafici Recharts) senza doverli reinventare per stare sopra una mappa — la più leggibile per i widget densi di dati (grafici, liste), il compromesso più vicino a un'implementazione immediata. |

Ogni direzione ha un secondo artboard **-Vuoto** che mostra la Dashboard per un utente nuovo, senza
nessuna escursione caricata — l'ipotesi da cui l'utente stesso ha detto di voler ripartire ("come la
vedremmo un nuovo utente?"). In tutti e tre non c'è una mappa bianca: stesso fallback decorativo già
usato altrove nell'app quando manca una copertina (`CoverMap.tsx`/`HubSkeleton.tsx`/
`BottomGallery.tsx` — sfondo `linear-gradient(158deg,#123448,#071824)` con una grana topografica
sottile), più un invito a caricare la prima escursione. In D ed E il fallback prende tutto lo
schermo (la mappa lì è il protagonista); in F resta confinato alla stessa fascia letterbox.

## Dati ipotizzati

Recovery, Volume, Prossima uscita, Accesso rapido sono gli stessi widget già calcolati dalla
Dashboard attuale (`components/dashboard/`). Le pillole aggregate di D/F ("12 percorsi · 348 km ·
+9.400 m D+") sarebbero `globalStats` (`lib/blobStore.ts`, già usato altrove). La mappa aggregata è
disegnata qui come tracciati SVG illustrativi (l'iframe del canvas non ha accesso di rete a tile
reali) — nell'app userebbe `AllRoutesMap.tsx` così com'è, passandogli `interactive={false}` per un
uso puramente decorativo di sfondo. La "traccia in evidenza" di E userebbe la stessa fonte
(`nextOuting` se presente, altrimenti l'ultima attività per data).

## Cosa NON è stato deciso qui

Tutte e tre restano compatibili con le schede/il catalogo widget già costruiti (nessuna delle tre
tocca quella logica, solo il contenitore visivo). Nessuna delle tre implementa ancora niente in
codice — sono solo direzioni da scegliere, come le precedenti A/B/C.
