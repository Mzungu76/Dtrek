# Diario a libro — Guida e Resoconto come pagine sfogliabili

> Il piano originale "Diario come fulcro" (Diario→Percorso→Reportage, schema `diaries`/`diary_id`,
> le route `/diari`, composer, pubblicazione, ricerca unificata, gestione, cutover nav) è stato
> **completato e già in produzione** — vedi git log (Fase 0→7, commit "Fase N: ..."). Questo piano
> ne è il seguito diretto: restilizza Guida e Resoconto, oggi ancora invariati dentro `/diari`,
> nel modello "a libro" validato in sei revisioni di mockup.

## Contesto

Dentro il Diario, aprire un Percorso mostra oggi la Guida esattamente come su `/guida/[id]` — stessa
galleria, stessa schermata scura immersiva — e un Reportage rimanda del tutto fuori, a `/resoconto/[id]`.
È lo stacco visivo che l'utente ha segnalato: il Diario è già stato ristrutturato concettualmente,
ma quando lo si legge davvero si cade ancora nella vecchia interfaccia.

Abbiamo validato in un mockup HTML (artifact `2e1f7d0a-5d69-4e17-9c8b-038aa651e13b`, non nel repo —
copia locale in `/tmp/claude-0/.../scratchpad/diario-swipe-mockup.html` nella sessione che l'ha
creato, non garantita persistente) un modello alternativo: il Diario si sfoglia come un libro vero —
copertina, indice, una pagina per Percorso, e da lì Guida e Resoconto diventano **pagine del libro**,
una per sezione, nello stesso ordine e con **tutti** i dati che hanno oggi (punteggi, categorie di
sicurezza, fauna, POI, meteo, assessment, grafici, foto) — non una versione riassunta. L'utente ha
approvato ed esplicitamente richiesto: nessun dato o funzione perso, solo restilizzato.

## Decisione architetturale chiave

