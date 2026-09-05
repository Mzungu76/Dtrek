# Piano: pagina unica di ricerca delle Mete (direzione A)

Direzione scelta: **A — Tre scaffali a fisarmonica** (`docs/mockup-ricerca-mete/Main.dc.html`,
canvas https://claude.ai/code/artifact/4fac632b-b9a7-451c-b1ae-c40228d3550d). Ingresso dalla
pagina Mete come in `IngressoMete.dc.html`.

Vincoli fissati: perimetro = ricerche + import + Mete salvate; architettura **ibrida** (le due
ricerche già veloci rispondono dentro l'hub, i flussi lunghi restano le schermate esistenti e si
raggiungono da qui); primo livello **per tipologia di Meta**; ingresso dedicato in evidenza.

Vale in tutto il piano il §48 di `docs/piano-mete-multitipologia.md`: non rompere Sentieri (§48.4),
mai metriche escursionistiche per le altre tipologie (§48.9), mai dedurre `metaType` (§48.11),
niente valori fabbricati al posto di un dato assente (§48.8), migration per ogni modifica al
modello dati (§48.13).

**Rotta**: l'hub prende `/percorsi/cerca` (già l'unico ingresso linkato dalla pagina Mete, incluso
il deep link `?q=`); l'attuale form Borghi/Siti si sposta in `/percorsi/cerca/luoghi`. Nessun link
esistente da riscrivere altrove.

---

## Fase 0 — Conteggi dinamici (mezza giornata) — risposta alla domanda aperta

**Oggi i conteggi dell'archivio non esistono da nessuna parte.** `/api/meta-search` ritorna solo i
risultati di una ricerca; nessun endpoint espone quante righe ha `dtrek_places`. Il "425 in
archivio" del mockup è scritto a mano. Due sole opzioni oneste: o si costruisce il conteggio, o la
riga non si mostra (mai un numero fisso in pagina — §48.8).

| # | Intervento | File |
|---|---|---|
| 0.1 | `GET /api/meta-search/counts` → `{ borgo_citta: n, sito: n }`, con `select('*', { count: 'exact', head: true })` per `meta_type` — nessuna riga trasferita, solo il conteggio | `app/api/meta-search/counts/route.ts` (nuovo) |
| 0.2 | `revalidate` a ~1h (l'archivio cambia solo con un import batch, non per azione dell'utente) invece di `force-dynamic` | stesso file |
| 0.3 | Se la chiamata fallisce o il conteggio è 0, lo scaffale non mostra alcun numero — mai un ripiego | hub, Fase 2 |

I conteggi delle **Mete salvate** (59 / 4 / 0 dei chip) sono già dinamici: `countsByType` in
`app/percorsi/page.tsx`, calcolato su `/api/percorsi`. Nulla da fare lì.

**Fatto quando**: aggiungendo righe a `dtrek_places` il numero sullo scaffale Borghi cambia entro
un'ora, senza deploy.

## Fase 1 — Scheletro dell'hub (1-2 giorni)

`app/percorsi/cerca/page.tsx` diventa l'hub: intestazione su carta, campo unico, tre scaffali
(Sentieri aperto di default, mai persistito — stessa scelta della carta in Fase 3 del restyling),
riga "ricerche salvate" in fondo.

- Ogni voce è un `Link` alla schermata esistente, invariata: `/upload?tab=gpx` (ManualImportChoice
  → wizard, link, a mano, da attività), `/percorsi-per-te`, `/profilo/ricerche-salvate`,
  `/percorsi/cerca/luoghi?tipo=borgo_citta|sito`.
- Nessun flusso riscritto in questa fase: solo l'indice che oggi manca.
- Conteggi dagli endpoint di Fase 0 + `/api/percorsi` (un solo fetch, riusato da campo e scaffali).

**Fatto quando**: da `/percorsi/cerca` si raggiunge ognuna delle 9 ricerche censite in
`docs/mockup-ricerca-mete/README.md` §1, e nessuna schermata esistente è cambiata.

## Fase 2 — Il campo unico che risponde subito (1-2 giorni) — il cuore dell'ibrido

Un solo campo, due sorgenti in parallelo, due gruppi di risultati:

1. **Fra le tue Mete** — filtro client sulle righe di `/api/percorsi` (stessa logica di
   `GlobalRouteSearch` in `app/diari/page.tsx`: titolo + titolo del Diario). Nessuna rete.
2. **Borghi, Città e Siti** — `POST /api/meta-search` con debounce ~350 ms e `AbortController`
   sulla richiesta precedente; ricerca su entrambe le tipologie non-sentiero in un giro
   (`metaType: 'borgo_citta'` e `'sito'` in parallelo, uniti e ordinati dal ranking già esistente).

Una Meta già salvata che ricompare fra i risultati d'archivio si mostra **una volta sola**, nel
gruppo "tue Mete" (dedup su `place_id`) — mai la stessa riga due volte con due azioni diverse.
I Sentieri non entrano in questo campo: `/api/meta-search` li rifiuta per progetto (501), e la loro
ricerca è un flusso lungo, non un'istantanea.

`?q=` prevalorizza il campo (il deep link della pagina Mete continua a funzionare, ora sull'hub).

**Fatto quando**: digitando "castel" compaiono insieme le Mete salvate che corrispondono e i borghi
d'archivio, senza doppioni, e digitando in fretta non parte una richiesta per carattere.

## Fase 3 — Ingresso dalla pagina Mete (mezza giornata)

- Card "Cerca una Meta" sotto la striscia-carta, prima del campo che filtra le Mete salvate.
- Via il bottone a icona `Building2` accanto al campo (oggi l'unico ingresso a `/percorsi/cerca`):
  assorbito dalla card, altrimenti tornerebbero due ingressi sovrapposti — esattamente ciò che la
  Fase 2 del restyling aveva appena tolto.
- Il link "Cerca «testo» fra Borghi, Città e Siti" (ricerca locale a vuoto) resta e punta all'hub.

**Fatto quando**: dalla pagina Mete c'è un solo ingresso alla ricerca esterna, ed è la card.

## Fase 4 — Lo scaffale Borghi/Siti (1 giorno)

`/percorsi/cerca/luoghi`: l'attuale `CercaMetaPage` spostata, invariata nella logica (tab tipologia,
filtri regione/categoria, `metaSearchResultToPlannedHike` + `savePlanned`). Arriva con la tipologia
già scelta dallo scaffale che l'ha aperta.

**Fatto quando**: creare una Meta borgo dall'hub funziona esattamente come oggi, con un tocco in più
e la tipologia già impostata.

---

## Verifiche a ogni fase

`tsc --noEmit` pulito, eslint pulito, vitest verde. Test nuovi: il conteggio di Fase 0 (riga borgo e
riga sito), il dedup di Fase 2 (una Meta salvata che è anche in archivio compare una volta sola).

## Decisioni ancora aperte

1. **Scaffale aperto di default**: Sentieri (proposto: è la tipologia con dati veri e con 4 vie su 6).
   L'alternativa — ricordare l'ultimo aperto — aggiunge stato persistito per un guadagno dubbio.
2. **Siti a 0 righe**: lo scaffale resta visibile e dichiara che l'archivio è vuoto (come nel mockup
   C), oppure resta chiuso e silenzioso finché non ci sono dati. Da decidere insieme alle fasi 4-6
   del restyling, che riguardano proprio i dati.
