# Direzione "Taccuino Botanico" — guida sintetica per la realizzazione

Mockup di riferimento (canvas Claude Design, statico, non aggiornato dopo questa nota):
https://claude.ai/code/artifact/ecea1be4-642c-4a3b-8e34-012daacbb2c7 — pagina "Taccuino Botanico".
Copia locale delle 9 schermate della sola direzione scelta (colori/markup di riferimento, non codice
da incollare): `docs/mockup-taccuino-botanico/*.dc.html`.

Scelta tra tre direzioni presentate (Campo/terra, Topografico/pino, **Botanico/salvia+terracotta**
— quella approvata). Sostituisce il verde `FOREST` (`#277134`, status bar e menù inferiore) ovunque
nell'app con questa palette; estende lo stile "taccuino" già avviato (Fase 17–31,
`lib/taccuinoTokens.tsx`) anche a `GuidaHub`/`ResocontoHub`/`HubNavBar`, finora rimaste nello stile
"vecchio" (fuori scope del redesign menù, Fasi 1–5 già completate su questo branch).

## Palette

| Ruolo | Hex | Uso |
|---|---|---|
| Carta (base) | `#F5EDDD` | sfondo pagina |
| Carta (chiara) | `#F9F2E4` | zone "in luce" |
| Card | `#EBE0C8` | card/riquadri incollati |
| Bordo card | `#D9C9A8` | bordi, separatori |
| Linee di contorno | `#A89A78` | decorazioni sottili |
| Inchiostro (testo) | `#2E2A22` | testo principale, mai nero puro |
| Inchiostro (mano) | `#7A6F52` | titoli/annotazioni scritte a mano |
| Inchiostro (muto) | `#95886A` | etichette secondarie |
| **Accento primario** | `#C0603D` (terracotta) | CTA, badge attivi, stato selezionato |
| **Accento secondario** | `#7C8F6E` (salvia polverosa) | accenti secondari, non CTA |
| Tinta accento | `#E9DAC3` | sfondo badge/chip |
| **Barra globale / status bar** | `#5F7355` (salvia scura) | sostituisce `FOREST[600]` ovunque: menù inferiore, `manifest.json theme_color` |
| Icona attiva in barra | `#F5EDDD` | |
| Icona inattiva in barra | `#B9C4AE` | |
| Hero scuro (mappe/foto) | gradiente `#4A5A3F → #6B7D58` | sfondo hero Guida/Percorsi/mappe |

Motivo, per chi rivede la scelta: la più illustrata/editoriale delle tre — niente verde saturo
"da app", un duo salvia/terracotta da erbario naturalistico. Più lontana dall'estetica attuale delle
altre due, quindi più lavoro per estenderla a schermate dense (Statistiche, Percorsi) — accettato.

## Tipografia — invariata

Nessun cambio: `Playfair Display` (titoli editoriali/copertine), `Lora` (prosa narrativa),
`DM Sans` (interfaccia/etichette), `Caveat` (titoli scritti a mano), `JetBrains Mono` (numeri/stat) —
gli stessi font già in `lib/designTokens.ts`/`lib/taccuinoTokens.tsx`, self-hosted da `next/font`.

## Componenti — mapping sui token esistenti

- **Barra globale inferiore** (`components/Navbar.tsx`, `MobileBottomBar`) e **avatar flottante**:
  `bg-forest-600/95` → nuovo tono salvia scura `#5F7355`; icone attive `#F5EDDD`, inattive `#B9C4AE`.
- **Status bar nativa** (`manifest.json` → `theme_color`, oggi `#277134`): allineare a `#5F7355`.
- **Pillola in cima a Guida/Resoconto** (`MobileNavBar` in `components/Navbar.tsx`, usata da
  `components/routehub/HubNavBar.tsx`): stesso trattamento della barra globale.
- **Book bar** (voltapagina, `components/libro/BookPage.tsx`): già usa `TACCUINO_ACCENT`/`TERRA` —
  da riallineare al nuovo duo salvia/terracotta invece di terra pura.
- **Card/badge/pill/bottone primario**: card = `#EBE0C8` bordo `#D9C9A8`; badge/pill attivi = tinta
  accento `#E9DAC3` su testo `#C0603D`; bottone primario = sfondo `#C0603D`, testo `#F9F2E4`.

`lib/taccuinoTokens.tsx` va aggiornato con questi valori (oggi porta ancora `TACCUINO_ACCENT = TERRA`,
la direzione "Campo"), oppure va introdotta una seconda palette selezionabile se si vuole tenere
`TERRA` disponibile altrove.

