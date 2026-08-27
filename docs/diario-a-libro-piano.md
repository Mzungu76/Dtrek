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
- **Creare un nuovo Diario** — non esisteva da nessuna parte nell'app reale (nessun `POST
  /api/diaries`, nessuna UI). Decisione dell'utente: il Diario di default resta incluso per tutti
  (non passa da questa route — esiste già dal backfill), Diari aggiuntivi solo per chi ha
  sbloccato Dtrek. `POST /api/diaries` (nuovo) conta i Diari esistenti e, se ≥1, verifica
  `resolveDtrekEntitlement(user.id).unlocked` (stessa risoluzione centrale di ogni altro gate —
  Premium, BYOK o owner — non un controllo nuovo inventato qui) prima di creare la riga; risponde
  403 con un messaggio se non sbloccato. Il nuovo Diario nasce con un titolo segnaposto ("Nuovo
  Diario") — l'utente lo rinomina da "Personalizza copertina" sulla copertina appena creata,
  riusando l'editor di `/pubblica` già esistente invece di costruirne uno per la creazione. Tessera
  "+ Nuovo Diario" (`NewDiarioTile` in `app/diari/page.tsx`) solo nello scaffale a libro — quello
  classico resta esattamente com'era, mai avendo avuto questa funzione.

**Fase 7 — Riga del Sommario: riuso della vera card di "Tutti i percorsi"** ✅ **COMPLETATA**

L'utente ha allegato due screenshot: la riga del Sommario (Fase 6) contro la card di
`ExpandedGalleryList.tsx` ("Tutti i percorsi", il pannello a comparsa scuro di GuidaHub/RouteHub)
— chiedendo la stessa ricchezza dati, ricolorata per la pergamena invece del suo sfondo scuro.
Confrontando i due componenti: quella card usa `GalleryMapThumb` (vera mappa Leaflet, lazy via
IntersectionObserver — non l'anteprima SVG astratta di `RouteThumb` usata finora qui),
`TrailScoreGaugeBadge` (anello Trail Score+Sicurezza) ed etichetta idoneità/rischio da
`ctsLabel()` — tutti dati già cachati su `planned_hikes` (nessuna chiamata live nuova, la stessa
euristica "solo colonne già in tabella" del resto del piano):
- `/api/diaries/[id]` ora seleziona anche `altitude_max`, `estimated_time_seconds`,
  `cached_safety_score` — `DiarioPercorsoRow` guadagna `altitudeMax`, `estimatedTimeSeconds`,
  `safety: SafetyPreview | null` (stesso sottoinsieme overall/color/label già usato da
  `RouteHubItem.safetyPreview` in `app/guida/GuidaHub.tsx`, non un tipo nuovo).
- La riga in `app/diari/[id]/page.tsx` riusa `GalleryMapThumb` e `TrailScoreGaugeBadge`
  (`dark={false}`, per la card chiara — lo stesso prop già usato da "Dati e sicurezza"/"Dati e
  punteggi") direttamente, non li reimplementa; solo i colori/testo intorno sono pergamena.
- **Non incluso**: la distanza "in auto" mostrata da quella card viene da `useDrivingDistance`,
  calcolata dal vivo (geocoding+indicazioni) — fattibile per un solo percorso aperto, non per un
  elenco di 56 senza N chiamate live per pagina. Omessa, non finta.

**Fase 8 — Ricerca e filtri nel Sommario** ✅ **COMPLETATA**

Richiesta esplicita: "tutti i filtri e la ricerca come nell'elenco precedente" — stessi controlli
di `ExpandedGalleryList.tsx`, non solo la card della riga (Fase 7). Aggiunti alla pagina Sommario
(`DiarioIndexLibro`), client-side su `detail.percorsi` già caricato per intero (nessuna nuova
chiamata di rete per filtrare/ordinare):
- Campo di ricerca per titolo (stesso comportamento di `app/percorsi/page.tsx`: sottostringa,
  case-insensitive).
- Filtro "solo preferiti" (stella) — nuovo campo `favorite` su `DiarioPercorsoRow`
  (`planned_hikes.favorite`, colonna già esistente, stesso concetto del filtro a stella di
  GuidaHub).
- Ordinamento Data/Km/D+/TS, stessa etichetta e stesso significato di
  `SORT_OPTIONS_BY_MODE.guida` in `components/routehub/BottomGallery.tsx` — non riesportate da lì
  perché quell'array include anche `rating` (Resoconto) e `distance`, entrambi non pertinenti o
  non disponibili qui; "Data" è l'ordine con cui l'API restituisce già i percorsi
  (`created_at desc`), non un ordinamento aggiuntivo.
- **Non incluso** (deliberatamente, stesso principio di Fase 7): l'opzione di ordinamento
  "Distanza" (richiede `useDrivingDistance`, dal vivo) e la sotto-sezione "Prossima uscita" dei
  preferiti (specifica del carosello a swipe, non richiesta per il Sommario).

**Fase 9 — Sommario: allineamento CTS, filtro di stato, evidenza uscite, ordine invertibile** ✅ **COMPLETATA**

Feedback dopo altri screenshot: l'anello Trail Score non era allineato in verticale da una riga
all'altra (dipendeva da quanto testo aveva l'etichetta di stato a destra, "N uscite" vs "in
programma", entrambe a larghezza libera dentro lo stesso flexbox). In `app/diari/[id]/page.tsx`:
- Sia la colonna dell'anello TS sia quella dello stato a destra hanno ora una larghezza fissa
  (`w-10` / `width: 82`), non più "shrink-to-content" — l'anello resta quindi alla stessa distanza
  dal bordo destro su ogni riga, con o senza uscite.
- Nuovo filtro di stato (Tutti / In programma / Con uscita), stesso stile a pillola dei chip di
  ordinamento già presenti.
- Le righe con almeno un'uscita hanno ora uno sfondo tinteggiato (terra molto tenue,
  `rgba(192,90,23,0.07)`) — riconoscibili a colpo d'occhio, non solo dall'etichetta testuale.
- Ordinamento invertibile: nuovo toggle (icona freccia su/giù) applicato a qualunque criterio
  scelto, "Data" incluso — inverte l'array già filtrato/ordinato invece di aggiungere un
  comparatore per data (l'API lo restituisce già in `created_at desc`).

**Fase 10 — "Piega" del libro sul bordo sinistro** ✅ **COMPLETATA**

Richiesta: far percepire ogni schermata del Diario a libro come parte di un taccuino rilegato,
con una piega elegante sul bordo sinistro. Nuovo `components/libro/BookSpineShadow.tsx`: un
`<div>` fisso, largo 24px, con un gradiente statico (nessuna animazione, costo zero) che
scurisce verso il bordo sinistro — due varianti di colore (`light` per la pergamena, `dark` per
lo sfondo scuro dello scaffale), `pointer-events: none` per non intercettare mai tap/click.
Montato in `BookPage.tsx` (quindi automaticamente su Sommario/Guida/Reportage/`/pubblica`, tutte
le pagine che già usano quel guscio) e in `DiariPageLibro` (lo scaffale).

**Scoped deliberatamente alle sole schermate del Diario a libro**, non a tutta l'app: le altre
schermate (GuidaHub/ResocontoHub/RouteHub e il resto) restano fuori dal perimetro di questo piano
per la stessa decisione architetturale di sempre (vedi sopra) — hanno palette/sfondi propri con
cui una piega pensata per la pergamena o per lo scaffale scuro non è stata verificata. La pagina
di riepilogo del Percorso (`PercorsoPageLibro` in
`app/diari/[id]/percorsi/[percorsoId]/page.tsx`) non la riceve per lo stesso motivo: non usa
ancora la palette pergamena (è rimasta nello stile "app moderna" fin dalla Fase 6, un gap
preesistente non segnalato in questo giro di feedback).

**Fase 11 — Home dell'app: apertura sull'ultimo Diario, drawer per cambiarlo** ✅ **COMPLETATA**

Richiesta esplicita: rendere il Sommario (elenco Percorsi) la home dell'app, aprendo sull'ultimo
Diario visualizzato prima della chiusura precedente, con lo scaffale "I miei Diari" sempre
raggiungibile (non più il primo schermo, ma mai nascosto).

- Nuova colonna `user_settings.last_diary_id` (`supabase/migrations/add_last_diary_id.sql`, UUID,
  `ON DELETE SET NULL`, stesso pattern di `diario_libro_enabled`) — segue l'utente su ogni
  dispositivo invece di restare legato al browser (localStorage, l'alternativa scartata).
  `app/api/user-settings/route.ts` e `lib/sync/userSettingsStore.ts` esposti/aggiornati di
  conseguenza (`lastDiaryId`).
- `DiarioIndexLibro` (`app/diari/[id]/page.tsx`) scrive `lastDiaryId` a ogni caricamento riuscito
  del Sommario — solo dopo il caricamento, mai dall'id grezzo nell'URL, così un link vecchio o non
  più accessibile non può mai diventare il prossimo punto di apertura.
- `app/page.tsx` (`/`, la home) non fa più un redirect fisso lato server a `/diari`: a flag spento
  il comportamento resta identico a prima; a flag acceso legge `diarioLibroEnabled`+`lastDiaryId`
  (client-side, stesso pattern `getUserSettingsCached()` di ogni altra pagina gated di questo
  piano) e apre direttamente `/diari/[lastDiaryId]` — verificato contro l'elenco vero dei Diari
  (non fidandosi ciecamente del valore salvato: un Diario eliminato nel frattempo farebbe aprire
  un Sommario 404), con ricaduta sul Diario di default. `/diari` stesso (lo scaffale) resta
  invariato e sempre raggiungibile con la stessa URL di sempre — nessun redirect-loop possibile.
- Nuovo `components/libro/DiarioSwitcherDrawer.tsx` — drawer laterale (preferenza esplicita tra le
  opzioni proposte, invece di una bottom sheet) con l'elenco compatto di tutti i Diari (non le
  copertine ricche dello scaffale, quelle restano lì) e un link in fondo verso lo scaffale per la
  gestione completa (copertine, nuovo Diario). Aperto dal titolo in cima al Sommario: `BookPage.tsx`
  guadagna un prop opzionale `onTitleClick` che trasforma quel link in un bottone — usato solo da
  `DiarioIndexLibro` (dove `indexHref` punterebbe allo scaffale, ora raggiungibile solo da qui in
  poi); ogni altra pagina del libro (Guida/Reportage/pubblica) continua a navigare normalmente,
  invariata.

**Fase 12 — Copertine reali nel drawer, nello scaffale e in cima al Sommario** ✅ **COMPLETATA**

Richiesta dopo aver visto il drawer di Fase 11 con copertine vuote (icona segnalibro) anche per
"Il mio Diario" (56 percorsi, non certo un Diario nuovo). Causa reale, non un bug di questa
sessione: `diaries.cover_url` (letto da scaffale/drawer/Sommario) è sempre stato NULL per il
Diario di default di ogni utente — il backfill che l'ha creato (Fase 0 di "Diario come fulcro")
è avvenuto prima che esistesse `diaries` come tabella, quando l'unica copertina possibile era
quella del vecchio Diario singolo per utente, `user_settings.diary_config->>'coverUrl'`
(`add_diary_config.sql`) — mai migrata sul nuovo campo.

- Nuovo `supabase/migrations/backfill_default_diary_cover.sql`: copia quella foto (se esiste) su
  `diaries.cover_url` del Diario di default, solo dove `cover_url` è ancora NULL — idempotente,
  non tocca titolo/sottotitolo/autore (non richiesti), non sovrascrive mai una copertina già
  impostata dopo. Nessuna riga di codice applicativo cambiata per questo: `/api/diaries` e
  `/api/diaries/[id]` leggono già `cover_url` direttamente, il gap era solo nei dati.
- `DiarioSwitcherDrawer.tsx`: ogni riga guadagna un'icona a matita (link a
  `/diari/[id]/pubblica`, sibling del link che apre il Sommario — non annidato, stesso principio
  di `DiarioCoverCard` in `app/diari/page.tsx`). Non serve toccare la resa della copertina stessa
  (`d.coverUrl`): il codice la mostrava già correttamente, mancavano solo i dati (vedi sopra).
- `DiarioIndexLibro` (`app/diari/[id]/page.tsx`): la copertina del Diario (stesso
  `detail.coverUrl` di scaffale/drawer) compare ora accanto al titolo in cima al Sommario.
- Il titolo in cima alla pagina (il bottone che apre il drawer) mostra ora sempre "I miei Diari"
  invece del nome di questo Diario specifico — da quando apre un drawer con TUTTI i Diari,
  ripetere il nome di uno solo era fuorviante; il vero titolo del Diario resta subito sotto,
  nell'h1 della pagina, invariato.
- **Decisione deliberata, non una nuova pagina**: "Personalizza copertina" (matita nel drawer,
  già anche nello scaffale da Fase 6) continua a puntare a `/diari/[id]/pubblica` — quella pagina
  ha già, sempre visibili in una barra laterale fissa, sia il caricamento foto sia i testi
  (titolo/sottotitolo/autore): "ogni aspetto della copertina" richiesto è già interamente
  editabile lì, e infatti è la STESSA colonna `diaries.cover_url` che questo giro di feedback
  riguarda — costruire un editor dedicato più leggero avrebbe duplicato una funzione che esiste
  già e scrive esattamente nel campo giusto.

**Fase 13 — Pagina dedicata per la copertina, default coerente ovunque** ✅ **COMPLETATA**

Due correzioni dopo aver visto Fase 12 in uso: (1) la matita apriva `/pubblica`, l'intera console
di pubblicazione del libro (esportazione PDF, condivisione, statistiche, escursioni escluse) — non
quello che l'utente intendeva per "modificare la copertina"; (2) i placeholder senza foto erano
diversi da elenco a elenco (icona su panna nel drawer/Sommario, gradienti ciclici nello scaffale)
e nessuno dei due era "quella di default" che l'utente vede davvero — il verde con profilo di
montagne di `DiarioCover.tsx`, usato sulla copertina stampabile.

- Nuova pagina `/diari/[id]/copertina` (`app/diari/[id]/copertina/page.tsx`): foto, titolo,
  sottotitolo, autore — nient'altro. Stessa fonte dati di `/pubblica` (GET/PATCH
  `/api/diaries/[id]/config`, che legge/scrive le colonne di `diaries` — nessuna duplicazione di
  logica di salvataggio, "corpo sempre completo" mantenuto anche qui per non perdere le
  impostazioni di pubblicazione che questa pagina non tocca). Anteprima dal vivo con lo stesso
  componente `DiarioCover` della copertina stampabile (scalato, non un componente a sé), pulsanti
  "Cambia foto" e "Rimuovi foto" (torna al verde di default). `/pubblica` resta invariata (i suoi
  stessi controlli restano lì, un utente potrebbe già averci fatto l'abitudine) — solo i link da
  scaffale e drawer puntano ora qui.
- Nuovo `components/diario/DiarioCoverThumb.tsx`: la stessa miniatura (foto se presente, altrimenti
  il gradiente verde + profilo di montagne del default reale, semplificato per leggibilità a
  dimensioni piccole) riusata da scaffale (`DiarioCoverCard`), drawer (`DiarioSwitcherDrawer`) e
  cima del Sommario (`DiarioIndexLibro`) — prima ciascuno aveva il proprio placeholder, ora ce n'è
  uno solo, coerente con quanto stampato.

**Fase 14 — Riepilogo del Percorso eliminato, copertine con testo nel drawer e nel Sommario** ✅ **COMPLETATA**

Due richieste dopo aver visto Fase 13 in uso.

*Riepilogo del Percorso eliminato.* La pagina (copertina verde, "Apri la Guida"/"Apri in
modalità classica", pannello di generazione in blocco) non doveva più esistere. Decisioni prese
con l'utente per non perdere le due funzioni che ci vivevano:
- **"Le tue uscite" resta**, ma la pagina (`app/diari/[id]/percorsi/[percorsoId]/page.tsx`,
  `PercorsoPageLibro`) è ridotta a un titolo minimo (solo testo, niente riquadro) più l'elenco —
  niente CTA verso la Guida (già raggiunta da lì quando si arriva dal Sommario o dal pallino
  "Reportage" di una pagina di Guida, i due soli punti d'ingresso qui). Stessa URL di prima:
  badge "N uscite" del Sommario e pallino "Reportage" non sono cambiati.
- **La generazione in blocco non è stata eliminata** — spostata sulla prima pagina della Guida
  ("Il percorso", `components/libro/GuideBookPage.tsx`), l'unico punto sempre raggiungibile prima
  di aver letto qualunque sezione. `GuideGenerationPanel` guadagna un prop opzionale
  `panelClassName` (stesso pattern di `WeatherWidget` in Fase 6) per il tono pergamena invece del
  bianco/stone pensato per la pagina ora rimossa.

*Copertine con testo nel drawer e in cima al Sommario.* L'utente ha chiarito: quei due punti
devono mostrare "la riproduzione in piccolo dell'effettiva copertina" — non solo lo sfondo
(foto/gradiente) ma anche titolo/sottotitolo/autore, come la copertina vera. `DiarioCoverThumb`
guadagna una modalità con testo: quando riceve `width` + `title`, renderizza la stessa
`<DiarioCover>` scalata (stesso trucco già usato in `/diari/[id]/copertina`, ora centralizzato
qui e riusato anche da quella pagina invece di duplicato); senza `title` resta il comportamento
di Fase 13 (solo sfondo, 100% del contenitore) — usato ancora dallo scaffale (`DiarioCoverCard`),
che ha già il proprio riquadro di testo e raddoppierebbe altrimenti. `DiarioDetail` guadagna
`author` (colonna già esistente su `diaries`, non selezionata finora) per poter riprodurre
l'autore anche nella miniatura del Sommario.

**Fase 15 — Un solo link per riga nel Sommario, drawer "Strumenti del Percorso"** ✅ **COMPLETATA**

Tre richieste, la seconda e la terza legate insieme (il drawer è dove finisce l'elenco Reportage
che prima viveva sulla pagina eliminata).

*Sommario.* Miniatura mappa più grande (64→76px, l'altezza della riga segue), e un solo `<Link>`
per riga invece di due — prima la riga andava alla Guida ma l'etichetta di stato a destra era un
secondo link separato verso l'elenco Reportage. Ora tutta la riga va sempre alla Guida; l'etichetta
resta solo informativa ("N Reportage" invece di "N uscite" — la terminologia "uscita" non era mai
stata usata altrove nel libro, "Reportage" sì).

*Pagina di riepilogo del Percorso eliminata per davvero.* Dopo Fase 14 restava una pagina minima
("solo uscite"); ora non esiste più affatto in modalità libro — `PercorsoPageInner`
(`app/diari/[id]/percorsi/[percorsoId]/page.tsx`) fa un redirect immediato a
`{basePath}/guida/il_percorso` quando il flag è acceso, così un link vecchio (bookmark, storico
del browser) non mostra una pagina ormai vuota. La modalità classica (flag spento) non è toccata:
`PercorsoPageClassico`/`ReportageSection` restano esattamente come sempre stati.

*Nuovo drawer "Strumenti del Percorso"* (`components/libro/PercorsoToolsDrawer.tsx`), aperto dalla
pillola "Strumenti" (prima "Reportage") in ogni pagina di Guida — slide da destra, non da sinistra
come `DiarioSwitcherDrawer` (quello è navigazione tra Diari, questo sono azioni sul Percorso
corrente, meglio non confonderli visivamente). Contiene, tutti riusi diretti di funzioni già
esistenti altrove, **mai raggiungibili dal libro prima d'ora**:
- **Elenco Reportage** — stessa `/api/percorsi/[id]/reportage`, righe proprie in tono pergamena
  (non la stessa `ReportageSection`, rimasta bianco/stone per il lettore classico — duplicarne la
  resa qui è stato più semplice che parametrizzarne il tono).
- **Generazione in blocco** — lo stesso `<GuideGenerationPanel>` bulk. Fase 14 lo aveva messo solo
  sulla pagina "Il percorso"; qui è raggiungibile da qualunque sezione, quindi quel montaggio
  dedicato è stato rimosso (il drawer lo sostituisce, non lo affianca).
- **Esporta PDF/GPX** — stesse `exportGuidePdf`/`exportPlannedHikeToGpx` di `app/guida/GuidaHub.tsx`,
  mai passate dal libro.
- **Video 3D** — stesso `<RouteMap3D>` di GuidaHub. Scoperta scrivendo questa fase: il prop
  `onOpenMap3D` di `GuideBookPage.tsx` esisteva già (passato ai widget) ma nessuna route lo
  valorizzava mai — restava sempre `undefined`, quindi il bottone 3D dentro "Il percorso" non ha
  mai funzionato nel libro. Ora `GuideBookPage` tiene lo stato e monta `RouteMap3D` lei stessa
  (stesso import dinamico `ssr:false` di GuidaHub — MapLibre non è compatibile col rendering
  server), il drawer si limita ad aprirlo.
- **"Apri in modalità classica"** — esisteva sulla pagina di riepilogo ora eliminata, ricollocato
  qui.
- **Non incluso** (deciso con l'utente): la condivisione di un singolo Percorso non esiste da
  nessuna parte nell'app (solo Reportage/statistiche hanno un "Condividi", `ShareModal.tsx`) — è
  una funzione nuova da progettare a sé, rimandata.

`BookPage.tsx`'s `BookPageSection` accetta ora `onClick` in alternativa a `href` (mai entrambi) —
la pillola "Strumenti" apre il drawer sul posto invece di navigare. `GuideBookPage` guadagna un
prop `diarioHref` esplicito: il titolo in testata portava alla pagina di riepilogo ora eliminata,
ora va al Sommario del Diario (non esiste più un "indice" a livello di Percorso). Il riepilogo del
Reportage (`.../reportage/[activityId]/page.tsx`, pagina diversa e ancora esistente — mostra le
statistiche di UNA uscita, non l'elenco) aveva anch'esso un link "Torna al Percorso" verso la
pagina eliminata: ora porta alla Guida, rietichettato "Torna alla Guida".

**Fase 16 — Pannello di generazione in blocco ripulito, copertine in miniatura corrette** ✅ **COMPLETATA**

Due difetti visivi segnalati dopo aver visto il drawer "Strumenti" (Fase 15) e le copertine con
testo (Fase 14) in uso.

*Pannello "Genera tutta la guida".* Da quando la pagina di riepilogo del Percorso non esiste più,
`GuideGenerationPanel` in modalità bulk (senza `sectionKey`) è montato SOLO dentro
`PercorsoToolsDrawer.tsx` — verificato con una ricerca mirata prima di toccare nulla, per essere
sicuri di non rompere un altro chiamante. La card bianca con icona a cerchio (`PanelShell`,
pensata per il vecchio riepilogo in stile "app moderna") stonava nel drawer pergamena, l'utente
l'ha trovata "non conforme al layout attuale". Riscritto senza riquadro proprio: chip di lunghezza
testo nello stesso stile a pillola dei filtri del Sommario (terra attivo/pergamena chiaro
inattivo), pulsanti "Genera"/"Rigenera" nello stesso stile piatto (`ToolButton`) delle altre righe
del drawer (Esporta PDF, Esporta GPX, Video 3D) — nessun elemento visivo nuovo, solo pattern già
in uso altrove nello stesso drawer/Sommario. `panelClassName` (nato apposta in Fase 15 per questo
tono) rimosso: con un solo chiamante rimasto e senza più un riquadro da colorare, non serviva più.

*Copertine in miniatura spostate verso il basso.* `DiarioCoverThumb` in modalità "con testo"
(drawer, cima del Sommario) riproduce `<DiarioCover>` scalata — quel componente ha però un
`margin: '24px auto'` proprio, pensato per la sua vetrina a schermo intero su `/pubblica` e
`/diari/[id]/copertina` (dove c'è spazio intorno). Ritagliata in una miniatura con
`overflow:hidden`, quel margine spingeva la copertina verso il basso lasciando un vuoto vuoto in
cima e tagliando il fondo. Corretto con un `translateY(-24px)` nella stessa `transform` di scala
(le unità sono quelle vere del contenuto non ancora scalato, si annulla esattamente indipendentemente
dalla dimensione della miniatura). Stesso fix per tutti e tre i punti che usano quella modalità
(drawer, Sommario, e l'anteprima di `/diari/[id]/copertina`, che riusa lo stesso componente).

**Fase 17 — Menù inferiore, prime fondamenta della direzione "taccuino topografico"** ✅ **COMPLETATA**

Prima di questa fase l'utente ha chiesto un mockup (non nel repo — canvas Claude Design pubblicato
a parte) per due proposte: un menù di navigazione fisso in basso al posto dei collegamenti sparsi
di oggi, e una variante di stile "taccuino da campo disegnato a mano" per l'intera estetica del
libro. Approvate entrambe: il menù inferiore va costruito subito nello stile pergamena attuale
(questa fase); il taccuino è una direzione futura da integrare gradualmente, non un redesign
immediato — qui nasce solo il file di token su cui si costruirà.

*Menù inferiore.* L'utente aveva segnalato incoerenza: il titolo in testata faceva doppio uso
(link o apertura del drawer Diari a seconda della pagina), la pillola "Strumenti" viveva in mezzo
alle sezioni della Guida, prev/next stavano in un footer a sé — tre paradigmi diversi per spostarsi.
`BookPage.tsx` ha ora una barra fissa in fondo, uguale su ogni pagina del libro: **Indietro /
Indice / Strumenti / Avanti**.
- La testata in cima è ora **solo informativa** (titolo del Diario, sezione, numero di pagina) —
  non più cliccabile. `onTitleClick` è diventato `onIndexClick`, spostato dal titolo al nuovo
  bottone "Indice"; sul Sommario continua ad aprire `DiarioSwitcherDrawer` (Fase 11), altrove
  naviga a `indexHref` come prima.
- "Strumenti" è un bottone opzionale (prop `onToolsClick`) — presente solo dove esiste
  `PercorsoToolsDrawer.tsx` (le pagine di Guida), assente su Sommario/Reportage.
- La striscia di pillole per le sezioni della Guida **resta invariata** — indice dei contenuti
  della pagina corrente, non navigazione dell'app: non c'entra con l'incoerenza segnalata.
- `BookPageSection.onClick` (aggiunto in Fase 15 solo per la pillola "Strumenti", ora rimossa da
  lì) è stato tolto: nessun altro chiamante lo usava, tenerlo sarebbe stata capacità morta.

*Prime fondamenta del taccuino.* Nuovo `lib/taccuinoTokens.tsx` — palette carta/inchiostro,
l'accento riusa la scala `TERRA` esistente (non un colore nuovo), il font `Kalam` (self-hosted in
`app/layout.tsx` come gli altri, variabile `--font-kalam`) per titoli/annotazioni scritte a mano,
il testo narrativo resta su `FONT.lora` esistente — un vero taccuino ha contenuto preciso e note a
margine personali, non tutto scritto a mano allo stesso modo. Include anche `HandWobbleFilter` +
`useHandWobbleId` (il filtro SVG per il tratto "a mano" validato nel mockup, con id univoco per
evitare collisioni tra istanze sulla stessa pagina). **Deliberatamente non ancora usato da nessun
componente reale** — è la base su cui costruire, schermata per schermata, nelle prossime fasi;
tenerlo separato da `lib/designTokens.ts` (che serve l'intera app nell'estetica attuale) evita di
mescolare una direzione non ancora applicata da nessuna parte con quella in produzione.

**Fase 18 — Il bottone "Diari" sostituisce il drawer, scaffale ridisegnato in taccuino** ✅ **COMPLETATA**

L'utente ha segnalato, guardando il Sommario a schermo: il bottone "Indice" della barra inferiore
apriva `DiarioSwitcherDrawer` (Fase 11) invece di portare davvero allo scaffale — ma con lo
scaffale stesso migliorato (griglia, ricerca), quel drawer duplica una destinazione che ora vale la
pena raggiungere per intero. "In questo contesto il Tab laterale non ha più molto senso."

*Bottone "Diari".* `BookPage.tsx`: `onIndexClick` rimosso (un solo chiamante, il Sommario), il
bottone "Indice"/"Diari" torna a essere sempre un `<Link href={indexHref}>` semplice; nuova prop
opzionale `indexLabel` (default `"Indice"`) per l'etichetta — il Sommario passa `indexLabel="Diari"`
perché lì porta allo scaffale, non al proprio stesso indice. `DiarioSwitcherDrawer.tsx` eliminato
(zero chiamanti rimasti dopo questo cambio, non teneva capacità morta).

*Scaffale in stile taccuino* (`app/diari/page.tsx`, `DiariPageLibro`) — primo uso reale di
`lib/taccuinoTokens.tsx`, finora solo fondamenta inutilizzate (Fase 17):
- Sfondo scuro immersivo → carta invecchiata (`TACCUINO_PAPER`, due macchie sfumate agli angoli),
  `BookSpineShadow` da `dark` a `light`. I dorsi lucidi delle copertine restano invariati — libri
  scuri su un tavolo di carta chiara invece che su uno scaffale in penombra, solo l'ombra di ogni
  copertina è stata scaldata (era pensata per un fondo scuro).
- Titolo "I miei Diari" sul font `Kalam` (`FONT_KALAM`) — prima annotazione a mano reale nell'app,
  il resto dei testi (eyebrow, corpo) resta sui font esistenti.
- Riga scorrevole orizzontale → griglia verticale `grid-cols-2`, più righe: la larghezza di ogni
  cella (~165px su mobile con questo padding/gap) è praticamente identica ai 168px fissi di prima,
  nessun ridimensionamento interno alle card necessario.
- Nuovo `GlobalRouteSearch`: ricerca testuale su tutti i Percorsi (stessa `/api/percorsi` di
  "Tutti i Percorsi"), risultati (max 8, per titolo o Diario) mostrati senza lasciare lo scaffale —
  prima l'unico modo era uscire verso quella pagina a sé. Il link a quella pagina resta, spostato
  sotto la ricerca (era subito sotto la riga di copertine).
- `<Navbar/>` (tab Diario/Percorsi/Resoconti) **non toccata** — la richiesta di rimuovere "il Tab
  laterale" riguardava il drawer (`DiarioSwitcherDrawer`, il pannello che scorre lateralmente), non
  la barra di navigazione classica in cima, che resta come sempre.

**Fase 19 — Via anche la Navbar classica dallo scaffale; Caveat al posto di Kalam** ✅ **COMPLETATA**

Vista la Fase 18 a schermo, l'utente ha chiesto di andare oltre: niente più `<Navbar/>` (le tab
Diario/Percorsi/Resoconti in cima) nemmeno sullo scaffale — "voglio passare definitivamente al
nuovo layout e abbandonare quello precedente". Rimozione **solo su questa pagina** (`DiariPageLibro`
in `app/diari/page.tsx`): `DiariPageClassico` e le altre pagine ancora nel vecchio chrome (es.
`/percorsi`) non sono toccate, non è un cambio del componente `Navbar` condiviso. `MOBILE_TOPBAR_SPACER`
(il padding-top pensato per compensare la Navbar fissa) va via con lei; al suo posto un
padding-top minimo con `env(safe-area-inset-top)` per il notch, stesso principio già usato in
fondo da `BOTTOM_BAR_SPACER` in `BookPage.tsx`.

Contestualmente, richiesta di provare `Caveat` al posto di `Kalam` per il tratto a mano (font
ancora in valutazione, non una scelta finale). Rinominati i token da `FONT_KALAM`/`FONT_VAR_KALAM`
a `FONT_HAND`/`FONT_VAR_HAND` in `lib/taccuinoTokens.tsx` — nome legato al ruolo (il font scritto a
mano) non al font specifico dietro, per non dover rinominare di nuovo a un prossimo cambio.
`app/layout.tsx`: `Kalam` → `Caveat` da `next/font/google`, variabile `--font-kalam` →
`--font-caveat`.

**Fase 20 — Il Sommario (elenco Percorsi di un Diario) in stile taccuino** ✅ **COMPLETATA**

Continuazione dell'integrazione graduale: dopo lo scaffale (Fase 18), il Sommario di un singolo
Diario (`app/diari/[id]/page.tsx`, `DiarioIndexLibro`) — richiesto esplicitamente dall'utente come
prossimo passo.

*`BookPage.tsx` guadagna una prop `theme`.* Invece di duplicare il guscio (header sticky, striscia
sezioni, barra inferiore, spacer) in una seconda versione taccuino, `BookPage` accetta ora
`theme?: 'pergamena' | 'taccuino'` (default `'pergamena'`, invariato per tutti i chiamanti
esistenti — `GuideBookPage.tsx`, `ReportBookPage.tsx` non lo passano, restano pergamena). I sei
colori locali (sfondo pagina, hairline, due toni di inchiostro muto, sfondo/testo delle pillole)
diventano un oggetto per tema; il markup non cambia, cambiano solo i valori.

*Il Sommario stesso* passa `theme="taccuino"` e sostituisce tutti i toni pergamena hardcoded nel
proprio contenuto (ricerca, filtri, righe dei Percorsi, link pubblicazione, schermate di
caricamento/errore) con `TACCUINO_PAPER`/`TACCUINO_INK` — alcune coppie di toni pergamena molto
vicini (es. due sfumature di hairline, due di inchiostro muto) sono confluite nello stesso token
taccuino, una consolidazione deliberata: il taccuino ha una palette più contenuta della pergamena.
Il titolo del Diario passa a `FONT_HAND` (come "I miei Diari" sullo scaffale) — stesso principio,
titoli a mano/corpo tipografico, applicato qui alla seconda pagina reale.

**Fase 21 — Fedeltà al mockup: texture, piega, rotazioni, non solo la palette** ✅ **COMPLETATA**

Verificata a schermo, la Fase 20 non assomigliava al mockup (`taccuino-canvas/SommarioTaccuino.dc.html`,
non nel repo) — solo la palette era cambiata, non la texture di carta, la piega disegnata a mano, le
rotazioni "imperfette" o l'uso diffuso del font a mano che danno al mockup la sua identità. Corretto
punto per punto contro il mockup:

- **`lib/taccuinoTokens.tsx`** — `HandWobbleFilter` guadagna `baseFrequency`/`scale` opzionali (prima
  fissi, pensati per un solo caso d'uso); nuovi `TaccuinoPaperTexture` (macchie sfumate + linee di
  livello disegnate a mano, `fixed`, dietro al contenuto, z-index negativo) e `TaccuinoSpineShadow`
  (piega con lo stesso tremore invece del gradiente lineare piatto di `BookSpineShadow`, un lato
  `left`/`right` per la futura alternanza sfogliando). Nuovo token `TACCUINO_PAPER.highlight`
  (evidenziatore caldo per righe importanti, sempre con opacità in coda — mai a piena tinta).
- **`BookPage.tsx`** — col tema "taccuino" monta `TaccuinoPaperTexture`/`TaccuinoSpineShadow` al
  posto di `BookSpineShadow`; il tema "pergamena" resta identico a prima.
- **`components/RouteThumb.tsx`** — `strokeDasharray`/`filter` opzionali (default assenti, nessun
  chiamante esistente cambia aspetto): permettono di ricalcare a mano la traccia REALE di un
  percorso invece di disegnarne una finta, riusando la stessa normalizzazione delle coordinate.
- **`app/diari/[id]/page.tsx`** — copertina come tassello incollato (bordo + ombra sfalsata 2px/3px
  + rotazione); titolo, sottotitolo, pulsante "nuovo percorso", chip di filtro/ordinamento e righe
  dei Percorsi passano al font a mano (prima solo il titolo); chip da "pillola piena" a "contorno
  attivo/testo semplice inattivo" (mockup); miniatura di ogni percorso da `GalleryMapThumb` (mappa
  pulita) a `RouteThumb` con tratteggio e tremore condiviso (un solo filtro montato in cima alla
  pagina, referenziato da ogni riga — mai un filtro duplicato per riga); divisore riga da punteggiato
  a tratteggiato; evidenziazione dei percorsi con un Reportage passata dal tinteggio arancio-accento
  al colore "evidenziatore" del mockup; spunta disegnata (icona `Check`) prima di "N reportage".
  Rotazioni tenute solo su titolo/pulsante/copertina, non sulle righe dell'elenco (a quella densità
  avrebbe reso illeggibile invece che artigianale).

**Fase 22 — Torna la vera mappa OSM nelle righe, ricolorata invece che astratta** ✅ **COMPLETATA**

Verificata a schermo la Fase 21, due segnalazioni sulla stessa riga dell'elenco Percorsi:

1. Titolo, statistiche ed etichetta di stato di ogni riga non si vedevano più — presenti nel DOM
   (verificato con un rendering isolato della riga fuori dall'app, bypassando l'autenticazione via
   `isSharedContentPath`/`isPublicPath`, `lib/publicPaths.ts`), ma non a schermo. La causa più
   probabile individuata: `RouteThumb` con `filter="url(#...)"` (Fase 21, `feTurbulence`/
   `feDisplacementMap`) dentro un contenitore `overflow:hidden` adiacente al testo — un bug di
   compositing GPU non raro su Android/Chromium con filtri SVG in questa combinazione, che può
   corrompere il rendering di contenuto adiacente invece che solo dell'elemento filtrato. Non
   riprodotto con certezza assoluta (serve un dispositivo Android reale per confermarlo), ma
   sufficientemente verosimile da giustificare la rimozione preventiva del filtro SVG da un
   elemento di lista ripetuto N volte per pagina.
2. Richiesta esplicita: la miniatura di ogni percorso deve tornare a essere la vera mappa OSM
   (roads, terreno — un'informazione reale, dove si trova il percorso), non un disegno astratto,
   ma con i toni scaldati verso la palette taccuino invece del blu/verde standard della mappa.

Le due correzioni convergono sulla stessa modifica: `GalleryMapThumb` (mappa Leaflet reale, invariata
— stessa usata dalla galleria Guida/Resoconto, `components/routehub/BottomGallery.tsx`) torna al
posto di `RouteThumb`+filtro SVG. La ricolorazione usa un `filter` **CSS** (`sepia() saturate()
hue-rotate() brightness() contrast()`) sul contenitore della miniatura, non un filtro SVG — stesso
risultato (le tile prendono i toni caldi del taccuino), ma un meccanismo di rendering completamente
diverso (raster, non SVG `feDisplacementMap`) e non applicato al componente `GalleryMapThumb` stesso
(che resta neutro per i suoi altri usi, es. la galleria non-taccuino). `RouteThumb`, `useHandWobbleId`
e `HandWobbleFilter` restano nel repo (altri usi legittimi, es. la ricerca globale dello scaffale non
usa filtri SVG) — solo questa riga smette di combinarli nel modo sospetto.

**Fase 23 — Trovata e corretta la causa reale: il filtro sullo sfondo, non sulle miniature** ✅ **COMPLETATA**

La Fase 22 non ha risolto: l'utente ha rimandato lo stesso schermo, testo ancora invisibile. Questa
volta isolato con certezza, non per ipotesi: una pagina fuori dall'app sotto `/s/…` (bypassa
l'autenticazione via `isSharedContentPath`) con l'esatta struttura della riga del Sommario, prima
senza `TaccuinoPaperTexture`/`TaccuinoSpineShadow` (testo visibile, sia con `RouteThumb`+filtro SVG
sia con `GalleryMapThumb`) poi CON quei due componenti montati (testo invisibile, riprodotto in modo
deterministico in Chromium headless su desktop — non serviva un dispositivo Android reale). Rimosso
selettivamente il filtro da dentro `TaccuinoPaperTexture` soltanto (lasciando texture/piega/`GalleryMapThumb`
tutti montati insieme): testo di nuovo visibile su tutte le righe testate.

**Causa reale**: `HandWobbleFilter` (`feTurbulence`+`feDisplacementMap`) applicato dentro
`TaccuinoPaperTexture` e `TaccuinoSpineShadow` — entrambi elementi `fixed`, a piena pagina/altezza,
montati stabilmente su OGNI pagina in tema taccuino (non solo il Sommario: anche lo scaffale, Fase 18,
li usa — segno che il problema era probabilmente presente anche lì, solo non segnalato perché quella
pagina non ha un elenco di righe con altro testo sotto lo stesso schermo). Il filtro, così applicato,
corrompe il rendering del testo in elementi **fratelli sottostanti nel DOM**, non solo dell'elemento
filtrato — un comportamento non specifico ad Android, riprodotto anche in Chromium desktop.

Le due fasi precedenti (21→22) avevano cambiato la miniatura del percorso pensando che il filtro lì
fosse la causa — coincidenza di tempistica (introdotto nella stessa PR di Fase 21 in cui è arrivato
anche `TaccuinoPaperTexture`), non la causa vera. `lib/taccuinoTokens.tsx`: le linee di livello di
`TaccuinoPaperTexture` e la piega di `TaccuinoSpineShadow` restano curve di Bézier organiche (nessun
cambiamento visivo di rilievo — il tremore aggiuntivo del filtro era comunque sottile), solo senza
più il filtro. `HandWobbleFilter`/`useHandWobbleId` restano esportati con un avviso esplicito nel
commento: sicuri su una forma piccola/contenuta nel proprio riquadro, mai su un elemento `fixed` a
piena pagina montato stabilmente.

**Fase 24 — La Fase 23 aveva diagnosticato male: causa reale isolata con un A/B/C rigoroso** ✅ **COMPLETATA**

La Fase 23 non ha risolto: l'utente ha disinstallato l'app, si è collegato direttamente all'URL
Vercel (escludendo con certezza qualunque cache — service worker o altro) e ha rimandato lo stesso
identico schermo. La diagnosi della Fase 23 (il filtro `HandWobbleFilter`) era quindi **sbagliata**
— il filtro era già stato rimosso e il bug persisteva.

Isolato questa volta con un metodo diverso, molto più rigoroso: invece di confrontare screenshot da
caricamenti di pagina separati (soggetti a differenze di timing/ambiente che avevano già portato a
una falsa conferma in Fase 23), un **A/B/C sulla STESSA pagina, stesso caricamento** — colonne
affiancate, alcune con `TaccuinoPaperTexture`/`TaccuinoSpineShadow` montati, altre no. Risultato
netto: `TaccuinoSpineShadow` da solo — nessun problema, testo sempre visibile. `TaccuinoPaperTexture`
da solo — testo sparito ovunque nella stessa colonna, **comprese etichette di prova senza alcun
font/colore taccuino** (mentre immagini e icone nella stessa riga restavano visibili). Esclusi uno
per uno, con lo stesso metodo A/B: lo z-index (negativo, zero, o assente — stesso risultato),
`position:fixed` in sé (`position:absolute` stesso risultato). L'unica variabile che faceva la
differenza: **un `<svg>` live che ricopre la pagina** (qualunque combinazione fixed/absolute,
con o senza filtro, con o senza z-index) corrompe il rendering del testo altrove nel DOM. Lo stesso
contenuto come `<svg>` **statico**, in flusso normale (non sovrapposto ad altro contenuto), non
causa alcun problema — conferma che è la sovrapposizione via SVG live, non l'SVG in sé né i suoi
contenuti (gradienti, `feTurbulence`, o altro).

**Correzione**: `TaccuinoPaperTexture` riscritta senza alcun elemento `<svg>` — un `<div>` con
`background: radial-gradient(...), radial-gradient(...), colore-base` (CSS puro), stesso principio
già in uso altrove nell'app per evitare esattamente questa classe di problema (l'utility Tailwind
`bg-topography`, un'immagine di sfondo invece di un SVG vivo nel DOM). Le quattro linee di livello
disegnate sono state tolte in questo passaggio — non riportate nemmeno come immagine di sfondo:
prima la stabilità del testo, un'eventuale reintroduzione come `background-image` (mai un altro
`<svg>` overlay) resta possibile in un secondo momento. Verificato con lo stesso componente
`BookPage` reale (non una ricostruzione a mano) e l'intera pagina Sommario: titolo, sottotitolo,
pulsante, chip, tutte le righe (titolo/statistiche/stato) visibili.

`TaccuinoSpineShadow` non è stata toccata in questa fase (verificata innocente dal test A/B) — resta
un `<svg>` `fixed`, ma è una striscia stretta (22-26px), non un overlay a piena pagina.

**Fase 25 — Anche la Fase 24 non bastava: rimosso il `filter` CSS sulla miniatura mappa** ✅ **COMPLETATA**

La Fase 24 non ha risolto: l'utente ha rimandato lo stesso identico schermo (mappe reali visibili,
titolo/statistiche/stato di ogni riga ancora del tutto assenti), questa volta con un'indicazione
precisa — il difetto è comparso "probabilmente dopo la modifica dei font e dei colori delle
miniature delle mappe". Indica il `filter` **CSS** (`sepia() saturate() hue-rotate() brightness()
contrast()`) applicato al contenitore di `GalleryMapThumb` in ogni riga del Sommario, introdotto in
Fase 22 e mai più toccato da allora — quindi presente, identico, in tutti e tre i tentativi falliti
(22, 23, 24).

Non riprodotto in locale con certezza: un test A/B sulla stessa pagina (stessa riga, con e senza
`filter`) non mostra differenze in Chromium headless desktop con dati di prova, ma qui mancano le
tile reali (`/api/tile` non raggiungibile in questo ambiente) — la stessa limitazione che ha reso
inaffidabili le verifiche isolate delle fasi precedenti. Circostanza comunque concreta: `filter`
promuove il suo contenitore a un layer compositato dalla GPU, e Leaflet (`GalleryMapThumb`) ci
disegna dentro decine di tile ciascuna con la propria trasformazione — la stessa famiglia di bug
già isolata in Fase 24 (un elemento che forza un compositing complesso adiacente al testo di riga
corrompe quel testo su certi dispositivi/driver Android), qui innescata da `filter` invece che da un
`<svg>` overlay a piena pagina.

**Correzione**: tolto il `filter` CSS dal contenitore della miniatura in `app/diari/[id]/page.tsx`
(Sommario) — stesso principio già seguito in Fase 24 (rimuovere il meccanismo sospetto invece di
un'ennesima "verifica" non affidabile in questo ambiente): la mappa resta quella vera (Leaflet,
tile OSM), solo senza la ricolorazione verso la palette taccuino. `GalleryMapThumb` stesso non è
stato toccato (nessun filtro applicato al componente, solo al contenitore chiamante — resta neutro
per gli altri suoi usi). I filtri CSS analoghi su `GuideHero`/`ReportHero` (immagine hero singola,
non una mappa Leaflet con decine di tile in un elenco ripetuto) non sono stati toccati — combinazione
diversa, nessuna segnalazione su quelle pagine.

Questa correzione **non è verificata con la stessa certezza** della Fase 24 (lì l'A/B aveva isolato
la causa in modo riproducibile): qui si rimuove il sospetto più concreto rimasto sul tavolo dopo tre
tentativi falliti, in attesa di conferma dell'utente sul dispositivo reale.

**Fase 26 — La causa reale, per la prima volta verificata su una build di produzione vera**
✅ **COMPLETATA**

La Fase 25 non ha risolto: l'utente ha rimandato lo stesso identico schermo (mappe reali, stavolta
nei loro colori naturali — coerente con la rimozione del `filter`, ma titolo/statistiche/stato
ancora del tutto assenti su ogni riga), con un'osservazione decisiva: *"non è che hai applicato un
layer sopra i testi?"*.

**Il vero errore metodologico di tutte le fasi 22-25**: ogni singola verifica di questa saga — inclusa
quella (falsamente) "rigorosa" A/B/C della Fase 24 — è stata condotta con `npm run dev`. Mai una
volta con una build di produzione reale (`next build && next start`), l'unico artefatto che riflette
davvero cosa gira su Vercel. Ricostruita la pagina del Sommario (con dati finti, stessa identica
struttura: `BookPage`, `GalleryMapThumb`, `TrailScoreGaugeBadge`) e servita con `next build && next
start` invece di `next dev`: **il bug si riproduce immediatamente e in modo deterministico**, prima
volta in questa sessione. Bisezione sistematica (con lo stesso metodo A/B, stavolta su una build di
produzione vera, unica differenza rispetto alle fasi precedenti): righe senza `<BookPage>` — testo
visibile; con `<BookPage theme="pergamena">` (il tema originale, mai toccato in questa saga) — testo
visibile; con `<BookPage theme="taccuino">` — testo invisibile. Isolato ulteriormente dentro il
guscio: `TaccuinoSpineShadow` da solo — innocuo; **`TaccuinoPaperTexture` da sola (il `<div>` con
`background: radial-gradient(...)` scritto in Fase 24, senza alcun `<svg>`) — testo invisibile**,
riprodotto con un singolo elemento, nessuna mappa, nessun filtro, nessuna delle cause sospettate
nelle fasi precedenti.

**Causa reale**, confermata via `getComputedStyle` nel browser: l'elemento ha `className="fixed
inset-0 -z-10 pointer-events-none"` ma `z-index` calcolato risultava **`auto`**, non `-10` — la
regola CSS `.-z-10{z-index:-10}` era del tutto assente dal foglio di stile generato in produzione
(verificato leggendo direttamente i file `.next/static/css/*.css`). Motivo: `tailwind.config.ts`
scansiona solo `./pages/**`, `./components/**`, `./app/**` per generare le classi usate — **mai
`./lib/**`**, la cartella dove vive `lib/taccuinoTokens.tsx`. La stringa `-z-10` non compare in
nessun altro file del repo dentro quei tre glob (verificato con una ricerca globale), quindi Tailwind
non l'ha mai generata per una build pulita. Un elemento `position: fixed` con `z-index: auto`
(invece di un valore negativo esplicito) dipinge, per le regole di stacking del CSS, **dopo** il
contenuto normale di flusso della pagina — cioè sopra il testo di ogni riga, non sotto — anche se
appare per primo nel DOM: esattamente il "layer sopra i testi" descritto dall'utente. Non un bug di
compositing GPU, non Android-specifico, non legato a mappe/filtri/SVG: una classe Tailwind
silenziosamente non generata in produzione.

