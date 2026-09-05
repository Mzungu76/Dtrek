# Restyling pagina `/diari` — 3 direzioni

Mockup mobile (390×844) per il ridisegno della pagina di atterraggio "I miei Diari"
(`app/diari/page.tsx`). Obiettivo dichiarato: far capire a colpo d'occhio che Dtrek è
un'app **tecnica** — si pianifica un percorso, lo si cammina con il navigatore, l'uscita
si registra nel Diario — evitando la lettura "album di ricordi di viaggio".

Canvas pubblicato: https://claude.ai/code/artifact/86c5e2f8-3e31-4a92-b9c4-a22481801a62

| File | Direzione | Idea portante |
|---|---|---|
| `Main.dc.html` | **A — Plancia di campo** | Rail Pianifica → Naviga → Registra con stato reale, card "prossima uscita" con profilo altimetrico e Trail Score, diari come righe di registro |
| `OptionB.dc.html` | **B — Archivio strumentale** | Lo scaffale di copertine attuale + fascia telemetria della stagione (km, D+, uscite, ore, istogramma mensile) e piedino tecnico su ogni copertina |
| `OptionC.dc.html` | **C — Il territorio percorso** | Hero con la mappa di tutte le tracce registrate, foglio che sale con i diari in carosello e la striscia "come nasce un reportage" |

Palette e tipografia sono quelle già in codice: `lib/taccuinoTokens.tsx` /
`tailwind.config.ts` (`botanico.*`) — `#F5EDDD` carta, `#EBE0C8` card, `#C0603D`
terracotta, `#7C8F6E` salvia, `#5F7355` barra; Playfair Display / Lora / DM Sans /
Caveat, JetBrains Mono per i numeri. La barra inferiore riprende le 5 voci reali di
`components/Navbar.tsx` (Mete, Navigator, Diari rialzato, Statistiche, Profilo).

Formato `.dc.html` come `docs/mockup-taccuino-botanico/`: richiedono il runtime del
canvas editor per essere visualizzati, non sono codice da incollare nell'app. Numeri e
titoli sono di esempio.
