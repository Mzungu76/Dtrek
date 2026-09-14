# Raccolte pubblicabili — piano di implementazione

Fase 3 del restyling /diari (`docs/diari-restyling-piano.md`), staccata in un piano proprio perché
non è una schermata in più: è un terzo livello di pubblicazione, e tocca il percorso di lettura
pubblica già esistente.

Mockup: `docs/mockup-diari-redesign/PubComponi.dc.html`, `PubRaccolta.dc.html`, `PubProfilo.dc.html`
(canvas: https://claude.ai/code/artifact/86c5e2f8-3e31-4a92-b9c4-a22481801a62, pagina
"Pubblicazione"). Modello e motivazioni: `docs/mockup-diari-redesign/README.md`.

## Il modello, in cinque righe

Percorso = un articolo (`/leggi/p/[token]`). Diario = un volume (`/leggi/d/[token]`). Raccolta =
una collana (`/leggi/c/[token]`, nuova). Il profilo pubblico non è un quarto documento: è l'indice
di ciò che è già pubblicato — resta fuori da questa fase (vedi in fondo).

**La raccolta è una selezione ordinata di Diari, non una cartella**: un Diario può stare in più
raccolte, non sparisce da nessun elenco quando ne entra in una, e continua a vivere per conto suo.
Le etichette (Fase 2) restano il modo di navigare; la raccolta è un oggetto editoriale.

**Consenso a cascata, vince il più restrittivo**: ogni livello ha il proprio token, indipendente.
Un Reportage escluso da un Diario (`config.excludedActivityIds`) resta escluso anche dentro una
raccolta pubblicata. Pubblicare una raccolta NON pubblica i Diari singoli: dentro la collana sono
leggibili in contesto, ma senza un link diretto proprio finché l'utente non lo crea.

**Aggiornamento (settembre 2026)**: la cascata è ora anche verso il basso, non solo verso l'alto.
Un Diario tolto dalla pubblicazione (il suo "Pubblica" spento, `share_token` a `null`) sparisce
anche da dentro le Raccolte pubblicate di cui è membro (`lib/sharePublicCollection.ts`,
`fetchPublicCollection`) — non solo dal proprio link diretto. Ogni cambio di stato di pubblicazione,
a qualunque livello, deve riflettersi ovunque quel contenuto potrebbe comparire sul sito: il sito
pubblico dell'utente non deve mai mostrare qualcosa che l'utente ha smesso di voler pubblicare.

## Fase 3a — Dati

`supabase/migrations/add_collections_tables.sql` (idempotente, da eseguire nell'SQL Editor come le
altre — la lezione della Fase 0: la migration va lanciata prima del deploy del codice che la usa):

```sql
CREATE TABLE IF NOT EXISTS collections (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title       TEXT NOT NULL DEFAULT 'Nuova raccolta',
  subtitle    TEXT NOT NULL DEFAULT '',
  preface     TEXT NOT NULL DEFAULT '',   -- la prefazione del mockup, markdown breve
  cover_url   TEXT,
  share_token UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS collection_diaries (
  collection_id UUID REFERENCES collections(id) ON DELETE CASCADE NOT NULL,
  diary_id      UUID REFERENCES diaries(id)     ON DELETE CASCADE NOT NULL,
  -- Denormalizzato apposta: fa funzionare la stessa policy `auth.uid() = user_id` di ogni altra
  -- tabella invece di un EXISTS sul genitore a ogni riga.
  user_id       UUID REFERENCES auth.users(id)  ON DELETE CASCADE NOT NULL,
  position      INT NOT NULL DEFAULT 0,
  PRIMARY KEY (collection_id, diary_id)
);
```

Più: indici `(user_id)` su entrambe e `(collection_id, position)` sulla giunzione; RLS abilitata con
la coppia di policy già usata da `diaries` (`*_owner` per `auth.uid() = user_id`, `*_public_share`
in SELECT dove `share_token IS NOT NULL`). La policy pubblica è cintura-e-bretelle: la lettura
pubblica passa dal client service-role (`lib/supabase.ts`), che scavalca comunque la RLS — è il
token opaco a fare da guardia, esattamente come per i Diari.

