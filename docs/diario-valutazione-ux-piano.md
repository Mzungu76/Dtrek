# Lo stile Diario — valutazione UI/UX e proposta di riordino

**Data**: 2026-09-09
**Metodo**: lettura diretta del codice sorgente sul branch corrente + misure quantitative sul repo
(conteggi di token tipografici, grafo dei collegamenti fra rotte, censimento dei gusci di pagina).
Ogni numero qui sotto è riproducibile con i comandi indicati in appendice.
**Perimetro**: nessuna feature va rimossa. Tutte le proposte sono di *riorganizzazione*, non di taglio.

---

## Executive summary

Lo stile "Diario" non è incompiuto perché manchi il lavoro: è incompiuto perché è stato applicato
**come palette e come texture, non come sistema**. Il risultato è un'app in cui il tema del taccuino
è arrivato al 100% sulle pagine-libro e alla Libreria/Atlante, ma convive con altre tre grammatiche
visive complete che non sono mai state ritirate.

Le tre cause della sensazione di "confusionario e dispersivo", in ordine di impatto:

1. **Non esiste una scala tipografica.** Ci sono **42 gradini di dimensione testo distinti** in uso e
   il **58% di tutte le dichiarazioni di testo è sotto i 14px**, il 25% sotto i 12px. Quando ogni cosa
   è piccola, niente è gerarchico: l'occhio non ha appigli e legge la pagina come una macchia uniforme.
   Questa, e non l'architettura informativa, è la prima causa del disorientamento.
2. **Quattro gusci di pagina coesistono** (taccuino/carta, libro-BookPage, magazine-glass del RouteHub,
   e le pagine "piatte" `bg-stone-50`). Passare da una sezione all'altra cambia sfondo, font, forma
   dei bottoni e persino la posizione della barra di navigazione.
3. **La navigazione globale ha tre implementazioni** e la storia dei quattro tentativi successivi è
   ancora leggibile nei commenti di `components/Navbar.tsx`. Il Profilo è un'icona flottante fuori
   dalla barra; sulle pagine-libro la barra è in alto, altrove in basso.

Il punto incoraggiante: **la soluzione modello esiste già dentro il progetto**. Il raggruppamento
delle 8 sezioni della Guida in 3 pillole di navigazione (`lib/guideSections.ts`, `GUIDE_NAV_GROUPS`)
è esattamente l'operazione giusta — conserva tutte le sezioni, riduce solo ciò che l'utente deve
scegliere in un dato momento. **La proposta di questo documento è generalizzare quel principio a
tutta l'app.**

Valutazione sintetica: **impianto concettuale forte, esecuzione dispersa**. Non serve un nuovo
redesign — serve *chiudere* quello in corso e ritirare ciò che ha sostituito.

---

## 1. Tipografia — il problema numero uno

### 1.1 Le misure

Conteggio su `app/`, `components/`, `lib/` (classi Tailwind `text-*` + `style={{ fontSize }}` inline):

| Metrica | Valore |
|---|---|
| Dichiarazioni di dimensione testo totali | **2 217** |
| Gradini di dimensione **distinti** | **42** |
| Sotto i 14px | **1 276 (58%)** |
| Sotto i 12px | **544 (25%)** |
| Valori arbitrari `text-[Npx]` | 505 (27% delle classi) |
| `fontSize` inline (fuori da Tailwind) | 340, di cui **77% sotto i 14px** |

I gradini in uso includono `7px, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14,
14.5, 15, 15.5, 16, 17, 18, 19, 19.5, 20, 21, 22, 24, 26, 27, 28, 30, 32, 34, 36, 46, 48, 52, 58,
60, 64, 70`. Differenze di mezzo pixel non sono percepibili come gerarchia: sono rumore che costa
manutenzione senza produrre significato.