## Struttura sezioni Guida — da 9 a 3 gruppi

Oggi (`lib/guideSections.ts`, `GUIDE_SECTIONS`): `prima_di_partire`, `il_percorso`, `verificato`,
`dati_sicurezza`, `comfort`, `luoghi`, `natura`, `sapori`, `consigli`.

Nuovo raggruppamento (3 sezioni nella pillola di navigazione del libro):

1. **Prima di partire** = `prima_di_partire` + `consigli` (rinominata da "Consigli finali" a
   **"Consigli"**). Contiene, in quest'ordine:
   - **Mappa 3D navigabile** (componente esistente `RouteMap3D`, riusato — non da ricostruire),
     **default satellitare**, navigabile embedded nella pagina, con pulsante "espandi" che apre
     `RouteMap3D` a schermo intero (comportamento invariato, solo restyling — vedi sotto). La
     mappa resta **anche** nella sezione "Percorso" (nessuna delle due la perde).
   - Meteo (widget esistente, invariato).
   - Consigli pratici standard (equipaggiamento, stagione, orario — testo statico esistente,
     `subtitle` di `prima_di_partire` in `guideSections.ts`).
   - **"Consigli"** — l'AI di Giulia (`GuideGenerationPanel`, selettore Essenziale/Approfondita/
     Molto approfondita invariato), presentata come **approfondimento secondario**, sotto i
     consigli pratici, mai a sostituirli né in conflitto con essi.
2. **Percorso** = `il_percorso` + `dati_sicurezza` + `verificato` ("Verifiche online").
3. **Luoghi e Natura** = `luoghi` + `natura` + `sapori`.

`comfort` ("Su misura per te") non menzionato dall'utente in questo giro — lasciare dov'è o
chiedere prima di spostarlo, non deciso qui.

Impatto codice: `GUIDE_SECTIONS` (`lib/guideSections.ts`) passa da 9 a 3 chiavi di primo livello
(la generazione AI e il contenuto restano quelli delle 9 sotto-sezioni, raggruppate solo nella UI/
navigazione — non è detto che l'AI debba generare per forza in 3 blocchi, verificare con l'utente
se serve invarianza anche lato prompt/`app/api/guide/route.ts`); la striscia pillole in
`components/libro/BookPage.tsx` e `GuideBookPage.tsx` mostrano i 3 gruppi.

## Mappa 3D espansa — restyling

La pagina a schermo intero aperta da "espandi" **è la stessa `RouteMap3D` esistente**
(`components/RouteMap3D.tsx`, oggi raggiungibile anche da "Strumenti" → "Video 3D del percorso") —
non una pagina nuova. Solo restyling nella nuova palette:
- Chip toggle Satellite/Topografica in alto a destra (satellitare default).
- Bottone indietro in alto a sinistra.
- Controlli fluttuanti sul bordo destro (orientamento, 3D, centra, blocca) in stile pillola/cerchio
  coerente con card/badge del resto dell'app invece dei controlli icon-only attuali (P-H8 dell'audit
  UX, occasione per sistemarlo insieme al restyling, non un requisito separato).
- Scheda inferiore con titolo percorso, pillole km/D+/tempo, CTA "Naviga" — stesso pattern delle
  card app-wide.

## Estensione IA — schermate da `bozza_mockup_dtrek`

Riferimento: `docs/mockup-dtrek-completo/` (15 schermate, mockup più recente ma ancora nella
palette verde vecchia — **non** cambia la scelta palette sopra, la sostituisce comunque con
salvia/terracotta). A differenza del resto di questa guida (solo restyling), qui il mockup introduce
anche struttura/flussi non ancora tutti presenti in codice. Stato reale per schermata (verificato nel
codice, non assunto):