`ON DELETE CASCADE` su `diary_id` è la scelta giusta: eliminando un Diario esce dalle raccolte, non
le rompe. Le raccolte non hanno `archived_at`: sono poche e già "chiuse" per natura.

## Fase 3b — Il refactor che regge tutto

`lib/sharePublicDiary.ts` oggi fa due cose in una funzione: **trova** il Diario dal token e ne
**costruisce** il contenuto. La raccolta ha bisogno solo della seconda, ripetuta su N Diari.

- Estrarre `fetchDiaryContent(diaryId, config, opts)` → `{ entries, totalKm, totalElevationGain,
  dateRangeLabel }` — la parte da `excludedActivityIds` in giù, invariata nel comportamento.
- `fetchPublicDiary(token)` resta con la stessa firma (la usano `app/leggi/d/[token]/page.tsx` e
  `opengraph-image.tsx`): risoluzione del token, poi chiama il core. Il ramo legacy del vecchio
  Diario singolo per utente (`user_settings.diary_token`) resta dov'è, intatto.
- Nuovo `lib/sharePublicCollection.ts`: `fetchPublicCollection(token)` → risolve la raccolta,
  carica i Diari nell'ordine di `position`, chiama il core per ciascuno, somma i totali.

Il "più restrittivo vince" non va scritto due volte: passando per il core, le esclusioni di ogni
Diario si applicano da sole. È il motivo per cui questo refactor viene prima di tutto il resto.

## Fase 3c — API in-app

| Rotta | Cosa fa |
|---|---|
| `GET /api/collections` | Elenco raccolte con conteggi (volumi, reportage, km) e stato di pubblicazione |
| `POST /api/collections` | Crea una raccolta vuota — **gated** come i Diari aggiuntivi (`resolveDtrekEntitlement`) |
| `GET/PATCH/DELETE /api/collections/[id]` | Dettaglio; PATCH campo-per-campo (titolo, sottotitolo, prefazione, copertina) come `PATCH /api/diaries/[id]` della Fase 2 |
| `PUT /api/collections/[id]/diari` | Sostituisce l'elenco ordinato dei Diari (array di id = nuovo ordine): un solo endpoint invece di add/remove/reorder separati, l'ordine è già tutto lì |
| `PATCH/DELETE /api/collections/[id]/token` | Pubblica/revoca, stesso identico contratto di `/api/diaries/[id]/token` (PATCH garantisce il token, DELETE lo ruota) |

Aggregazione e ordinamento in helper puri e testati (`lib/raccolte/`), come `aggregateDiaries` —
le route restano thin wrapper.

## Fase 3d — Composizione in-app

- `/raccolte` — elenco (schermata sobria, non un secondo scaffale).
- `/raccolte/[id]` — la schermata del mockup `PubComponi`: copertina e titolo, elenco dei volumi in
  ordine con maniglia di trascinamento, "aggiungi un volume" (sceglie tra i Diari dell'utente, un
  Diario già dentro resta selezionabile per le altre raccolte), prefazione, anteprima, pubblica.
- Punti di ingresso: una riga in fondo a `/diari` accanto a "Tutte le Mete", e "aggiungi a una
  raccolta" nel Sommario di un Diario (`/diari/[id]`), accanto a etichette e archiviazione.

Riordino: `@dnd-kit` **non è tra le dipendenze** — niente libreria nuova per questo. Frecce su/giù
su ogni riga (accessibili, funzionano al primo colpo su mobile) e `PUT` dell'ordine completo.

## Fase 3e — La pagina pubblica

`app/leggi/c/[token]/` — stessa architettura di `/leggi/d/[token]`: componenti **server**, nessuno
stato, nessun JS spedito al browser (chi apre il link da una chat scarica testo e immagini pigre).
Riusa `SiteChrome` (testata/piede/richiami a DTrek) e `EntryArticle`, estendendo la testata con il
nome della collana; `generateMetadata` + `opengraph-image` sul modello di quelli del Diario.