Le due dimensioni più frequenti sono **14px (655 usi) e 12px (619)**. In pratica il corpo del testo
dell'app *è* 14px e la sua "gerarchia" secondaria è 12px — con 212 usi di 10px e 188 di 11px sotto
ancora. Su un'app che si usa **all'aperto, in movimento, con luce forte e spesso con i guanti**,
questa è la scelta più costosa dell'intera interfaccia.

### 1.2 Sei famiglie di carattere

`app/layout.tsx` carica **sei** font: Playfair Display, DM Sans, JetBrains Mono, Barlow Condensed,
Lora, Caveat.

**Correzione rispetto alla prima stesura di questo documento**: qui era scritto che Lora fosse un
doppione di Playfair da ritirare. Verificato più a fondo durante l'esecuzione della Fase 1, non è
così — `lib/taccuinoTokens.tsx` dichiara esplicitamente Lora come il font della **prosa
narrativa** ("corpo del testo resta su FONT.lora: professionalità e precisione del contenuto"),
distinto da Playfair (titoli) e da Caveat (annotazioni a mano): una coppia editoriale seria/serif
da titolo + serif da testo, non un doppione. L'uso reale lo conferma — è il font dei paragrafi di
Reportage, Guida e Diario, e delle pagine pubbliche di lettura (`/leggi/...`), applicato in modo
pressoché sistematico lì (~40 punti, non i 13 usi-classe contati nella prima stesura, che
guardavano solo `font-lora` e non gli altrettanto frequenti `FONT.lora` inline).

Il problema reale non è Lora in sé ma due soli punti in cui esce dal proprio ruolo: il titolo h1
"Atlante" e i titoli di `app/fonti-e-crediti/page.tsx` usavano Lora alla scala di un titolo,
invece di Playfair — corretto in Fase 1 (§7).

Resta vera la diagnosi su Caveat: la scrittura a mano, **l'elemento che più dice "diario"**, è
usata solo 3 volte in tutta l'app.

### 1.3 Proposta — una scala di 7 gradini, e nient'altro

Una scala tipografica non è una preferenza estetica: è ciò che permette all'occhio di saltare i
livelli senza leggerli. Proposta, calibrata sull'uso all'aperto:

| Ruolo | Dimensione | Famiglia | Dove |
|---|---|---|---|
| `display` | 30px / 700 | Playfair | Titolo di copertina, nome del Diario |
| `title` | 22px / 600 | Playfair | Titolo di pagina o di sezione |
| `heading` | 18px / 600 | Playfair | Testata di card, titolo di voce |
| `body` | **16px** / 400 | DM Sans | **Corpo dell'interfaccia — il default nuovo** |
| `reading` | **16px** / 400 | Lora | **Prosa narrativa — paragrafi di Reportage/Guida/Diario** |
| `secondary` | 14px / 400 | DM Sans | Sottotitoli, descrizioni, metadati |
| `label` | 12px / 600 uppercase | Barlow Condensed | Etichette, chip, unità di misura |
| `hand` | 18px | Caveat | Annotazioni, date, note a margine — l'accento "diario" |

**Regole**:
- **12px è il minimo assoluto**, e solo per `label` (testo breve, maiuscolo, alto contrasto).
  I 544 usi sotto i 12px salgono a 12px o vengono promossi a `secondary`.
- **Il corpo passa da 14px a 16px** — sia in `body` (interfaccia) sia in `reading` (prosa). È il
  singolo cambiamento con più effetto sulla leggibilità percepita dell'intera app.
- **Lora non si ritira**: è il ruolo dichiarato di `reading`, non un doppione di Playfair (vedi
  §1.2, corretto dopo verifica). Va solo tenuto fuori dai titoli, dove il ruolo giusto è
  `display`/`heading`. **Mono** (JetBrains Mono, 82 usi) è già disciplinato sull'uso semantico
  (cifre, statistiche, coordinate) — verificato a campione, nessun uso decorativo trovato.
- **Caveat si estende** a date, titoli di voce del Diario e annotazioni: da 3 usi a presenza
  sistematica. È il portatore dell'identità.
