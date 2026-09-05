# Restyling `/diari` — versione A ("Plancia di campo")

Piano di implementazione della direzione approvata. Mockup di riferimento:
`docs/mockup-diari-redesign/Main.dc.html` (canvas:
https://claude.ai/code/artifact/86c5e2f8-3e31-4a92-b9c4-a22481801a62, pagina "Pagina Diari").

Obiettivo: la pagina di atterraggio dice a colpo d'occhio che Dtrek è uno strumento tecnico —
si pianifica, si naviga, si registra — e regge la crescita del numero di Diari senza cartelle.

Struttura della pagina, dall'alto: intestazione con la frase di posizionamento → rail delle tre
fasi con lo stato reale → card "prossima uscita" (azione primaria unica) → indice a chip →
righe di registro raggruppate per stagione → stagioni chiuse e archivio collassati → nuovo volume.

## Fase 0 — Dati (prerequisito di tutto)

**Migration** (`supabase/migrations/add_diary_labels_and_archive.sql`, idempotente come le altre):

```sql
ALTER TABLE diaries ADD COLUMN IF NOT EXISTS labels      TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE diaries ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_diaries_user_archived ON diaries (user_id, archived_at);
```

Nessuna tabella nuova, nessun backfill: i Diari esistenti restano con `labels = '{}'` e
`archived_at = NULL`, cioè tutti attivi e senza etichette — la pagina si comporta come oggi
finché l'utente non usa le nuove funzioni.

**`GET /api/diaries`** (`app/api/diaries/route.ts`) — `DiarySummary` si estende con i campi che
la riga di registro mostra e che oggi la pagina non ha:

- `distanceMeters`, `elevationGain` — somma sulle `activities` collegate, stessa join che il file
  già fa per `reportageCount`;
- `lastActivityAt` — `max(activities.start_time)`, serve sia alla riga sia al raggruppamento per
  stagione;
- `labels`, `archivedAt`.

Una sola query in più rispetto a oggi (le `activities` sono già lette, va aggiunta la selezione
delle colonne metriche). Aggregazione in un helper puro e testabile, `lib/diari/aggregateDiaries.ts`.

**`GET /api/diari/overview`** (nuovo) — quello che serve al rail e alla card, in una chiamata:
mete pronte (`planned_hikes` senza Reportage, non archiviate), Reportage totali, prossima uscita.

## Fase 1 — La pagina

Riscrittura di `app/diari/page.tsx`, con i pezzi nuovi in `components/diari/`:

| Componente | Contenuto |
|---|---|
| `FasiRail.tsx` | Le tre fasi con i conteggi; ogni fase è un link (Mete, Navigator, Nuovo) |
| `ProssimaUscitaCard.tsx` | Titolo, profilo altimetrico, km / D+ / stima / Trail Score, CTA Navigator + Guida |
| `RegistroRow.tsx` | Riga del Diario: dorso, titolo, etichette, metriche, sparkline |
| `GruppoCollassato.tsx` | Stagione chiusa e archivio: dorsi impilati, conteggio, chevron |
| `IndiceChips.tsx` | Filtri; compare solo sopra i 6 Diari, sotto quella soglia è rumore |

Da riusare invariati: `TaccuinoPaperTexture`, `TaccuinoRuledLines`, i token di
`lib/taccuinoTokens.tsx`, `Navbar` con `MOBILE_BOTTOMBAR_SPACER`, `GlobalRouteSearch` (resta,
spostata sotto l'indice), `ElevationProfileChart` e `TrailScoreGaugeBadge` per la card — da
verificare che i props reggano la misura ridotta, altrimenti un SVG dedicato come nel mockup.

Il raggruppamento per stagione si calcola da `lastActivityAt` in un helper puro
(`lib/diari/raggruppaDiari.ts`), non nel componente.

## Fase 2 — Etichette e archiviazione ✅ implementata

- `PATCH /api/diaries/[id]` accetta `labels` e/o `archivedAt`, un campo alla volta — non esisteva
  ancora (questo piano lo dava per scontato, corretto in corso d'opera): aggiunta accanto a
  GET/DELETE nello stesso file, normalizzazione etichette (trim/doppioni/lunghezza/quante) estratta
  in `lib/diari/normalizeLabels.ts`, testata. Il Diario di default non è mai archiviabile (stessa
  regola già in vigore per l'eliminazione).
- L'editor delle etichette (`EtichetteDiarioEditor`) vive nel **Sommario** (`/diari/[id]`), non nel
  form di copertina/pubblicazione: sono metadati del registro (come lo si ritrova), non la veste
  pubblica del Diario (come lo si presenta a chi legge) — deviazione deliberata da questo piano.
- Archiviazione (`ArchivioDiarioSection`, accanto a `DeleteDiarioSection`): un'azione esplicita con
  conferma inline, **sempre disponibile**, reversibile (si può riattivare). Non ancora costruita: la
  *proposta* automatica dopo mesi di inattività menzionata sopra — oggi l'utente deve arrivarci da
  sé, il pulsante non si mette in evidenza da solo. Prossimo passo naturale se emerge la necessità.

## Fase 3 — Raccolte pubblicabili

Fuori da questo piano: dipende dalla pagina finita e vale un piano suo. Le tre schermate sono
già disegnate (pagina "Pubblicazione" del canvas) e il modello è nel README dei mockup —
`collections` + `collection_diaries`, `share_token` come su `diaries`, lettura pubblica che riusa
`lib/sharePublicDiary.ts` un livello più su.

## Due buchi di dati, con la mia proposta

1. **"Prossima uscita · sab 12" non ha una data dietro.** `planned_hikes` non ha un campo di
   programmazione: c'è `created_at`, `first_completed_at`, `favorite`, nessuna data prevista.
   Due strade: aggiungere `planned_for DATE` (una colonna, un date picker sulla Meta) oppure
   ripiegare su "Meta in evidenza" — la preferita, o la più recente senza Reportage.
   *Proposta: partire senza colonna, con "Meta in evidenza", e aggiungere `planned_for` solo se
   la programmazione diventa una funzione vera (meteo del giorno scelto, promemoria).*

2. **"2 tracce offline" è un dato locale, non del server.** I pacchetti offline stanno in
   IndexedDB per `hikeId` (`lib/offline/packageManager.ts`), e vengono scaricati dentro Navigator,
   che è un'app a sé. Sul web principale il conteggio può risultare zero anche con le tracce
   scaricate sul telefono. *Proposta: leggere il manifest locale quando c'è e mostrare il numero
   solo allora; altrimenti la fase "Naviga" mostra le Mete pronte a essere navigate, che è un dato
   server e non mente.*

## Verifica

- Test unitari (vitest, già configurato) su `aggregateDiaries` e `raggruppaDiari`: Diario senza
  uscite, Diario archiviato, stagioni a cavallo d'anno, utente con un solo Diario.
- A mano: utente nuovo (un Diario di default vuoto — la pagina non deve sembrare rotta), utente
  con 3 Diari, utente con 12 Diari di cui 4 archiviati.
- `next build` pulita prima del merge: le classi usate solo dentro `lib/` sono già state un
  problema una volta (vedi il commento in cima a `tailwind.config.ts`).

## Ordine di lavoro

Fase 0 e Fase 1 sono una PR sola (la pagina senza i dati non si vede, i dati senza la pagina non
servono). Fase 2 una seconda PR. Fase 3 dopo, con piano proprio.
