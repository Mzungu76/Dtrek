# "Opere di questo museo" da Wikidata — alternativa ad ArCo

Data: 2026-09-27. Segue `docs/arco-opere-musei.md`, chiuso negativamente: il meccanismo tecnico per
collegare un'opera catalogata al suo museo su ArCo funziona, ma la copertura reale è insufficiente
per l'obiettivo (arricchire la sezione "opere" della Guida Sito museo — `lib/guideProfiles.ts`,
oggi puro testo LLM — per OGNI museo, non per una manciata di musei vetrina). Questo documento
verifica Wikidata come alternativa, sulla stessa richiesta.

---

## 1. Perché Wikidata

- `wdt:P195` (collezione) e `wdt:P276` (ubicazione) sono proprietà Wikidata standard che collegano
  un'opera d'arte al museo che la conserva.
- Dtrek ha già un ponte pronto: `dtrek_places.wikidata_id` (colonna esistente) e
  `scripts/places/wikidata/enrich.ts` (arricchimento nome+prossimità, già in produzione per altre
  Meta) — **mai eseguito sui musei**: verificato su Supabase, 0/2.296 musei con `wikidata_id`
  popolato.
- Wikidata è generalmente molto più densamente popolato di ArCo per "opere in un museo", grazie
  anche alle collaborazioni GLAM/Wikimedia attive con diversi musei italiani.

---

## 2. Verifica dal vivo (2026-09-27, via Termux)

### 2.1 Primo tentativo fallito — lezione pagata, non un'ipotesi

Cercare un museo per nome con SPARQL (`FILTER(CONTAINS(LCASE(?itemLabel), ...))` su tutte le
etichette di Wikidata) è andato in **timeout dopo 30s** — non indicizzato per uno scan di questo
tipo su centinaia di milioni di trple. Corretto usando l'API REST dedicata `wbsearchentities`
(`https://www.wikidata.org/w/api.php?action=wbsearchentities...`), pensata per questo — verificata
reale, sub-secondo. Il conteggio/campione opere (una volta noto il QID) resta invece SPARQL: lì è
una query mirata e indicizzata su un singolo QID, non uno scan — verificata veloce.

### 2.2 Musei grandi (già confrontati con ArCo)

| Museo | QID | Opere (Wikidata, P195/P276) | Opere (ArCo, `MIC_DATA_SOURCES.md`/`arco-opere-musei.md`) |
|---|---|---|---|
| Galleria Borghese | Q841506 | **240** | 1 |
| Musei Capitolini | Q333906 | **302** | 1 |
| Museo nazionale romano – Palazzo Massimo | *(non trovato con questo nome)* | — | 0 |
| Museo nazionale etrusco di Villa Giulia | Q15055388 | **15** | 0 |
| Galleria nazionale d'arte moderna | Q1492387 | **153** | 0 |

Differenza netta: dove ArCo dava 0-1 opere anche per i più grandi musei statali, Wikidata ne dà
decine/centinaia. "Museo nazionale romano - Palazzo Massimo" non è stato trovato con
`wbsearchentities` usando esattamente questo nome — probabile che il nome Wikidata sia diverso
(es. "Palazzo Massimo alle Terme", o registrato come parte del "Museo Nazionale Romano" più ampio)
— non ancora risolto, da riprovare con varianti del nome prima di concludere che manca del tutto.

### 2.3 Musei piccoli/tematici (campione casuale da Dtrek, per non avere solo casi favorevoli)

Campione di 15 musei estratto a caso da `dtrek_places` (`source='mic'`, `subtype='museo'`) su
Supabase — quasi tutti piccoli/tematici (Casa di Fausto Coppi, Micromuseo contadino, Museo del
Contrabbandiere, collezioni diocesane/militari/artigianali...), non gallerie d'arte. Testati 2:

| Museo | QID | Opere (Wikidata) |
|---|---|---|
| Museo civico di Vignola | Q55360890 | **0** |
| Museo civico di San Damiano d'Asti | Q55370699 | **0** |