- **Zero `fontSize` inline e zero `text-[Npx]`**: i 7 ruoli diventano classi/token e le 845
  dichiarazioni arbitrarie si mappano su di essi.

---

## 2. Dimensione dei bersagli tattili

| Metrica | Valore |
|---|---|
| `<button>` nel codice | **655** |
| File che garantiscono un bersaglio ≥ 44px | **1** |
| Icone a 16px (`h-4`) | 375 usi |
| Icone a 14px (`h-3.5`) | 307 usi |

La linea guida di riferimento (Apple HIG 44pt, Material 48dp, WCAG 2.2 *Target Size* 24px minimo)
non è rispettata quasi in nessun punto. Un'icona `h-3.5` dentro un bottone con `py-1` produce un
bersaglio di circa 22×22px — dimezzato rispetto al minimo, su un'app che si usa camminando.

**Proposta**: introdurre tre taglie di controllo e vietare tutto il resto.

| Taglia | Altezza | Icona | Uso |
|---|---|---|---|
| `sm` | 36px | 18px | Controlli densi dentro liste, chip filtro |
| `md` | **44px** | 20px | **Default per ogni bottone** |
| `lg` | 52px | 24px | Azione primaria di pagina, controlli in navigazione attiva |

Per i controlli che devono restare visivamente piccoli, l'area cliccabile si estende con padding
trasparente o `::before` — la resa grafica non cambia, il bersaglio sì.

---

## 3. Architettura informativa

### 3.1 Otto pagine-lapide

Otto rotte esistono solo per fare `router.replace()` verso la loro nuova casa, ciascuna con un
commento che spiega quale ristrutturazione le ha svuotate:

`app/percorsi/page.tsx`, `app/percorsi/cerca/page.tsx`, `app/reportage/page.tsx`,
`app/raccolte/page.tsx`, `app/resoconto/page.tsx`, `app/guida/page.tsx`,
`app/diari/[id]/percorsi/[percorsoId]/page.tsx`,
`app/diari/[id]/percorsi/[percorsoId]/reportage/[activityId]/page.tsx`

Come scelta tecnica sono corrette (non rompono i bookmark). Come **indicatore** dicono che
l'architettura è stata rifatta almeno quattro volte senza che un assetto venisse dichiarato finale.

### 3.2 Un doppione letterale, nella stessa schermata

In `app/atlante/page.tsx` la stessa destinazione `/percorsi-per-te` compare **due volte nella stessa
pagina**, con due nomi diversi e **lo stesso identico sottotitolo**:

- riga 44 — scaffale "Sentieri" → *"Percorsi per te"* · "5 proposte già pronte, aggiornate ogni settimana"
- riga 369 — tavola → *"Suggerite"* · "5 proposte già pronte, aggiornate ogni settimana"

Un utente che le legge entrambe conclude che sono due funzioni diverse e non capisce quale scegliere.
È il caso di studio in miniatura di tutta la dispersione dell'app.

### 3.3 Pagine ricche ma quasi irraggiungibili

Collegamenti entranti (`href` / `router.push`) per rotta:

| Rotta | Link entranti | Nota |
|---|---|---|
| `/resoconto` | 11 | ok |
| `/guida` | 10 | ok |
| `/profilo` | 8 | ok |
| `/diari` | 6 | ok |
| `/statistiche` | 5 | ok |
| `/vette` | **1** | 249 righe di funzionalità, un solo ingresso |
| `/percorsi-per-te` | **1** (più il doppione dell'Atlante) | candidata storica a diventare la Home |
| `/profilo/log-ricerche` | **0** | citata solo in un commento nel codice |

`/vette` e `/percorsi-per-te` sono funzionalità intere che l'utente incontra per caso o mai.

### 3.4 Tre barre di navigazione per la stessa app

`components/Navbar.tsx` esporta tre gusci diversi:

- **`DesktopNav`** — barra in alto, 3 voci + avatar inline.
- **`MobileNavBar`** — barra in **alto**, 3 voci + "Profilo" come quarta voce *con etichetta*.
  Usata dalle pagine-libro tramite `HubNavBar`.
- **`MobileBottomBar`** — barra in **basso**, 2 voci piatte + "Libreria" come **disco sollevato
  centrale** con un ritaglio radiale nel pannello, e il Profilo **fuori dalla barra**, come icona
  flottante in alto a destra (`FloatingProfileAvatar`).

Quindi su mobile la posizione della barra, il numero di voci e il trattamento del Profilo cambiano
a seconda della pagina. Il commento nel codice è esplicito: *"Quarto giro sul trattamento di
Diari/Libreria (richiesta esplicita dell'utente, dopo aver scartato pillola sempre accesa, bottone
a sinistra, bottone centrato con ritaglio, e infine la barra piatta a 5 voci)"*.

**Proposta**: **una sola barra, in basso, quattro voci, sempre**, incluse le pagine-libro.

```
   Libreria        Atlante        Navigator        Profilo
```

- Il Profilo **rientra nella barra** come quarta voce: è una destinazione, non un accessorio, e
  l'icona flottante oggi copre il contenuto nell'angolo in alto a destra.
- **Si ritira il disco sollevato centrale** e il ritaglio radiale. Il "peso" della Libreria si
  comunica con lo stato attivo e con il fatto che l'app ci si apre — non con una geometria che ha
  richiesto quattro iterazioni, buca il pannello e sbilancia le altre voci.
- Sulle pagine-libro la barra **resta in basso** come altrove; la barra voltapagina del libro sale
  appena sopra di essa invece di sostituirla.

---

## 4. I quattro gusci visivi

| Guscio | File | Linguaggio |
|---|---|---|
| **Taccuino** (`TaccuinoPaperTexture`) | 9 | Carta, righe, inchiostro, cornici disegnate a mano |
| **Libro** (`BookPage`) | 4 chiamanti | Pagina impaginata, barra voltapagina, 2 temi interni |
| **Magazine** (`routehub/overlayTheme`) | 5 | Vetro scuro, `bg-black/45`, chip bianchi, `text-stone-*` |
| **Piatto** (`bg-stone-50` / `bg-white`) | 25 pagine | Card bianche, nessuna texture, look da web app generica |

`overlayTheme.ts` è la prova più netta della divergenza: definisce un sistema completo
(`glassTile`, `glassChip`, `bigNumber`, `sectionHeading`) che **non ha alcun rapporto** con
`taccuinoTokens.tsx`. Sono due design system paralleli nello stesso prodotto.

### 4.1 Due palette con lo stesso nome — nome giusto, non un difetto

- `tailwind.config.ts` → `terra.500 = #C0603D` (terracotta), `forest.500 = #7C8F6E` (salvia) — la
  palette del chrome UI, direzione "Taccuino Botanico"
- `lib/designTokens.ts` → `TERRA[500] = #d97220` (arancione acceso), `FOREST[500] = #378d44` (verde
  acceso) — usati SOLO per la mappa (marker foto/POI in `lib/mapSnapshot.ts`, `ROUTE_COLORS` per i
  tracciati)

**Correzione rispetto alla prima stesura di questo documento**: qui era scritto che fosse un
difetto da unificare. Verificato più a fondo durante l'esecuzione della Fase 3, non lo è —
`tailwind.config.ts` lo dichiara esplicitamente in un commento: *"il colore delle tracce sulle
mappe non passa da qui... quel verde resta quello originale apposta (già ripristinato più volte in
sessioni precedenti)"*. È una scelta intenzionale e già difesa contro tentativi precedenti di
"correggerla": i colori di una mappa (tracciato, marker) restano un sistema a parte dal chrome
dell'interfaccia, per leggibilità sopra foto satellitari e sfondi vari — non per coerenza col resto
dello schermo.

Il problema reale era uno solo, non l'intera palette: `BookPage.tsx` importava `TERRA[600]`
(l'arancione acceso, pensato per la mappa) come accento del tema "pergamena" — quello sì un leak
del brand precedente dentro il chrome. Risolto insieme al resto di **§4.2**, rimuovendo
"pergamena": una volta tolto quell'unico punto, `TERRA`/`FOREST` in `designTokens.ts` restano
usati esclusivamente per le mappe, dove è corretto che stiano. Nessuna unificazione necessaria.

### 4.2 Il tema "pergamena" residuo

`BookPage` ha due temi. Tre chiamanti su quattro passano già `theme="taccuino"`; **solo
`app/diari/[id]/pubblica/page.tsx` resta su "pergamena"** (il default). Quella pagina mostra ancora
carta color pergamena e accento arancione mentre tutto il resto del libro è passato a
carta botanica e terracotta.

**Proposta**: `taccuino` diventa il default, `pergamena` viene rimosso. È un intervento di poche
righe che chiude una delle incoerenze più visibili.

---

## 5. Densità dei contenuti

### 5.1 La schermata di navigazione attiva

`components/navigation/ActiveNavigationView.tsx` (1 514 righe) monta **13 superfici sovrapposte** —
`InstructionBanner`, `NavBottomStrip`, `NavLayerRail`, `NavStatsSheet`, `PoiCalloutSheet`,
`FieldNoteSheet`, `EscapeOptionsSheet`, `SpeciesIdentifySheet`, `NavOnboardingSheet`,
`ConfirmEndDialog`, `EndHikeReviewDialog`, `SosButton`, `TrailConfidenceBadge` — più **15 bottoni**
diretti.

È il momento in cui l'utente cammina su un sentiero, guarda lo schermo per due secondi e deve
capire dove andare. È anche la schermata più densa dell'app.

**Proposta — tre livelli espliciti, tutte le funzioni conservate**:
- **Livello 1 (sempre visibile)**: direzione, distanza al prossimo punto, SOS. Nient'altro.
- **Livello 2 (un tap)**: una sola maniglia "Strumenti" che apre i fogli oggi sparsi sui bordi.
- **Livello 3 (contestuale)**: avvisi che compaiono **uno alla volta e in coda**, mai sovrapposti.

### 5.2 Il cassetto "Altro"

`PercorsoToolsDrawer.tsx` organizza gli strumenti in: Reportage · Appunti di campo · Genera tutta
la guida · Esporta · Visualizza · **Altro**. Una sezione chiamata "Altro" è il segnale che la
tassonomia non copre i suoi contenuti: è il posto dove finisce ciò per cui non si è trovata una casa.

**Proposta**: rinominare per **compito dell'utente** — *Scrivere* · *Consultare* · *Condividere* —
e distribuire "Altro" fra le tre. Nessuno strumento viene rimosso.

---

## 6. Che cosa vuol dire davvero "stile Diario"

Oggi il tema è applicato come **superficie**: texture di carta, palette beige, un font a mano usato
tre volte. Perché sia compiuto deve diventare un **modello di interazione**. Un diario ha quattro
proprietà che l'app oggi non sfrutta:

1. **È cronologico.** Si scorre nel tempo. L'app organizza invece per *tipo di oggetto*
   (Percorsi, Reportage, Guide, Raccolte) — una tassonomia da database, non da diario.
2. **È scritto a mano.** L'annotazione personale è la cosa che lo distingue da un archivio.
   `Caveat` va usato per date, titoli di voce e note — non tenuto in riserva.
3. **Ha un ciclo.** *Progetto → cammino → racconto.* L'app ha tutte e tre le fasi (Atlante →
   Navigator → Reportage) ma le presenta come tre sezioni parallele, non come tre momenti di una
   stessa storia.
4. **Si sfoglia, non si naviga.** Il gesto è avanti/indietro. `BookPage` lo fa già bene: va esteso.

**La proposta di fondo**: rendere **il Diario il contenitore di tutto**. Non una delle quattro voci
del menu, ma il luogo dove le altre tre confluiscono. L'Atlante è "dove scelgo la prossima pagina
da scrivere"; il Navigator è "mentre la scrivo"; il Reportage è "la pagina scritta". Tutte le
feature restano — cambia solo la storia che l'interfaccia racconta.

---

## 7. Piano di intervento

Ordinato per **rapporto beneficio/rischio**. Le fasi 1–3 danno la maggior parte del guadagno
percepito e non toccano l'architettura.

### Fase 1 — Tipografia *(impatto altissimo, rischio bassissimo)* — ✅ eseguita

1. ✅ Definiti i 7 ruoli tipografici in `lib/designTokens.ts`, documentati insieme alla famiglia
   che ciascuno usa in pratica. Nessuna estensione a `tailwind.config.ts`: la scala nominale già
   presente in Tailwind (xs/sm/base/lg/xl/2xl/3xl/4xl/5xl/6xl/7xl = 12/14/16/18/20/24/30/36/48/
   60/72px) copriva già tutti i gradini necessari.
2. ✅ Corpo del testo narrativo (Reportage/Guida — `GuideBookPage.tsx`, `ReportBookPage.tsx`) da
   14px a **16px**. Le pagine pubbliche di lettura (`EntryArticle.tsx`, `CollectionPublicView.tsx`)
   e il lettore continuo (`SectionCard.tsx`) erano già a 16px o vi sono arrivate con lo snap del
   punto 4.
3. ✅ Le **844** dichiarazioni arbitrarie (`text-[Npx]` + `fontSize` inline) sono state consolidate
   sulla scala nominale Tailwind con uno script deterministico (snap al gradino più vicino, mai
   sotto i 12px) — verificato idempotente, zero regressioni a typecheck/lint/test (395 test, tutti
   verdi).
4. **Eccezione dichiarata**: i template a pagina fissa per l'export PDF del Diario
   (`components/diario/DiarioReportPage.tsx`, `DiarioStubPage.tsx`, `DiarioIndice.tsx`,
   `DiarioStatistiche.tsx`, `DiarioCover.tsx`, `DiarioMappa.tsx`, `DiarioYearDivider.tsx`,
   `PageHeader.tsx`, `StatCard.tsx` — tutti import `lib/pdfPageGeometry.ts`) sono stati **esclusi**
   da questo intervento: usano un'altezza di pagina fissa in pixel, e crescere le dimensioni del
   testo lì rischia di rompere l'impaginazione stampata in un modo verificabile solo rendendo
   davvero il PDF pagina per pagina — fuori perimetro per un intervento di sola tipografia
   on-screen. Restano sulle dimensioni precedenti; un intervento dedicato di typography-in-print è
   un follow-up separato, non ancora fatto.
5. ✅ Corretti i due usi di Lora fuori dal proprio ruolo (`app/atlante/page.tsx` h1, `app/fonti-e-
   crediti/page.tsx` h1+h2) → `FONT.display`/`font-display`. **Non ritirato**: verificato che Lora
   non è un doppione di Playfair ma il ruolo dichiarato per la prosa narrativa (§1.2, corretto).
   Verificato anche `font-mono` (82 usi): già disciplinato sull'uso semantico (cifre, statistiche,
   coordinate, nomi di file) — nessuna modifica necessaria.

