# Bug e note di lavorazione — revisione delle forme di condivisione

Registro dei difetti trovati e delle verifiche da fare, aperto durante il rifacimento delle forme
di condivisione (Fasi 0-4). Va ripassato alla fine di tutte le fasi.

**Convenzioni**

- **Verificato** = letto nel codice o riprodotto, con file e riga.
- **Da verificare** = plausibile ma non confermato; da controllare prima di agire.
- Ogni voce dice in quale fase è previsto l'intervento, oppure `fuori ambito` se esula da questo
  lavoro e va deciso a parte.

---

## 1. Bug aperti

Tutti i bug bloccanti/gravi/minori individuati per la condivisione sono stati risolti nelle Fasi
0-4 (vedi §5). Restano aperte solo le voci fuori ambito o deliberatamente rimandate:

| ID | Dove | Difetto | Stato | Fase |
|---|---|---|---|---|
| B21 | `components/RouteMap3D.tsx:1728` | **Fuori ambito, ma è un bug reale.** In maplibre-gl 5 `preserveDrawingBuffer` vive dentro `canvasContextAttributes`; qui è passato al livello superiore con un cast a `any`, quindi **ignorato in silenzio** (verificato: nel bundle di maplibre 5.24 compare solo `preserveDrawingBuffer:!1`, nessuna gestione dell'opzione legacy). La registrazione video non ne risente perché legge dentro l'evento `render` — e il commento a `:3175-3180` documenta i fotogrammi neri comparsi quando fu aggiunto un `requestAnimationFrame` di ritardo, che è esattamente la firma del buffer non preservato. Ma `handleCapture` (`:2011`, il pulsante screenshot della vista 3D) legge **fuori** da un evento render: dovrebbe produrre un PNG nero o vuoto | Verificato | fuori ambito — decidere a parte |
| B27 | `app/api/resoconto/route.ts:326-331` | `?all=true` scarica il **markdown integrale di ogni resoconto** senza limite né paginazione, a ogni apertura del Diario. Non affrontato: risolverlo per bene richiede virtualizzare il libro (montare le pagine lazy), non solo l'endpoint — rimane un intervento a sé, di performance, indipendente dalla revisione dell'export PDF | Verificato | non pianificata — intervento di performance a sé |
| B30 | `components/diario/types.ts:40-43` | `GREEN`/`AMBER`/`BLUE`/`VIOLET` usano colori Tailwind standard (`#f0fdf4`, `#166534`, `#eff6ff`…), estranei alla palette DTrek. Le `StatCard` del diario sono verdi-Tailwind, non forest. Non toccato: sono temi di accento per widget dati, non l'identità tipografica/cromatica principale della pagina — cambiarli ora avrebbe allargato il diff senza risolvere un difetto segnalato dall'utente | Verificato | da valutare, cosmetico |
| B32 | `app/leggi/r/[activityId]/page.tsx` | Il resoconto pubblico usa l'`activityId` in chiaro nell'URL invece di un token opaco, a differenza di `/s/[token]`. **Ancora aperto dopo la Fase 4**: `HiddenPdfRoot.tsx` è stato riscritto (vedi §5) ma il motore di pubblicazione/URL non è stato toccato — non è uno stile o un'impaginazione, è uno schema di link, fuori dall'ambito letterale "verificare le esportazioni PDF". La colonna `hike_reports.share_token` esiste già in produzione (indice unico verificato via MCP): resta un buon prossimo passo piccolo e isolato | Verificato | non pianificata |
| B36 | `lib/blobStore.ts:120` | `ActivityMeta.routePolyline` è ridotta a **60 punti** da `downsamplePolyline`. La condivisione di una singola escursione (`ResocontoHub.tsx`, Fase 2) e ora anche il PDF del resoconto (`renderReportPdf.ts`, Fase 4.2 — ricostruisce da `activity.trackPoints`) usano la traccia piena. Resta aperto solo per la mappa multi-percorso «Le mie escursioni» (`generateMapImage`) e per statistiche/confronto | Verificato | 2.1/4.2 (parziale) |
| B45 | `app/globals.css:107` | `@media print { @page { margin: 1.5cm } }` è in conflitto con le pagine `.diario-page` da 794px, che assumono margine zero: la stampa nativa rimpicciolisce o taglia. Non toccato: riguarda solo Ctrl+P, un percorso secondario rispetto a export/link pubblico | Verificato | da valutare, minore |
| B52 | `app/diario/page.tsx:425` | Le mappe dei singoli resoconti nel PDF del diario passano ancora dal cucitore di tile raster (`fetchSatMap`, ~25 tile HTTP per resoconto attraverso `/api/tile`): con 50 resoconti sono oltre mille richieste. La Fase 0 aveva costruito `lib/mapSnapshot.ts` (MapLibre, nessun flood di tile) proprio per questo, ma il Diario non è mai stato migrato. **Non affrontato nel giro di correzioni post-Fase 4**: le due cause dominanti della lentezza erano altre (vedi §5, "Correzioni dopo la revisione") e sono state risolte; questa richiede di riusare una sola istanza MapLibre per N tracce, un intervento a sé | Verificato | non pianificata — perf |

---

## 2. Da verificare

| ID | Dove | Cosa controllare |
|---|---|---|
| V01 | `app/components/guide/GuideSection.tsx:102-111` | Il ramo `avviso` era stato segnalato come codice morto. **Non lo è in modo dimostrabile**: `extractGuideNotices` (`lib/guideNotices.ts:40`) rimuove i tag **solo quando la sezione "verificato" è inclusa** (`GuideReader.tsx:499`). Senza quella sezione i tag sopravvivono, e la regex di `GuideSection` intercetta la variante `[avviso]` senza gravità — non `[avviso:danger]` né `[danger]`. È quindi una rete di sicurezza parziale: **non rimuovere**, ma rifarla insieme a B14 |
| V02 | `app/diario/page.tsx` | `clone.querySelectorAll('canvas').remove()` con il commento sul «taint CORS». Il commento era **errato** (Leaflet usa `<img>` e SVG, e le tile passano dal proxy same-origin) ed è stato corretto in Fase 1. La riga è stata **mantenuta** come difesa: oggi non rimuove nulla, ma proteggerebbe da canvas introdotti in futuro. Decidere in Fase 3 se serve ancora |
| V03 | `app/api/activity-weather/`, `app/api/hiking-project/` | Nessun chiamante trovato lato client. Prima di rimuoverle va escluso l'uso da cron esterni o chiamate manuali |
| V04 | `app/components/guide/guide-print.css` | Quattro grigi ad hoc (`#1C1C1C`, `#2D2D2D`, `#3D3D3D`, `#44403c`), bordo `#e8e4de` inventato, e `#fafaf8` e `#f8f7f4` usati entrambi come fondo tenue. Da uniformare su `lib/designTokens.ts` in Fase 4.1 |
| V05 | `app/components/guide/guide-print.css:449` e altre | `text-align: justify` a 10,5px su tre colonne produce fiumi bianchi vistosi. Valutare la bandiera a sinistra |
| V06 | Tutti i PDF | I font del brand **non sono incorporati** nei documenti jsPDF: testatine e numeri di pagina usano Helvetica. Incorporare Barlow Condensed in base64 è possibile ma pesa; da decidere in Fase 4 |
| V07 | `lib/activityPhotos.ts` | Le foto **non hanno miniatura**: un carosello di 10 foto scarica 10 file a piena risoluzione. **Ancora aperto dopo la Fase 2.2**: il carosello (`utils/shareImage/carousel.ts`) disegna ogni foto ritagliata a scheda polaroid (`aspectFitCrop`), ma il *download e il decode* restano a piena risoluzione — il ritaglio avviene dopo, sul canvas. Non risolto in questa fase: richiede o una colonna `thumb_url` popolata all'upload, o un ridimensionamento lato client prima del `drawImage` (rifare `loadRemoteImageEl` passando per un canvas intermedio) — entrambe vanno oltre l'ambito "condivisione" e toccano `lib/activityPhotos.ts`, condiviso anche da tutto il resto dell'app che mostra le foto |
| V08 | `lib/mapSnapshot.ts` | La cattura MapLibre va provata su un dispositivo reale a bassa memoria: il contesto WebGL può andare perso e far scattare il ripiego. Verificare che il ripiego produca comunque una mappa accettabile |
| V09 | `app/diario/page.tsx`, funzione `migrateLegacyConfigIfNeeded` | La migrazione da `localStorage` al `diary_config` server-side scatta solo se il config server è **esattamente** ai valori di default (`isConfigDefault`). È corretto per il rollout (nessun utente ha mai avuto un `diary_config` non-default prima di questa Fase), ma dopo il rollout una race a bassissimo rischio resta possibile: un dispositivo mai aperto da mesi, con `localStorage` legacy, potrebbe sovrascrivere una configurazione ormai genuinamente personalizzata da un altro dispositivo, SE quel dispositivo non ha mai completato la migrazione (flag `dtrek_diary_migrated_v1` mai scritto) — improbabile ma non impossibile. Nessuna azione richiesta, solo da tenere presente |
| V10 | `app/diario/page.tsx`, `handleCoverUpload` | La vecchia copertina in data-URL (`localStorage['dtrek_diary_cover']`) **non viene migrata automaticamente**: richiederebbe riconvertirla in Blob e ricaricarla silenziosamente, e molte di quelle copertine potrebbero essere già state troncate/perse dal `QuotaExceededError` che B03 descriveva. Un utente con la vecchia copertina locale la perde silenziosamente al primo caricamento con la nuova versione e deve ricaricarla una volta — accettabile, ma da segnalare se emergono lamentele |
| V11 | `components/diario/DiarioMappa.tsx`, `components/diario/DiarioStatistiche.tsx` | La mappa d'insieme e le statistiche aggregate del diario continuano a mostrare **tutte** le `activities`, non filtrate da `excludedActivityIds`: l'esclusione vale per le pagine del libro (e quindi per l'indice e per il PDF), non per questi due riepiloghi. Scelta deliberata per restare nell'ambito richiesto (escludere una narrazione dal libro, non falsare le proprie statistiche complessive), ma è una decisione di design implicita — da confermare con l'utente se si aspettava il contrario |
| V12 | `components/editorial/MagazineBody.tsx:108` | Stesso difetto di B16 (credito fotografico `© Wikimedia Commons` cablato) ma **a schermo**, non nel PDF: `photoCaption ?? '© Wikimedia Commons'`. La Fase 4 ha corretto solo la catena verso il PDF (`fetchRoutePhotos→usePDFExport→buildGuideContent→GuideSection`, ora tutta con `{url,credit}`); qui `GuideReader.tsx:1111` passa `sectionPhoto={routePhotos[i]}` come stringa nuda (solo URL), quindi il credito reale non arriva nemmeno a monte. Fuori dall'ambito "esportazioni PDF" di questa fase, ma root cause identica — un buon prossimo passo piccolo |
| V13 | `app/resoconto/[id]/HiddenPdfRoot.tsx` | Il nuovo profilo altimetrico e la mappa nel PDF del resoconto non sono mai stati provati su un'escursione con GPS molto rumoroso (pochi punti, altimetria a scalini). `buildElevationSvgPath`/`downsampleSeries` non hanno smoothing: un tracciato del genere potrebbe rendere un profilo a dente di sega poco leggibile. Nessun problema noto, solo da provare su un caso reale prima di considerarlo definitivamente a posto |

---

## 3. Disallineamento tra schema e database

Verificato via MCP sul progetto `sdxlcpxgbkagbxhukehd`.

`supabase-schema.sql` è **in ritardo rispetto al database reale**. In produzione `hike_reports` ha già
tre colonne assenti dal file:

- `share_token` (uuid)
- `sections` (jsonb)
- `authored_by` (text)

Conseguenza pratica: leggere lo schema dal file porta a falsi allarmi. In fase di analisi
`app/api/resoconto/route.ts:329`, che seleziona `share_token`, era stato scambiato per un bug attivo;
non lo è.

**Aggiornamento Fase 3:** risolto. `user_settings.diary_config JSONB` è stata aggiunta sia in
produzione (`apply_migration` via MCP) sia nel file (`supabase/migrations/add_diary_config.sql` +
`supabase-schema.sql`), insieme alle tre colonne di `hike_reports` sopra, ora documentate nel file
anche se `share_token` resta non usata dal codice (vedi B32, non affrontato in Fase 4: è uno schema
di link, non uno stile o un'impaginazione del PDF).

---

## 4. Duplicazione da assorbire

| Cosa | Dove | Nota |
|---|---|---|
| Due cucitori di tile completi | `utils/pdfExport/mapTiles.ts` e `utils/shareImage/tileHelpers.ts` | Stessa matematica scritta due volte con costanti divergenti. **Fase 2**: `utils/shareImage/{activityImage,mapImage}.ts` non chiamano più `drawTiledMap`/`drawRouteOnTiles` direttamente — passano da `lib/mapSnapshot.ts`, che tiene `tileHelpers.ts` come unico ripiego interno. **Non assorbito in Fase 4**: `utils/pdfExport/mapTiles.ts` resta, ma serve solo alla copertina/mini-mappa della Guida (`usePDFExport.ts`) e al fallback vettoriale di Statistiche/Mappa — spostarlo su MapLibre richiederebbe portare anche quei due jsPDF (voluti "a breve termine" su jsPDF dal piano) sopra una resa asincrona, fuori dall'ambito di questa fase |
| Palette tracciati triplicata | `mapTiles.ts` ×2, `app/diario/page.tsx:237` | Risolto dalla Fase 3: `ROUTE_COLORS` di `lib/designTokens.ts` è la sorgente unica |
| Campionamento traccia ×3 (era B37) | `utils/pdfExport/{planned,activity}.ts` (ritirati in Fase 4) + `usePDFExport.ts:36-37` | **Risolto**: i primi due file sono stati rimossi con i rispettivi documenti jsPDF; il terzo ora chiama `lib/downsamplePolyline.ts` invece di un campionamento a modulo scritto a mano |
| Ricampionamento grafici a 250 punti ×3 + una quarta variante a 40 punti | `planned.ts`/`activity.ts` (ritirati) + `buildGuideContent.ts:41` | **Risolto**: le prime due copie sono sparite con i file; `buildGuideContent.ts` e il nuovo profilo altimetrico di `HiddenPdfRoot.tsx` condividono ora `downsampleSeries` in `lib/elevationSvgPath.ts` |
| Blocco «Profilo Altimetrico» duplicato | `planned.ts` vs `activity.ts` | **Risolto per rimozione**: entrambi i file jsPDF sono stati ritirati in Fase 4.3, sostituiti dal profilo SVG unico di `lib/elevationSvgPath.ts` (Guida e Resoconto) |
| Blocco «Note Personali» e intestazione, incluso il difetto dell'ellissi (B07) | `planned.ts` vs `activity.ts` | **Risolto per rimozione** insieme ai due file |
| `parseTextBlocks` duplicata e già divergente | `GuideSection.tsx` vs `components/editorial/MagazineBody.tsx` | **Risolto**: estratta in `lib/guideMarkup.ts` (`parseMarkupBlocks`), usata da entrambi. Il primo paragrafo "lead"/pull-quote e il pre-trattamento del testo (il PDF riceve il markdown grezzo, lo schermo lo riceve già ripulito dei tag `[epoca]` a monte) restano scelte del chiamante, non della funzione condivisa |
| Griglia fotografica duplicata | `app/resoconto/[id]/PrintPhotoGrid.tsx` vs `HiddenPdfRoot.tsx` | **Non unificata**: sono due percorsi di resa genuinamente diversi — stampa nativa del browser (classi Tailwind `print:*`) contro cattura html2canvas di un albero fuori schermo (stili tutti inline, niente CSS media query) — stessa distinzione già presente in B45. Unificarli vorrebbe dire scegliere un solo meccanismo, una decisione più grande di una correzione di stile. Allineati solo i colori (`#f59e0b`→`#c05a17`, `#78716c`→`#a9a18e`) sulla palette DTrek |
| Mappa icona/colore delle sezioni | `GuideOverview.tsx` (TOC) vs `components/guida/sectionStyle.tsx` | **Non unificata, ma non più divergente**: prima la guida in breve elencava 6 sezioni su 9 (le stesse tre mancanti da B14); ora `TOC_ITEMS` ha le stesse 9 chiavi e gli stessi colori di `SECTION_STYLE`. Restano due dichiarazioni separate (chiavi diverse: quelle di `GuideData['sections']` contro `GuideSectionKey`), commento già presente a spiegare perché |

---

## 5. Risolti

### Fase 0

| Difetto | Dove | Risoluzione |
|---|---|---|
| I font del brand non venivano **mai** applicati: dopo il passaggio a `next/font` i nomi letterali non corrispondono a nessun `@font-face`, quindi Diario e PDF cadevano su Times/Arial/Courier | 8 componenti `components/diario/`, `HiddenPdfRoot.tsx`, `ReportReader.tsx:516`, `app/globals.css:73,103` | Nuovo `lib/designTokens.ts`; 67 riferimenti letterali sostituiti con le variabili CSS |
| Pesi tipografici richiesti ma non caricati (900 su JetBrains Mono, caricato a 400/500; 900 su Playfair, caricato a 400/600/700): il browser li sintetizzava | `StatCard.tsx:15`, `DiarioCover.tsx:39`, `HiddenPdfRoot.tsx:26,50` | Allineati ai pesi disponibili |
| Mappe dei PDF **a scacchi grigi**: le tile erano scaricate da `tile.openstreetmap.org` direttamente dal browser, che non manda header CORS, quindi ogni caricamento falliva e il ripiego riempiva di grigio | `utils/pdfExport/mapTiles.ts:139,248` | Instradate sul proxy `/api/tile`, in versione @2x |
| Mappa composta a 660px e poi ricampionata a 2× da html2canvas: ingrandimento su un raster già ridotto, toponimi illeggibili | `utils/pdfExport/mapTiles.ts` | `TILE_SIZE` a 512 con tile @2x; nuovo parametro `retina` sul proxy |
| Attribuzione cartografica **assente** da ogni immagine e PDF pubblicato | — | Incisa nell'immagine da `lib/mapSnapshot.ts` |
| **PDF bianco su iOS**: un resoconto lungo produceva un canvas unico da oltre 28 Mpx, sopra il limite di Safari (~16,7 Mpx), che torna vuoto **senza sollevare eccezioni** | `lib/pdfPaginate.ts:78` | Cattura a blocchi con area sotto i 12 Mpx |
| Testatina e piè di pagina solo sulla prima e ultima fetta, e sovrapposti al contenuto: erano `position:absolute` rispetto all'elemento, non alla pagina | `lib/pdfPaginate.ts:38-56` | Disegnati con jsPDF sulle pagine fisiche, con spazio riservato |
| Numerazione pagine sbagliata per costruzione (`totalPages = elements.length`): il resoconto riportava «1 / 1» sull'intero documento | `lib/pdfPaginate.ts:71,76` | Numerazione sulle pagine fisiche reali |
| Il piè di pagina veniva disegnato **sopra la copertina** della guida, grigio su arancione | `lib/pdfPaginate.ts` + `GuideTemplate.tsx:68` | Classe `.pdf-bleed` sulle copertine |
| Nessuna attesa della decodifica delle immagini nel Diario e nel Resoconto: si misurava su altezze sbagliate. La rete di sicurezza esisteva solo per la Guida | `app/diario/page.tsx:309-314`, `ReportReader.tsx:519` | `waitForImages` in `lib/pdfImages.ts`, richiamata dal paginatore per tutti |
| `object-fit` non è implementato da html2canvas: ogni foto verticale usciva schiacciata | `HiddenPdfRoot.tsx`, 5 selettori in `guide-print.css` | `flattenObjectFit` in `lib/pdfImages.ts`, applicata dal paginatore a tutti i documenti |
| La generazione si congelava senza errore cambiando scheda, perché `nextLayout` dipendeva solo da `requestAnimationFrame` | `lib/pdfPaginate.ts:140` | Aggiunto un ripiego a tempo |

### Fase 1 — codice morto rimosso

Ogni voce è stata riverificata con un `grep` sui call-site **immediatamente prima** di rimuoverla.

| Cosa | Dove | Evidenza |
|---|---|---|
| `fetchPublicReport`, `fetchPublicDiary` e le interfacce `PublicReport`, `PublicDiary`, `PublicDiaryReport` | `lib/sharePublic.ts:68-198` | Zero riferimenti esterni per tutti e cinque gli export. Residuo di un disegno precedente — una pagina HTML pubblica con il testo del resoconto — poi abbandonato a favore della pubblicazione del PDF. Il file passa da 227 a 95 righe |
| `html2pdf.js` e `@types/html2pdf.js` | `package.json` | Nessun `import` in tutto il repository: restavano solo citazioni nei commenti che spiegano **perché** è stato abbandonato (produceva pagine bianche). I commenti sono stati lasciati: documentano una decisione presa |
| `badgeScale`, `dBadgeScale` | `utils/shareImage/activityImage.ts:81,158` | Assegnate e mai lette. Residui di un badge rimosso |
| `<img alt="Mappa percorsi">` e la prop `mapImgUrl` | `components/diario/DiarioMappa.tsx` | L'immagine aveva `className="print:block"` **e** `style={{ display: 'none' }}` in linea: lo stile in linea vince sempre sulla classe, quindi non è mai comparsa, nemmeno stampando. Lo stato `mapImgUrl` in `page.tsx` resta perché serve da cache al PDF |
| `if` vuoto | `utils/pdfExport/docHelpers.ts:144` | Blocco senza effetto dentro la griglia dei POI |
| `components/SurfaceBar.tsx`, `components/TrailMiniMap.tsx`, `components/WikiCards.tsx` | — | Zero import in tutto il repository |

**Non rimosso, a differenza di quanto ipotizzato in analisi:** il ramo `avviso` di
`GuideSection.tsx` (vedi V01). Non è dimostrabilmente morto e toglierlo sarebbe una regressione.

### Fase 3 — Diario

**Configurazione su database (chiude B03/R12)**

Nuova colonna `user_settings.diary_config JSONB` (migrazione applicata sia in produzione via MCP
sia nel file `supabase/migrations/add_diary_config.sql`), con `lib/diaryConfig.ts` come tipo e
normalizzazione condivisi tra client e server, e `app/api/diary-config/route.ts` (GET/PATCH) che
sostituisce le sei chiavi sparse di `localStorage`. Il client tiene l'intera configurazione in
stato e la salva con un debounce di 800ms, invece di un round-trip per ogni tasto o toggle.

Migrazione una tantum da `localStorage`: se il config server è ancora ai valori di default e il
dispositivo ha dati legacy, li adotta e li carica una sola volta (flag `dtrek_diary_migrated_v1`).
Vedi V09/V10 per i limiti noti di questa migrazione.

La copertina passa da un data-URL in `localStorage` (causa di B03: nessun ridimensionamento, nessun
`try/catch`, quota superabile) a un upload su Supabase Storage (`lib/diaryCoverUpload.ts`, bucket
`dtrek-photos`, stesso bucket delle foto delle escursioni), con ridimensionamento a un massimo di
1600px di larghezza **prima** dell'upload.

**Esclusione delle escursioni (l'ask esplicito dell'utente)**

Pulsante "Escludi" (print:hidden, nascosto anche dalla cattura PDF tramite la nuova classe
`.diario-editor-control` — vedi sotto) su ogni pagina del libro (`DiarioReportPage.tsx`,
`DiarioStubPage.tsx`), che rimuove l'escursione da `visibleBookPages` e quindi dal libro, dall'indice
e dal PDF pubblicato in un colpo solo (il PDF cattura il DOM live, che già non contiene le pagine
escluse). Un pannello nel rail destro ("Escursioni escluse dal diario", badge col conteggio) elenca
le escluse con un bottone "Includi" per ciascuna.

**Bug trovato e corretto durante l'implementazione**: la prima versione nascondeva `.print:hidden`
in blocco durante la cattura PDF — ma `.diario-global-map` e `.diario-report-map` portano *anch'esse*
quella classe (per un motivo diverso: contengono la Leaflet interattiva, sostituita da un raster
subito dopo), e il raster viene inserito **dentro** quei wrapper con `t.el.appendChild(img)` **dopo**
la cattura del clone. Nascondere il wrapper prima di inserirci l'immagine ne avrebbe nascosto tutto
il contenuto, comprese le mappe appena generate: **nessuna mappa nel PDF**. Corretto con una classe
dedicata (`diario-editor-control`) che non intercetta i wrapper delle mappe.

**Personalizzazione per singola escursione**: popover "Personalizza" su ogni pagina (mappa,
statistiche, grafico, FC, velocità), che scrive in `reportExtrasByActivity[activityId]` — un default
globale più un override opzionale per attività, non più un'unica impostazione valida ovunque.

**Rimosso il troncamento (chiude B02/R10)**

`DiarioReportPage.tsx` non taglia più a 3 paragrafi per sezione né a 3 curiosità totali: un
resoconto lungo perdeva prima circa metà del testo, senza alcun avviso, mentre il PDF del singolo
resoconto (`HiddenPdfRoot.tsx`) non ha mai troncato. Reso possibile dalla Fase 0.4 (il paginatore ora
gestisce correttamente il flusso multipagina): i blocchi `.pdf-block`, prima pochi e grandi (l'intera
intro, l'intera sezione), sono stati granularizzati — titolo + primo paragrafo insieme (evita un
titolo isolato in fondo pagina), ogni paragrafo successivo per conto proprio — così un testo lungo
scorre su più pagine senza mai tagliare un paragrafo a metà.

**Prestazioni (chiude B09/B10/R13)**

`AllRoutesMap.tsx`: aggiunto un `ResizeObserver` che chiama `map.invalidateSize()` a ogni cambio di
dimensione del contenitore — prima Leaflet misurava la mappa una sola volta alla creazione e non si
accorgeva se il layout del libro cambiava dopo (foto e grafici che arrivano in background), con tile
mancanti e tracciato non centrato come conseguenza visibile.

Nuovo `components/LazyMount.tsx`: rimanda il montaggio di una mappa Leaflet finché non è a 600px dal
viewport. Applicato alla mappa di ogni `DiarioReportPage`: prima 50 resoconti significavano 50
istanze Leaflet vive fin dal primo render, ognuna con il proprio `tileLayer`.

`DiarioYearDivider.tsx` → `DiarioYearBand`: da pagina A4 intera (chiude B46) a fascia inline
incorporata in cima alla prima pagina dell'anno — sei anni di attività non sono più sei pagine quasi
vuote, né sei pagine fisiche PDF sprecate.

**Pubblicazione (chiude B26/B28)**

Barra di avanzamento nel pannello di condivisione, alimentata dal callback `onProgress` del
paginatore (Fase 0.4). Guardia `chartsAndPhotosReady`: il pulsante «Pubblica»/«Scarica» resta
disabilitato finché foto e trackpoint di *tutti* i resoconti non sono arrivati (o falliti) — prima si
poteva pubblicare un attimo dopo l'apertura della pagina e ottenere un PDF senza foto né grafici,
senza alcun avviso. Pulsante «Ripubblica» quando il diario è già pubblicato (prima bisognava
rimuovere il link e ricrearlo). Gli errori del download non sono più inghiottiti: sempre loggati e
sempre mostrati (il pannello di condivisione si apre da solo se l'errore viene da un download).

**Revoca reale (chiude B11)**

`DELETE /api/diary-token` ora cancella davvero l'oggetto dallo Storage (`dtrek-reports/${userId}/
diary.pdf`) e ruota `diary_token` — prima azzerava solo `diary_pdf_url`, lasciando il PDF
raggiungibile a chi ne avesse l'URL diretto e permettendo al vecchio link di tornare valido alla
pubblicazione successiva.

**Link pubblico come pagina HTML (chiude B12/B13/B33/B34)**

`/leggi/d/[token]` è ora una pagina di atterraggio vera (`generateMetadata`, OpenGraph/Twitter card,
`opengraph-image.tsx` in stile DTrek), non un embed nudo di PDF: copertina, titolo/sottotitolo/
autore, statistiche aggregate, indice delle escursioni (nuovo `lib/sharePublicDiary.ts`, stesso
principio di `lib/sharePublic.ts` — service-role client dietro token opaco, dati curati). Il PDF
resta scaricabile, ma come opzione (bottone «Sfoglia il diario» che monta `PdfViewer` solo al clic,
più «Scarica il PDF» diretto) non come unica forma.

Nuovo `components/AppChrome.tsx`: splash screen, service worker, motore di sincronizzazione, gate di
onboarding e affini non si montano più su `/s/…` e `/leggi/…` — prima un visitatore anonimo li
riceveva tutti, incluso il rischio che `OnboardingGate` coprisse il contenuto con un wizard a schermo
intero. Nuovo `app/not-found.tsx`: un link revocato porta a una pagina con l'identità DTrek, non più
al 404 nudo di Next.

`app/components/PdfViewer.tsx` (condiviso anche da `/leggi/r/[activityId]`) riscritto: palette e font
passano da navy/Georgia/Arial a forest/stone con i token del brand; nuova modalità "dimensione
reale" con scroll, per leggere il testo alla sua risoluzione di rendering invece che sempre
compresso nella larghezza dello schermo (chiude B13); risolta la corsa a leggere/scrivere lo stato
`rendering` in modo asincrono (chiude B47) sostituendola con un `useRef` mutato in modo sincrono.

**Non affrontato in questa fase** (motivato singolarmente in §1): B27 (paginazione di
`/api/resoconto?all=true`, rimandato a un intervento di performance a sé), B30 (palette Tailwind
standard nei temi StatCard, cosmetico), B32 (token per il resoconto pubblico, deferred a Fase 4.2),
B45 (margine di stampa nativa, minore).

**Deduplicazione palette (chiude una voce di §4)**: `ROUTE_COLORS` di `lib/designTokens.ts` (già
creata in Fase 0) è ora la sorgente unica per `AllRoutesMap.tsx`, `DiarioMappa.tsx` e le due copie in
`utils/pdfExport/mapTiles.ts` — prima quattro liste di colori scritte a mano, con la legenda del
diario che poteva mostrare un colore diverso da quello del tracciato che stava descrivendo.

### Fase 2 — Condivisione dai resoconti

**Mappa su MapLibre (chiude parte di B36, apre la base per il carosello)**

`utils/shareImage/activityImage.ts` e `mapImage.ts` non passano più da `drawTiledMap`/
`drawRouteOnTiles` (tile raster CartoDB Voyager) ma da `renderRouteMap` (`lib/mapSnapshot.ts`, già
pronto dalla Fase 0): basemap "outdoor" con rilievo e sentieri, nitidezza reale a `pixelRatio: 2`,
attribuzione incisa nel PNG. `mapImage.ts` aveva una `ROUTE_COLORS` locale duplicata: rimossa a
favore di quella condivisa in `lib/designTokens.ts`.

La scheda "mappa a tutto campo" di `activityImage.ts` (gradiente, titolo, statistiche, profilo)
è stata estratta nella funzione esportata `drawActivityMapCard`, con un parametro opzionale per
passare una mappa già resa: il carosello la riusa per la copertina *senza* pagare una seconda volta
il costo di MapLibre, e riusa di nuovo la stessa immagine come sfondo della scheda di chiusura —
un solo `captureRouteMap` per l'intera sequenza, indipendentemente da quante schede produce.

`ResocontoHub.tsx` non ricampiona più la traccia a 250 punti prima di passarla al modale di
condivisione: la mappa vettoriale non ha nulla da guadagnare da una traccia più povera (a
differenza delle tile raster, dove serviva a contenere il numero di segmenti disegnati), quindi ora
riceve `activity.trackPoints` per intero. Chiude B36 solo per questo percorso — vedi la nota
aggiornata su B36 in §1.3 per cosa resta fuori.

**Formato 4:5 (Instagram Feed)**

Aggiunto a `ShareFormat` con dimensioni 1080×1350, le stesse di `VIDEO_DIMS['4:5']` in
`RouteMap3D.tsx:269` (coerenza con quanto il video già usa). Le dimensioni di ogni formato sono
state estratte in `FORMAT_DIMS` (`canvasHelpers.ts`), unica fonte condivisa da `makeCanvas` e
dall'anteprima del modale — **chiude B35 alla radice**: prima l'anteprima dichiarava
`aspectRatio: '16/9'` mentre `makeCanvas` produceva 1200×630 (rapporto 1,905, non 1,778); con
`FORMAT_DIMS` i due punti non possono più andare fuori sincrono, perché leggono lo stesso valore.

**Link pubblico invece della pagina privata (chiude B20)**

`handleFacebook` e il ripiego di `handleCopy` in `ShareModal.tsx` condividevano
`window.location.href` — per il resoconto, un URL privato e autenticato: chi apriva il link dal feed
vedeva la schermata di accesso. Nuovo `getShareUrl()`: per `kind === 'activity'` crea il link
pubblico `/s/{token}` al volo se non esiste ancora (prima l'utente doveva averlo già creato a mano
nel pannello "Link pubblico" perché Facebook/Copia funzionassero in modo sensato), altrimenti
riusa quello esistente. Per `stats`/`comparison`/`map` non esiste un concetto di link pubblico:
il pulsante Facebook per questi tre tipi è ora disattivato invece di condividere silenziosamente
una pagina privata — non era nell'ambito di questa fase costruire link pubblici anche per quelle
viste, ma lasciarli attivi e rotti sarebbe stata una regressione mascherata da correzione parziale.

**Nuova modalità carosello**

`utils/shareImage/carousel.ts` (nuovo): `generateCarousel(activity, photos, opts, fmt)` produce
copertina → una scheda per gruppo di foto vicine → scheda dati opzionale → chiusura, come sequenza
di PNG. Riuso diretto, senza riscriverlo, del codice canvas 2D dello Studio Video:

| Cosa | Da | Uso nel carosello |
|---|---|---|
| `drawStopPhotoZoom` + `StopPhoto` | `lib/videoOverlays.ts:826,764` | Scheda foto (polaroid, fino a 4 per scheda, con didascalia se ≤2) — chiamato con `zoomT=1, stopT=0` per un fotogramma fermo già completamente aperto |
| `drawMiniMap` + `buildMiniRoute` | `:660,642` | Mini-mappa d'insieme nell'angolo di ogni scheda foto, con il punto sulla posizione del gruppo |
| `groupPhotoTimings` + `buildCumulativeDistances`/`progressToDistanceM` | `lib/videoPhotoCarousel.ts:26,54,73` | Raggruppa foto scattate entro 50m di percorso in un'unica scheda, invece di una scheda per foto |
| `drawNumbersBeat` / `drawElevationBeat` | `lib/videoOverlays.ts:1380,1395` | Scheda dati opzionale — altimetria se il profilo è disponibile, altrimenti i tre numeri principali. Chiamati con `t=0.85`: oltre la soglia (`k>0.55` per l'altimetria, `k>0.64` per l'ultima riga della griglia numeri) a cui l'animazione di ingresso è già completa |
| `drawEndCard` | `:1849` | Chiusura, con `fade=1` (a regime) sopra la stessa mappa già resa per la copertina |
| `safeInsetsFor` | `:81` | Margine della mini-mappa, per restare fuori dalle zone coperte dall'interfaccia di Instagram Stories |
| `loadRemoteImageEl` (nuovo, `canvasHelpers.ts`) | — | `crossOrigin='anonymous'` prima di `.src` per ogni foto Supabase disegnata su un canvas destinato a `toDataURL()` — senza, `SecurityError` anche su bucket pubblico (stesso vincolo già documentato in `RouteMap3D.tsx:1194`) |

**Non riusati, con motivazione** (valutati durante la Fase 2, scartati deliberatamente):
- `selectPhotosAvoidingCrowding` (`lib/videoTimeline.ts:231`) — richiede `routeSeconds`, un
  concetto legato al montaggio video (durata in secondi), non pertinente a una sequenza statica;
- `suggestCaptions` (`lib/videoCaptions.ts:61`) — estrae didascalie dal testo della **guida**; le
  foto del resoconto hanno già una didascalia propria scritta dall'utente, fonte diversa e già
  presente;
- `StudioControl`/`StudioGroup` (`lib/videoStudio.ts`) — modello a dati per il pannello a due
  colonne dello Studio Video; il modale di condivisione resta sul pattern `Toggle` già in uso,
  coerente con `stats`/`comparison`/`map` nello stesso file.

**Copertina con pin numerati**: la mappa della copertina (e della chiusura) riceve un marker
`kind: 'photo'` per ogni foto inclusa con coordinate GPS note, numerato nello stesso ordine delle
schede del carosello — usa il sistema di marker già presente in `lib/mapSnapshot.ts`
(`captureRouteMap`'s `markers`), non `drawPhotoPin` di `videoOverlays.ts` (quest'ultimo richiede le
coordinate proiettate `map.project()` di un'istanza mappa viva, non disponibili dopo che
`captureRouteMap` ha già chiuso la mappa e restituito un PNG piatto).

**Numerazione delle schede**: ogni immagine del carosello riceve un pallino "N / totale" in alto a
sinistra, ridisegnato in un secondo passaggio sul PNG già prodotto (funzione `withSlideIndex`) — un
solo punto che sa quante schede ci sono in totale, invece di doverlo passare a ognuno dei quattro
rami che generano una scheda.

**Esportazione**: `navigator.share` con più file quando il dispositivo lo supporta (verificato con
`navigator.canShare({ files })` sull'array intero, non su un file alla volta), altrimenti ZIP via
`fflate` (`zipSync`, già una dipendenza del progetto — vedi `lib/kmzExtract.ts` per l'uso gemello in
lettura). Il download della singola scheda resta disponibile anche in modalità carosello (scarica
solo quella a fuoco nell'anteprima).

**UI**: selettore di modalità (Scheda singola ⇄ Carosello) in `ShareModal.tsx`, visibile solo per
`kind === 'activity'` quando `photos.length > 0`. Elenco foto con miniatura, inclusione a
toggle e campo didascalia modificabile per quel carosello (non tocca la didascalia salvata
sull'attività). `ResocontoHub.tsx` ora passa `photos` al modale — prima non veniva passata affatto,
il carosello non era costruibile.

**Non affrontato in questa fase** (motivato singolarmente in §1/§2): B36 resta aperto per
`generateMapImage`/`stats`/`comparison` (non ricevono la traccia piena); V07 (foto senza miniatura)
si applica ora anche al download delle schede del carosello, non solo alla galleria.

### Fase 4 — Export PDF di guide e resoconti

Prima esistevano **quattro** documenti per due oggetti: `exportPlannedPdf` + `exportGuidePdfHtml`
per la guida, `exportActivityPdf` + `publishPdf` per il resoconto — ognuna delle due coppie con
stile, colori e persino contenuto diversi per lo stesso oggetto. Ora sono **due**: un solo motore
DOM-based per ciascuno, `exportGuidePdf` (guida) e `renderReportPdf.ts` (resoconto). `stats.ts`/
`map.ts` restano su jsPDF, come previsto dal piano — sono schede dati, non documenti editoriali —
ma sono stati corretti.

**4.1 — Guida (chiude B14, B15, B16, B18, B19, B43, B44; V04, V05)**

`buildGuideContent.ts` mappava solo 6 sezioni su 9: *Verificato online*, *Dati e sicurezza* e *Su
misura per te* non arrivavano mai al PDF, con esse gli avvisi di chiusura sentiero (in rosso a
schermo) che non comparivano in nessuna forma. Aggiunte tutte e tre in `GuideTemplate.tsx`
(`sections.verificato/datiSicurezza/suMisura`), nello stesso ordine canonico di
`lib/guideSections.ts`. "Verificato online" porta con sé gli avvisi (`GuideNotice[]`, banner
colorati per gravità — nuove classi `.guide-notice-{danger,warning,info}` in `guide-print.css`) e le
fonti consultate (`GuideSource[]`, come pillole), gli stessi dati già mostrati a schermo
(`hike.cachedGuideNotices`/`cachedGuideSources`), letti direttamente da `hike` dentro
`buildGuideContent.ts` — non serviva passarli a parte.

Il piano segnalava anche un secondo buco: `PdfExportButton.tsx` (pannello "strumenti" di
`GuidaHub.tsx`) chiamava ancora il vecchio `exportPlannedPdf` (jsPDF), un documento diverso da
quello che il pulsante "Scarica PDF" dentro la guida stessa produceva (`exportGuidePdf`, DOM). Il
contenuto esclusivo del primo — badge di difficoltà, punteggio "adatta a te", rischi/consigli
(`hike.assessment`) — non esisteva nel secondo: perderlo senza sostituto sarebbe stata una
regressione, non solo un ritiro di codice morto. Nuovo `GuideAssessment.tsx`, sulla pagina "a colpo
d'occhio" (`GuideOverview.tsx`), con gli stessi dati e gli stessi token di colore del resto del
documento. Il bottone in `GuidaHub.tsx` ora chiama lo stesso `exportGuidePdf(hike, hike.cachedGuide)`
del lettore, disabilitato con un titolo esplicativo se la guida non è ancora stata generata (`hike.
cachedGuide` vuoto) invece di produrre un PDF con le sezioni narrative vuote.

Il titolo di sezione appariva due volte senza motivo apparente (occhiello maiuscolo + `h2`, stesso
testo): mancava la riga esplicativa (`subtitle`, già definita in `lib/guideSections.ts` e scartata).
Aggiunta a `GuideSection.tsx` e passata da ogni chiamata in `GuideTemplate.tsx` — completa lo stesso
schema a tre livelli già usato a schermo (`SectionCard.tsx`) invece di lasciare occhiello e titolo
senza nulla in mezzo a spiegare la ripetizione.

Credito fotografico `© Wikimedia Commons` cablato in `GuideSection.tsx`, mentre
`fetchRoutePhotos.ts` produce già `© {autore} / Wikimedia Commons` — per foto CC-BY l'attribuzione
nominale non è opzionale. La catena `fetchCoverPhotos` (`usePDFExport.ts`) → `buildGuideContent.ts`
→ `GuideSection` ora porta `{url, credit}` invece di una stringa nuda (nuovo tipo
`GuideSectionPhoto`, esportato da `GuideSection.tsx`).

`column-count: 3` sulla sezione "Il percorso" (quando priva di foto) era incompatibile con
l'impaginatore: i `bottom` dei blocchi in colonne diverse sono interlacciati sull'asse verticale, e
il punto di taglio calcolato cadeva in mezzo al testo di una colonna. Tornata a colonna singola —
risolve anche la giustificazione troppo stretta segnalata a parte (V05).

Titolo di copertina a 52px fissi, senza adattamento alla lunghezza, in un riquadro con
`overflow:hidden`: un titolo lungo usciva dal riquadro e veniva tagliato senza traccia visibile
dell'errore. `GuideCover.tsx` ora sceglie la dimensione (52/42/34/28px) in base al numero di
caratteri del titolo.

`preserveAspectRatio="none"` sulla fascia altimetrica decorativa deformava il profilo verticalmente.
Rimosso (il default `xMidYMid meet` scala in proporzione). La funzione che costruisce il tracciato
SVG è stata estratta in `lib/elevationSvgPath.ts`, condivisa con il nuovo profilo altimetrico del
Resoconto (vedi 4.2) — prima sarebbe stata una quarta copia della stessa idea.

`◆`/`⚠` (etichette "Lo sapevi?"/"Stato del percorso") e il ripiego `📍` per i POI senza emoji
propria: caratteri Unicode "a forma di simbolo" che html2canvas rende con il font di sistema, quindi
in modo non deterministico tra macchine. Sostituiti con forme CSS (`.guide-icon-diamond`, un rombo)
o icone `lucide-react` (`MapPin`) già usate altrove nello stesso documento — l'emoji per-tipo di POI
(`POI_META`), quella vera e voluta, non è stata toccata.

Grigi ad hoc unificati sui token di `lib/designTokens.ts` (V04): `#1C1C1C`→INK, `#2D2D2D`/`#44403c`
→STONE[800], `#3D3D3D`→STONE[700], `#e8e4de`→HAIRLINE, `#fafaf8`/`#f8f7f4`→STONE[50] (erano due
quasi-bianchi quasi identici, ora uno solo), `#888`→STONE[500], `#AAA`/`#a8a29e`→STONE[400]. I
colori di marca (`#d97220`, `#c05a17`, `#813619`, `#378d44`) erano già gli esadecimali corretti di
TERRA/FOREST — CSS statico non ha un modo di referenziare `lib/designTokens.ts` direttamente, quindi
restano scritti a mano, ma già allineati.

**4.2 — Resoconto: riscrittura di `HiddenPdfRoot.tsx` (chiude B01, B17; aggiunge mappa/profilo/
statistiche/POI come richiesto dal piano)**

Rampa colori delle intestazioni di sezione: `#b7e4c7`/`#d8f3dc` con testo bianco sopra, contrasto
≈1,3:1 e ≈1,2:1 — le ultime due sezioni di un racconto lungo erano illeggibili. Sostituita con
`narrativeStyleFor()` di `components/resoconto/sectionStyle.ts`, la stessa già verificata WCAG ≥5:1
e usata a schermo (invece di una terza scala scritta solo per questo file).

`float: right` sulla foto di sezione, in un contenitore senza `overflow:hidden` né
`display:flow-root`: la foto sfondava il bordo della card e, non contribuendo all'altezza del
genitore, il punto di taglio calcolato dal paginatore cadeva sopra di essa e la tagliava fra due
pagine. Sostituito con una riga flessibile (`display:flex`) — un figlio flex contribuisce sempre
all'altezza reale del genitore, il problema non si pone per costruzione, non serviva nessun
`overflow`/`flow-root` di ripiego.

**Aggiunto ciò che mancava del tutto** (il PDF era un racconto con foto in cui la parte
escursionistica spariva): statistiche (distanza, dislivello, durata, quota massima, passo medio,
calorie — griglia in testa), mappa del percorso (MapLibre via `lib/mapSnapshot.ts`, resa una sola
volta da `renderReportPdf.ts` prima del mount, passata come prop già pronta — nessuna mappa
interattiva montata solo per essere sostituita da un raster, a differenza del Diario: qui la radice
è comunque sempre e solo fuori schermo), profilo altimetrico (stesso SVG condiviso della Guida,
`lib/elevationSvgPath.ts`), punti di interesse (`poiWikiEntries`, già raccolti da `ReportReader.tsx`
per il widget a schermo, ora anche nel PDF — nome, tipo, distanza, miniatura Wikipedia).

`.pdf-block` granulari: ogni paragrafo del racconto ha ora il proprio blocco (prima l'intera sezione,
fino a diverse migliaia di pixel, era un blocco solo — lo stesso difetto già risolto per il Diario
in Fase 3, qui applicato al Resoconto).

**`HiddenPdfRoot` non è più montato permanentemente** nel DOM di `ReportReader.tsx`: prima c'era
sempre, anche quando nessuno stava esportando nulla, e ogni foto veniva scaricata due volte (una per
la vista a schermo, una per questa radice nascosta sempre presente). Nuovo `renderReportPdf.ts`
(stesso pattern di `usePDFExport.ts` per la Guida): monta il componente fuori schermo solo al
momento della cattura, con `createRoot`/`flushSync`, e lo smonta subito dopo.

**4.3 — Ritiro dei template jsPDF (chiude B04, B06, B08, B22, B24, B37, B38, B39, B40; B05, B07,
B23, B25, B41, B42 risolti per rimozione del codice che li conteneva)**

`utils/pdfExport/activity.ts` (`exportActivityPdf`) e `utils/pdfExport/planned.ts`
(`exportPlannedPdf`) sono stati **rimossi**: producevano un secondo PDF, jsPDF, fuori stile, per
oggetti che hanno già un documento DOM-based corretto. I bottoni che li richiamavano
(`ResocontoHub.tsx` "strumenti", `GuidaHub.tsx` "strumenti") sono stati rimossi o ripuntati al
motore unico (vedi 4.1/4.2) — non è rimasta nessuna funzionalità in meno, solo un secondo documento
di qualità inferiore in meno.

Con quei due file spariscono anche una manciata di difetti che vivevano solo lì, senza bisogno di
correggerli riga per riga: griglia POI che derivava (`renderPois`, B05 — la funzione stessa è stata
rimossa da `docHelpers.ts`, era usata solo da `planned.ts`), ellissi aggiunta dopo `safeText`
scavalcando `txt()` (B07), guardia di pagina mancante sulla mappa (B25), descrizioni POI troncate
due volte alla cieca (B41), piè di pagina non troncato che si sovrapponeva al numero (B42).

`docHelpers.ts` riscritto:
- **Palette derivata da `lib/designTokens.ts`** invece di valori scelti a mano — `FOREST` era
  `[22,101,52]`, esattamente il verde-800 di Tailwind, non un colore DTrek; ora `rgb(FOREST_SCALE
  [600])`. `SKY` (mai più usato dopo il ritiro di `planned.ts`) è stato rimosso.
- **`safeText` sostituita da `pdfSafe`** (`lib/pdfPaginate.ts`, ora esportata): la vecchia versione
  eliminava tutto ciò che sta fuori da Latin-1, quindi cancellava in silenzio trattini lunghi,
  virgolette curve e puntini di sospensione; `pdfSafe` conserva anche la fascia alta di CP1252, dove
  quei segni stanno (B06). Una sola implementazione invece di due che rischiavano di divergere.
- **`statBox` ora tronca** (nuovo `fitOneLine`, con ellissi): prima un'etichetta o un valore lunghi
  uscivano dal riquadro e si sovrapponevano a quello adiacente (B08).
- **`footer()` legge le dimensioni reali della pagina** (`doc.internal.pageSize`) invece di
  coordinate cablate per A4 verticale (Y=291, X=196): `exportMapPdf` crea il documento in
  orizzontale (297×210mm), quindi il piè di pagina non compariva mai, essendo sotto il bordo
  inferiore della pagina (B04).

`stats.ts`/`map.ts`: intestazione con un terzo verde cablato (`setFillColor(22,78,50)`, diverso dal
`FOREST` usato tre righe sotto) sostituita con il token (B38); accenti tolti a mano per aggirare la
vecchia `safeText` ("Piu calorie", "Attivita Mensili" — non necessario, gli accenti italiani sono
già dentro Latin-1) ripristinati (B39); soglie di fine pagina incoerenti (270 in tutte le guardie
tranne una a 280) uniformate a 270 (B40); rapporti d'aspetto dei canvas allineati ai riquadri
d'incasso — prima 540×160 (3,375:1) dentro un riquadro 182×38mm (4,79:1, +33% di stiramento
orizzontale) e 1800×700 (2,57:1) dentro 269×160mm (1,68:1, −35% verticale) (B22).

`canvasCharts.ts`: `chartLine`, rimasta senza chiamanti dopo il ritiro di `activity.ts`/`planned.ts`
(gli unici due che la usavano), è stata rimossa — con essa il difetto che portava (asse X per indice
del punto, non per distanza, B23) è sparito insieme al codice morto che lo conteneva.
`chartRouteFallback` (il ripiego vettoriale quando le tile satellite non arrivano, ancora in uso da
`mapTiles.ts`) proiettava la latitudine **linearmente**: alle latitudini italiane un percorso
risultava allungato di circa il 37% in orizzontale. Sostituita con una proiezione di Mercatore
(`mercatorY`, la stessa matematica di ogni mappa web) sull'asse verticale (B24). Colore di default
allineato a FOREST[600] (era `#166534`, verde-800 Tailwind).

`PdfExportButton.tsx`: tipo `Variant` ridotto a `'stats' | 'map'` (`'activity'`/`'planned'` non
esistono più).

**4.4 — Deduplicazione**: vedi §4 per il dettaglio di ogni voce. In sintesi: il campionamento
polilinea triplicato e il ricampionamento grafici a 250 punti sono spariti insieme ai due file
jsPDF ritirati; `usePDFExport.ts` usa ora `lib/downsamplePolyline.ts` invece di un campionamento a
modulo scritto a mano; `parseTextBlocks` (Guida PDF) e `parseBlocks` (schermo, Guida e Resoconto)
sono stati unificati in `lib/guideMarkup.ts`; il profilo altimetrico SVG è condiviso tra Guida e
Resoconto (`lib/elevationSvgPath.ts`); la mappa icona/colore delle sezioni della Guida in breve ora
elenca le stesse 9 sezioni (prima 6) con gli stessi colori dell'equivalente a schermo. Non unificati
(motivati singolarmente in §4): i due cucitori di tile lato PDF/condivisione, la griglia fotografica
di stampa nativa contro quella catturata via html2canvas.

**Non affrontato in questa fase** (motivato in §1): B21 (buffer WebGL non preservato nello
screenshot 3D, fuori ambito), B27 (paginazione `?all=true`, intervento di performance a sé), B30
(palette Tailwind nei temi StatCard del diario, cosmetico), B32 (token opaco per il resoconto
pubblico — uno schema di link, non uno stile del PDF), B45 (margine di stampa nativa, minore). Nuovi
V12 (stesso difetto di B16 ma a schermo, in `MagazineBody.tsx`) e V13 (profilo altimetrico non
ancora provato su un tracciato GPS molto rumoroso) in §2.

### Correzioni dopo la revisione del PDF reale (post-Fase 4)

L'utente ha fornito un PDF di resoconto realmente esportato e ha segnalato quattro cose: PDF del
resoconto non ancora perfetto, Diario lentissimo e mal impaginato senza margini, app in generale
rallentata, export PDF delle guide inattivo. Qui sotto cosa è risultato vero, come è stato
verificato e cosa è stato corretto.

**Metodo**: il paginatore è stato messo alla prova in Chromium headless riproducendone il DOM e
girando la logica reale (`safeBreaks`/`sliceHeights` + `html2canvas`), invece di dedurre le cause
dal solo aspetto del PDF. Due ipotesi plausibili sono state così **escluse**: l'altezza misurata
(`scrollHeight` 2582 contro rect 2582,25) e l'offset di cattura di html2canvas (un ritaglio chiesto
al confine di un blocco inizia esattamente su quel confine, verificato su una pagina a righe
numerate). Il paginatore era corretto: i difetti stavano altrove.

| Segnalazione | Esito | Causa |
|---|---|---|
| Diario mal impaginato, «pagine senza margini» | **Confermato, grave** | Le pagine del diario erano alte `1123px` (A4 pieno) ma l'area utile del PDF è `1067px`, perché la Fase 0 ha riservato 30px di testatina e 26px di piede. **Ogni pagina del libro ne produceva due**: una piena e una striscia da 56px quasi vuota |
| Diario lentissimo | **Confermato** | Due cause sommate: (a) il raddoppio di pagine qui sopra, che raddoppiava anche le catture; (b) `html2canvas` clona l'**intero documento** a ogni chiamata, e il modulo la chiama una volta per pagina — col libro a schermo *più* i cloni fuori schermo nel DOM, ogni cattura ricopiava decine di pagine A4. Costo quadratico nel numero di pagine |
| Export PDF guide inattivo | **Confermato, regressione della Fase 4** | Il pulsante "Esporta PDF" degli strumenti era stato ripuntato da `exportPlannedPdf` a `exportGuidePdf` e disabilitato senza `cachedGuide`. Ma i due documenti non erano la stessa cosa: il primo era una **scheda dati del percorso**, che funzionava anche senza guida AI. Su ogni itinerario privo di guida generata l'export è quindi sparito del tutto |
| PDF resoconto imperfetto | **Confermato, 4 difetti distinti** | Vedi sotto |
| App in generale rallentata | **Parzialmente confermato** | Nessuna regressione trovata nei bundle (`/resoconto` 665→657 kB fra Fase 2 e 4). Trovato però un peso evitabile: `renderReportPdf.ts` — che si porta dietro il template PDF, `react-dom/client`, jsPDF e html2canvas — era importato **staticamente** in `ReportReader.tsx`, quindi finiva nel bundle della rotta più pesante dell'app anche per chi non esporta nulla. Reso dinamico. Il resto della lentezza percepita non è riconducibile a una causa misurata: va riverificato dopo queste correzioni |

**I quattro difetti del PDF del resoconto**

1. **Markdown dell'enfasi stampato alla lettera**: si leggeva `****9 chilometri****`. Il corpo delle
   sezioni è markdown, ma veniva reso come testo grezzo. Nuova `parseInlineEmphasis`
   (`lib/guideMarkup.ts`) che restituisce segmenti `{text, bold}` — segmenti e non HTML per restare
   indipendente dal framework — resi come `<strong>` dal template. Riconosce anche la variante a
   quattro asterischi che i modelli producono ogni tanto, e ripulisce gli asterischi spaiati.
2. **Intestazione di sezione orfana**: «02 CRONACA» restava da sola in fondo a pagina 1. Il fondo
   di quel blocco era un punto di taglio legittimo, e il paginatore non aveva modo di sapere che
   un'intestazione non deve restare ultima. Nuova classe `.pdf-keep-next`: i blocchi marcati non
   generano un punto di taglio, quindi l'interruzione cade *sopra* di essi e l'intestazione parte
   con il suo testo.
3. **Taglio in mezzo a una riga di testo** fra pagina 2 e 3 (metà superiore dei caratteri su una
   pagina, metà inferiore sull'altra). Succede quando nessun confine di blocco entra nella pagina
   rimasta: il paginatore ripiegava sul bordo pagina esatto. Ora i **riquadri di riga** (via
   `Range.getClientRects()` sui nodi di testo) fanno da punti di taglio di ripiego, calcolati solo
   quando servono davvero. Il taglio peggiore possibile cade così *fra* due righe, che è la normale
   interruzione tipografica. In più i confini di blocco includono ora metà del margine inferiore,
   per non tagliare a filo dei glifi.
4. **Testo ritagliato a metà altezza** nei nomi dei luoghi e nelle didascalie: `overflow:hidden` su
   un serif senza interlinea dichiarata, che html2canvas ritaglia al box del contenuto. Aggiunta
   un'interlinea esplicita.

**Verifica delle correzioni** (stesso banco di prova in Chromium): con un'intestazione `pdf-keep-next`
che cadrebbe a fine pagina, il taglio si sposta sopra di essa; con un blocco unico più alto della
pagina, i tagli forzati passano da 1 a **0** e l'interruzione cade su un confine di riga.

**Nota sull'area utile**: `lib/pdfPaginate.ts` esporta ora `PDF_PAGE_W`/`PDF_PAGE_H`/`PDF_CONTENT_H`.
Un template che si disegna alto quanto l'A4 pieno sfora e viene spezzato in due: è l'errore che il
Diario faceva. Solo le pagine `.pdf-bleed` (le copertine, su cui testatina e piede non vengono
disegnati) possono usare `PDF_PAGE_H`. Le pagine del diario usano ora `PDF_CONTENT_H`, così una
pagina del libro corrisponde a una pagina del PDF.