Ho fatto verificare l'architettura da un'analisi dedicata del codice reale prima di scrivere questo
piano. Conclusione più importante: **`GuidaHub`/`ResocontoHub` sono gallerie a carosello di *tutti*
i percorsi/attività dell'utente** (`RouteHub`, `mode="guida"`/`"resoconto"`), non viste di un singolo
elemento — `/diari/[id]/percorsi/[percorsoId]/page.tsx` oggi monta `<GuidaHub id={percorsoId} />`
per intero, quindi eredita anche lo swipe verso un percorso completamente diverso. Riusarle dentro
il nuovo flusso a libro (Diario→Percorso→Guida→...→torna all'indice) porterebbe dentro quella
semantica da carosello, che lo contraddice.

**Decisione: non tocco `GuidaHub.tsx`, `ResocontoHub.tsx`, `RouteHub.tsx`, `GuideReader.tsx`,
`ReportReader.tsx`.** Restano esattamente come sono — sono file lunghi, pieni di commenti su bug
sottili già chiusi (sfarfallii, race condition, doppio calcolo CTS), e `/guida/[id]`/`/resoconto/[id]`
continuano a passarci invariate: rischio zero sulle route standalone, che restano il "modo classico"
sempre raggiungibile (link esplicito, mai rimosso) da ogni pagina del libro.

Il libro nasce invece da **estrazione, non riscrittura**:
- `GuideReader.tsx` (righe ~280-291, ~741-848) e `ReportReader.tsx` (righe ~339-347, ~564-741)
  costruiscono già, internamente, un unico array piatto di sezioni (`displaySections`) e un
  dispatcher puro che sceglie il widget per ciascuna (`renderWidget(key, body)` /
  `renderFixedWidget(key)`). Estraggo queste due funzioni pure in moduli condivisi
  (`lib/guida/guideDisplaySections.tsx`, `lib/resoconto/reportDisplaySections.tsx`) con argomenti
  espliciti al posto della closure. GuideReader/ReportReader continuano a chiamarle internamente,
  comportamento identico — è un'estrazione meccanica, verificabile con un diff visivo prima/dopo.
  Questo è ciò che garantisce "nessun widget riscritto": la logica di dispatch resta la stessa
  funzione, chiamata sia dal reader continuo sia dalle nuove pagine a libro.
- Il libro monta **una sola sezione per volta, mount/unmount reale** (non `display:none`): è anche
  la scelta più sicura per le mappe (MapLibre/PoiMap) e i grafici (Recharts/HRChart/SpeedChart), che
  misurano il proprio contenitore al mount e restituiscono spesso un box 0×0 se nascosti via CSS.
  Il pan/zoom si resetta cambiando pagina — coerente con un libro fisico, non uno stato che oggi è
  comunque persistito.
- Caricamento dati: due loader nuovi e magri (`useGuidaBookData`, `useReportageBookData`) che
  riusano gli hook già estratti come moduli standalone (`useDtmProfile`, `useTerrainProfile`,
  `useProtectedAreaCheck`, `useDrivingDistance`, `useSafetyScore`, `useHasAiAccess`,
  `useEnrichmentTimeout`, `useCtsRecompute`, `useFlora`, in `app/guida/use*.ts`/`app/resoconto/use*.ts`/
  `lib/`) e duplicano — deliberatamente, con commento esplicito — solo la colla residua che oggi vive
  inline dentro GuidaHub/ResocontoHub (~150-200 righe: effetto POI/wiki, memo `personalSafety`,
  handler `routeMode`, guardia di auto-generazione della guida Breve). Un refactor di quei due hub
  per estrarne un hook condiviso è lavoro rischioso e ortogonale a questa fase; la duplicazione
  temporanea è il compromesso giusto, con un ticket di follow-up per unificare dopo la validazione.

### Chrome che vive fuori dal loop delle sezioni — dove va

GuideReader/ReportReader hanno ~15 pezzi di UI che oggi compaiono una sola volta per lettura, non
per sezione: hero, stat strip, pannello generazione/rigenerazione AI + selezione lunghezza,
`VoicePlayer` (solo Guida), galleria foto finale, `GuideQA`, export PDF, editor manuale
(`editorMode==='manual'`), pubblica/scarica PDF, `NextStepBanner`, `PhotoLightbox`,
`RouteModeDialog`/`CreditErrorModal`, i modali `RouteMap3D`/Street View (passati a GuideReader solo
via callback `onOpenMap3D` da GuidaHub). Nessuno di questi è "una sezione" — vanno assegnati
esplicitamente, non lasciati impliciti:
- **Pagina di riepilogo Percorso/Reportage** (nuova, vedi Fase 3): pannello generazione/rigenerazione,
  selezione lunghezza, `NextStepBanner`, pubblica/scarica PDF, editor manuale come azione esplicita
  che esce dal libro (`editorMode==='manual'` non è paginabile).
- **Link "Apri in modalità classica"** (sempre presente, mai rimosso, su ogni pagina di riepilogo):
  `VoicePlayer` (lettura vocale multi-sezione con auto-scroll non ha equivalente diretto in
  paginazione — funzionalità dichiaratamente non riportata nel libro v1), `GuideQA`, `RouteMap3D`,
  Street View, editor manuale se non ricollocato in Fase 3.
- **Deep-link a sezione** (tap sul badge Trail Score → "Dati e sicurezza", tap su un pin POI →
  "Luoghi") oggi fanno `scrollIntoView`; nel libro diventano "vai alla pagina N" — vanno
  esplicitamente ricollegati nella Fase 2/3, altrimenti spariscono in silenzio insieme a GuidaHub.
- **Pull quote del Resoconto** (frase a effetto tra due capitoli, tracciata a parte via `gapRefs`,
  non è una voce di `displaySections`): decisione presa in Fase 0 — resta dov'era (in fondo alla
  pagina del capitolo narrativo precedente), non richiede trattamento speciale nell'estrazione.
- **Auto-generazione guida Breve**: la stessa guardia (`enrichmentReady && hasAiAccess &&
  autoGenSections.length>0`) va replicata nel nuovo loader, altrimenti rischio di doppia
  generazione (costo AI) se lo stesso percorso si apre sia da `/guida/[id]` sia dal libro.

## Fasi (ognuna verificabile da sola)

**Fase 0 — Estrazione pura (rischio minimo, meccanica)** ✅ **COMPLETATA** (commit `2b470b2`)
- `lib/guida/guideDisplaySections.tsx`: estrarre `buildGuideDisplaySections(guideText)` e
  `renderGuideWidget(key, body, props)` da `GuideReader.tsx`.
- `lib/resoconto/reportDisplaySections.tsx`: stesso trattamento per `ReportReader.tsx`
  (`buildReportDisplaySections`, `renderReportFixedWidget`).
- Verifica: `tsc --noEmit` ed `eslint` puliti sull'intero progetto. Non è stato possibile fare un
  diff visivo screenshot-based di `/guida/[id]`/`/resoconto/[id]` in questo ambiente (nessuna
  credenziale Supabase disponibile nella sandbox) — l'estrazione è comunque meccanica (stesso
  switch/JSX spostato, non riscritto) e verificata riga per riga.

