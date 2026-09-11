# Ripristino del layout a PR #741 — cosa è successo e perché

Nota per sessioni future: questo documento racconta due interventi consecutivi
(10-11 settembre 2026) che insieme spiegano perché il repo oggi ha la logica
"nuova" (Diari, Percorso ripetibile, Places Engine) ma il layout/estetica
"vecchio" (pre-taccuino, 19 agosto). Se stai leggendo questo perché qualcosa
non torna tra cosa mostra una schermata e cosa fa un endpoint, la spiegazione
è quasi certamente qui.

## Il contesto

L'utente non era soddisfatto del restyling estetico "taccuino" applicato
all'app nelle settimane successive al 19 agosto (colori, texture carta,
navigazione a 4 voci, Libreria/Atlante/Raccolte). Voleva tornare all'aspetto
di allora, **ma senza perdere** il lavoro sul backend fatto nel frattempo
(Diario come fulcro, Percorso ripetibile, Places Engine multi-tipologia,
pagamenti Paddle — questi ultimi esistevano già al 19 agosto).

Punto di riferimento concreto: **commit `e30daa2`** (merge PR #741, 19 agosto
2026) — l'ultimo prima che iniziasse il restyling "taccuino". Il progetto
Supabase di produzione (`sdxlcpxgbkagbxhukehd`) è lo stesso sia per il vecchio
sia per il nuovo codice: nessuna migrazione va eseguita per questi due
interventi, lo schema attuale è già un superset compatibile.

## Intervento 1 — PR #897: innesto Diario/Places Engine su PR #741, poi recupero di "Su misura per te"

Partito come un tentativo di costruire "PR#741 + backend nuovo" su un branch
separato (`feature/diari-e-places-engine-su-pr741`), è finito per diventare
qualcosa di diverso una volta risolti i conflitti con main: **tutto il
backend nuovo esisteva già identico su main** (main l'aveva costruito per
conto suo nel frattempo), quindi l'unica differenza reale emersa era che
main, in un refactor bundlato ma indipendente, aveva **rimosso la sezione
"Su misura per te"** (comfort) dalla generazione della Guida AI.

Cosa contiene davvero questa PR (6 file, ~90 righe):
- `lib/guideSections.ts` — richiave `comfort` reintrodotta nel tipo
  `GuideSectionKey` e in `GUIDE_SECTIONS`
- `lib/guideProfiles.ts` — `comfort` aggiunta a `HIKING_ONLY_SECTIONS` (esclusa
  per Borghi/Città e Siti, che non hanno uno storico escursionistico da
  confrontare — stesso principio già applicato a "Dati e sicurezza")
- `app/api/guide/route.ts` — reinnestate le funzioni
  `fetchHikerProfileForComfort`/`buildComfortContext` e il threading di
  `comfortContext` in `buildPrompt`, ripartendo dalla struttura ATTUALE del
  file (che ha già tutto il supporto multi-tipologia), non dalla mia prima
  bozza basata su `e30daa2`
- `components/guida/sectionStyle.tsx` — icona/colore per la sezione (richiesto
  dal type checker, `Record` esaustivo)
- `lib/__tests__/guideProfiles.test.ts` — due test aggiornati

**Navigator**: `components/navigation/ActiveNavigationView.tsx` è stato
esplicitamente lasciato identico a main — richiesta diretta dell'utente,
nessun regresso allo stato dell'agosto per quel componente specifico.

Mergiata in main il 10/09 (commit `254477c0`).

## Intervento 2 — branch `restore/layout-pr741`: il vero ripristino del layout

Dopo l'intervento 1 l'utente ha chiarito che il problema non era la sezione
comfort ma tutto **il layout/estetica dell'app**, rimasto quello attuale
("taccuino"). Richiesta esplicita: riportare l'aspetto a come era al 19
agosto, sopra il codice/logica attuale.

### Decisione chiave, presa insieme all'utente

Alcune pagine di oggi (Libreria/Diari multipli, Atlante, Raccolte, lettura
pubblica delle Raccolte) **non esistevano affatto** al 19 agosto — nate dopo,
non hanno un "vecchio layout" a cui tornare. Tre opzioni proposte:
nasconderle e tornare alla nav vecchia / tenerle raggiungibili ma senza
restyling (ibrido) / decidere pagina per pagina. **Scelta: nasconderle,
nav vecchia esatta.** Il backend che le serve (tabelle Supabase, route in
`app/api/`) resta nel codice e funzionante — semplicemente non raggiungibile
da nessuna schermata finché non si costruisce un'interfaccia dedicata.