> Da sola, questa fase risolve la parte maggiore della sensazione di "confusionario".

### Fase 2 — Bersagli tattili *(impatto alto, rischio basso solo dove verificabile)* — 🟡 avviata

A differenza della tipografia, la dimensione di un bottone è legata al layout circostante (righe
dense, toolbar, spazio fra controlli adiacenti) — crescerla non è un'operazione sempre sicura come
lo era lo snap dei caratteri, e questo ambiente non ha un modo di rendere l'app con dati reali per
una verifica visiva. Eseguita quindi solo la parte verificabile per lettura diretta del codice:

6. ✅ Tre taglie definite: `components/ui/IconButton.tsx` (componente riutilizzabile, sm/md/lg =
   36/44/52px) + `TAP_TARGET` in `lib/designTokens.ts`. Adozione incrementale, non un cambio dei
   655 bottoni esistenti in un colpo solo.
7. ✅ Applicate al punto a più alto traffico: `components/Navbar.tsx`. La `MobileNavBar` (barra in
   alto, montata da `HubNavBar` sulle pagine Guida/Resoconto — cioè proprio dove capita di doverla
   toccare camminando) aveva le icone più piccole di tutta l'app, 16px, e un avatar da 20px:
   alzate a 20px/22px con più padding verticale. `FloatingProfileAvatar`, isolato nel suo angolo
   senza vicini con cui sovrapporsi, portato al bersaglio pieno di 44px. `ProfileAvatar` di
   `DesktopNav` idem (40px di default). La `MobileBottomBar` (icona+etichetta impilate, Atlante/
   Navigator/il disco Libreria) era già ampia a sufficienza — nessuna modifica necessaria lì.
   `DesktopNav` (solo da tablet in su, fascia che l'audit stesso non ha verificato a schermo)
   alzata con un rialzo leggero, non il pieno 44px, per restare conservativi.
8. ⏳ **Non fatto**: il resto dei 655 bottoni dell'app. Serve una verifica visiva reale (l'app è
   autenticata, con dati Supabase — non riproducibile in questo ambiente) prima di toccare bottoni
   dentro toolbar dense, righe di tabella o cassetti di strumenti, dove crescere un controllo può
   causare sovrapposizioni o troncamenti che un mero controllo statico del codice non intercetta.
   Follow-up naturale: applicare `IconButton` schermata per schermata, verificando ciascuna a
   schermo (locale o con `run`), a partire dalle pagine a più alto traffico (Diario, Atlante,
   navigazione attiva).

