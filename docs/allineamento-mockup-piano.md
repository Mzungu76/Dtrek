# Allineamento ai mockup approvati — censimento e piano

Stato rilevato dopo il merge della PR #890 (Libreria + Atlante, fasi 0–6). L'impianto nuovo è in
piedi, ma convive con quello vecchio: nessuna pagina è stata ritirata, quindi diverse funzioni
esistono ora in **due posti** e diverse pagine sono rimaste **senza un ingresso**. Questo documento
censisce cosa c'è davvero e cosa fare, nell'ordine.

Mockup di riferimento: `docs/mockup-taccuino/` (canvas
https://claude.ai/code/artifact/7e0d6df9-aba9-4e98-bf30-cbf7e26f5431).

---

## 1. Censimento — dove siamo

Metodo: grafo dei link reali (`href`/`router.push` verso ogni rotta, esclusi i riferimenti dentro
la rotta stessa e in `routeHierarchy.ts`).

### Allineate ai mockup — nessun intervento

| Rotta | Mockup |
|---|---|
| `/` → `/diari` | apertura sull'ultimo Diario |
| `/diari` | 1 · Libreria (copertina + banner) |
| `/diari/[id]` | 7 · Indice del taccuino |
| `/diari/[id]/percorsi/[percorsoId]/guida/[groupKey]` | 8 · Le pagine di una voce |
| `.../reportage/[activityId]/sezione/[n]` | lettura del Reportage |
| `/atlante` · `/atlante/salvate` · `.../aggiungi` | 4 · 5 · 6 |
| `/navigatore*` · `/profilo*` · `/raccolte*` | fuori perimetro, coerenti |
| `/leggi/*` · `/s/*` · `/login` · `/signup` · `/prezzi` | fuori perimetro |

### Sovrapposte — la stessa cosa in due posti

| # | Doppione | Stato reale |
|---|---|---|
| S1 | `/percorsi` (753 righe) **vs** `/atlante/salvate` (130) | Due elenchi delle stesse Mete. **`/percorsi` è il più ricco**: carta espandibile (`MeteMap`), chip tipologia, ricerca, ordinamenti (data/km/D+/distanza), stato CTS. `/atlante/salvate` ha solo i chip. `/percorsi` è fuori dalla barra ma ancora raggiungibile |
| S2 | `/percorsi/cerca` **vs** `/atlante` | Due hub di ricerca. `/percorsi/cerca` ha il campo di ricerca vero (debounce su `/api/meta-search`, `useCreateMetaFromSearch`) + Costruisci/trova + Importa + Percorsi per te + Ricerche salvate. `/atlante` ha 4 tavole di cui **2 identiche** a voci di `/percorsi/cerca`, e per cercare *rimanda a `/percorsi/cerca`* |
| S3 | `/guida/[id]/[groupKey]` **vs** `/diari/[id]/percorsi/[percorsoId]/guida/[groupKey]` | Stessa lettura, due URL. Storicamente giusto (una Meta senza Diario non ha un percorso annidato) — **resta necessario** per le Salvate, non è un errore da correggere |
| S4 | `/navigatore/percorsi` | Terzo elenco delle Mete, dentro Navigator (scarico offline). App separata: **legittimo**, da non toccare |
| S5 | `/resoconto/[id]` **vs** lettura a libro del Reportage | Convivenza dichiarata e voluta (vista estesa come link secondario): **non è un problema** |

### Silenziose — esistono ma non le raggiunge nessuno

| Rotta | Link in ingresso | Nota |
|---|---|---|
| `/guida` (GuidaHub) | 0 esterni | Ex tab di primo livello, uscita dalla barra |
| `/resoconto` (ResocontoHub) | 0 esterni | Ex tab di primo livello, uscita dalla barra |
| `/statistiche` | solo da profilo, GuidaHub, ResocontoHub, NextStepBanner | **Tolta dalla barra in Fase 1 con la promessa di "confluire nel Diario" — mai fatto.** È il buco più grosso lasciato aperto |
| `/vette` | solo da `/statistiche` e `/profilo` | Dipende da una pagina già semi-orfana |
| `/profilo/log-ricerche` | 0 | Mai linkata |
| `/reportage` | 0 | Stub di redirect voluto — ok così |

### Codice morto

- **Lasciato dalla Fase 1** (sostituito dalla Libreria): `FasiRail`, `RegistroRow`,
  `GruppoCollassato`, `IndiceChips`, `NuovoDiarioRow`.
- **Preesistente** (dalla Bacheca ritirata e altro): `NuovoDiarioSheet`, `BachecaStage`,
  `TileIllustration`, `CuriosityModal`, `SectionEyebrow`, `RecoSuggestedRow`, `TerritoryMap`,
  `ChartPanels`, `GuideQA`, `PdfExportButton`, `TourControls`.
- Falsi positivi da non toccare (import dinamico): `RouteMap3D`, `AllRoutesMap`, `MapView`.

### Un'incoerenza introdotta da me

`ProssimaUscitaCard` (riusata nella Libreria) nel suo stato vuoto linka **`/percorsi`**: la pagina
nuova rimanda a quella vecchia invece che all'Atlante.

---

## 2. Piano — cinque interventi, in ordine

### A. Un solo elenco di Mete *(risolve S1)*

**Direzione: `/atlante/salvate` assorbe `/percorsi`, non il contrario** — la pagina vecchia è
quella buona, va spostata e filtrata, non riscritta.

1. Spostare il corpo di `app/percorsi/page.tsx` in `app/atlante/salvate/page.tsx`, aggiungendo il
   filtro `diaryId === null` (una Meta con un Diario è già una voce di quel Diario) e togliendo
   ciò che l'Atlante non deve mostrare.
2. `app/percorsi/page.tsx` → redirect a `/atlante/salvate` (stesso pattern di
   `app/reportage/page.tsx`).
3. `components/diari/ProssimaUscitaCard.tsx`: stato vuoto → `/atlante`, non `/percorsi`.

*Verifica*: da `/atlante/salvate` si vede la carta, si filtra per tipologia, si ordina; una Meta
appena trascritta in un Diario sparisce da qui e compare nel suo indice.

### B. Un solo hub di ricerca *(risolve S2)*

1. `app/atlante/page.tsx` assorbe da `app/percorsi/cerca/page.tsx`: il **campo di ricerca vero**
   (debounce + `useCreateMetaFromSearch`) e le due azioni operative — *Costruisci o trova*
   (`/upload?tab=gpx&source=build`) e *Importa* (`/upload?tab=gpx`).
2. `app/percorsi/cerca/page.tsx` → redirect a `/atlante`.
   `app/percorsi/cerca/luoghi/page.tsx` **resta**: è la ricerca su carta, cioè la tavola
   "Vicino a te".
3. Struttura finale dell'Atlante: campo di ricerca · 4 tavole (Salvate · Vicino a te · Ricerche
   salvate · Proposte per te) · 2 azioni (Costruisci o trova · Importa).