Struttura: frontespizio (titolo, sottotitolo, totali), prefazione, indice dei volumi con i numeri di
ciascuno, mappa d'insieme, piede con l'autore. Ogni volume apre l'indice delle sue escursioni;
le pagine di lettura di una singola escursione restano quelle esistenti.

**Il PDF non sale di livello**: resta su percorso e Diario. Diciotto reportage non si esportano da
un telefono — è già successo una volta (vedi il commento in cima a `lib/sharePublicDiary.ts`, il
file da 21 MB). La raccolta è solo web.

## Fase 3f — Privacy (trasversale, vale anche per i Diari già pubblicati)

I due interruttori del mockup, in `user_settings` perché la scelta è dell'utente, non del singolo
documento: `publish_hide_home_starts BOOLEAN DEFAULT true`, `publish_hide_exact_dates BOOLEAN
DEFAULT false`. Mostrati nella schermata di pubblicazione (raccolta e Diario), applicati nel core
di 3b — così proteggono ogni livello senza tre implementazioni.

- `lib/privacy/trimHomeStart.ts` — pura, testata: taglia dall'inizio (e dalla fine: gli anelli
  tornano a casa) i punti entro un raggio dal punto di partenza salvato in profilo
  (`user_settings.starting_lat/starting_lon`, già usato da `generateRecommendations.ts`). La
  polyline pubblica è già ridotta a ~60 punti in scrittura (`lib/downsamplePolyline.ts`), quindi il
  taglio è grossolano per costruzione: raggio generoso (1 km), meglio togliere un tornante in più.
- `lib/privacy/formatPublicDate.ts` — pura: data intera o solo mese/anno.

⚠️ **Conseguenza da decidere**, non silenziosa: con `hide_home_starts` a `true` di default, i link
di Diari **già pubblicati** cominciano a mostrare tracce accorciate. È un miglioramento di
sicurezza e la mia proposta è applicarlo a tutti — ma è un cambiamento visibile su pagine che
qualcuno ha già condiviso, quindi lo decidi tu (vedi sotto).

## Cosa resta fuori

- **Profilo pubblico** (`PubProfilo.dc.html`) — è la vetrina, non un documento: merita la sua fase,
  e porta con sé la domanda dell'URL leggibile (`dtrek.app/marco-b`), che significa username
  univoci e moderazione. Da affrontare dopo, quando le raccolte esistono e c'è qualcosa da indicizzare.
- **PDF della raccolta** — vedi sopra.
- **"Pubblica tutto l'archivio"** — deliberatamente mai: sicurezza, valore editoriale, costo di
  rendering (le tre ragioni sono nel README dei mockup).

## Tre decisioni prima di partire

1. **Privacy retroattiva** — `hide_home_starts` di default a `true` per tutti, anche sui link già
   condivisi? *Proposta: sì.*
2. **Gating** — le raccolte sono per tutti o solo per chi ha sbloccato Dtrek? *Proposta: sbloccato,
   stessa regola dei Diari aggiuntivi (`resolveDtrekEntitlement`), stesso messaggio di blocco.*
3. **Limite di volumi per raccolta** — *Proposta: nessuno strutturale, ma la pagina pubblica pagina
   i volumi oltre i ~10 invece di costruirli tutti in una richiesta.*

## Verifica

- Unit test sugli helper puri: ordinamento e normalizzazione dell'elenco volumi, totali aggregati,
  "più restrittivo vince" (Reportage escluso da un Diario non compare nella raccolta),
  `trimHomeStart` (traccia che parte da casa, che ci torna, che non la tocca, senza punto salvato).
- A mano, con un account reale: raccolta con due Diari di cui uno con un Reportage escluso; revoca
  del token; Diario eliminato mentre è dentro una raccolta.
- `next build` pulita prima del merge, e **la migration eseguita prima del deploy**.

## Ordine di lavoro