Perché non si è mai visto con `npm run dev`: la cache JIT di Tailwind di un processo `next dev` di
lunga durata accumula le classi già viste (anche da usi altrove nel repo nel frattempo rimossi) senza
mai ripartire da una scansione pulita — a differenza di una build di produzione da zero, che
ri-scansiona i glob di `content` da capo. Questo spiega perché ogni "verifica" di questa saga,
comprese quelle che sembravano più rigorose (Fase 24), abbia sempre mostrato il testo visibile in
sviluppo pur non correggendo il difetto reale in produzione.

**Correzione**: aggiunto `'./lib/**/*.{js,ts,jsx,tsx,mdx}'` ai `content` di `tailwind.config.ts`.
Verificato che altri tre file sotto `lib/` (`resoconto/reportDisplaySections.tsx`,
`guideContent.tsx`, `guida/guideDisplaySections.tsx`) usano `className` ed erano quindi ugualmente
esposti allo stesso rischio silenzioso, non ancora segnalato — coperti dalla stessa correzione.
Verificato con `getComputedStyle` (`z-index` ora `-10`) e visivamente, sempre su una build di
produzione vera: testo visibile in ogni combinazione testata (texture da sola, texture+piega,
texture+header sticky+barra fissa, tutto insieme) e sulla pagina reale del Sommario ricostruita con
`GalleryMapThumb`/`TrailScoreGaugeBadge`.

