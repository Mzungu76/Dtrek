# Due libri, uno strumento — Libreria, Atlante, taccuino

Canvas a tre pagine: https://claude.ai/code/artifact/7e0d6df9-aba9-4e98-bf30-cbf7e26f5431

**La libreria** — l'app apre qui, sull'ultimo taccuino aperto.

| # | File | Schermata |
|---|---|---|
| 1 | `Libreria.dc.html` | Copertina del taccuino corrente; lo scaffale è sempre scritto in alto; lo swipe resta dentro lo scaffale |
| 2 | `Scaffali.dc.html` | Il banner aperto: l'Atlante in cima, poi i ripiani |
| 3 | `Sposta.dc.html` | Drag & drop: destinazione evidenziata, il posto che si apre, il vuoto lasciato |

**L'Atlante** — il libro delle mete.

| # | File | Schermata |
|---|---|---|
| 4 | `Atlante.dc.html` | Ricerca, carta, e le quattro tavole |
| 5 | `Segnate.dc.html` | Una tavola, con il gesto "trascrivi in un taccuino" |
| 6 | `Nuova.dc.html` | La trascrizione: il ponte fra i due libri |

**Il taccuino aperto** — invariato.

| # | File | Schermata |
|---|---|---|
| 7 | `Main.dc.html` | L'indice |
| 8 | `Voce.dc.html` | Una voce e le sue pagine contigue |
| 9 | `Appunti.dc.html` | Gli appunti presi in cammino |

## Il modello

**Due libri, uno strumento, te.** Libreria (i tuoi taccuini, su scaffali che decidi tu) ·
Atlante (dove potresti andare, uno solo) · Navigator · Profilo. È anche la barra in basso,
e sostituisce le cinque voci di oggi: "Mete" sparisce come voce autonoma, perché cercare è
ciò che si fa dentro l'Atlante.

Il confine che tiene tutto insieme, in una riga:
**l'Atlante contiene ciò che non è ancora tuo; il taccuino ciò che lo è.**
Appena una meta ha una data, ha una voce in un taccuino — e non sta più nell'Atlante.

## Le quattro tavole dell'Atlante

`Segnate` (l'unica nuova) · `Vicino a te` (dedotta dalla posizione) · `Ricerche salvate`
(esistono già, in `/profilo/ricerche-salvate`) · `Proposte per te` (è `/percorsi-per-te`,
oggi una pagina isolata). Niente "Programmate": avrebbe creato due posti per la stessa cosa.

## Conseguenze sui dati

Un taccuino su un solo scaffale non si mappa sulle `labels` esistenti (multi-valore):
serve `shelf_id` su `diaries` più una tabella `shelves` (id, user_id, nome, posizione). Le
labels restano utili come **filtro trasversale**: lo scaffale dice *dove* sta un taccuino,
l'etichetta dice *com'è*. I Diari esistenti migrano in uno scaffale "I miei taccuini".

Il prezzo del genitore unico: bisogna scegliere un asse (geografico, temporale, o per
compagnia) e usare quello. È accettabile, ma è irreversibile nella percezione una volta che
l'utente ha sistemato la libreria.

Formato `.dc.html` come gli altri mockup del progetto. Numeri, titoli e appunti sono di
esempio; palette, tipografia, sezioni e tipologie vengono dal codice.
