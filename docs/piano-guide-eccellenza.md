# Piano: schede Guida chiare e non dispersive (Sentieri + Borghi/Città + Siti)

Piano operativo per me stesso — nasce dall'audit reale di `GuidaHub.tsx`, `app/guida/elenco/page.tsx`,
`GuideReader.tsx`, `lib/guideProfiles.ts`, `app/api/guide/route.ts`, `lib/guideCardVariant.ts`,
`lib/useCtsRecompute.ts`. Il "cervello" tipologico (profili per sezione, filtro server-side) è già
ben fatto — il problema è che **liste** e **gerarchia visiva interna** non parlano con quel cervello.
Ordine: bug concreti e visibili → causa reale della dispersività → coerenza tra file → robustezza del
confine di gating → eventuale ridisegno della navigazione (solo se serve davvero).

## Vincoli permanenti

- Mai una metrica escursionistica (km/D+/quota/durata) per Borgo/Sito — se manca il dato, la riga
  sparisce, non uno zero.
- `lib/guideProfiles.ts`/`lib/guideSections.ts` restano l'unico scheletro canonico — nessun secondo
  elenco di sezioni parallelo.
- Non toccare il filtro server (`app/api/guide/route.ts:982-985`): è corretto e senza varchi, verificato.
- `tsc --noEmit`, eslint, vitest verdi ad ogni fase.

---

## Fase 0 — Bug concreti nelle liste (2-3 giorni)

Il problema #1 dell'audit ("confusione tra tipologie"): le card fuori dalla guida mostrano sempre
km/D+/quota/durata, a prescindere dalla tipologia. `lib/metaCard.ts` esiste apposta e non è collegato.

| # | Intervento | File |
|---|---|---|
| 0.1 | `metaToItem` e `pillsFor` in GuidaHub: sostituire le 4 pillole fisse con `metaCardStats`/`metaRowLocationStats` (già scritte) quando `h.metaType !== 'sentiero'` | `app/guida/GuidaHub.tsx:72-105, 550-559` |
| 0.2 | Stessa correzione nella griglia "Percorsi in attesa" (card attiva riga 166-175 e card archiviata riga 200) | `app/guida/elenco/page.tsx` |
| 0.3 | Copertina/thumbnail: per un item senza `routePolyline` mostrare un'icona/badge coerente con `META_TYPE_CONFIG[metaType].icon`, non sempre `Mountain` | `app/guida/elenco/page.tsx:150-152`, `app/guida/GuidaHub.tsx` |
| 0.4 | Copy della lista: titolo "Percorsi in attesa" e stato vuoto restano validi solo se la lista è a maggioranza Sentieri — se la tipologia mista diventa comune, generalizzare (non urgente, valutare insieme a 0.1-0.3) | `app/guida/elenco/page.tsx:63, 119-123` |

**Fatto quando**: una guida Borgo/Sito in lista mostra luogo/categoria (come già fa `metaRowLocationStats`), mai "0.0 km".

## Fase 1 — Gerarchia visiva "generato" vs "da generare" (4-6 giorni)

La vera causa della dispersività: 9 card di sezione con lo stesso peso visivo, che siano piene o
vuote in attesa di un tocco su "Approfondisci con Giulia".

| # | Intervento | File |
|---|---|---|
| 1.1 | Le sezioni non ancora generate (`missingSectionKeys`) non restano card a piena altezza in mezzo alle altre: diventano una riga compatta unica ("+ 5 sezioni da generare: Natura, Sapori, Consigli…") con azione unica, invece di N placeholder identici nello scroll | `components/guida/GuideReader.tsx` (blocco 1139-1159 e il rendering di `displaySections`, 1257-1287) |
| 1.2 | `SectionNav` distingue visivamente (badge/pallino) le pillole già generate da quelle vuote — oggi ha solo lo stato "attiva" via IntersectionObserver | `components/editorial/SectionNav.tsx` |
| 1.3 | Verificare che, tolti i placeholder dallo scroll principale, `SectionNav` continui a puntare correttamente alle sole sezioni realmente presenti | stesso file + `GuideReader.tsx` |

**Fatto quando**: aprendo una guida con solo le 3 sezioni di default generate, lo scroll mostra 3 card piene + un unico invito compatto ad approfondire, non 9 blocchi di peso uguale.

## Fase 2 — Widget "morti per accidente" (1-2 giorni)