**Fase 1 — Loader magri per singolo elemento** ✅ **COMPLETATA** (commit `5dbf5e7`, con due fix in `f964924`)
- `app/diari/[id]/percorsi/[percorsoId]/useGuidaBookData.ts`
- `app/diari/[id]/percorsi/[percorsoId]/reportage/[activityId]/useReportageBookData.ts`
- Riusano gli hook già estratti; duplicano solo la colla (commentata esplicitamente sul perché);
  replicano la guardia di auto-generazione.
- **Non ancora fatto**: `/api/percorsi/[id]/reportage` (`ReportageRow`) espone ancora solo
  id/title/startTime/distanceMeters/hasWrittenReport — da estendere in Fase 3 se la card di
  riepilogo Reportage ne ha bisogno (foto, dislivello, voto).

**Fase 2 — Guscio "libro" (componenti nuovi)** ✅ **COMPLETATA** (commit `f964924`)
- `components/libro/BookPage.tsx`: pergamena, palette TERRA/FOREST/STONE e font
  Playfair/Lora/Barlow Condensed da `lib/designTokens.ts`. Adattamento deliberato rispetto al
  mockup: frecce/pillole sono `<Link>` reali (URL vere, Fase 3), non zone invisibili ai bordi né
  stato JS di un simulatore — più utilizzabile su desktop e coerente con URL condivisibili/back
  button.
- `components/libro/GuideBookPage.tsx` / `components/libro/ReportBookPage.tsx`: montano una sola
  sezione alla volta, usando l'estrazione di Fase 0 + i loader di Fase 1.
- **Non ancora verificato a schermo** (nessun ambiente Supabase/dati reali in questa sandbox):
  dimensionamento di RouteMapSection/HRChart/SpeedChart/PoiMap dentro il nuovo contenitore a piena
  pagina (oggi vivono in una colonna `max-w-3xl`/`lg:max-w-[52rem]` dentro GuideReader/ReportReader).

**Fase 3 — Routing** ✅ **COMPLETATA** (non ancora committata come commit a sé — vedi stato sotto)
- **Decisione presa con l'utente** (non riusare/estrarre `generateSections` di GuideReader): pannello
  di generazione nuovo e isolato, `components/libro/GuideGenerationPanel.tsx` /
  `components/libro/ReportGenerationPanel.tsx` — chiamano `/api/guide`/`/api/resoconto` direttamente
  via `streamFetchText` (nessuna anteprima live carattere-per-carattere, solo spinner fino al
  completamento). Il server persiste già lui stesso il risultato (`cached_guide` lato
  `/api/guide`, `hike_reports` lato `/api/resoconto`) — il pannello Guida rilegge il percorso con
  `getPlannedById` a fine stream invece di rifare il merge lato client; il pannello Reportage riceve
  il testo finale direttamente dallo stream e lo passa su via callback (`onGenerated`).
- `app/diari/[id]/percorsi/[percorsoId]/page.tsx`: da embed diretto di GuidaHub a vera pagina di
  riepilogo (copertina, statistiche chiave, CTA "Apri la Guida", link "Apri in modalità classica",
  elenco Reportage restilizzato, `GuideGenerationPanel`).
- `.../percorsi/[percorsoId]/guida/[sectionKey]/page.tsx`: slug stabile (`GuideSectionKey`), monta
  `<GuideBookPage>`; `sectionKey` non valida → `notFound()`.
- `.../percorsi/[percorsoId]/reportage/[activityId]/page.tsx`: riepilogo Reportage (nuovo — prima si
  rimandava sempre a `/resoconto/[id]`): copertina, statistiche, CTA "Apri il Reportage",
  `ReportGenerationPanel`, `NextStepBanner`.
- `.../reportage/[activityId]/sezione/[n]/page.tsx`: indice numerico 1-based, monta
  `<ReportBookPage>`. Clamp/redirect implementato con un prop nuovo, additivo, su
  `ReportBookPage` — `onInvalidPageIndex?: (presentCount: number) => void`, chiamato in un
  `useEffect` quando `pageIndex` cade fuori da `[1, sezioni presenti]` — la route lo usa per un
  `router.replace` a `sezione/1` (se esistono sezioni) o alla pagina di riepilogo (se zero).
  `ReportBookPage` non conosce l'URL della pagina di riepilogo (il suo `basePath` è quello del
  Reportage, non del suo indice), quindi la decisione resta al chiamante.
