# Pagina "Diari" — integrare Raccolte e Resoconti — 3 direzioni

Mockup mobile (390×844) per aggiornare la pagina `/diario` (rinominata "Diari" nella
tab bar, `components/Navbar.tsx`) alla struttura **Raccolte → Diari → Resoconti**:
le raccolte già esistono lato backend (`app/api/collections`, tabelle `collections` /
`collection_diaries`, vedi `docs/raccolte-pubblicazione-piano.md`) ma la loro UI è
stata rimossa nel ripristino al layout PR #741 (commit `73b2efa`, "le nascondo, torno
alla nav vecchia") insieme a quella dei Diari multipli (`app/api/diaries`). Questi
mockup ridisegnano l'ingresso a quella struttura, nello stile attuale dell'app
(post-ripristino: palette `forest`/`terra`/`stone`, Playfair Display / DM Sans /
Barlow Condensed / Lora / JetBrains Mono, `HubNavBar`).

Canvas pubblicato: https://claude.ai/code/artifact/ef2b535b-571f-4c11-81cd-19e049ed30a7

| File | Direzione | Idea portante |
|---|---|---|
| `Main.dc.html` | **A — Archivio a scaffale** | Raccolte in striscia orizzontale in cima, Diari come righe di registro sotto (copertina, n. resoconti, km, stato di pubblicazione). Lettura veloce, poco scroll — l'evoluzione più diretta dell'attuale pagina. |
| `DirezioneB.dc.html` | **B — Diario in copertina** | Hero fotografico sul Diario più recente (stesso linguaggio di `/bacheca`), poi un foglio con la filmstrip di tutti i Diari e le Raccolte come card con copertine "a ventaglio". Più immersiva, coerente con le altre pagine hub a schermo intero. |
| `DirezioneC.dc.html` | **C — Struttura a strati** | Le Raccolte sono chip-filtro che accendono i Diari che contengono (barra laterale colorata sulla riga); ogni Diario si apre ad accordion e mostra i suoi Resoconti — l'intera gerarchia Raccolta→Diario→Resoconto è visibile e manipolabile in una sola schermata, senza andare altrove. |

## Cosa resta fuori dal mockup (di proposito)

**La vista di lettura del singolo Diario non cambia** — resta l'attuale libro
impaginato (`app/diario/page.tsx`, `components/diario/*`): tutte e tre le direzioni
mostrano solo come ARRIVARE a quella vista (tap su una riga/copertina/dorso), non
come sostituirla.

## Dati di esempio

Numeri, titoli e date sono inventati per il mockup: 4 diari (Appennino 2024, Alpi
2023, Weekend in Toscana, Prime uscite — archiviato), 2 raccolte (Le mie stagioni
2024 — pubblicata, con Appennino 2024 e Alpi 2023; Sentieri di casa — bozza, con
Weekend in Toscana).

Formato `.dc.html`: richiedono il runtime del canvas editor per essere visualizzati
(aprire il link sopra), non sono codice da incollare nell'app.