La Fase 25 (rimozione del `filter` CSS dalla miniatura mappa) non era necessaria per questo bug —
non ne era la causa — ma resta comunque innocua: non reintrodotta in questa fase, la mappa continua
a mostrarsi nei suoi colori naturali. Un'eventuale ricolorazione verso la palette taccuino potrà
tornare in un secondo momento, ora su basi solide.

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
- `app/api/diaries/[id]/route.ts` — `DiarioPercorsoRow.trailScore` aggiunto in Fase 6,
  `altitudeMax`/`estimatedTimeSeconds`/`safety` in Fase 7.
- `components/routehub/BottomGallery.tsx` (`GalleryMapThumb`), `components/TrailScoreGaugeBadge.tsx`,
  `lib/trailScore.ts` (`ctsLabel`) — non toccati, riusati direttamente da Fase 7 nella riga del
  Sommario.
- `app/diari/[id]/pubblica/page.tsx` — non toccato in Fase 6, solo scoperto: già ha l'editing di
  foto/titolo/sottotitolo/autore del Diario che la Fase 6 rende raggiungibile dallo scaffale.
- `app/api/diaries/route.ts` — nuovo `POST` (Fase 6): crea un Diario aggiuntivo, gated su
  `resolveDtrekEntitlement`.
- `lib/dtrekEntitlement.ts` — non toccato, riusato per il gate di creazione Diario.
- `app/diari/[id]/page.tsx` — Fase 9 (allineamento colonne fisse, filtro di stato, sfondo
  tinteggiato, ordine invertibile del Sommario) e Fase 11 (scrittura `lastDiaryId`, drawer).