### Fase 3 — Unificazione cromatica *(rischio molto più basso di quanto temuto — due dei tre punti erano falsi allarmi)* — ✅ eseguita

Come per Lora in Fase 1, verificare più a fondo prima di editare ha cambiato il giudizio su due dei
tre punti previsti. Non un fallimento del piano: è il motivo per cui si verifica prima di
mecchanizzare un intervento.

8. ❌→✅ **Non fatto, e giustamente**: `TERRA`/`FOREST` di `lib/designTokens.ts` NON vanno unificati
   con `tailwind.config.ts`. `tailwind.config.ts` lo dichiara esplicitamente in un commento — sono i
   colori delle MAPPE (marker, tracciati in `lib/mapSnapshot.ts`/`ROUTE_COLORS`), tenuti apposta
   distinti dal chrome dell'interfaccia, "già ripristinati più volte in sessioni precedenti" dopo
   tentativi di unificarli. L'unico leak reale nel chrome era `TERRA[600]` dentro il tema
   "pergamena" di `BookPage.tsx` — risolto al punto 9. Corretta anche la relativa sezione
   dell'audit (§4.1).
9. ✅ **Fatto**: tema "pergamena" rimosso da `BookPage.tsx`. Verificato che i tre chiamanti reali del
   componente passassero già tutti `theme="taccuino"` esplicitamente — "pergamena" non era un tema
   ancora in uso da qualche pagina dimenticata, era irraggiungibile: il default di una prop che
   nessuno leggeva più. Rimossi insieme i due rami morti che vi si condizionavano (background e
   ombra della barra) e l'import ora inutile di `TERRA`.
