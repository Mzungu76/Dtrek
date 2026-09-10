# Home Diario — 3 direzioni

Mockup mobile (390×844) per la revisione della prima pagina e dei processi dell'app.
Nascono dalla diagnosi in `docs/revisione-processi-e-pagina-diari.md`: il problema non è
grafico ma strutturale — l'uscita cambia nome e casa due volte lungo la sua vita (Meta →
traccia Navigator → Reportage), e il Diario la riceve solo alla fine. Per questo non si
percepisce come fulcro.

Canvas: https://claude.ai/code/artifact/a3d6e06b-840b-4c35-9944-4e856b997453

| File | Direzione | Idea portante |
|---|---|---|
| `Main.dc.html` | **A — L'uscita dura, il Diario è la sua casa** | Un oggetto, tre stati (in programma → in cammino → registrata) legati da un filo verticale; la home è un Diario aperto, non lo scaffale |
| `Cambio.dc.html` | **A, secondo schermo** | Lo scaffale retrocesso a selettore: si apre dal titolo, e ripete su ogni volume la stessa anatomia a tre stati |
| `DirezioneB.dc.html` | **B — La pagina attuale, sfoltita** | Una porta sola, via il rail delle fasi, tre blocchi invece di otto. Primo passo dentro A, non un'alternativa |
| `DirezioneC.dc.html` | **C — Il Diario dichiarato archivio** | Si rinuncia al fulcro e lo si dice: la home è la ricerca, i Diari sono il magazzino |

La domanda che decide tutto: **quando salvo una Meta, entra subito in un Diario?**
Sì → A. No → C. B rimanda la domanda sistemando intanto la pagina.

Palette e tipografia sono quelle reali del codice (`lib/taccuinoTokens.tsx`,
`tailwind.config.ts`) e la barra inferiore riprende `components/Navbar.tsx` — in A a
quattro voci (Diario, Cerca, Navigator, Profilo), in B le cinque attuali. Numeri e titoli
sono di esempio.

Formato `.dc.html` come `docs/mockup-diari-redesign/`: richiedono il runtime del canvas
editor, non sono codice da incollare nell'app.
