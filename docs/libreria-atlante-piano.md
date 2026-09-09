# Libreria + Atlante — piano di implementazione

Mockup di riferimento: `docs/mockup-taccuino/` (canvas:
https://claude.ai/code/artifact/7e0d6df9-aba9-4e98-bf30-cbf7e26f5431, tre pagine — La libreria,
L'Atlante, Il taccuino aperto). Sostituisce lo scaffale di `app/diari/page.tsx` e introduce un
secondo "libro" per la ricerca. Nomi che restano in codice: **Diario** (tabella `diaries`, non
rinominata) — "Libreria" e "Atlante" sono etichette di navigazione, non nuove entità dati.

## La scoperta che riduce il piano: metà dati esistono già

- `planned_hikes.diary_id` **esiste già** (migrazione `add_diaries_table.sql`) ed è già
  PATCHabile via `PATCH /api/planned` (`patch.diaryId`). Oggi si popola solo al momento del
  Reportage o dalla scelta Diario in Navigator (`FreeTrackSaveDialog`) — **il bridge
  Atlante → Diario ("Aggiungi ad un Diario") è quindi un PATCH su un campo che già c'è**, non
  una migrazione nuova.
- `planned_hikes.planned_date` esiste già → è il campo "quando" della schermata di trascrizione.
- `HikeNote[]` (testo, ora, lat/lon, foto, dettatura) esiste già su `StoredActivity.hikeNotes` →
  sono gli "appunti di campo", da leggere, non da costruire.
- `diaries.labels`/`archived_at` esistono già (Fase 2 del restyling precedente).
- **Non esiste**: la tabella degli scaffali. È l'unica cosa nuova in Fase 0.

## Fase 0 — Dati: solo gli scaffali

```sql
CREATE TABLE IF NOT EXISTS shelves (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name       TEXT NOT NULL,
  position   INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE diaries ADD COLUMN IF NOT EXISTS shelf_id UUID REFERENCES shelves(id) ON DELETE SET NULL;
ALTER TABLE diaries ADD COLUMN IF NOT EXISTS shelf_position INT NOT NULL DEFAULT 0;
```

Backfill: uno scaffale "I miei taccuini" per utente, tutti i Diari esistenti assegnati lì
(genitore unico da subito, nessuno stato transitorio "senza scaffale" da gestire in UI).

`GET/POST/PATCH /api/shelves` (CRUD + riordino) e `PATCH /api/diaries/[id]` esteso con
`shelfId`/`shelfPosition` (stesso file, stesso pattern di `labels`/`archivedAt`).

## Fase 1 — Libreria: barra e home

- `components/Navbar.tsx`: `NAV_LINKS` passa da 5 a 4 — **Libreria, Atlante, Navigator,
  Profilo** (icona Libreria: fila di libri, non più `Notebook`; "Mete" sparisce come voce).
  Statistiche confluisce nella pagina del Diario (Fase 5).
- `app/page.tsx`: **nessuna modifica di comportamento** — apre già sull'ultimo Diario
  (`lastDiaryId`); cambia solo cosa trova ad aprirsi.
- **`app/diari/page.tsx` riscritta** da scaffale-griglia a copertina singola (`Libreria.dc.html`):
  copertina a piena pagina del Diario corrente, con nome+posizione dello scaffale sempre in
  testata, striscia dati (voci/km/D+/pagine, da `DiarioDetail` già caricato), riga "prossima
  uscita" se presente, bottone unico "Apri l'indice" → `/diari/[id]`. Swipe orizzontale = i
  Diari dello stesso `shelf_id`, ordinati per `shelf_position`.
- **Banner inferiore** (`Scaffali.dc.html`), componente nuovo `components/libreria/ScaffaliBanner.tsx`:
  chiuso = riepilogo (dorsi mini + conteggio); aperto (bottom sheet) = tutti gli scaffali
  dell'utente coi loro Diari, l'Atlante sempre in cima come voce fissa non spostabile. Nessuna
  pagina dedicata — vive solo qui, come da decisione.
- Drag & drop (`Sposta.dc.html`): nessuna libreria di riordino in `package.json` (i risultati
  per "draggable" sono l'attributo HTML nativo nei componenti mappa, non drag-reorder) — serve
  aggiungere `@dnd-kit/core`+`@dnd-kit/sortable`, piccola dipendenza, nessun conflitto con
  Leaflet/maplibre. Al drop: `PATCH /api/diaries/[id]` con
  `shelfId`+`shelfPosition` nuovi; riordino dello scaffale sorgente e destinazione in batch.

## Fase 2 — L'Atlante

Nuova rotta `app/atlante/page.tsx` (`Atlante.dc.html`): ricerca (riusa i componenti di ricerca
già in `app/percorsi/cerca/`), carta espandibile (`MeteMap`, già in uso in `/percorsi`), quattro
tavole:

| Tavola | Fonte dati | Stato oggi |
|---|---|---|
| **Salvate** | `planned_hikes` con `diary_id IS NULL` e `reportageCount = 0` | è l'attuale `/percorsi`, filtrato — **`/api/percorsi` va ristretto** a `diaryId == null` per non duplicare le voci già transcritte in un Diario |
| **Vicino a te** | posizione utente + `route_polyline`/coordinate | da costruire, query geografica semplice |
| **Ricerche salvate** | tabella esistente dietro `/profilo/ricerche-salvate` | sposta il punto d'ingresso, riusa `SearchHistoryRow` |
| **Proposte per te** | `lib/routeBuilder/generateRecommendations.ts`, oggi `/percorsi-per-te` | sposta il punto d'ingresso, riusa `FoundRouteCard`/`BuiltRouteCard` |

`app/percorsi-per-te/page.tsx` e `app/profilo/ricerche-salvate/page.tsx` diventano redirect a
`/atlante` (stesso pattern già usato per `app/reportage/page.tsx`), non cancellati.

Tavola **Salvate** (`Segnate.dc.html`, rinominata "Salvate" nel mockup aggiornato): righe con
CTA "Aggiungi ad un Diario"; una voce appena assegnata (`diaryId` valorizzato) sparisce da qui
al refresh — nessuno stato "recentemente trascritta" persistito, si vede subito nel Diario.

## Fase 3 — Aggiungere ad un Diario (`Nuova.dc.html`)

Foglio/pagina con tre soli campi editabili — titolo (precompilato), quando (`plannedDate`,
già esistente), quale Diario (selettore sui Diari attivi, non archiviati) — più un riepilogo
statico di ciò che si genera da sé (traccia, profilo, sezioni Guida, dati sicurezza — già
generati al momento della creazione della Meta, non da rifare qui).

Conferma → `PATCH /api/planned/{id}` con `{ diaryId, plannedDate }`. Nessuna nuova API.
Redirect a `/diari/[diaryId]/percorsi/[id]/guida/prima_di_partire` (rotta già esistente).

## Fase 4 — Il taccuino aperto: l'indice

`app/diari/[id]/page.tsx` (oggi `DiarioIndexLibro`, mostra solo `reportage`) va esteso per
mostrare **anche le Mete "in programma"** di questo Diario: `planned_hikes` con
`diary_id = this` e senza Reportage collegato. Serve estendere `GET /api/diaries/[id]` con
questo elenco (stessa query già usata per la Fase 2, filtrata sul Diario).

Ordinamento delle **pagine**: cronologico per evento che le crea (data di creazione della voce
"in programma", poi data del Reportage quando nasce) — **mai riordinabile dall'utente**, per la
regola già scritta nei mockup precedenti. I filtri (preferiti/ricerca/ordinamento) restano
sull'**indice**, non sulle pagine — distinzione da preservare nel refactor.

Tre stati per riga (`Main.dc.html`): quadrato = in programma (nessun Reportage), pallino pieno =
in cammino (sessione Navigator aperta e collegata a questa Meta — segnale già disponibile via
`linkedPlannedId` sull'activity in corso), spunta = registrata.

Riga finale "Scrivi una nuova voce" → apre la stessa creazione di Meta di oggi
(`useCreateMetaFromSearch`/`RouteBuilder`) ma con `diaryId` di questo Diario preimpostato, non
più via l'Atlante.

## Fase 5 — Una voce, le sue pagine (`Voce.dc.html`)

Tab **Pianificazione / Appunti / Reportage** sopra il contenuto già esistente di
`app/diari/[id]/percorsi/[percorsoId]/page.tsx` — non una pagina nuova, un contenitore a tab
attorno alle rotte già presenti (`guida/[groupKey]`, `reportage/[activityId]`) più la nuova tab
Appunti (Fase 6). Il tab Reportage resta disabilitato/etichettato "da scrivere" finché non
esiste un `activityId` collegato.

Statistiche (tolta dalla barra in Fase 1) rientra qui come sezione del Diario aggregata su
`reportage` — riusa `lib/diari/aggregateDiaries.ts`, già calcola `distanceMeters`/`elevationGain`.

## Fase 6 — Appunti di campo (`Appunti.dc.html`)

Nuovo tab in sola lettura dentro la Voce: legge `activity.hikeNotes` (già popolato da
Navigator/`FieldNoteSheet.tsx`) e li mostra come pagina — testo, foto, pin numerati sul profilo
altimetrico. **Nessuna scrittura da qui**: gli appunti si prendono solo in cammino, in Navigator,
come oggi. CTA finale "Scrivi il Reportage da questi appunti" → apre il composer di Reportage
esistente con `hikeNotes` passati come riferimento (verificare se `components/upload` già li
usa in generazione; se no, è l'unico pezzo di logica di prodotto genuinamente nuovo del piano).

## Ordine di lavoro consigliato

1. **Fase 0 + Fase 1** in una PR: senza scaffali la Libreria non ha nulla da mostrare, senza la
   pagina la tabella non serve. Verificabile subito (utente con un solo Diario/scaffale non deve
   sembrare rotto).
2. **Fase 2 + Fase 3** insieme: l'Atlante senza "Aggiungi ad un Diario" è una vetrina morta.
3. **Fase 4 + Fase 5** insieme: l'indice esteso e i tab della voce sono la stessa vista.
4. **Fase 6** per ultima, isolata: dipende solo da dati già esistenti, nessuna altra fase la blocca.

## Decisioni ancora aperte (bloccano l'inizio, non l'intero piano)

1. **Asse degli scaffali** — geografico, temporale, per compagnia: determina solo i nomi di
   default nel backfill, non il codice.
2. **Atlante singolo o multiplo** — il piano assume *uno solo* (voce fissa in cima al banner,
   nessun `shelf_id` proprio). Se diventa plurale, la Fase 2 cambia da pagina a piccola
   collezione e va deciso prima di costruirla.