- `components/libro/BookSpineShadow.tsx` — nuovo in Fase 10, montato in `BookPage.tsx` e in
  `DiariPageLibro` (`app/diari/page.tsx`).
- `components/libro/DiarioSwitcherDrawer.tsx` — nuovo in Fase 11, montato solo da
  `DiarioIndexLibro`; `BookPage.tsx`'s prop opzionale `onTitleClick` è il suo unico punto
  d'aggancio.
- `app/page.tsx` — riscritto in Fase 11 (redirect condizionale invece che fisso a `/diari`).
- `supabase/migrations/add_last_diary_id.sql`, `app/api/user-settings/route.ts`,
  `lib/sync/userSettingsStore.ts` — `lastDiaryId`, Fase 11, stesso pattern di
  `diario_libro_enabled`.
- `supabase/migrations/backfill_default_diary_cover.sql` — Fase 12, backfill una tantum di
  `diaries.cover_url` dal vecchio `user_settings.diary_config->>'coverUrl'`.
- `app/api/diaries/[id]/config/route.ts`, `lib/diaryConfig.ts` — non toccati in Fase 12, solo
  scoperti: `diaries.cover_url` è la STESSA colonna che `/pubblica` legge/scrive come
  `config.coverUrl` (non due campi distinti) — il gap era solo nei dati storici del Diario di
  default, colmato dal backfill sopra.