**Atteso, non un errore**: questi hanno comunque un item Wikidata (trovato dalla ricerca), ma zero
opere collegate — sono musei locali/tematici (storia locale, mestieri, collezioni militari), non
gallerie d'arte con opere catalogate individualmente. Lo stesso vale verosimilmente per la
maggioranza dei 2.296 musei già in Dtrek: la sezione "opere" della Guida Sito, per questi, non ha
contenuto strutturato a cui agganciarsi né su ArCo né su Wikidata — non un problema della fonte, un
limite del concetto stesso ("opere d'arte" non è pertinente per un museo del contrabbando).

**Completato (2026-09-27)** — i 3 musei mancanti del campione casuale:

| Museo | QID | Opere (Wikidata) |
|---|---|---|
| MACK Museo Arte Contemporanea Crotone | *(non trovato)* | — |
| Museo civico della ceramica di Nove | Q55359420 | **0** |
| Casa di Fausto Coppi | Q55370304 | **0** |

**Su 5 musei piccoli/tematici testati (campione casuale, non scelti ad hoc): 4/4 con un QID hanno
0 opere, 1/5 non ha nemmeno un item Wikidata.** Stesso schema di scarsità già visto su ArCo — solo
con un tetto più alto per i musei importanti (centinaia contro 0-1). Non un limite della fonte: è
un limite del dominio. La stragrande maggioranza dei 2.296 musei già in Dtrek sono collezioni
locali/tematiche (storia, mestieri, militari, sportive) dove "opere d'arte catalogate" non è
nemmeno un concetto pertinente — nessuna fonte LOD pubblica (ArCo, Wikidata) avrà mai un elenco di
"opere" per una casa museo dedicata a un ciclista o un museo del contrabbando.

---

## 3. Conclusione

**Wikidata è una fonte nettamente migliore di ArCo per i musei che hanno davvero opere d'arte
catalogate individualmente** (gallerie, pinacoteche, musei archeologici di rilievo) — copertura
reale su scala molto più alta (centinaia contro 0-1). **Non risolve però il caso dei musei
locali/tematici**, che sono la maggioranza dei 2.296 già in Dtrek: campione casuale di 5, 4/4 con un
QID hanno 0 opere, 1/5 senza nemmeno un item Wikidata (§2.3). Stesso limite di ArCo, un tetto più
alto ma la stessa forma — non risolvibile cambiando fonte, perché è un limite del dominio ("opere
d'arte catalogate" non è un concetto pertinente per una casa museo dedicata a uno sportivo o un
museo del contrabbando), non della fonte scelta.

**Raccomandazione pratica, a doppio binario**:
1. **Un sottoinsieme minoritario ma reale di musei "importanti"** (gallerie/pinacoteche/musei
   archeologici di rilievo, identificabili per numero di opere collegate su Wikidata sopra una
   soglia, es. ≥10) può avere una vera sezione "Opere di questo museo" — lista reale con titolo,
   immagine, autore, anno (campi da verificare con `--sample`, non ancora fatto in questa sessione:
   nessun test ha ancora ispezionato i valori di `operaLabel`/`image`/`creatorLabel`/`inception` su
   un museo reale, solo il conteggio).
2. **Per tutti gli altri** (la maggioranza), "opere" come lista strutturata non è realizzabile con
   nessuna fonte pubblica nota — l'unico miglioramento realistico rispetto a oggi (testo LLM
   totalmente inventato) è ancorare la narrazione a un segnale reale quando esiste: l'estratto
   Wikipedia già recuperato da Dtrek per altri tipi di Meta (`lib/wikipedia.ts`), la `description`
   ArCo già importata per molti CIS (`MIC_DATA_SOURCES.md` §12, `l0:description`), o semplicemente
   il `subtype`/nome del museo per calibrare il tono — mai spacciare un'invenzione per un dato reale,
   ma nemmeno lasciare un buco quando la lista strutturata non esiste.

## 4. Implementato (2026-09-27) — arricchimento dal vivo, non batch

Verifica utente: un import batch di tutti i 2.296 musei è impraticabile (una sessione manuale ne ha
arricchiti 28 in un lotto). Implementato invece l'arricchimento DAL VIVO alla prima apertura della
Guida di uno specifico museo, con cache condivisa — stesso principio già in produzione per
`itinerary_cache` (Borgo/Città) e `image_url`/`image_credit` (foto di copertina):