1. **PR 1 — fondamenta ✅ implementata**: 3a (migration, eseguita in produzione), 3b (refactor del
   core), 3c (API). Nessuna UI: verificata con i test e via `tsc`/build — non ancora con una
   chiamata reale agli endpoint da un client (nessuna pagina li chiama ancora). Deviazione minima
   dal piano: `combineDateRangeLabels` vive in `lib/raccolte/combineDateRangeLabels.ts` invece che
   dentro `lib/sharePublicCollection.ts`, per restare testabile senza istanziare il client Supabase
   (che lancia un'eccezione a import-time senza le variabili d'ambiente — lo stesso vincolo che ha
   tenuto `lib/diari/*` puri fin dall'inizio).
2. **PR 2 — la funzione ✅ implementata**: 3d (composizione, `/raccolte` e `/raccolte/[id]`) + 3e
   (pagina pubblica, `/leggi/c/[token]`). Deviazioni dal piano: niente upload di copertina (PATCH
   accetta già `coverUrl`, manca solo la UI — una raccolta senza copertina mostra il gradiente di
   default, non uno stato rotto); il punto di ingresso nel Sommario di un Diario è un link verso
   `/raccolte` invece di un selettore inline di appartenenza (comporre l'elenco si fa da dentro la
   raccolta, dove si vede la collana intera, non da dentro il Diario). La pagina pubblica ha un
   livello in più del Diario (`/v/[vi]` tra la home e `/e/[n]`): un indice unico di tutte le
   escursioni di tutti i volumi sarebbe un solo muro di card con più di un paio di Diari dentro.
3. **PR 3 — privacy ✅ implementata**: 3f. Decisione 1 applicata come proposto — `DEFAULT true`
   sulla colonna, quindi retroattiva per costruzione (letta live a ogni apertura, mai congelata al
   momento della pubblicazione). I due toggle vivono in un componente a sé
   (`components/PublishPrivacyToggles.tsx`) invece che duplicati: sono preferenze globali per
   utente, mostrate identiche nella schermata di pubblicazione del Diario e in quella della
   Raccolta. Endpoint dedicato (`/api/user-settings/privacy`) invece di infilarle nel monolite
   `/api/user-settings` — quel file seleziona già una quarantina di colonne con un fallback per
   quelle non ancora migrate; due booleani in più lì avrebbero rischiato una regressione
   sproporzionata al beneficio di evitare un file nuovo.

### Nota: rimosso e ripristinato (settembre 2026)

Le PR 2 e 3 di questo piano erano già interamente implementate (vedi sotto), ma il commit
`73b2efa` ("restore: layout dell'app allo stato PR #741 (pre-taccuino)") le ha rimosse insieme a
un ripristino generale del layout dell'app a uno stato precedente — decisione esplicita dell'utente
di allora ("le nascondo, torno alla nav vecchia"), non un difetto di questo piano. Rimossi solo i
file di UI/pagina (`app/leggi/c/[token]/*`, la sezione di pubblicazione di `app/raccolte/[id]/
page.tsx`, `components/PublishPrivacyToggles.tsx`); il resto (tabelle Supabase, `lib/raccolte/*`,
`lib/sharePublicCollection.ts`, `lib/privacy/*`, le route `/api/collections/**` e
`/api/user-settings/privacy`) è sempre rimasto intatto, come previsto dal commit di ripristino
stesso.

Ripristinato di nuovo (Fase 1 di un piano più ampio — pubblicazione con stile editoriale coerente
per Raccolta/Diario/Reportage, sotto un futuro profilo pubblico unico per utente) quando l'utente
ha chiesto esplicitamente di rendere pubblicabili anche le Raccolte: gli stessi file, recuperati da
`git show 52de651`/`6170d20`, adattati solo nello stile (oggi niente più "Taccuino", i token di
`app/raccolte/[id]/page.tsx` sono quelli della sua riscrittura successiva) — nessuna logica
riscritta da zero, era già corretta e testata.

### Fase 2 del piano più ampio (settembre 2026): il Reportage diventa un vero articolo

Il modello in cinque righe qui sopra diceva già "Percorso = un articolo (`/leggi/p/[token]`)" fin
dall'inizio — ma non lo era mai stato per davvero: quella rotta era rimasta un `PdfViewer` nudo,
l'unico dei tre livelli mai aggiornato al passaggio "il link vive da sé, il PDF è un allegato in
più" che Diario e Raccolta avevano già. Sistemato ora, su richiesta esplicita dell'utente (Fase 2
di un piano di pubblicazione più ampio, di cui questo documento copre solo la parte Raccolte):