- `lib/diario/useDiarioTitle.ts` (nuovo, piccolo): le pagine di sezione conoscono solo l'id del
  Diario dall'URL — fetch minimo di `/api/diaries/[id]` per il titolo vero nella running head di
  `BookPage`, invece del placeholder `"Diario"`.
- **Deliberatamente rimandato "Apri in modalità classica"** (non ricollocato in questa fase — resta
  sempre raggiungibile, mai rimosso, come da principio del piano):
  - Pubblica/scarica PDF ed editor manuale (`editorMode==='manual'`), sia per Guida che per
    Reportage: costruirli dentro la pagina di riepilogo è un lavoro a sé (export jsPDF, ShareModal,
    editor a due colonne) sproporzionato rispetto alla portata di "routing" di questa fase.
  - `VoicePlayer`, `GuideQA`, `RouteMap3D`/Street View — come già previsto dal piano originale.
  - **Scorciatoia one-tap "tocca il badge Trail Score / avviso → vai a Dati e sicurezza /
    Verificato online"**: nella galleria a carosello (`GuidaHub.scoreGaugeBadge`,
    `pendingScrollSection`) è un tap su `TrailScoreGaugeBadge`/`CoverNoticesChip` nella card di
    copertina. Riprodurlo identico nella pagina di riepilogo del libro richiede portare lì anche
    `computeTrailScoreBreakdown`/`isTrailScoreVetoed` e verificare che i due componenti non
    annidino elementi interattivi in un contesto diverso (card scura immersiva vs. riepilogo
    pergamena) — non fatto in questa fase. La sezione "Dati e sicurezza" resta comunque
    raggiungibile in due tap (CTA "Apri la Guida" → pillola di navigazione), non sparisce: si perde
    solo la scorciatoia a un tap, non l'accesso. Da rivalutare se/quando GuidaHub verrà davvero
    ritirato per questo flusso (Fase 4).
  - Scaffale `/diari` (lista/grid) e indice del Diario: nessun link da correggere (già puntavano a
    `/diari/[id]/percorsi/[percorsoId]`, path invariato — la nuova pagina di riepilogo ci vive
    sopra senza bisogno di toccare chi ci rimanda). Un restyling visivo del scaffale stesso (una
    "copertina" del Diario come card, oggi assente) resta non fatto — pura rifinitura estetica, non
    bloccante per il flusso.
- Presence-gating di Fase 2 (`isSectionPresent` in `GuideBookPage.tsx`/`ReportBookPage.tsx`) non
  toccato in questa fase — resta un giudizio "ragionevole ma non confermato dall'utente".

**Fase 4 — Flag di rollout** ✅ **COMPLETATA**
- Nuova colonna `diario_libro_enabled` su `user_settings` (booleano, default `false`) — migrazione
  `supabase/migrations/add_diario_libro_enabled.sql`, non ancora eseguita in nessun ambiente reale
  (nessuna credenziale Supabase in questa sandbox — va lanciata a mano nello SQL Editor, stesso
  flusso già seguito per ogni altra migrazione di questo progetto). Finché non è eseguita, la
  colonna semplicemente non esiste: il fallback automatico già presente in
  `app/api/user-settings/route.ts` (droppa dalla `upsert` la colonna che Postgres segnala mancante)
  copre la scrittura, e la lettura torna comunque al default `false` via `?? false` — nessun errore
  visibile all'utente nel frattempo, solo il comportamento classico finché la colonna non c'è.
- `lib/sync/userSettingsStore.ts` (`diarioLibroEnabled`), `app/api/user-settings/route.ts` (GET/POST)
  seguono lo stesso pattern di `guideBreveSections`/`aiUseBiometricData`.
- `app/diari/[id]/percorsi/[percorsoId]/page.tsx`: unico punto di gating, come da scope della
  Fase 4 — a flag spento monta esattamente il vecchio `<GuidaHub id={percorsoId} />` +
  `<ReportageSection>` con link a `/resoconto/[id]` (contenuto recuperato dalla history git,
  `git show c8a0c39^:...`, non riscritto a mano); a flag acceso monta la pagina di riepilogo di
  Fase 3. Le route nuove sotto (`guida/[sectionKey]`, `reportage/[activityId]`,
  `reportage/[activityId]/sezione/[n]`) non hanno un proprio gate: a flag spento restano
  semplicemente prive di link in ingresso (nessuna UI ci rimanda), non disabilitate — raggiungibili
  solo digitando l'URL a mano, coerente con "scoped solo al punto d'ingresso Percorso".
  `/guida/[id]` e `/resoconto/[id]` standalone non sono mai stati toccati, a prescindere dal flag.
