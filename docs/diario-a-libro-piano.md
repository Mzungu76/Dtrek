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

**Fase 3 — Routing** ⬜ **DA FARE**
- `app/diari/[id]/percorsi/[percorsoId]/page.tsx`: da embed diretto di GuidaHub a vera pagina di
  riepilogo (copertina, statistiche chiave, CTA "Apri la Guida", link "Apri in modalità classica",
  elenco Reportage restilizzato) — qui vive il chrome extra-loop assegnato sopra.
- Nuova: `.../percorsi/[percorsoId]/guida/[sectionKey]/page.tsx` — slug stabile (`GuideSectionKey`),
  monta `<GuideBookPage basePath=... diarioTitle=... percorsoId=... sectionKey=... />`.
- Nuova: `.../percorsi/[percorsoId]/reportage/[activityId]/page.tsx` — riepilogo Reportage, non
  esiste oggi (oggi si rimanda a `/resoconto/[id]`).
- Nuova: `.../reportage/[activityId]/sezione/[n]/page.tsx` — indice numerico 1-based, monta
  `<ReportBookPage basePath=... diarioTitle=... activityId=... pageIndex={n} />`; clamp/redirect
  esplicito se il numero di capitoli cambia dopo una rigenerazione (`n` fuori range → redirect a
  `sezione/1` o alla pagina di riepilogo).
- Scaffale `/diari` (oggi lista/grid semplice, nessun componente "copertina" riusabile — va
  costruito) e indice del Diario: soprattutto lavoro visivo/di link.
- **Decisione aperta, non ancora presa**: dove va davvero il pannello di generazione/rigenerazione
  AI nel libro. GuideReader oggi genera testo con la sua logica interna (`generateSections`,
  `autoGenSections`, bottoni "Approfondisci" per-sezione dentro ogni `SectionCard`) — quella logica
  NON è stata estratta in Fase 0 (solo build/render delle sezioni lo è stata) e GuideBookPage non la
  richiama. Se una sezione non ha ancora testo AI, oggi nel libro quella pagina semplicemente non
  esiste (gate di presenza) — il piano assume che generare/rigenerare avvenga dalla pagina di
  riepilogo (Fase 3) o da "Apri in modalità classica", ma il *come* (riusare un pezzo di
  GuideReader? un pannello nuovo che chiama `/api/guide` direttamente?) non è stato disegnato.
  **Da chiarire con l'utente prima di costruire la pagina di riepilogo.**
- Presence-gating già implementato in Fase 2 (`isSectionPresent` in GuideBookPage.tsx,
  `resocontoSectionsFor`-equivalente in ReportBookPage.tsx) è un giudizio "ragionevole ma non
  confermato dall'utente" — copiato dai criteri del mockup ma non testato su dati reali. Da
  rivedere quando si potranno vedere le pagine vere a schermo.

**Fase 4 — Flag di rollout** ⬜ **DA FARE**
- Riuso del pattern già in uso nel progetto (booleano su `user_settings`, letto via
  `getUserSettingsCached()`, come `guideBreveSections`) invece di inventarne uno nuovo — scoped
  **solo** al punto d'ingresso Percorso del Diario. `/guida/[id]` e `/resoconto/[id]` standalone
  restano fuori dal flag, sempre sul motore invariato.
- Cutover del default flag solo dopo validazione in produzione, stesso principio già seguito nel
  piano originale (Fase 7 lì).

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
- `components/libro/BookPage.tsx`, `GuideBookPage.tsx`, `ReportBookPage.tsx` — il guscio di Fase 2.

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
- **Prossimo passo**: Fase 3 (routing). Prima di scriverla, decidere con l'utente dove va il
  pannello di generazione/rigenerazione AI nel libro (vedi "Decisione aperta" sopra) — è l'unico
  punto del piano dove GuideReader tiene una logica (generazione testo) mai estratta, perché non fa
  parte del dispatch sezioni/widget di Fase 0.
- **Mai verificato a schermo**: nessuna delle pagine scritte finora è stata vista renderizzata con
  dati reali — questa sandbox non ha credenziali Supabase. La verifica end-to-end (Playwright, o
  anche solo apertura manuale) va fatta in un ambiente con l'app che gira per davvero, idealmente
  prima di scrivere altro codice sopra Fase 2 (rischio di build-on-sand se GuideBookPage/
  ReportBookPage hanno un difetto non visibile a `tsc`/`eslint`, es. un widget che esplode a
  runtime con `props` reali).