| # | Intervento | File |
|---|---|---|
| 2.1 | `PhotoMosaic`: oggi montato sempre ma alimentato solo da `trackPoints`/`routePolyline` — per un Sito puntuale è quasi sempre vuoto. O si nasconde esplicitamente quando `metaType !== 'sentiero' && !hasGps` (coerente col gate già usato da `RouteMapSection`), o si estende la fonte foto a `imageUrl`/foto del luogo già presenti su `dtrek_places` | `components/guida/GuideReader.tsx:388-398, 1122-1125` |

**Fatto quando**: nessun riquadro vuoto silenzioso nello scroll di un Sito/Borgo senza traccia.

## Fase 3 — Coerenza tra `guideCardVariant.ts` e `guideProfiles.ts` (1 giorno, decisione di prodotto)

`guideCardVariant.ts` promette che un Borgo con `trekking_misto` (traccia reale) mantiene "Il
percorso"/"Dati e sicurezza" quasi come un Sentiero; `guideProfiles.ts` esclude sempre
`dati_sicurezza` per ogni `borgo_citta`, senza eccezione.

| # | Intervento | File |
|---|---|---|
| 3.1 | Decidere: (a) `guideProfileFor` accetta la variante `trekking_misto` e include `dati_sicurezza` solo in quel caso, oppure (b) si corregge il commento/la promessa in `guideCardVariant.ts` per riflettere il comportamento reale. Preferenza: (a) — un borgo raggiunto a piedi con dati di cammino reali ha senso mostri quella sezione | `lib/guideProfiles.ts:66-70`, `lib/guideCardVariant.ts:6-14` |

**Fatto quando**: i due file dicono la stessa cosa, verificato da un test in `lib/__tests__/guideProfiles.test.ts`.

## Fase 4 — Confine di gating esplicito per tipologia (2-3 giorni)

Oggi CTS/Safety si attivano da "esistono ≥2 trackPoints", non da "è un Sentiero" — funziona per
accidente, non per garanzia. Rischio silente se un Sito acquisisse punti traccia per un bug di import.

| # | Intervento | File |
|---|---|---|
| 4.1 | Aggiungere `metaType === 'sentiero' \|\| (metaType === 'borgo_citta' && variant === 'trekking_misto')` come condizione esplicita, in AND con il controllo `hasEnoughGps` già esistente — mai in sostituzione, il controllo sui dati resta la prima difesa | `lib/useCtsRecompute.ts`, `app/guida/GuidaHub.tsx:470-483, 725-745` |
| 4.2 | Stesso principio per `computeSafetyForHike`/`useSafetyScore` | `app/guida/useSafetyScore.ts`, `lib/computeSafetyForHike.ts` |

**Fatto quando**: un test con un Sito a cui viene iniettata per errore una traccia di 2 punti non produce comunque un Safety/CTS Score.

## Fase 5 — Navigazione a blocchi (solo se le Fasi 1-2 non bastano) (5-8 giorni, opzionale)

`GUIDE_NAV_GROUPS` (3 gruppi: Prima di partire, Percorso, Luoghi e Natura) è già definito ma **non
consumato da nessun componente montato** — non un'alternativa pronta, un mattone inutilizzato.

| # | Intervento | File |
|---|---|---|
| 5.1 | Rivalutare DOPO la Fase 1: se la gerarchia "generato/da generare" già riduce la dispersività a sufficienza, non implementare — evitare di costruire una seconda modalità di lettura non richiesta | — |
| 5.2 | Se ancora necessario: usare `GUIDE_NAV_GROUPS` per raggruppare visivamente le 9 `SectionCard` in 3 blocchi scrollabili con ancoraggio, riusando `SectionNav` per i 3 gruppi invece che le 9 sezioni singole | `components/guida/GuideReader.tsx`, `components/editorial/SectionNav.tsx`, `lib/guideSections.ts:63-82` |

**Fatto quando**: solo se attivata, la lettura passa da 9 a 3 tappe percepite senza perdere l'accesso diretto a ciascuna sottosezione.

---

## Ordine di esecuzione consigliato

Fase 0 → 1 → 2 → 3 → 4, tutte indipendenti tra loro tranne 1 che beneficia di essere fatta dopo 0
(stessa area di codice, meno conflitti). Fase 5 è condizionata al risultato della Fase 1 — non
partire da lì. Verifica ad ogni fase: `tsc --noEmit`, eslint, vitest verdi, nessuna regressione sui
test esistenti di `lib/__tests__/guideProfiles.test.ts`.