| Schermata mockup | Stato in codice | Note |
|---|---|---|
| Mete / scelta categoria (Sentieri, Borghi e Città, Siti) | **Non esiste** | `app/percorsi/page.tsx` è già una lista piatta di Mete non ancora percorse (tutti i tipi mischiati), `app/percorsi/cerca/page.tsx` gestisce solo creazione/ricerca `borgo_citta`/`sito`. Una schermata hub dedicata a scegliere il tipo è lavoro nuovo, non solo restyling. |
| Ricerca sentieri/borghi/siti, card type-aware | **Esiste** | `lib/metaSearch/` (`searchMeta()`, `searchSentieri.ts`), `lib/metaCard.ts` (`metaCardStats()`), `app/api/meta-search/route.ts`. Solo da restilizzare in salvia/terracotta. |
| Scheda sentiero — Trail Score | **Esiste, ma diverso pattern grafico** | `lib/trailScore.ts`/`trailScoreV2.ts`, UI in `components/TrailScoreGaugeBadge.tsx`/`components/ScoreRing.tsx` (gauge/anello, non radar chart come nel mockup). Proposta: restilizzare il gauge/ring esistente nella nuova palette invece di costruire un radar chart nuovo — da confermare, non deciso qui. |
| Scheda borgo/sito, tab Panoramica/Da vedere/Info | **Esiste** | Stessa rotta di sentiero, `app/guida/[id]/page.tsx`, type-aware via `lib/guideProfiles.ts` (`GUIDE_PROFILES`, esclude `dati_sicurezza` per non-sentiero). Coerente con la struttura Guida a 3 sezioni già pianificata sopra. |
| Itinerario (mappa + tappe cronometrate) | **Esiste** | `lib/itinerary.ts`, `app/api/meta-itinerary/route.ts`, persistenza in `lib/plannedStore.ts`/`lib/metaToPlannedHike.ts`. Solo restyling mappa/card nella nuova palette. |
| Guida durante l'uscita — audio-tour "Tappa N di M" | **Non esiste** | Nessun componente di guida audio con play/pausa e navigazione a tappe trovato in codice (verificato: nessun hit su audioguida/step-player). È una feature nuova, non un restyling — impatto maggiore del resto di questa guida, da valutare/decidere separatamente prima di implementarla. |
| Reportage / pagine reportage | **Esiste** | `app/resoconto/ResocontoHub.tsx`, `components/resoconto/*`, `components/diario/DiarioReportPage.tsx`, `lib/reportProfiles.ts`. Lo stile "taccuino" (foto graffate, bordi strappati) di queste due schermate del mockup è già coerente con la direzione approvata — buon riferimento diretto per il restyling di `ResocontoHub`. |
| Barra di navigazione inferiore a 5 voci (Diario/Mete/Guida/Mappa/Profilo) | **Diverge da quanto in codice oggi** | `components/Navbar.tsx` (`NAV_LINKS`) ha oggi solo 3 voci (Diario→`/diari`, Mete→`/percorsi`, Nuovo→`/upload`), con Profilo come icona avatar separata, non nella barra. La barra a 5 voci del mockup è un cambio di struttura oltre alla palette (che resta comunque `--bar-bg: #5F7355`, non crema come nel mockup) — da decidere se adottarla, non assunto qui. |
| Mappa full-screen, toggle Mappa/Satellite | **Coerente con quanto già pianificato** | Vedi "Mappa 3D espansa" sopra — stesso pattern (toggle satellite/topo, back button, scheda inferiore), ma il mockup mostra una mappa 2D stile marker classici, non la `RouteMap3D` 3D navigabile già in app. Da restilizzare **`RouteMap3D`** esistente, non sostituirla con una mappa 2D. |

Nota positiva: `public/manifest.json` (`theme_color`) risulta **già aggiornato a `#5F7355`** (salvia) —
il resto della migrazione palette (verde `#277134`/`FOREST` ancora presente in `tailwind.config.ts`,
`lib/designTokens.ts`, `NavigationMap.tsx`, `NavigationMapLibre.tsx`, `RouteLeafletEditor.tsx`,
`WeatherWidget.tsx`, `utils/pdfExport/*`, `app/profilo/page.tsx`, `scripts/gen-app-icons.mjs`) resta
da fare.

## Mappatura pagine app → mockup (censimento rotte, prima dell'implementazione)

Censimento di tutte le route reali sotto `app/` (non assunto — letto file per file), incrociato con
le 10 schermate del mockup, per capire cosa va **modificato** (restyling di una pagina che esiste
già) e cosa va **aggiunto** (schermata nuova, nessuna route corrispondente oggi).

### Da modificare (pagina esiste, solo restyling — salvo dove indicato)

