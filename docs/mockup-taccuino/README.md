# La Libreria e il taccuino di campo

Canvas a due pagine: https://claude.ai/code/artifact/7e0d6df9-aba9-4e98-bf30-cbf7e26f5431

**Pagina "La libreria"** — la proposta a copertine, con scaffali personali.

| # | File | Schermata |
|---|---|---|
| 1 | `Libreria.dc.html` | Una copertina alla volta, si swipa; sotto, la striscia dati e la prossima uscita |
| 2 | `Scaffali.dc.html` | Il banner inferiore aperto: i ripiani con i dorsi |
| 3 | `Sistema.dc.html` | Su quali scaffali sta un taccuino, e l'ordine sul ripiano |

**Pagina "Il taccuino aperto"** — il modello taccuino / voce / pagine.

| # | File | Schermata |
|---|---|---|
| 4 | `Main.dc.html` | L'indice del taccuino aperto |
| 5 | `Nuova.dc.html` | La prima pagina libera: trascrivere una meta trovata cercando |
| 6 | `Voce.dc.html` | Una voce e le sue pagine contigue |
| 7 | `Appunti.dc.html` | Gli appunti presi in cammino, e il Reportage che ne nasce |

## Le tre posizioni prese nei mockup

1. **La copertina da sola sarebbe meno tecnica dello scaffale, non più.** Un oggetto per
   schermata, tutto immagine, è l'interfaccia di un lettore di ebook. Per questo la pagina
   non è una copertina ma una **scheda**: identità in alto, dati densi in basso.
2. **Il banner non è un complemento, è la navigazione.** Con sette taccuini, arrivare al
   quinto a forza di swipe è sfogliare alla cieca; il ripiano si tocca e si salta.
3. **Uno scaffale è un'etichetta resa visibile, non un contenitore nuovo.** `labels text[]`
   esiste già (Fase 2) e le Raccolte esistono già per pubblicare: un terzo sistema di
   raggruppamento riporterebbe l'accumulo da cui siamo partiti. In più un taccuino può
   stare su più scaffali senza essere spostato — cosa che una cartella non permette.
   Unica aggiunta reale: una posizione per (taccuino, scaffale), perché le etichette non
   hanno ordine e uno scaffale sì.

## La decisione aperta

**La Libreria è la porta o la stanza accanto?** Se il tab in basso apre la libreria,
la prima pagina torna a essere un contenitore di contenitori — il problema di partenza —
al costo di un tap in più prima dell'indice, ogni giorno. L'alternativa è che il tab apra
l'indice e la copertina si raggiunga con uno swipe verso il basso ("chiudo il taccuino e
guardo la libreria"). I mockup sono disegnati nella prima versione, per poterla giudicare
al meglio.

Formato `.dc.html` come gli altri mockup del progetto. Numeri, titoli e appunti sono di
esempio; palette, tipografia e sezioni vengono dal codice.
