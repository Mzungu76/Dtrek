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

### 1.1 Bloccanti

| ID | Dove | Difetto | Stato | Fase |
|---|---|---|---|---|
| B01 | `app/resoconto/[id]/HiddenPdfRoot.tsx:48` | Rampa colori delle intestazioni di sezione: `#b7e4c7` e `#d8f3dc` con testo bianco sopra, contrasto ≈1,3:1 e ≈1,2:1. Le sezioni 4 e 5 sono **illeggibili**. Esiste già `NARRATIVE_COLORS` in `components/resoconto/sectionStyle.ts:35`, verificato WCAG ≥5:1 e usato a schermo: nel PDF c'è una terza scala, diversa da entrambe | Verificato | 4.2 |

### 1.2 Gravi

| ID | Dove | Difetto | Stato | Fase |
|---|---|---|---|---|
| B04 | `utils/pdfExport/docHelpers.ts:56-64` + `utils/pdfExport/map.ts:10` | Il piè di pagina è cablato a Y=291mm e X=196mm, coordinate valide per A4 **verticale**. `exportMapPdf` crea il documento in **orizzontale** (297×210): 291 > 210, quindi **il piè di pagina non compare mai**. Anche l'ancoraggio a destra è sbagliato (196 invece di 283) | Verificato | 4.3 |
| B05 | `utils/pdfExport/docHelpers.ts:138-153` | Griglia dei POI senza descrizione: `cy = y + row * 7` mentre `y` avanza di 8 a riga completata. Ogni riga scivola in basso di 7mm cumulativi. La guardia di fine pagina controlla `y`, non `cy`, quindi le ultime righe possono finire **fuori pagina** | Verificato | 4.3 |
| B06 | `utils/pdfExport/docHelpers.ts:19` | `safeText` elimina tutto ciò che sta fuori da Latin-1, quindi cancella in silenzio trattini lunghi (`—`), virgolette curve, puntini di sospensione (`…`) e la stella `★` di `map.ts:59`. In `lib/pdfPaginate.ts` è già stato sostituito da `pdfSafe`, che conserva la fascia alta di CP1252 | Verificato | 4.3 |
| B07 | `utils/pdfExport/planned.ts:22-25`, `activity.ts:20-23` | Il troncamento del titolo aggiunge `…` **dopo** `safeText` e chiama `doc.text` direttamente, scavalcando `txt()`. Il carattere arriva a jsPDF senza sanificazione | Verificato | 4.3 |
| B08 | `utils/pdfExport/docHelpers.ts:45-54` | `statBox` non misura né tronca il testo: nessun `splitTextToSize`. Con box da 34,8mm (`planned.ts:53`) un valore lungo **esce dal riquadro e si sovrappone** a quello adiacente | Verificato | 4.3 |
| B14 | `app/components/guide/buildGuideContent.ts:118-131` | Il PDF della guida mappa **6 sezioni su 9**: mancano del tutto *Verificato online*, *Dati e sicurezza*, *Su misura per te*. Gli avvisi di chiusura sentiero, in rosso a schermo, non compaiono in nessuna forma nel PDF | Verificato | 4.1 |
| B15 | `app/components/guide/GuideSection.tsx:156-159` | Il titolo di sezione è stampato **due volte**: occhiello maiuscolo e `h2` ricevono entrambi `title`. `lib/guideSections.ts:31-48` definisce già un `subtitle` che il PDF scarta | Verificato | 4.1 |
| B16 | `app/components/guide/GuideSection.tsx:170,181` | Credito fotografico `© Wikimedia Commons` cablato, mentre `fetchRoutePhotos.ts:66` produce già il credito corretto con l'autore, che `buildGuideContent.ts:99` butta via. Per foto CC-BY è una violazione di licenza | Verificato | 4.1 |
| B17 | `app/resoconto/[id]/HiddenPdfRoot.tsx:54` | `float: right` in un contenitore senza `overflow:hidden` né `display:flow-root`. La foto sfonda il bordo della card e, non contribuendo all'altezza del genitore, il punto di interruzione calcolato cade sopra di essa e **la taglia tra due pagine** | Verificato | 4.2 |
| B18 | `app/components/guide/guide-print.css:513` + `GuideSection.tsx:191` | `column-count: 3` è incompatibile con l'impaginazione: i `bottom` dei blocchi nelle tre colonne sono interlacciati, quindi i tagli cadono in mezzo al testo | Verificato | 4.1 |
| B19 | `app/components/guide/guide-print.css:94-104` | Titolo di copertina a 52px fissi senza `clamp` in un contenitore con `overflow: hidden`: un titolo lungo esce dal riquadro e **viene tagliato senza traccia** | Verificato | 4.1 |
| B20 | `components/ShareModal.tsx:189-205` | `handleFacebook` e il ripiego di `handleCopy` condividono `window.location.href`, che dal resoconto è un URL **privato e autenticato**: chi apre il link dal feed vede la pagina di accesso. Il link pubblico corretto (`/s/{share_token}`) esiste ma non viene usato | Verificato | 2.1 |