| Schermata mockup | Route reale | File |
|---|---|---|
| Diario (Home) | `/diari` | `app/diari/page.tsx` (`DiariPage`) |
| Sommario | `/diari/[id]` | `app/diari/[id]/page.tsx` (`DiarioDetailPage`) |
| Guida — Prima di partire (+ struttura 3 sezioni, vedi sopra) | `/guida/[id]/[groupKey]` **e** `/diari/[id]/percorsi/[percorsoId]/guida/[groupKey]` | due route per lo stesso layout "a libro" (`GuideGroupPage`) — verificare che condividano davvero lo stesso componente prima di restilizzare due volte |
| Percorsi (vista piatta) | `/percorsi` | `app/percorsi/page.tsx` (`MetePage`) — **nota**: oggi lista solo Mete non ancora percorse, non "tutti i percorsi"; verificare che lo scope combaci col mockup o se serve un adattamento minimo oltre al colore |
| Statistiche | `/statistiche` | `app/statistiche/page.tsx` (`StatistichePage`) |
| Profilo | `/profilo` | `app/profilo/page.tsx` (`ProfiloPage`) |
| Navigatore | `/navigatore` | `app/navigatore/page.tsx` (`NavigatorePage`) |
| Mappa 3D espansa | *(componente, non route dedicata)* | `components/RouteMap3D.tsx`, vedi sezione dedicata sopra |
| Reportage | `/resoconto/[id]` (`EscursionePage`) **e/o** `/diari/[id]/percorsi/[percorsoId]/reportage/[activityId]` (`ReportageSummaryPage`) | due possibili route per lo stesso concetto — per commento in `Navbar.tsx` un Reportage oggi si raggiunge solo via Diario, quindi `ReportageSummaryPage` è probabilmente quella attiva e `/resoconto/[id]` legacy/alternativa: **da chiarire prima di restilizzare entrambe** |

### Da aggiungere (nessuna route oggi)

- **Hub "Mete"** (scelta Sentieri / Borghi e Città / Siti) — vedi "Estensione IA" sopra, già
  approvato dall'utente ("ok per hub mete"). `/percorsi` oggi è già la lista piatta,
  `/percorsi/cerca` gestisce solo creazione/ricerca `borgo_citta`/`sito` — nessuna delle due è un
  hub di scelta tipo. Da decidere prima di costruire: `/percorsi` diventa l'hub e la lista piatta
  trasloca altrove, oppure l'hub è una route nuova (es. `/percorsi/nuovo` o `/mete`) e `/percorsi`
  resta com'è.

### Fuori scope per decisioni già prese

- **Barra di navigazione a 5 voci** — l'utente ha confermato di lasciarla invariata (3 voci +
  avatar, `components/Navbar.tsx`).
- **Audio-guida a tappe durante l'uscita** — in pausa: prima va valutato se il GPS ha senso durante
  l'uscita (e se implementarlo sia in Dtrek che nel navigatore esterno), solo per le nuove sezioni
  Borgo/Città e Sito (Percorsi ha già l'app esterna Navigatore).
- **`GuidaHub`/`ResocontoHub`/`HubNavBar`** (hub prima di entrare in una Guida/Resoconto specifica,
  contenuto scuro immersivo) — fuori scope dal piano originale, non toccati qui.

### Pagine non coperte da nessuna schermata del mockup (non toccate in questo giro)

Copertina Diario, pubblica Diario, Percorsi-per-te, Guida flora/animali/naviga, Resoconto
racconta/flora/animali, Profilo impostazioni/AI/cronologia navigazione/log ricerche/ricerche
salvate, Vette, Navigatore percorsi/importa/traccia, Upload, pagine di autenticazione, Prezzi,
Fonti e crediti, pagine pubbliche di condivisione (`/leggi/*`, `/s/*`). Nessuna di queste è
menzionata nel mockup: restano come sono finché non viene chiesto altrimenti.

## Cosa NON è ancora deciso/fatto

- Il restyling completo di `GuidaHub`/`ResocontoHub`/`HubNavBar` (contenuto scuro immersivo) resta
  fuori scope: qui è stata aggiornata solo la vista "a libro" (`GuideBookPage`).
- L'hub "Mete" (scelta tipo Sentiero/Borgo e Città/Sito) e l'audio-guida a tappe durante l'uscita
  sono feature nuove viste nel mockup più recente (`docs/mockup-dtrek-completo/`), non solo
  restyling: vanno progettate/decise a parte prima di essere implementate.
- Se adottare la barra di navigazione a 5 voci (Diario/Mete/Guida/Mappa/Profilo) del nuovo mockup
  al posto delle 3 voci + avatar attuali (`components/Navbar.tsx`) non è deciso qui.
- Nessun codice applicativo è stato toccato in questa sessione — solo il mockup e questa guida.
  Le Fasi 1–5 già pushate su questo branch riguardano il menù globale (navigazione), non i colori.
