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
| `Raccolte.dc.html` | **Confronto — raccolte come cartelle** | La variante a contenitori, disegnata per il confronto, con i suoi tre costi in pagina |

## Quando i Diari diventano molti

La proposta non è una cartella che contiene Diari, ma un livello di **vista** sopra
l'elenco piatto:

1. **Etichette** multiple per Diario (Natura, Urbano, una zona) — un Diario può stare in
   più insiemi senza essere spostato;
2. **Stato** attivo / archiviato, con archiviazione proposta dopo mesi senza uscite;
3. **Raggruppamento per stagione** dedotto dalle uscite, non mantenuto a mano;
4. **Ricerca** globale, già in pagina oggi (`GlobalRouteSearch`).

Sul database è una colonna `labels text[]` e una `archived_at timestamptz` su `diaries`
(`supabase/migrations/add_diaries_table.sql`) — nessuna tabella nuova, nessuna gerarchia
da mantenere, nessuna migrazione dei Diari esistenti.

Le raccolte come contenitori veri (`Raccolte.dc.html`) restano sul tavolo per un caso
solo: se diventassero l'unità di **pubblicazione**, cioè "pubblica la raccolta Appennino"
come volume unico condivisibile.

Palette e tipografia sono quelle già in codice: `lib/taccuinoTokens.tsx` /
`tailwind.config.ts` (`botanico.*`) — `#F5EDDD` carta, `#EBE0C8` card, `#C0603D`
terracotta, `#7C8F6E` salvia, `#5F7355` barra; Playfair Display / Lora / DM Sans /
Caveat, JetBrains Mono per i numeri. La barra inferiore riprende le 5 voci reali di
`components/Navbar.tsx` (Mete, Navigator, Diari rialzato, Statistiche, Profilo).

Formato `.dc.html` come `docs/mockup-taccuino-botanico/`: richiedono il runtime del
canvas editor per essere visualizzati, non sono codice da incollare nell'app. Numeri e
titoli sono di esempio.

## Pubblicare le raccolte (pagina "Pubblicazione" del canvas)

| File | Schermata |
|---|---|
| `PubComponi.dc.html` | Composizione di una raccolta in-app: i tre livelli pubblicabili, i volumi in ordine, i due interruttori di privacy |
| `PubRaccolta.dc.html` | La raccolta come la vede chi riceve il link: frontespizio, prefazione, indice dei volumi, mappa d'insieme |
| `PubProfilo.dc.html` | Profilo pubblico dell'autore — l'indice delle opere pubblicate, non l'archivio |

Modello proposto: **percorso = articolo, diario = volume, raccolta = collana**, più una
vetrina (il profilo) che indicizza ciò che è già pubblico. La raccolta è una *selezione
ordinata* di Diari, non una cartella: un Diario può stare in più raccolte e non sparisce
da nessun elenco quando ne entra in una — così le etichette restano il modo di navigare e
la raccolta diventa un oggetto editoriale.

Consenso a cascata, con il livello più restrittivo che vince: un Reportage escluso resta
escluso anche dentro una raccolta pubblicata.

Costo: tabelle `collections` e `collection_diaries` (con `position`), `share_token` come
su `diaries`; la lettura pubblica riusa `lib/sharePublicDiary.ts` un livello più su. Il
PDF non sale di livello — 18 Reportage non si esportano da telefono — quindi resta su
percorso e Diario.

**"Pubblica tutto l'archivio" non è previsto**, per tre ragioni in ordine di peso:
sicurezza (un archivio completo di tracce con date espone abitudini e luogo di partenza
abituale), valore editoriale (un dump non si legge), costo di rendering. Il profilo
pubblico copre lo stesso bisogno mostrando i numeri aggregati completi e solo i contenuti
scelti.