- **Nuovo `lib/sharePublicReport.ts`** (`fetchPublicReport(token)`): un Reportage pubblicato da
  solo è la stessa identica voce di un Diario pubblicato, senza il Diario intorno — riusa
  `buildContentFromReports` di `lib/sharePublicDiary.ts` (ora esportata) invece di duplicarne la
  logica, nessuna esclusione né selezione foto (non c'è un Diario/una Raccolta a monte che curi la
  scelta).
- **`app/leggi/p/[token]/page.tsx` riscritta**: da `PdfViewer` a pagina editoriale vera, stessa
  testata minima (senza navigazione: un solo Reportage non ha altre pagine da raggiungere),
  `EntryArticle`/`EntryCard` riusati senza modifiche. **`app/leggi/r/[activityId]` resta invariata**
  (retrocompatibilità per i link già in circolazione, come già era).
- **`PATCH /api/share-report` decoppiato dal PDF**: prima il token si generava SOLO insieme a un
  PDF caricato; ora garantisce il token indipendentemente (stesso contratto delle altre due route
  token), il PDF resta un allegato facoltativo (`sharePdfUrl` nel corpo lo tocca, la sua assenza no
  — mai azzerato da un mint-only). `ReportReader.tsx`: "Pubblica" (la pagina, sempre disponibile) e
  "Allega anche il PDF" (facoltativo) invece dell'unico "Genera e pubblica" di prima che li
  confondeva in un solo passo.
- `PublishPrivacyToggles` montato anche qui, terzo posto oltre a Diario e Raccolta.

**Nota**: `app/diario/page.tsx`'s pagina del Diario raggiunta scorrendo verso l'alto
(`DiarioSommarioContent.tsx`) è rimasta deliberatamente non toccata in questo giro, su richiesta
esplicita dell'utente — nessuna delle modifiche sopra la riguarda comunque (tutta lato Reportage
pubblico, non Diario).

### Fase 3 del piano più ampio (settembre 2026): il profilo pubblico