- Toggle per accendere il flag sul proprio account durante la validazione:
  `components/profilo/SectionAvanzate.tsx` → "Diario a libro (beta)" (sezione "Impostazioni
  avanzate", collassata di default) — non pensato per un rollout diffuso via impostazioni utente,
  solo per poterlo verificare a schermo prima del cutover del default.
- **Non fatto** (resta il passo successivo, fuori da questo piano): eseguire davvero la migrazione
  su Supabase, accendere il flag sul proprio account, verificare a schermo l'intero flusso
  Diario→Percorso→Guida/Reportage a pagine con dati reali, e solo dopo decidere se/quando flippare
  il default a `true` per tutti.

**Fase 5 — Feedback dopo la prima verifica a schermo** ✅ **COMPLETATA**

L'utente ha eseguito la migrazione, acceso il flag e verificato il flusso su dati reali. Due
richieste emerse da quella verifica:

- **"Approfondisci con Giulia" dentro le sezioni, non solo nel riepilogo** — `GuideGenerationPanel`
  accetta ora un `sectionKey` opzionale: con `sectionKey` si comporta da trigger inline identico a
  quello del lettore classico (`ApprofondisciTrigger`, riesportato — non duplicato — da
  `components/editorial/SectionCard.tsx`), montato da `GuideBookPage.tsx` sotto ogni sezione priva
  di testo. Cambia di conseguenza il gate di presenza: verificato/comfort/sapori/consigli sono ora
  SEMPRE pagine raggiungibili (prima sparivano senza testo AI — la versione originale, coerente col
  mockup ma incompatibile con l'idea di generarle da lì). Per il Reportage — che si genera per
  intero, non per capitolo, quindi non esiste un "approfondisci questa sezione" vero — `ReportBookPage`
  monta `ReportGenerationPanel` quando il Reportage non ha ancora contenuto, qualunque pagina si
  stia guardando.
- **Layout dello scaffale `/diari` e dell'indice del Diario** — rimasti nello stile "app moderna"
  (card bianche, palette forest/stone) mentre Guida/Reportage erano già a pergamena: lo scarto
  visivo segnalato. Il mockup validato (`2e1f7d0a-5d69-4e17-9c8b-038aa651e13b`, "Diario a schermo
  intero" — ancora accessibile come artifact pubblicato, non nel repo) aveva già uno scaffale
  (`renderShelf`/`.bk-cover`) e un indice (`renderIndexPage`/`.bk-index-*`) per il "Modello B"
  scelto: entrambi ora portati nell'app reale, dietro lo stesso flag `diarioLibroEnabled` di Fase 4
  (a flag spento restano `app/diari/page.tsx` e `app/diari/[id]/page.tsx` esattamente come prima —
  rinominate `*Classico`, non riscritte).
  - Scaffale: copertine verticali (rapporto 3:4, gradiente caldo o `coverUrl` reale, taglio pagine
    sul bordo) — adattamento deliberato: riga scorrevole di link invece del carosello
    drag/swipe a una copertina alla volta del mockup, perché una gestura del genere non si può
    verificare a schermo in questa sandbox e un errore lì sarebbe silenzioso finché qualcuno non ci
    prova sul serio. Nessun campo "tema colore" nello schema reale (solo `cover_url`, una foto): il
    gradiente cicla per indice invece di essere una scelta salvata.
  - Indice: **riusa `components/libro/BookPage.tsx`** (stessa running head/chrome di ogni altra
    pagina del libro) con dentro l'elenco Percorsi in stile "Sommario" del mockup (anteprima
    tracciato, stato uscite, tap → pagina di riepilogo del Percorso). "+ Nuovo percorso" collegato
    a `/upload?diaryId=...` (una sola scelta invece del composer a due corsie della versione
    classica — quello resta raggiungibile spegnendo il flag). **Differenza strutturale importante**
    dal resto del piano: qui non esiste un "Apri in modalità classica" a cui rimandare, perché
    l'indice condivide la STESSA URL della versione classica (scelta solo dal flag), non una route
    a sé come `/guida/[id]`/`/resoconto/[id]` — funzioni più pesanti ("Percorsi per te", il composer
    a due corsie) restano quindi raggiungibili solo spegnendo il flag. L'eliminazione del Diario
    (distruttiva, rara) resta invece un'eccezione voluta: montata anche nella versione a libro,
    sotto la pagina, perché è l'unica azione della vecchia pagina che non doveva sparire nemmeno a
    flag acceso.
  - **Non fatto**: la scorciatoia one-tap "Statistiche del Diario" del mockup non esiste nell'app
    reale (nessuna vista statistiche filtrata per Diario, solo `/statistiche` globale) — non
    riprodotta per non promettere una vista che non esiste; l'indice qui non ha quel link.

**Fase 6 — Feedback dopo la seconda verifica a schermo (screenshot reali)** ✅ **COMPLETATA (parziale — vedi non fatto)**

L'utente ha mandato screenshot reali del flusso (Sommario, riepilogo Percorso, pagine Guida,
scaffale) con sei osservazioni puntuali:

- **Righe del Sommario troppo povere** — mancavano le statistiche essenziali, il Trail Score e
  un'anteprima del tracciato che c'erano nella vecchia griglia (`app/percorsi/page.tsx`, la stessa
  card riusata anche dal vecchio `/diari/[id]`). Righe riscritte: miniatura 56×56 con
  `RouteThumb`, km/dislivello, badge Trail Score. Il Trail Score non era esposto da
  `/api/diaries/[id]` — aggiunta `trailScore` a `DiarioPercorsoRow` (colonna già esistente,
  `planned_hikes.cached_ts_total`, nessun ricalcolo nuovo).
- **La pagina di riepilogo del Percorso con "Apri la Guida" è un tap in più inutile** — il tap
  dalla riga del Sommario va ora dritto a `.../guida/il_percorso`, non più alla pagina di
  riepilogo. Quella pagina non sparisce (ci vive ancora il pannello di generazione bulk e "Le tue
  uscite"): il CTA "Apri la Guida" è stato ridotto da pulsante pieno a link secondario, e resta
  raggiungibile da ogni pagina di Guida tramite un pallino extra "Reportage" aggiunto in coda ai
  pallini di sezione (`GuideBookPage.tsx`) — così un Percorso con 0 uscite non perde comunque
  l'accesso a quella pagina. Riga del Sommario ridisegnata di conseguenza: l'area principale
  (miniatura+titolo+dati) è un `<Link>` verso la Guida, il badge "N uscite"/"in programma" è un
  `<Link>` **sorella** separata verso il riepilogo (non annidata — due `<a>` nello stesso HTML
  sarebbero non validi).
- **"Muri di testo" nelle sezioni della Guida** — il corpo era un singolo `<p>` con
  `whiteSpace:'pre-wrap'`. Sostituito con `components/editorial/MagazineBody.tsx`, lo stesso
  componente già usato dal lettore classico (via `SectionCard.tsx`): paragrafo di apertura in
  corsivo, resto diviso in `<p>` veri, callout `[curiosita]`/`[avviso]` riconosciuti — riuso, non
  una riscrittura. Stesso trattamento anche per i capitoli narrativi del Reportage
  (`ReportBookPage.tsx`), stesso difetto.
- **Banner Meteo a sfondo bianco stonava sulla pergamena** — l'utente ha indicato esplicitamente
  la preferenza: un tono più scuro della pergamena, non lo stesso bianco del lettore classico.
  Aggiunto un prop opzionale `panelClassName` a `WeatherWidget.tsx` (tutti e tre i suoi modi:
  historical/forecast/planned) che sovrascrive lo sfondo bianco di default — additivo, il lettore
  classico (GuideReader/ResocontoHub) non lo passa e resta bianco com'era. `GuideBookPage.tsx` lo
  valorizza a un tono pergamena più scuro (`#f1e9d2` su bordo `#e4d9bd`, stessi toni di
  `BookPage.tsx`).
- **Copertine dei Diari: foto e testi personalizzabili, "riviste di settore"** — la personalizzazione
  **esiste già**: `/diari/[id]/pubblica` ha da tempo l'upload della foto di copertina e l'editing di
  titolo/sottotitolo/autore (`app/diari/[id]/pubblica/page.tsx`, righe ~527-570), e scrive nelle
  stesse colonne (`diaries.title/subtitle/author/cover_url`) che lo scaffale e l'indice già
  leggono — non serviva un editor nuovo, solo renderla raggiungibile da dove si vede la copertina.
  Aggiunto un link discreto "Personalizza copertina" su ogni copertina dello scaffale, verso quella
  stessa pagina (un `<Link>` sorella di "Apri Diario", non annidata).
- **Non fatto — richiede una decisione, non solo un cambiamento di stile**: creare un nuovo Diario.
  Non esiste da nessuna parte nell'app reale (nessun `POST /api/diaries`, nessuna UI, in nessuna
  delle due versioni, classica o a libro) — è una funzione mai costruita, non solo assente dallo
  scaffale a libro. Prima di costruirla va deciso se multi-Diario è libero per tutti o gated per
  tier (`subscriptionTier` esiste già in `user_settings` ma nessun limite sul numero di Diari è mai
  stato implementato altrove) — **chiesto all'utente, risposta in sospeso**.

## File critici
- `components/guida/GuideReader.tsx`, `components/resoconto/ReportReader.tsx` — sorgente da cui
  estratto in Fase 0, non riscritti.
- `app/guida/GuidaHub.tsx`, `app/resoconto/ResocontoHub.tsx`, `components/routehub/RouteHub.tsx` —
  riferimento per Fase 1, non toccati (semantica da carosello incompatibile col libro).
- `app/diari/[id]/percorsi/[percorsoId]/page.tsx` — punto di ingresso da riprogettare in Fase 3
  (oggi ancora `<GuidaHub id={percorsoId} />` + `<ReportageSection>`, invariato).
- `lib/designTokens.ts` — fonte dei token font/palette riusata in `BookPage.tsx`.
- `lib/guida/guideDisplaySections.tsx`, `lib/resoconto/reportDisplaySections.tsx` — l'estrazione di
  Fase 0, punto unico di verità per il dispatch dei widget.
- `app/diari/[id]/percorsi/[percorsoId]/useGuidaBookData.ts`,
  `.../reportage/[activityId]/useReportageBookData.ts` — i loader di Fase 1.
- `components/libro/BookPage.tsx`, `GuideBookPage.tsx`, `ReportBookPage.tsx` — il guscio di Fase 2;
  `ReportBookPage.tsx` ha in più il prop `onInvalidPageIndex` aggiunto in Fase 3.
- `components/libro/GuideGenerationPanel.tsx`, `ReportGenerationPanel.tsx` — i pannelli di Fase 3.
- `app/diari/[id]/percorsi/[percorsoId]/page.tsx`,
  `.../guida/[sectionKey]/page.tsx`, `.../reportage/[activityId]/page.tsx`,
  `.../reportage/[activityId]/sezione/[n]/page.tsx` — il routing di Fase 3.
- `lib/diario/useDiarioTitle.ts` — titolo del Diario per la running head, Fase 3.
- `components/editorial/SectionCard.tsx` — `ApprofondisciTrigger` riesportato per Fase 5, non
  duplicato.
- `app/diari/page.tsx`, `app/diari/[id]/page.tsx` — scaffale e indice, Fase 5: contengono sia la
  versione `*Classico` (invariata, a flag spento) sia quella a libro (`DiariPageLibro`/
  `DiarioIndexLibro`); Fase 6 ha riscritto le righe del Sommario (stats/CTS/link doppio) e aggiunto
  "Personalizza copertina" allo scaffale.
- `components/editorial/MagazineBody.tsx` — riusato in Fase 6 da `GuideBookPage.tsx`/
  `ReportBookPage.tsx` per la suddivisione in paragrafi, non toccato.
- `components/WeatherWidget.tsx` — nuovo prop opzionale `panelClassName` (Fase 6), additivo, non
  usato dal lettore classico.
- `app/api/diaries/[id]/route.ts` — `DiarioPercorsoRow.trailScore` aggiunto in Fase 6.
- `app/diari/[id]/pubblica/page.tsx` — non toccato in Fase 6, solo scoperto: già ha l'editing di
  foto/titolo/sottotitolo/autore del Diario che la Fase 6 rende raggiungibile dallo scaffale.

## Verifica
- Fase 0-2: `tsc --noEmit`, `eslint`, `npm run build` (la build fallisce nella sandbox corrente per
  variabili d'ambiente Supabase assenti — stesso fallimento anche sul branch non modificato,
  confermato con uno stash-and-rebuild — non è un errore introdotto da questo lavoro).
- Fase 3+: da fare in un ambiente con credenziali Supabase reali — Playwright end-to-end sul flusso
  completo: apri un Diario → apri un Percorso → sfoglia tutte le sezioni Guida presenti (gate di
  presenza identico a quello validato nel mockup) → apri un Reportage → sfoglia le sue sezioni →
  verifica che ogni link "Apri in modalità classica" porti alla schermata classica invariata.
- Confronto visivo con l'artifact del mockup (`2e1f7d0a-5d69-4e17-9c8b-038aa651e13b`) come
  riferimento di accettazione per ogni schermata — include il Diario "Dati reali dal database" già
  nel mockup (Faggeta del Cimino / Sentiero Valloni), utile anche come fixture di test con contenuto
  vero invece che fittizio.
- Prima del cutover del flag (Fase 4): verifica manuale della tabella "chrome extra-loop" — ogni
  voce elencata sopra deve avere una casella assegnata (riepilogo pagina, ogni pagina del libro, o
  link modalità classica), nessuna lasciata cadere in silenzio.

## Stato di avanzamento e continuazione

Vedi la history di questo branch per il dettaglio commit-per-commit. In sintesi, al momento in cui
questo file è stato scritto:

- **Fatto e pushato** su `claude/dtrek-diary-focal-point-sziwkj`: Fase 0 (`2b470b2`), Fase 1
  (`5dbf5e7`), Fase 2 (`f964924`, include due correzioni a Fase 1 trovate scrivendo Fase 2:
  `useGuidaBookData` non esponeva `isLinearRoute`/`endPoint`/`returnOptions` — calcolati
  internamente da `GuideReader.tsx`, non passati da `GuidaHub` — e `useReportageBookData` non
  recuperava affatto il testo del Resoconto, `hike_reports.content`, un fetch a sé rispetto a
  `StoredActivity`).
- Quei quattro commit non erano mai stati portati oltre `claude/dtrek-diary-focal-point-sziwkj`
  (né in `main`, né sul branch di routing `claude/dtrek-diary-routing-p1b5ou` da cui questa sessione
  è ripartita) — recuperati con un merge all'inizio di questa sessione prima di riprendere il piano.
- **Fatto in questa sessione** (branch `claude/dtrek-diary-routing-p1b5ou`, poi ripartito da `main`
  due volte dopo ogni merge — vedi nota sotto): Fase 3 (routing), Fase 4 (flag di rollout) e Fase 5
  (feedback dopo la prima verifica a schermo: "Approfondisci con Giulia" nelle sezioni, layout di
  scaffale/indice) — vedi le rispettive sezioni sopra per il dettaglio completo di cosa è stato
  costruito e cosa deliberatamente rimandato.
- **Merge**: Fase 3+4 → PR #786, "Approfondisci con Giulia" nelle sezioni → PR #787, entrambe
  mergiate in `main` (CI verde: `lint-typecheck-test` + Vercel). Dopo ogni merge il branch è stato
  riavviato da `main` (`git checkout -B` + stash) invece di continuare sul branch già mergiato, per
  seguire la convenzione di questo progetto (una PR già mergiata non va più allungata).
- **Verifica fatta in questa sessione**: `tsc --noEmit` ed `eslint` puliti sull'intero progetto dopo
  ogni fase (0 errori in tutti i casi; solo warning preesistenti non introdotti da questo lavoro —
  65 al momento, uno in più delle 64 di partenza per il nuovo `<img>` di copertina nello scaffale,
  stessa convenzione già in uso altrove nell'app).
- **Trovato durante Fase 5**: il mockup validato (`2e1f7d0a-5d69-4e17-9c8b-038aa651e13b`) esiste
  ancora come artifact pubblicato — non serve ricostruire lo scaffale/indice a memoria, la specifica
  visiva completa (classi CSS, struttura HTML) è lì.
- **Mai verificato a schermo**: nessuna delle pagine scritte in questa sessione (Fase 3-5) è stata
  vista renderizzata con dati reali in QUESTA sandbox (nessuna credenziale Supabase). L'utente ha
  però eseguito la migrazione di Fase 4 e verificato il flusso Fase 3-4 sul proprio ambiente reale
  prima di chiedere i due ritocchi di Fase 5 — quei due ritocchi stessi non sono stati ancora
  riverificati a schermo dopo essere stati scritti.
- **Prossimo passo — sull'ambiente reale**: verificare a schermo i due cambi di Fase 5 (trigger
  inline nelle sezioni, nuovo scaffale/indice a libro) sullo stesso account con il flag già acceso,
  poi decidere se/quando flippare il default del flag a `true` per tutti.
