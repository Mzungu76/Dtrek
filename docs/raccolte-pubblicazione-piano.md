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
3. **PR 3 — privacy**: 3f. Indipendente dalle altre due e può anche andare per prima, se la
   decisione 1 arriva subito.

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

Non ancora deciso/fatto: la decisione 1 (privacy retroattiva) resta aperta, 3f non è iniziata; la
decisione 3 (limite volumi) è stata anticipata in `normalizeDiaryOrder` con un tetto di 20, più
basso della sola paginazione proposta — da rivedere se stretto.

In più, per PR 2: `app/raccolte/page.tsx` (elenco + creazione), `app/raccolte/[id]/page.tsx`
(composizione: campi editabili, riordino a frecce, aggiungi/rimuovi volume, pubblica/copia/revoca
link, elimina raccolta), `app/leggi/c/[token]/` (home, `SiteChrome` proprio che riusa
`DtrekCallout`/`SiteFooter` dal Diario, `v/[vi]` indice di un volume, `v/[vi]/e/[n]` lettura di
un'escursione, `opengraph-image`). Punti di ingresso: un link in fondo a `/diari` e uno nel
Sommario di ogni Diario (`/diari/[id]`), accanto a "Pubblicazione".

Verificato come per PR 1: `tsc` e lint puliti, 374/374 test, `next build` pulita con tutte le nuove
rotte compilate. Non verificato a schermo in un browser — l'ambiente non ha un progetto Supabase
reale da cui autenticarsi (stesso limite già segnalato nelle fasi precedenti del restyling).