10. 🟡 **Ridimensionato**: `routehub/overlayTheme.ts` non è il "sistema di stile parallelo" descritto
    nella prima stesura dell'audit. Verificati i 10 file che lo importano: `glassTile`,
    `glassTileHover`, `glassChip`, `textFaint` — i quattro token davvero "vetro scuro" — risultano
    **codice morto, zero usi in tutto il repo** (rimossi). I quattro token vivi (`textPrimary`,
    `textMuted`, `bigNumber`, `sectionHeading`) usano già lo stesso font (`font-display`) e la
    stessa scala neutra (`stone-*`) del resto dell'app: non sono un sistema a parte, solo alias
    brevi per classi Tailwind ripetute in piccoli menu/popover. La copertina a foto piena di
    GuidaHub/ResocontoHub resta invece deliberatamente un modo visivo distinto dalla carta del
    taccuino — dichiarato esplicitamente nel commento in testa a `BookPage.tsx` ("pergamena calda,
    NON lo sfondo scuro immersivo di GuidaHub/ResocontoHub") — e non va uniformata: due modi
    d'uso diversi (sfogliare un libro / la copertina a schermo intero di un percorso), non un
    errore da correggere.

### Fase 4 — Navigazione globale *(impatto alto, rischio medio)*
11. **Una sola barra**, in basso, 4 voci (Libreria · Atlante · Navigator · Profilo), su ogni pagina.
12. Ritiro del disco sollevato, del ritaglio radiale e dell'avatar flottante.
13. `MobileNavBar` (barra in alto) rimossa; `HubNavBar` usa la barra unica.

### Fase 5 — Pulizia dell'architettura informativa *(impatto medio, rischio basso)*
14. Eliminare il doppione `/percorsi-per-te` nell'Atlante: **un solo ingresso, un solo nome**.
15. Dare un ingresso vero a `/vette` (dentro le Statistiche del Diario, dove stanno i dati che riassume).
16. Decidere su `/profilo/log-ricerche`: esporlo in Impostazioni o rimuoverlo.
17. Le 8 pagine-lapide restano come redirect, ma vanno **elencate in un solo punto** invece di
    essere 8 file con 8 commenti.

### Fase 6 — Densità *(impatto alto sul momento critico, rischio medio)*
18. Navigazione attiva a 3 livelli; avvisi in coda, mai sovrapposti.
19. Cassetto strumenti riorganizzato per compito; "Altro" eliminato.

### Fase 7 — Il Diario come contenitore *(impatto strutturale, rischio alto — da valutare a parte)*
20. Vista cronologica unica come pagina di apertura del Diario.
21. `Caveat` esteso a date e titoli di voce.
22. Ciclo *progetto → cammino → racconto* reso esplicito nell'interfaccia.

---

## 8. Che cosa **non** proporre

Per essere espliciti, dato che l'app ha già subito quattro riorganizzazioni:

- **Nessuna feature va rimossa.** Ogni proposta è di raggruppamento o di ricollocazione.
- **Nessuna nuova direzione visiva.** "Taccuino Botanico" è la direzione giusta e va *completata*,
  non sostituita. Il rischio maggiore per questo progetto è un quinto redesign.
- **Nessuna nuova pagina.** Il problema non è che manchino schermate.

---

## Appendice — comandi di verifica

```bash
# Gradini tipografici distinti e percentuale sotto i 14px
grep -rhoE "text-(xs|sm|base|lg|xl|[2-7]xl|\[[0-9.]+px\])" --include=*.tsx app components lib | sort | uniq -c | sort -rn
grep -rhoE "fontSize: [0-9.]+" --include=*.tsx app components lib | sort | uniq -c | sort -rn

# Font effettivamente usati
grep -rhoE "font-(display|body|mono|barlow|lora|caveat)" --include=*.tsx app components lib | sort | uniq -c

# Bottoni totali e bersagli accessibili
grep -rho "<button" --include=*.tsx app components | wc -l
grep -rlE "min-h-\[4[048]px\]" --include=*.tsx app components | wc -l

# Divergenza delle palette
grep -n "terra:" -A4 tailwind.config.ts ; grep -n "export const TERRA" -A3 lib/designTokens.ts

# Pagine-lapide
grep -rln "Questa pagina non esiste più" app --include=page.tsx

# Doppione nell'Atlante
grep -n "percorsi-per-te" app/atlante/page.tsx
```