### 1.3 Medi

| ID | Dove | Difetto | Stato | Fase |
|---|---|---|---|---|
| B21 | `components/RouteMap3D.tsx:1728` | **Fuori ambito, ma è un bug reale.** In maplibre-gl 5 `preserveDrawingBuffer` vive dentro `canvasContextAttributes`; qui è passato al livello superiore con un cast a `any`, quindi **ignorato in silenzio** (verificato: nel bundle di maplibre 5.24 compare solo `preserveDrawingBuffer:!1`, nessuna gestione dell'opzione legacy). La registrazione video non ne risente perché legge dentro l'evento `render` — e il commento a `:3175-3180` documenta i fotogrammi neri comparsi quando fu aggiunto un `requestAnimationFrame` di ritardo, che è esattamente la firma del buffer non preservato. Ma `handleCapture` (`:2011`, il pulsante screenshot della vista 3D) legge **fuori** da un evento render: dovrebbe produrre un PNG nero o vuoto | Verificato | fuori ambito — decidere a parte |
| B22 | `utils/pdfExport/canvasCharts.ts` + chiamanti | Rapporti d'aspetto sbagliati su tutti i grafici e le mappe del motore jsPDF: canvas 540×150 dentro riquadri 182×38mm significa **+33% in orizzontale**; `map.ts` è −35% in verticale | Verificato | 4.3 |
| B23 | `utils/pdfExport/canvasCharts.ts:11-42` | `chartLine` non ha assi, griglia né etichette, e l'asse X è **l'indice del punto**, non la distanza percorsa: un tratto pianeggiante campionato fitto e una salita breve campionata rada occupano lo stesso spazio. Il profilo altimetrico è geometricamente falso | Verificato | 4.3 |
| B24 | `utils/pdfExport/canvasCharts.ts:89-126` | `chartRouteFallback` usa una proiezione **lineare** lat/lon, non Mercatore: alle latitudini italiane il percorso risulta allungato di circa il 37% in orizzontale | Verificato | 4.3 |
| B25 | `utils/pdfExport/planned.ts:62-71` | Il blocco mappa non ha guardia di fine pagina (il profilo altimetrico sì, `:76`) e `mapImg` non è controllato prima di `addImage`: se `fetchSatMap` restituisce stringa vuota, jsPDF solleva un'eccezione che `PdfExportButton.tsx:43` inghiotte, e **il clic non produce nulla senza alcun riscontro** | Verificato | 4.3 |
| B27 | `app/api/resoconto/route.ts:326-331` | `?all=true` scarica il **markdown integrale di ogni resoconto** senza limite né paginazione, a ogni apertura del Diario. Non affrontato in Fase 3: risolverlo per bene richiede virtualizzare il libro (montare le pagine lazy), non solo l'endpoint — rimane un intervento a sé, più grosso della sola persistenza della configurazione | Verificato | non pianificata — da riprendere come intervento di performance a sé |
| B30 | `components/diario/types.ts:40-43` | `GREEN`/`AMBER`/`BLUE`/`VIOLET` usano colori Tailwind standard (`#f0fdf4`, `#166534`, `#eff6ff`…), estranei alla palette DTrek. Le `StatCard` del diario sono verdi-Tailwind, non forest. Non toccato in Fase 3: sono temi di accento per widget dati, non l'identità tipografica/cromatica principale della pagina — cambiarli ora avrebbe allargato il diff senza risolvere un difetto segnalato dall'utente | Verificato | da valutare, cosmetico |
| B32 | `app/leggi/r/[activityId]/page.tsx` | Il resoconto pubblico usa l'`activityId` in chiaro nell'URL invece di un token opaco, a differenza di `/s/[token]`. **Deliberatamente deferred a Fase 4**: la colonna `hike_reports.share_token` esiste già in produzione (indice unico verificato via MCP), ma migrare richiede toccare anche `app/api/share-report/route.ts` e il pannello "Pubblica PDF" di `ReportReader.tsx` — stesso file (`HiddenPdfRoot.tsx`) che la Fase 4.2 riscrive comunque da zero | Verificato | 4.2 |
| B35 | `utils/shareImage/canvasHelpers.ts:18` vs `components/ShareModal.tsx:282` | Il formato «16:9» produce in realtà 1200×630 (rapporto 1,90), mentre l'anteprima dichiara `aspectRatio: '16/9'`: anteprima e file esportato non coincidono | Verificato | 2.1 |
| B36 | `lib/blobStore.ts:120` | `ActivityMeta.routePolyline` è ridotta a **60 punti** da `downsamplePolyline`. Le immagini condivise di statistiche e mappa lavorano su quella, quindi con tracciati molto spezzati il percorso risulta spigoloso | Verificato | 2.1 |
| B37 | `utils/pdfExport/planned.ts:59-60`, `activity.ts:69-70`, `usePDFExport.ts:36-37` | Campionamento della traccia **a indice fisso**, non geometrico, riscritto tre volte. `lib/downsamplePolyline.ts` esiste e non è usata da nessuno dei tre. Su 12.000 punti se ne tiene 1 ogni 40: i tornanti vengono tagliati in linea retta | Verificato | 4.3 |

### 1.4 Minori

| ID | Dove | Difetto | Stato | Fase |
|---|---|---|---|---|
| B38 | `utils/pdfExport/stats.ts:21` | `setFillColor(22, 78, 50)` è un **terzo verde** cablato, diverso dal `FOREST` usato tre righe sotto | Verificato | 4.3 |
| B39 | `utils/pdfExport/stats.ts:64`, `activity.ts:85` | Accenti rimossi **a mano** dalle stringhe sorgente (`'Piu calorie'`, `'Attivita:'`) per aggirare `safeText`: nel PDF si legge italiano scorretto | Verificato | 4.3 |
| B40 | `utils/pdfExport/*` | Soglie di fine pagina incoerenti (270 / 278 / 280) contro un piè di pagina a 291mm | Verificato | 4.3 |
| B41 | `utils/pdfExport/docHelpers.ts:110-115` | Descrizioni dei POI troncate due volte alla cieca (340 caratteri, poi 2 righe), **a metà parola e senza ellissi** | Verificato | 4.3 |
| B42 | `utils/pdfExport/planned.ts:164` | Il piè di pagina non è troncato: con un titolo lungo si **sovrappone** al numero di pagina ancorato a destra | Verificato | 4.3 |
| B43 | `app/components/guide/GuideSection.tsx:142` | `preserveAspectRatio="none"` sulla fascia altimetrica: il profilo è deformato verticalmente e lo spessore del tratto non è uniforme | Verificato | 4.1 |
| B44 | `app/components/guide/` vari | Emoji nel PDF (`📍`, `◆`, `⚠`): html2canvas le rende con il font di sistema, quindi in modo non deterministico tra macchine | Verificato | 4.1 |
| B45 | `app/globals.css:107` | `@media print { @page { margin: 1.5cm } }` è in conflitto con le pagine `.diario-page` da 794px, che assumono margine zero: la stampa nativa rimpicciolisce o taglia. Non toccato: riguarda solo Ctrl+P, un percorso secondario rispetto a export/link pubblico | Verificato | da valutare, minore |

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
| V07 | `lib/activityPhotos.ts` | Le foto **non hanno miniatura**: un carosello di 10 foto scarica 10 file a piena risoluzione. Valutare una colonna `thumb_url` o il ridimensionamento lato client in Fase 2.2 |
| V08 | `lib/mapSnapshot.ts` | La cattura MapLibre va provata su un dispositivo reale a bassa memoria: il contesto WebGL può andare perso e far scattare il ripiego. Verificare che il ripiego produca comunque una mappa accettabile |
| V09 | `app/diario/page.tsx`, funzione `migrateLegacyConfigIfNeeded` | La migrazione da `localStorage` al `diary_config` server-side scatta solo se il config server è **esattamente** ai valori di default (`isConfigDefault`). È corretto per il rollout (nessun utente ha mai avuto un `diary_config` non-default prima di questa Fase), ma dopo il rollout una race a bassissimo rischio resta possibile: un dispositivo mai aperto da mesi, con `localStorage` legacy, potrebbe sovrascrivere una configurazione ormai genuinamente personalizzata da un altro dispositivo, SE quel dispositivo non ha mai completato la migrazione (flag `dtrek_diary_migrated_v1` mai scritto) — improbabile ma non impossibile. Nessuna azione richiesta, solo da tenere presente |
| V10 | `app/diario/page.tsx`, `handleCoverUpload` | La vecchia copertina in data-URL (`localStorage['dtrek_diary_cover']`) **non viene migrata automaticamente**: richiederebbe riconvertirla in Blob e ricaricarla silenziosamente, e molte di quelle copertine potrebbero essere già state troncate/perse dal `QuotaExceededError` che B03 descriveva. Un utente con la vecchia copertina locale la perde silenziosamente al primo caricamento con la nuova versione e deve ricaricarla una volta — accettabile, ma da segnalare se emergono lamentele |
| V11 | `components/diario/DiarioMappa.tsx`, `components/diario/DiarioStatistiche.tsx` | La mappa d'insieme e le statistiche aggregate del diario continuano a mostrare **tutte** le `activities`, non filtrate da `excludedActivityIds`: l'esclusione vale per le pagine del libro (e quindi per l'indice e per il PDF), non per questi due riepiloghi. Scelta deliberata per restare nell'ambito richiesto (escludere una narrazione dal libro, non falsare le proprie statistiche complessive), ma è una decisione di design implicita — da confermare con l'utente se si aspettava il contrario |

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
anche se non ancora usate dal codice (`share_token` resta per la Fase 4, vedi B32).

---

## 4. Duplicazione da assorbire

| Cosa | Dove | Nota |
|---|---|---|
| Due cucitori di tile completi | `utils/pdfExport/mapTiles.ts` e `utils/shareImage/tileHelpers.ts` | Stessa matematica scritta due volte con costanti divergenti. Con `lib/mapSnapshot.ts` ne resta uno solo, come ripiego |
| Palette tracciati triplicata | `mapTiles.ts` ×2, `app/diario/page.tsx:237` | Ora c'è `ROUTE_COLORS` in `lib/designTokens.ts` |
| Campionamento traccia ×3 | vedi B37 | `lib/downsamplePolyline.ts` esiste già |
| Ricampionamento grafici a 250 punti ×3 | `planned.ts:78`, `activity.ts:94,113` | Più una quarta variante a 40 punti in `buildGuideContent.ts:41` |
| Blocco «Profilo Altimetrico» | `planned.ts:74-90` vs `activity.ts:89-106` | 17 righe identiche a meno di due colori |
| Blocco «Note Personali» e intestazione | `planned.ts` vs `activity.ts` | Compreso il difetto dell'ellissi (B07) |
| `parseTextBlocks` duplicata e **già divergente** | `GuideSection.tsx:22-54` vs `components/editorial/MagazineBody.tsx:10-40` | Da estrarre in `lib/guideMarkup.ts` |
| Griglia fotografica duplicata | `app/resoconto/[id]/PrintPhotoGrid.tsx` vs `HiddenPdfRoot.tsx:70-85` | Valori diversi tra le due copie |
| Mappa icona/colore delle sezioni | `GuideOverview.tsx:11-18` vs `components/guida/sectionStyle.tsx:12-22` | Il commento ammette la duplicazione; già divergente (9 chiavi contro 6) |

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