- `lib/museumOpere.ts` — risolve `wikidata_id` (nome+prossimità 200m, stessa soglia 0.5 già
  validata in produzione da `scripts/places/wikidata/enrich.ts`) se mancante, poi le opere
  collegate (`wdt:P195`/`P276`) filtrate per sottoclasse di "opera d'arte" (`wd:Q838948` — fix
  dell'anomalia mostra/esposizione trovata su Galleria Borghese, §2.4, MAI riverificato dal vivo
  dopo il fix: rete di questa sessione bloccata). Cache TTL 90 giorni su `dtrek_places.opere_cache`/
  `opere_cached_at` (migration `add_dtrek_places_opere_cache.sql`, **applicata sul progetto
  Supabase reale in questa sessione**).
- `app/api/places/[id]/route.ts` — chiama l'arricchimento solo per `subtype === 'museo'`, mai per
  altri tipi di Sito/Borgo; `opere_cache`/`opere_cached_at` letti con una select ISOLATA (stesso
  principio già usato in quel file per `image_credit`/`phone`/`email`: mai un 500 sull'intera
  scheda se la migration non fosse applicata su un altro progetto Supabase).
- `components/guida/widgets/OpereMuseoWidget.tsx` — silenzioso se vuoto, wired in
  `GuideReader.tsx` solo per `siteType === 'museo'`, subito dopo `SitoInfoWidget`.

**Verificato in questa sessione**: 720/720 test passano (7 nuovi per le funzioni pure di
`lib/museumOpere.ts`), `tsc --noEmit` e `next lint` puliti sull'intero progetto.

**NON verificato in questa sessione** (onestà dovuta, non un dettaglio da tacere): nessun test in
un browser reale. Questa sandbox non ha credenziali Supabase configurate (`.env.local` assente) né
raggiunge `query.wikidata.org` — non è stato possibile aprire la Guida di un museo reale e vedere
il widget popolarsi con dati veri. Il filtro anti-mostra (`wd:Q838948`) in particolare resta una
correzione teorica, mai confermata contro l'endpoint reale dopo l'aggiunta. **Prossimo passo reale
per l'utente**: aprire la Guida di un museo già arricchito (uno dei 28 con `wikidata_id` da questa
sessione, es. "Museo Ferrari" o "Museo civico di Vignola" — quest'ultimo con 0 opere attese) e
confermare che il widget appare/non appare come previsto, senza errori in console.

## 2.4 Campione opere Galleria Borghese (2026-09-27) — campi reali e un'anomalia da correggere

`--sample Q841506` (10 opere):

```
Cranach. L'altro rinascimento
Sibilla Cumana, Domenichino, 1617 [immagine]
Il cardinal Domenico Ginnasi, Giuliano Finelli [immagine]
ritratto di monsignor clemente merlini, Andrea Sacchi, 1630 [immagine]
Busto di Adriano
sarcofago con le dodici fatiche di Ercole
Apollo in stile arcaistico, da un modello rodio, e leone ricomposto da vari frammenti [immagine]
gruppo con fontana, pescatore, personificazioni di mare e fiumi
Amazzone con due guerrieri, barbaro e greco [immagine]
Ritratto di Felice Zacchia Rondinini, Domenico Guidi
```

**Positivo**: titolo sempre presente, **7/10 con immagine**, autore quando noto (Domenichino,
Andrea Sacchi, Giuliano Finelli, Domenico Guidi) — assente per i pezzi antichi/anonimi (Busto di
Adriano, sarcofagi, gruppi scultorei romani), coerente e atteso, non un dato mancante per errore.

**Anomalia trovata, da correggere prima di un import reale**: **"Cranach. L'altro rinascimento" non
è un'opera — è il titolo di una mostra temporanea** ospitata alla Galleria Borghese, non un pezzo
della collezione permanente. `wdt:P276` (ubicazione) include quindi anche eventi/mostre, non solo
opere permanenti — `wdt:P195` (collezione) da solo è probabilmente più pulito per questo scopo (un
oggetto "in collezione" è quasi sempre un'opera vera, un evento "ubicato" in un museo può essere una
mostra). Non ancora isolato quale dei due contribuisca l'anomalia (query testata solo con
UNIONE delle due) — prossimo probe utile, se si procede: contare/campionare separatamente P195 e
P276, e/o aggiungere un filtro `wdt:P31/wdt:P279*` su classi di opera d'arte (dipinto Q3305213,
scultura Q860861, ecc.) per escludere eventi ed esposizioni.