*Verifica*: cercando dall'Atlante si crea una Meta e si apre la sua Guida, senza passare da
`/percorsi/cerca`.

### C. Statistiche — chiudere la fase lasciata aperta

È la promessa esplicita della Fase 1 mai mantenuta. Due strade, **serve la tua scelta**:

- **C1 (come da piano)** — sezione "Statistiche" in fondo all'indice del Diario, aggregata sui suoi
  Reportage (`lib/diari/aggregateDiaries.ts` calcola già km e D+); `/statistiche` resta come
  pagina di dettaglio raggiungibile da lì, e `/vette` sotto di essa. Nessuna pagina orfana.
- **C2** — Statistiche torna una destinazione propria, raggiungibile dal Profilo in modo esplicito.
  Più economico, ma la barra resta a quattro voci e le statistiche restano "di lato".

Finché non si decide, `/statistiche` e `/vette` restano raggiungibili solo per vie traverse.

### D. Ritirare gli hub ex-tab *(risolve le silenziose)*

1. `/guida` e `/resoconto` (le due pagine indice) → redirect, rispettivamente a `/atlante` e a
   `/diari`: l'ingresso alle Guide è ora la voce dentro il Diario, ai Reportage l'indice del
   Diario. **Le pagine figlie restano tutte** (`/guida/[id]/*` per le Mete senza Diario,
   `/resoconto/[id]` come vista estesa).
2. `/profilo/log-ricerche`: dare un ingresso da `/profilo` o ritirarla. Da decidere: è una pagina
   di diagnostica, probabilmente basta il link nel Profilo.

### E. Pulizia del codice morto

Eliminare i cinque componenti sostituiti dalla Libreria (`FasiRail`, `RegistroRow`,
`GruppoCollassato`, `IndiceChips`, `NuovoDiarioRow`) e, separatamente, i preesistenti elencati
sopra. Commit a sé, nessun cambio di comportamento.

---

## 3. Ordine di lavoro

1. **A + fix di `ProssimaUscitaCard`** — è il doppione che si vede di più e si chiude in una PR.
2. **B** — dipende da A (l'Atlante va toccato una volta sola).
3. **D** — piccola, indipendente, toglie subito le pagine mute.
4. **C** — appena scegli fra C1 e C2.
5. **E** — pulizia finale, quando A/B/D hanno stabilizzato cosa è davvero morto.

## 4. Cosa non tocchiamo, e perché

- `/guida/[id]/*` in versione diary-agnostic: serve alle Salvate, che un Diario non ce l'hanno.
- `/navigatore/percorsi`: è l'elenco di un'app separata, con uno scopo diverso (pacchetti offline).
- `/resoconto/[id]`: vista estesa, convivenza già dichiarata e voluta.
- `/raccolte*`: ha un piano proprio (`docs/raccolte-pubblicazione-piano.md`), fuori da questo.
