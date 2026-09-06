# Pagina unica di ricerca delle Mete — 3 mockup

Mockup mobile (390×844) per una nuova pagina che raccolga **tutte** le ricerche di Mete oggi
sparse in app, raggiungibile dalla pagina Mete (`app/percorsi/page.tsx`). Palette e tipografia
sono quelle già in codice (`lib/taccuinoTokens.tsx`, `lib/metaTypes.ts`'s `META_TYPE_CONFIG[t].color`,
`tailwind.config.ts` → `botanico.*`): `#F5EDDD` carta, `#EBE0C8` card, `#D9C9A8` bordo, `#C0603D`
terracotta (accento/CTA), `#7C8F6E` salvia (sentiero), `#5F7355` salvia scura (barra, sito);
Caveat per i titoli a mano, Lora per il testo, DM Sans per le etichette, JetBrains Mono per i numeri.
La barra inferiore riprende le tre voci reali della versione mobile di `components/Navbar.tsx`.

Canvas pubblicato: https://claude.ai/code/artifact/4fac632b-b9a7-451c-b1ae-c40228d3550d

## 1. Le ricerche che esistono oggi (inventario dal codice)

| Ricerca | Dove sta oggi | Backend | Tipologia |
|---|---|---|---|
| Costruisci un percorso su misura | `components/upload/RouteBuilder.tsx` (`/upload?tab=gpx` → Manuale) | `/api/route-build` | Sentiero |
| Trova un percorso già documentato | stesso wizard, livelli gratuiti | `/api/route-build/search` | Sentiero |
| Giulia (ricerca AI) | `components/upload/GiuliaSearchPanel.tsx`, dentro il wizard | `/api/route-search` | Sentiero |
| Percorsi per te | `app/percorsi-per-te/page.tsx` | `/api/percorsi-per-te` | Sentiero |
| Ricerche salvate (max 5) | `app/profilo/ricerche-salvate/page.tsx` | `lib/routeBuilder/searchHistory.ts` | Sentiero |
| Cerca Borgo / Città | `app/percorsi/cerca/page.tsx` | `/api/meta-search` (`searchBorghi`) | Borgo/Città |
| Cerca Sito | stessa pagina, altro tab | `/api/meta-search` (`searchSiti`) | Sito |
| Ricerca fra le Mete salvate | campo in `app/percorsi/page.tsx` | client, su `/api/percorsi` | tutte |
| Ricerca globale dei percorsi | `GlobalRouteSearch` in `app/diari/page.tsx` | client, su `/api/percorsi` | tutte |
| Import (non è una ricerca) | `GpxUploader`, `UrlImportUploader`, `ManualPlanUploader`, `FromActivityUploader` | — | Sentiero |

Non sono ricerche di Mete e restano fuori: `app/navigatore/*` (elenco dei percorsi già pianificati
per la navigazione GPS) e `app/vette/page.tsx` (cime raggiunte, calcolate dalle attività).

## 2. Scelte fissate prima di disegnare

Decise con l'utente, valgono per tutti e tre i mockup:

1. **Perimetro**: ricerche + import + le Mete già salvate — un solo posto per "voglio una Meta nuova"
   e "dov'era quella che avevo salvato".
2. **Architettura ibrida**: le due ricerche già veloci (Mete salvate, Borghi/Siti su `/api/meta-search`)
   rispondono *dentro* l'hub; i flussi lunghi (wizard, AI, import) restano le schermate esistenti,
   raggiunte da qui. Nessuna riscrittura di flussi funzionanti.
3. **Struttura per tipologia di Meta** (Sentiero / Borgo-Città / Sito), coerente con i chip di
   `TypeFilterChips` della pagina Mete appena rifatta.
4. **Ingresso dedicato** dalla pagina Mete: una card in evidenza, non il bottone a icona di oggi.

## 3. Le tre opzioni (pagina 1 del canvas)

**Scelta: A.** Piano di implementazione in `docs/piano-ricerca-mete.md`.

| File | Opzione | Idea portante | Contro |
|---|---|---|---|
| `Main.dc.html` | **A — Tre scaffali a fisarmonica** | Le tre tipologie sempre in pagina, una sola aperta; sotto le ricerche salvate | La sezione aperta spinge in basso le altre due; i Sentieri hanno 4 voci contro 1 delle altre → fisarmonica sbilanciata |
| `OptionB.dc.html` | **B — Segmentata + pannello** | Una tipologia alla volta ma per intero: campo, filtri suoi e risultati veri in pagina (mostrata Borghi e Città, l'unica con dati reali) | Le altre due tipologie sono dietro un tocco; per i Sentieri resta comunque un rimando al wizard |
| `OptionC.dc.html` | **C — Indice del taccuino** | Niente da aprire: campo grande in testata + i tre gruppi in righe compatte, tutto in una schermata | Densa; a parte il campo in cima non completa nessuna ricerca, è smistamento |

`IngressoMete.dc.html` (pagina 2) mostra il nuovo ingresso nella pagina Mete — identico per tutte
e tre le opzioni: card "Cerca una Meta" sotto la striscia-carta, il campo che filtra le Mete salvate
resta, sparisce il bottone a icona `Building2` accanto ad esso (oggi l'unico ingresso a
`/percorsi/cerca`, assorbito dalla card).

Formato `.dc.html` come `docs/mockup-mete-redesign/`: richiedono il runtime del canvas editor, non
sono codice da incollare nell'app.

## 4. Dati veri usati nei mockup

I conteggi vengono dallo stato reale già registrato in `docs/mockup-mete-redesign/README.md`:
59 Sentieri + 4 Borghi in `planned_hikes`, 425 righe in `dtrek_places` (tutte `borgo_citta`, tutte
Lazio), 0 Siti. Per questo l'opzione B mostra Borghi e Città come tipologia attiva e l'opzione C
dichiara esplicitamente che i Siti non hanno ancora dati — nessun risultato inventato per una
ricerca che oggi tornerebbe vuota (piano §48.8).

I conteggi degli **archivi** ("425 in archivio") sono invece scritti a mano nel mockup: oggi nessun
endpoint espone il numero di righe di `dtrek_places`. Renderli dinamici è la Fase 0 del piano.
