# Bacheca come dashboard personalizzabile — 3 direzioni

Mockup mobile (390×844) per trasformare `/bacheca` (oggi una galleria fotografica a
schermo intero con una statistica alla volta, `app/bacheca/page.tsx`) in una vera
dashboard, fortemente personalizzabile dall'utente, nello stile attuale dell'app
(palette `forest`/`terra`/`stone`, Playfair Display / DM Sans / Barlow Condensed /
Lora / JetBrains Mono, `HubNavBar`).

Canvas pubblicato: https://claude.ai/code/artifact/4b854c10-ffa1-4efe-97a5-2a8a60847b56

| File | Direzione | Idea portante |
|---|---|---|
| `Main.dc.html` | **A — Griglia modulare** | Pillole KPI in cima, poi una griglia a 2 colonne di widget indipendenti (Recovery, Prossima uscita, Volume, Streak, Traguardo più vicino, Diario attivo, Percorsi per te). La matita in alto apre la modifica: maniglia di trascinamento e "×" su ogni card, tessera "Aggiungi widget" in fondo. La più densa, adatta a chi vuole tutto a colpo d'occhio. |
| `DirezioneB.dc.html` | **B — Fasce impilate** | Ogni sezione è larga quanto lo schermo; si riordina con frecce su/giù (stessa scelta già fatta per le Raccolte in `docs/raccolte-pubblicazione-piano.md` — niente `@dnd-kit`) e si nasconde con un interruttore. Più leggibile su schermi piccoli, meno densa di A. |
| `DirezioneC.dc.html` | **C — Schede personalizzabili** | L'utente crea le proprie schede (Oggi, Allenamento, Traguardi, Community, +) e sceglie quali widget mettere in ciascuna. La personalizzazione più profonda: viste diverse per scopi diversi (una per il training, una per i traguardi...). |

## Dati ipotizzati

Recovery Score, Bilancio fisico/forma, volume settimanale, streak, traguardi/record
personali, Diario attivo e Percorsi per te sono già calcolati oggi in Bacheca
(`components/bacheca/ChartPanels.tsx`, `lib/trainingLoad.ts`, `lib/badges.ts`, `lib/
stats.ts`) — il mockup li riusa come contenuto dei widget. **"Prossima uscita"** (con
meteo) è l'unico dato nuovo ipotizzato: verrebbe dalle Mete/Percorsi pianificati
(`planned_hikes`) con un meteo previsto per la data e il luogo — utile perché lega la
dashboard a un'azione futura, non solo al passato.

Numeri, nomi e frasi sono di esempio. Formato `.dc.html`: richiedono il runtime del
canvas editor per essere visualizzati (aprire il link sopra), non sono codice da
incollare nell'app.