### Come è stato fatto

Non un porting file per file: un **checkout in blocco** di `app/`,
`components/`, `tailwind.config.ts` e `lib/designTokens.ts` dalla versione
`e30daa2`, seguito da:

1. Rimozione dei 50 file sotto `app/`/`components/` nati dopo il 19 agosto
   (pagine Atlante/Diari-multipli/Raccolte e i componenti "a libro" —
   `components/libro/*` — che le servivano)
2. Rimozione di due file orfani in `lib/` (`lib/guida/guideDisplaySections.tsx`,
   `lib/resoconto/reportDisplaySections.tsx`) — esistevano solo per i
   componenti "a libro" appena rimossi, nessun altro chiamante
3. Sistemati i 5 punti di attrito trovati dal type checker tra layout
   vecchio e API/logica attuali (per lo più l'opzione `deleteLinkedPlanned`,
   non più supportata da `lib/activitySave.ts` da quando un Percorso non
   viene più cancellato al completamento)

**`lib/` e `app/api/` NON sono stati toccati** (a parte le due rimozioni di
file orfani sopra) — restano alla versione attuale di main, con tutta la
logica Diario/Percorso ripetibile/Places Engine intatta e funzionante.

### Un errore preso in tempo, da tenere a mente

Il comando iniziale (`git checkout e30daa2 -- app/ components/`) ha
inizialmente riportato indietro anche `app/api/**` — che è sotto `app/` ma è
**logica, non layout**. Sarebbe stato un disastro silenzioso: avrebbe
cancellato tutto il lavoro della PR #897 senza errori di compilazione
evidenti (i file avrebbero comunque tipato, solo con la logica vecchia).
Controllato con `git status` prima di proseguire e corretto subito
(`git checkout HEAD -- app/api/`). **Lezione per interventi futuri di questo
tipo**: `app/api/` è sempre logica anche se vive sotto `app/` — va escluso
esplicitamente da qualunque revert "di layout" fatto per directory.

### Verifica

`tsc --noEmit` pulito, lint solo warning pre-esistenti (`<img>`,
`exhaustive-deps` — non introdotti da questo intervento), 395/395 test
passati. `npm run build` fallisce in locale/sandbox solo per mancanza delle
chiavi Supabase nell'ambiente di sviluppo — non collegato a queste modifiche.

## Stato a fine intervento

- **main**: logica attuale (Diario, Percorso ripetibile, Places Engine,
  comfort ripristinata) + layout "taccuino" — invariato da questo lavoro
- **Branch `restore/layout-pr741`**: layout dell'agosto sopra la logica
  attuale, pushato, con preview Vercel generata per verifica visiva. **Non
  ancora mergiato in main** al momento di scrivere questo documento — decisione
  dell'utente dopo aver controllato la preview.

## Per chi riprende in mano questo lavoro

- Se il branch `restore/layout-pr741` risulta ancora aperto/non mergiato:
  verificane lo stato prima di assumere che il layout in main sia quello
  vecchio o quello nuovo.
- Se in futuro si vuole costruire un'interfaccia per Diario multipli/
  Atlante/Raccolte: il backend è tutto in `app/api/diaries/**`,
  `app/api/collections/**`, `app/api/meta-search/**`,
  `app/api/meta-itinerary/**`, `lib/diari/**`, `lib/metaSearch/**` — mai
  stato toccato da questo ripristino, pronto da agganciare.
- Se emerge un'altra sezione "orfana" dopo aver rimosso pagine (come successo
  con `guideDisplaySections.tsx`/`reportDisplaySections.tsx`): cercare sempre
  chi importa un file `lib/` prima di deciderne il destino — se nessuno lo fa
  più, va rimosso insieme al layout che lo usava, non lasciato come codice
  morto silenzioso.
- Il branch di partenza per "cos'era il 741" è sempre il commit `e30daa2`
  (merge PR #741, 19 agosto 2026) — usarlo come riferimento per qualunque
  futuro confronto vecchio/nuovo, invece di ricalcolarlo da capo.