Il modello in cinque righe diceva già "il profilo pubblico non è un quarto documento: è l'indice
di ciò che è già pubblicato" e lo lasciava esplicitamente fuori da questa fase. Costruito ora, con
una decisione dell'utente sulla forma dell'indirizzo: **uno slug leggibile come ALIAS pubblico
dell'id utente reale**, mai come credenziale — `/u/marco-rossi`, non un token opaco come agli altri
tre livelli. Motivazione dell'utente: UX (facile da condividere/ricordare), branding, stabilità
(cambiare il nome visualizzato non deve richiedere di cambiare l'indirizzo), unicità gestita con un
vincolo UNIQUE, e consapevolezza esplicita che uno slug scelto può rivelare l'identità — una scelta
di privacy dell'utente, non un difetto tecnico da correggere.

- **`supabase/migrations/add_profile_slug.sql`**: due colonne su `user_settings`, non una —
  `profile_slug` (l'identità, stabile) e `profile_enabled` (la visibilità, revocabile senza perdere
  lo slug scelto). Indice UNIQUE case-insensitive (`lower(profile_slug)`) — "Marco-Rossi" e
  "marco-rossi" sono lo stesso indirizzo. Stessa policy RLS "cintura e bretelle" di
  collections/diaries.
- **`lib/profileSlug.ts`** (nuovo, puro, testato): validazione del formato (minuscolo,
  alfanumerico e trattini singoli, 3–30 caratteri) e un piccolo elenco di parole riservate. Nessun
  precedente da riusare nel repo — scritto da zero, non c'era mai stato un identificatore pubblico
  leggibile prima d'ora (solo token opachi).
- **`app/api/user-settings/profile/route.ts`** (nuovo, non nel monolite `/api/user-settings/`,
  stesso motivo già dato per `/privacy`): GET legge `{slug, enabled}`; PATCH normalizza e valida lo
  slug lato server (mai fidarsi solo del client), traduce una violazione UNIQUE (codice Postgres
  23505) in "indirizzo già in uso" invece di un 500 generico; rifiuta `enabled: true` senza uno
  slug già scelto.
- **`lib/publicProfile.ts`** (`fetchPublicProfile(slug)`): NON aggrega contenuto (a differenza di
  `fetchPublicCollection`) — elenca solo cosa ha già un proprio token ai tre livelli esistenti,
  senza dedurre appartenenza fra loro. Un Diario dentro una Raccolta pubblicata E con un proprio
  token compare in entrambi gli elenchi, deliberatamente: sono due condivisioni indipendenti,
  entrambe vere.
- **`app/u/[slug]/page.tsx`** (nuovo): tre sezioni (Raccolte/Diari/Reportage), ciascuna solo se non
  vuota, ogni riga apre direttamente `/leggi/c|d|p/[token]` — il profilo è un indice, non
  un'ulteriore cornice attorno ai contenuti.
- **`components/profilo/SectionProfiloPubblico.tsx`**, montata in
  `app/profilo/impostazioni/page.tsx` subito dopo `SectionIdentita` (lo slug è concettualmente
  adiacente al nome visualizzato): campo indirizzo + Salva, poi — solo dopo aver scelto uno slug —
  l'interruttore di visibilità e copia-link.

### Cosa c'è già, per chi riprende da qui

- `supabase/migrations/add_collections_tables.sql` — `collections` + `collection_diaries`, RLS
  come `diaries`. **Già eseguita sul progetto Supabase in produzione.**
- `lib/sharePublicDiary.ts` — spezzato: `fetchDiaryContent(userId, diaryId, excluded,
  photoIdsByActivity)` esportata, `fetchPublicDiary(token)` invariata nel comportamento.
- `lib/sharePublicCollection.ts` — `fetchPublicCollection(token)`, usa `fetchDiaryContent` per
  ogni volume nell'ordine di `position`.
- `lib/raccolte/` — `aggregateCollections.ts`, `normalizeDiaryOrder.ts`, `combineDateRangeLabels.ts`,
  tutti puri e testati.
- API: `GET/POST /api/collections`, `GET/PATCH/DELETE /api/collections/[id]`,
  `PUT /api/collections/[id]/diari`, `GET/PATCH/DELETE /api/collections/[id]/token` — creazione
  gated dietro `resolveDtrekEntitlement` (decisione 2 del piano, applicata).

La decisione 3 (limite volumi) resta anticipata in `normalizeDiaryOrder` con un tetto di 20, più
basso della sola paginazione proposta nel piano — da rivedere se stretto.

### Fase 4 (settembre 2026): un solo link, sempre

Richiesta esplicita dell'utente: mai più di un link condivisibile per volta. Fino a qui ogni
livello restava pubblicabile con un link a sé (Diario/Reportage/Raccolta, ciascuno col proprio
token) — la Fase "Pre-pubblicazione" aveva già spostato il profilo (`/u/[slug]`) al centro come
link principale, ma i link diretti per singolo contenuto restavano comunque visibili, in più
punti dell'app, come opzione secondaria. Qui vengono tolti del tutto: pubblicare un contenuto
significa solo farlo comparire sul proprio sito, non genera più un indirizzo da copiare a parte.

- **`lib/requireActiveProfile.ts`** (nuovo): `hasActiveProfile(userId)` — vero solo con
  `profile_slug` scelto E `profile_enabled = true`. Chiamato prima di ogni mint di un nuovo
  `share_token` (mai su un token già esistente, né su una revoca) in `PATCH
  /api/diaries/[id]/token`, `PATCH /api/collections/[id]/token`, `PATCH /api/share-report`, `POST
  /api/collections/publish-batch` — 409 con lo stesso messaggio (`PROFILE_REQUIRED_ERROR`) se il
  sito non è ancora attivo. Un Diario/Reportage/Raccolta non può avere un link proprio prima che
  l'utente abbia scelto e attivato il suo unico indirizzo.
- **`lib/hooks/useProfileStatus.ts`** + **`components/PublishGateNotice.tsx`** (nuovi): il gate
  gemello lato client — letto da ogni pannello di pubblicazione per disabilitare in anticipo il
  pulsante "Pubblica" e mostrare l'invito ad attivare il sito, invece di far fallire la richiesta.
- **Tolti "Apri"/"Copia link" per il singolo contenuto** in tutte le superfici che li mostravano:
  `components/raccolte/SettingsSheet.tsx` (`PublishBlock`, condiviso da Raccolta/Diario/Reportage
  nell'albero di `/raccolte`), `components/resoconto/ReportReader.tsx` (pannello "Pubblica" del
  Reportage), `app/raccolte/[id]/page.tsx` (composizione di una Raccolta), `app/diario/libro/
  [id]/page.tsx` (menù "Condividi / pubblica" del libro), e la sezione "Oppure condividi una
  singola Raccolta" di `app/raccolte/pubblica/page.tsx`. Al posto del link: un badge "Pubblicato
  sul tuo sito" e un pulsante "Rimuovi dal sito" (la revoca — mai gated, sempre disponibile).
- **`share_token` non sparisce dal database**: le pagine `/leggi/d|c|p/[token]` restano
  esattamente come sono (il profilo le apre da lì), il token resta la chiave con cui `/u/[slug]`
  le trova — cambia solo che l'utente non lo vede più né lo copia mai come indirizzo a sé.
- Il link pubblico "attività singola" di `components/ShareModal.tsx` (`/s/[token]`, scheda
  immagine da condividere sui social) resta fuori da questa fase: non fa parte del modello
  Diario/Reportage/Raccolta/Profilo, è una funzione diversa (esportare una card statistica), non
  un secondo modo di pubblicare lo stesso contenuto editoriale.

Per PR 3: migration `add_publish_privacy_settings.sql` (eseguita in produzione) —
`user_settings.publish_hide_home_starts`/`publish_hide_exact_dates`. `lib/privacy/trimHomeStart.ts`
e `lib/privacy/formatPublicDate.ts`, puri e testati. `lib/sharePublicDiary.ts` e
`lib/sharePublicCollection.ts` leggono le due preferenze (più `starting_lat/lon` per il punto di
casa) in un'unica query aggiunta a quella già esistente per `display_name`, e le applicano nel
core: `buildContentFromReports` accorcia la `polyline` di ogni escursione quando `hideHomeStarts`
è attivo, e marca `hideExactDates` su `DiaryContent`. `EntryArticle`/`EntryCard`
(`app/leggi/d/[token]/EntryArticle.tsx`, riusati identici dalla Raccolta) leggono quel flag per
scegliere tra data esatta e solo mese/anno — l'unica label già coarse (mese/anno nell'occhiello)
non tocca.

In più, per PR 2: `app/raccolte/page.tsx` (elenco + creazione), `app/raccolte/[id]/page.tsx`
(composizione: campi editabili, riordino a frecce, aggiungi/rimuovi volume, pubblica/copia/revoca
link, elimina raccolta), `app/leggi/c/[token]/` (home, `SiteChrome` proprio che riusa
`DtrekCallout`/`SiteFooter` dal Diario, `v/[vi]` indice di un volume, `v/[vi]/e/[n]` lettura di
un'escursione, `opengraph-image`). Punti di ingresso: un link in fondo a `/diari` e uno nel
Sommario di ogni Diario (`/diari/[id]`), accanto a "Pubblicazione".

Verificato come per PR 1: `tsc` e lint puliti, 374/374 test, `next build` pulita con tutte le nuove
rotte compilate. Non verificato a schermo in un browser — l'ambiente non ha un progetto Supabase
reale da cui autenticarsi (stesso limite già segnalato nelle fasi precedenti del restyling).
