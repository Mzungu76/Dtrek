# Prompt per un'altra chat: importare TUTTI i cammini in un unico run

> Copia il blocco qui sotto (dal titolo «Compito» in poi) come primo messaggio di una nuova chat con Claude Code sul repo `Mzungu76/Dtrek`.

---

## Compito

Nel repo Dtrek c'è l'import dei cammini da OpenStreetMap (registro in `lib/cammini/registry.ts`, 30 voci, ondate 1–3).
Oggi si importa **un cammino per volta** dal workflow manuale `.github/workflows/import-cammini-registry.yml`
(input `mode`, `registryId`, `minStatus`) che lancia `scripts/places/cammini/import-registry.ts`.
L'import della **Via Francigena è fallito**. Voglio correggere l'errore e poter **importare tutti i cammini con un solo run**.
Rispondimi in italiano, sii sintetico e non fare dry-run inutili.

## Cosa è andato storto (dai log reali dei run 4 e 5 del workflow)

1. **Run 4 (`36991552620`)**: ho scritto nel campo `registryId` il nome «Via Francigena» invece dell'id `via-francigena`.
   Lo script non lo trova e muore. → Il workflow/lo script devono accettare anche nome o `searchName` (confronto senza maiuscole e
   accenti, `-`/spazi equivalenti) e, se non c'è corrispondenza, elencare gli id validi nel messaggio d'errore.
2. **Run 5 (`36991847851`, `registryId=via-francigena`, `mode=write`)**: dopo ~40 minuti, **HTTP 504 su tutti e 4 gli endpoint Overpass
   per 3 giri** → `Error: Tutti gli endpoint Overpass hanno fallito dopo 3 giri` da `overpass.ts:35`, chiamato da `import-registry.ts:104`.
   Cioè la **prima** query, `relationsQuery(entry)`: cerca per nome in *tutto il mondo*
   (`rel[route~hiking|foot][name~"Via Francigena",i]`) e poi risale due livelli di figli (`.kids`, `.grandkids`) con `out body center`.
   Per un cammino enorme e con mille sotto-relazioni come la Francigena è troppo pesante. Il San Benedetto, più piccolo, passava.
   Nel run fallito `/tmp/raw-registry.json` non esiste perché lo script cade prima di salvarlo.

## Cosa voglio

**A. Rendere affidabile il download per i cammini grandi (Francigena in primis).**
- Restringi la ricerca all'Italia (bbox o area Italia in Overpass) e/o spezza la query: prima solo le relazioni radice col nome,
  con `out tags members` (leggero, senza geometria), poi i figli per ID a blocchi (`rel(id:...)`), poi le way a blocchi (già fatto, `WAY_CHUNK`).
  Valuta anche `[timeout:300]` e `[maxsize:...]`, e di non ripetere gli stessi endpoint già lenti (rotazione, attese crescenti, jitter).
- Gestisci il `remark` e i 504/429 con retry ma **senza perdere il lavoro già fatto**: cache su disco per relazioni e way scaricate
  (file JSON per cammino in una cartella, caricata/ripresa all'avvio) e `actions/cache` o artifact tra un run e l'altro, così un
  rilancio riparte da dove è caduto invece che da zero.
- Riproduci l'errore prima di cambiare (la query come è oggi), poi mostra che la nuova versione scarica la Francigena. Se Overpass dal tuo
  ambiente non è raggiungibile, dillo e usa il workflow GitHub per provare (tool `mcp__github__actions_*`, ricordati che non hai `gh`).

**B. Un unico run per tutti i cammini.**
- Aggiungi a `registryId` il valore speciale `tutti` (e magari `ondata-1`, `ondata-2`) che cicla su tutto il registro **escluse** le voci
  `anchors: 'rifugi'` (ondata 3: Alte Vie, Via Alpina, GTA, Sentiero Italia, non ancora supportate) e rispettando `overlapsWith`
  (Via Romea / Romea Strata) senza importare due volte gli stessi tratti.
- **Continua dopo gli errori**: un cammino che fallisce non ferma gli altri. Riprova i falliti in coda una volta. Pausa gentile tra un cammino e
  l'altro per non far arrabbiare Overpass.
- Rispetta i limiti di GitHub Actions: un job dura al massimo 6 h. Se il tempo non basta, usa una matrice di job o un job che si
  auto-rilancia sui rimasti, con `concurrency: import-places` come ora (non deve girare insieme agli altri import).
- `mode=write` scrive solo i cammini **PRONTI** (`minStatus=pronto`); i `DA_RIVEDERE` non si scrivono ma vanno elencati con i motivi.
  Il `splitAt` della Francigena (Francigena / Francigena del Sud a San Pietro) deve continuare a funzionare.
- Alla fine un **riepilogo in `$GITHUB_STEP_SUMMARY`**: tabella per cammino con esito (scritto / saltato / da rivedere / errore),
  km, numero di tappe, durata, e l'errore se c'è. Exit code diverso da 0 solo se qualcosa è fallito *davvero* (non per i «da rivedere»).
- Idempotente: rilanciare non deve duplicare (controlla come `importCammino` fa upsert su `dtrek_places` / `dtrek_cammino_tappe`).

**C. Verifica.**
- Test unitari per ciò che è puro (risoluzione dell'id da nome, selezione dei cammini per `tutti`/ondata, spezzamento in blocchi,
  ordine/retry), in `lib/__tests__/` come gli altri (`npx vitest run lib/__tests__`), più `npx tsc --noEmit -p .` ed eslint.
- Lancia il workflow in `dry-run` con `registryId=tutti` e riportami il riepilogo; poi **chiedimi conferma** prima di lanciare `write`
  (scrive su Supabase, progetto `sdxlcpxgbkagbxhukehd`).

## Vincoli

- Branch di lavoro: quello assegnato alla sessione. Commit con i trailer richiesti dalla sessione. Dopo il push crea una **PR in bozza**
  (strumenti `mcp__github__*`, niente `gh`). Non toccare `main`.
- **Non cancellare né modificare dati utente**: nel mio account ci sono 5 attività simulate del Cammino di San Benedetto
  (`sim-sanbenedetto-*`) e il reportage di prova nel piano: **vanno lasciati dove sono**. Il Cammino di San Benedetto (16 tappe) è già importato:
  non va rovinato, un re-import deve dare lo stesso risultato.
- Non reinventare: riusa `overpass.ts`, `buildRegistry.ts`, `build.ts`, `import.ts` e il controllo di qualità già esistenti; cambia il minimo.
- Documenta in `docs/piano-cammini.md` (nuova sottosezione) come si lancia l'import di tutto e cosa fare se un cammino cade.
- Alla fine dimmi onestamente cosa hai verificato davvero (run reali del workflow) e cosa no.

## File utili

- `lib/cammini/registry.ts` (REGISTRY, `wave`, `anchors`, `structure`, `splitAt`, `overlapsWith`, `match`, `searchName`)
- `scripts/places/cammini/import-registry.ts` (`main`, `relationsQuery`, `waysQuery`, `printReport`, `WAY_CHUNK`)
- `scripts/places/cammini/overpass.ts` (`runOverpass`, endpoint, ROUNDS)
- `scripts/places/cammini/buildRegistry.ts`, `build.ts`, `import.ts`, `fetch.ts`
- `.github/workflows/import-cammini-registry.yml` (concurrency group `import-places`)
- Run falliti di riferimento: `https://github.com/Mzungu76/Dtrek/actions/runs/36991552620` e `.../36991847851`
