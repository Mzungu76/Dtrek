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
| `DirezioneE.dc.html` + `DirezioneEGuide.dc.html` | **E — Due mappe intercambiabili** *(aggiornata su richiesta dell'utente — vedi sotto)* | Non un'unica traccia in evidenza (versione precedente) ma **2 mappe a piena pagina fra cui passare** con una pillola a due segmenti in alto ("tocca o scorri per cambiare mappa"): `DirezioneE.dc.html` mostra la mappa aggregata di TUTTI i percorsi (stessi dati di D); `DirezioneEGuide.dc.html` mostra invece i PUNTI dove si trovano le Guide consultate (verde) e i Resoconti scritti (terracotta) — più leggibile delle tracce quando sono tante e sovrapposte, e risponde a una domanda diversa ("dove sono stato/dove voglio tornare" invece di "che percorsi ho fatto"). Sotto, stesso pannello fisso con 2 widget chiave e la stessa maniglia "trascina per tutti i widget" — lo STESSO gesto già usato per aprire Guida/Resoconto/Diari (RouteCarousel → RoutePage), che renderebbe la Dashboard un membro a pieno titolo della stessa famiglia di pagine invece di un'imitazione visiva. |
| `DirezioneF.dc.html` | **F — Pannello ibrido** | Via di mezzo più prudente: la mappa aggregata occupa solo una fascia "letterbox" superiore (~40% di schermo, non tutta la pagina), con lo stesso titolo/pillole/schede in overlay; sotto, un pannello chiaro separato ospita gli stessi widget già implementati oggi (card bianche, grafici Recharts) senza doverli reinventare per stare sopra una mappa — la più leggibile per i widget densi di dati (grafici, liste), il compromesso più vicino a un'implementazione immediata. |

Ogni direzione ha (almeno) un artboard **-Vuoto** che mostra la Dashboard per un utente nuovo, senza
nessuna escursione caricata — l'ipotesi da cui l'utente stesso ha detto di voler ripartire ("come la
vedremmo un nuovo utente?"). In D e F l'utente nuovo vede lo stesso fallback decorativo già usato
altrove nell'app quando manca una copertina puntuale (`CoverMap.tsx`/`HubSkeleton.tsx`/
`BottomGallery.tsx` — sfondo `linear-gradient(158deg,#123448,#071824)` con una grana topografica
sottile), più un invito a caricare la prima escursione; in D prende tutto lo schermo, in F resta
confinato alla fascia letterbox.

**Direzione E fa eccezione, per una richiesta specifica dell'utente**: qui, invece del fallback
scuro decorativo, l'utente nuovo vede la STESSA ambientazione "mappa" a zoom regionale delle altre
due viste, solo senza tracce/pin propri (`DirezioneEVuoto.dc.html`) — possibile perché a zoom
regionale la mappa di base non ha bisogno di nessuna coordinata specifica dell'utente per esistere,
a differenza di una cover-map puntuale su un singolo percorso. Se "Percorsi per te" ha già un
suggerimento pronto al primo accesso, l'utente vede invece quel percorso unico disegnato sulla mappa,
sempre a zoom regionale (`DirezioneENuovoConSuggerimento.dc.html`) — un terzo stato intermedio fra
"niente" e "storico pieno", senza selettore a due mappe (non c'è ancora nulla di "suo" da mostrare
in due viste).

## Dati ipotizzati

Recovery, Volume, Prossima uscita, Accesso rapido sono gli stessi widget già calcolati dalla
Dashboard attuale (`components/dashboard/`). Le pillole aggregate di D/E/F ("12 percorsi · 348 km ·
+9.400 m D+") sarebbero `globalStats` (`lib/blobStore.ts`, già usato altrove). Le mappe sono
disegnate qui come tracciati/pin SVG illustrativi (l'iframe del canvas non ha accesso di rete a tile
reali) — nell'app userebbero `AllRoutesMap.tsx` così com'è per la vista "tutti i percorsi",
passandogli `interactive={false}` per un uso puramente decorativo di sfondo; la vista "Guide e
Resoconti" di E richiederebbe invece un nuovo pannello a marker singoli (posizione di ogni Guida
consultata e Resoconto scritto, con clustering ai livelli di zoom più larghi — non ancora presente
in `AllRoutesMap.tsx`, che oggi disegna solo tracciati). Il "percorso consigliato" per un utente
nuovo userebbe la prima card di `/api/percorsi-per-te` (già interrogata da `useDashboardData.ts`
per il teaser attuale della Dashboard); in sua assenza (ancora in generazione, o nessun risultato)
resta lo stato completamente vuoto.

## Cosa NON è stato deciso qui

Tutte restano compatibili con le schede/il catalogo widget già costruiti (nessuna tocca quella
logica, solo il contenitore visivo). Nessuna implementa ancora niente in codice — sono solo
direzioni da scegliere, come le precedenti A/B/C. Non è stato deciso se il passaggio fra le 2 mappe
di E sia uno swipe reale, un tap sulla pillola, o entrambi — qui sono solo 2 artboard statici
affiancati, come da convenzione di questi mockup (niente prototipazione cliccabile).