- `app/diari/[id]/copertina/page.tsx` — nuova in Fase 13, riusa `/api/diaries/[id]/config` e
  `components/diario/DiarioCover.tsx` (stessa anteprima della copertina stampabile, scalata).
- `components/diario/DiarioCoverThumb.tsx` — nuovo in Fase 13, riusato da `app/diari/page.tsx`
  (`DiarioCoverCard`), `components/libro/DiarioSwitcherDrawer.tsx` e `app/diari/[id]/page.tsx`
  (cima del Sommario) al posto di tre placeholder diversi.
- `app/diari/[id]/pubblica/page.tsx` — invariata in Fase 13: i suoi controlli foto/testi copertina
  restano (un utente potrebbe già averci fatto l'abitudine), solo i link da scaffale/drawer non
  puntano più qui per personalizzare la copertina.
- `app/diari/[id]/percorsi/[percorsoId]/page.tsx` — Fase 14: `PercorsoPageLibro` ridotta a titolo
  + `ReportageSection`, niente altro (era il riepilogo completo di Fase 3).
- `components/libro/GuideBookPage.tsx`, `GuideGenerationPanel.tsx` — Fase 14: il pannello di
  generazione in blocco (rimosso dal riepilogo) vive ora qui, solo sulla sezione `il_percorso`;
  `panelClassName` nuovo prop opzionale per il tono pergamena.
- `components/diario/DiarioCoverThumb.tsx` — Fase 14: nuova modalità con testo (`width`+`title`),
  usata da `DiarioSwitcherDrawer.tsx` e dal Sommario; `/diari/[id]/copertina/page.tsx` riusa la
  stessa invece della propria copia locale del trucco di scala.
- `app/api/diaries/[id]/route.ts` — `DiarioDetail.author` aggiunto in Fase 14.
- `components/libro/BookPage.tsx` — Fase 17: barra inferiore fissa (Indietro/Indice/Strumenti/
  Avanti), titolo in testata non più cliccabile, `onTitleClick`→`onIndexClick`, `onToolsClick`
  nuovo, `BookPageSection.onClick` rimosso (nessun chiamante rimasto).
- `lib/taccuinoTokens.tsx`, `app/layout.tsx` (font `Kalam`) — nuovi in Fase 17: fondamenta della
  direzione "taccuino topografico" (approvata, integrazione graduale) — non ancora usati da
  nessun componente reale.
- `components/libro/BookPage.tsx` — Fase 18: `onIndexClick` rimosso, nuova prop `indexLabel`
  (default `"Indice"`) per l'etichetta del bottone che porta a `indexHref`.
- `components/libro/DiarioSwitcherDrawer.tsx` — eliminato in Fase 18 (zero chiamanti rimasti: il
  Sommario naviga ora direttamente allo scaffale via `indexHref="/diari"`, `indexLabel="Diari"`).
- `app/diari/page.tsx` (`DiariPageLibro`) — Fase 18: primo uso reale di `lib/taccuinoTokens.tsx`
  (carta invecchiata, font sul titolo); griglia `grid-cols-2` al posto della riga scorrevole;
  nuovo `GlobalRouteSearch` (ricerca su `/api/percorsi` senza lasciare lo scaffale); link "Tutti i
  Percorsi" spostato sotto la ricerca. Fase 19: `<Navbar/>`/`MOBILE_TOPBAR_SPACER` rimossi da
  questa funzione (non dal componente condiviso), sostituiti da un padding-top minimo con
  `env(safe-area-inset-top)`.
- `lib/taccuinoTokens.tsx`, `app/layout.tsx` — Fase 19: font a mano `Kalam` → `Caveat` (ancora in
  prova), token rinominati `FONT_KALAM`/`FONT_VAR_KALAM` → `FONT_HAND`/`FONT_VAR_HAND` (nome legato
  al ruolo, non al font specifico), variabile CSS `--font-kalam` → `--font-caveat`.
- `components/libro/BookPage.tsx` — Fase 20: nuova prop `theme` (`'pergamena'` default o
  `'taccuino'`), i colori locali diventano un oggetto per tema; nessun chiamante esistente la passa
  ancora, restano tutti su pergamena finché non convertiti.
- `app/diari/[id]/page.tsx` (`DiarioIndexLibro`) — Fase 20: `theme="taccuino"` su `BookPage`, toni
  pergamena hardcoded sostituiti da `TACCUINO_PAPER`/`TACCUINO_INK`, titolo del Diario su
  `FONT_HAND`. Fase 21: vedi sopra — copertina a tassello, font a mano diffuso, chip a contorno,
  miniature `RouteThumb` ricalcate a mano, divisore tratteggiato, evidenziatore, spunta `Check`.
  Fase 22: miniatura tornata a `GalleryMapThumb` (mappa OSM reale) con un `filter` CSS di
  ricolorazione sul contenitore, al posto di `RouteThumb`+filtro SVG (sospettato di un bug di
  compositing che rendeva invisibili titolo/statistiche della riga).
- `lib/taccuinoTokens.tsx` — Fase 21: `HandWobbleFilter` con `baseFrequency`/`scale` opzionali;
  nuovi `TaccuinoPaperTexture`, `TaccuinoSpineShadow`, token `TACCUINO_PAPER.highlight`. Fase 23
  (diagnosi poi corretta in Fase 24): `HandWobbleFilter` rimosso da entrambi, sospettato causa del
  bug testo-invisibile — non lo era. **Fase 24 (causa reale)**: `TaccuinoPaperTexture` riscritta
  senza alcun `<svg>` — un `<div>` con `background: radial-gradient(...)` CSS puro; le linee di
  livello disegnate tolte (non reintrodotte come immagine di sfondo in questo passaggio).
  `TaccuinoSpineShadow` invariata (verificata innocente).
- `components/RouteThumb.tsx` — Fase 21: `strokeDasharray`/`filter` opzionali (default assenti,
  nessuna modifica per i chiamanti esistenti). Non più usato dal Sommario dopo la Fase 22, restano
  validi per altri chiamanti futuri.
- `app/diari/[id]/percorsi/[percorsoId]/page.tsx` — Fase 15: `PercorsoPageLibro` rimossa del tutto,
  redirect immediato alla Guida a flag acceso. `PercorsoPageClassico`/`ReportageSection`
  invariate.
- `components/libro/PercorsoToolsDrawer.tsx` — nuovo in Fase 15, montato solo da
  `GuideBookPage.tsx`; riusa `GuideGenerationPanel` (bulk), `exportGuidePdf`,
  `exportPlannedHikeToGpx`, `/api/percorsi/[id]/reportage`.
- `components/RouteMap3D.tsx` — non toccato, montato per la prima volta dal libro in Fase 15
  (`GuideBookPage.tsx`, stesso import dinamico `ssr:false` di `app/guida/GuidaHub.tsx`).
- `components/libro/BookPage.tsx` — `BookPageSection.onClick` aggiunto in Fase 15 (alternativa a
  `href`, usato dalla pillola "Strumenti").
- `app/diari/[id]/percorsi/[percorsoId]/reportage/[activityId]/page.tsx` — riepilogo di UN
  Reportage (pagina diversa dall'elenco eliminato in Fase 15, ancora esistente): solo il link
  "Torna al Percorso" aggiornato per puntare alla Guida invece della pagina eliminata.

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
