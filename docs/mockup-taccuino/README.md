# Il taccuino di campo — il processo fisico portato in app

Cinque schermate mobile (390×844) che traducono il gesto del taccuino di carta:
**taccuino → voce → pagine**. Nascono dall'obiezione all'impostazione precedente
(`docs/mockup-home-diario/`, direzione "uscita come macchina a stati"): quella proponeva
degli *stati*, questa propone un *luogo*, ed è dei luoghi che ci si ricorda.

Canvas: https://claude.ai/code/artifact/7e0d6df9-aba9-4e98-bf30-cbf7e26f5431

| # | File | Schermata |
|---|---|---|
| 1 | `Scaffale.dc.html` | I taccuini come dorsi, uno aperto alla volta |
| 2 | `Main.dc.html` | **L'indice del taccuino aperto** — la nuova prima pagina |
| 3 | `Nuova.dc.html` | La prima pagina libera: trascrivere una meta trovata cercando |
| 4 | `Voce.dc.html` | Una voce e le sue pagine contigue (pianificazione · appunti · reportage) |
| 5 | `Appunti.dc.html` | Gli appunti presi in cammino, e il Reportage che ne nasce |

## Perché non è da inventare

La struttura fisica è già mezza costruita, in due punti indipendenti del progetto:

- **Negli URL**: `/diari/[id]/percorsi/[percorsoId]/guida/[groupKey]` e
  `.../reportage/[activityId]/sezione/[n]` — un taccuino, una voce, le sue pagine. Le
  sezioni della Guida sono già raggruppate in tre (`lib/guideSections.ts`).
- **Nei dati**: `HikeNote` (testo, ora, lat/lon, foto, dettatura vocale, fallback offline)
  vive su `StoredActivity` insieme a `linkedPlannedId`, che punta alla Meta. Il filo
  pianificazione → appunti → reportage è già cucito da un campo.

Manca che la Meta **nasca** nel taccuino invece di arrivarci da un albero parallelo, e che
il Sommario diventi un indice vero.

## Le due regole che tengono in piedi la metafora

1. **Le pagine non si riordinano mai; l'indice sì.** Se le voci si rimescolano per km o per
   data sparisce il senso di posizione, che è tutto il valore del taccuino.
2. **La carta è come l'app si organizza, non come ci si muove.** Niente animazioni di
   pagina che si volta né sfogliate obbligate: cercare, saltare e indicizzare restano
   istantanei — è lì che il digitale batte la carta invece di imitarla.

## Da decidere

Nomenclatura (Diario o Taccuino, oggi convivono), numeri di pagina veri o numerazione delle
voci, e cosa succede a una voce pianificata e mai camminata (si chiude, non si cancella).
Dettagli nelle annotazioni del canvas.

Formato `.dc.html` come gli altri mockup del progetto: richiedono il runtime del canvas
editor, non sono codice da incollare nell'app. Numeri, titoli e appunti sono di esempio.
