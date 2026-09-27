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

**Test rimasti da fare** (non ancora eseguiti, mandati dall'utente ma non ancora ricevuti/analizzati
in questa sessione): MACK Museo Arte Contemporanea Crotone, Museo civico della ceramica di Nove,
Casa di Fausto Coppi — altri 3 musei del campione casuale, per completare il quadro sulla parte
piccola/tematica prima di stimare una percentuale di copertura complessiva.

---

## 3. Conclusione preliminare (da completare)

**Wikidata è una fonte nettamente migliore di ArCo per i musei che hanno davvero opere d'arte
catalogate individualmente** (gallerie, pinacoteche, musei archeologici di rilievo) — copertura
reale su scala molto più alta (centinaia contro 0-1). **Non risolve il caso dei musei
locali/tematici** (probabilmente la maggioranza dei 2.296 in Dtrek), per i quali "opere" come
concetto (opere d'arte, non oggetti museali in generale) potrebbe semplicemente non applicarsi.

Prima di progettare una pipeline reale:
1. Completare il campione casuale (i 3 musei mancanti) per stimare quanti dei musei "generici" già
   in Dtrek hanno davvero opere collegabili — non solo i musei d'arte già noti.
2. Verificare `--sample` su almeno un museo grande (es. Galleria Borghese) per vedere quali campi
   sono realmente popolati (titolo, immagine, autore, anno) — nessuno di questi verificato ancora,
   solo il conteggio.
3. Decidere l'architettura in base a QUANTO è ampia la copertura reale: se resta un sottoinsieme
   significativo ma minoritario (es. qualche centinaio di musei "importanti" su 2.296), un
   approccio a doppio binario ha senso — lista reale di opere (con immagini, da Wikidata) per i
   musei con dati, testo narrativo ancorato a Wikipedia (non più invenzione LLM pura) per tutti gli
   altri, mai un blocco vuoto o un errore per i musei senza opere.

Nessuna pipeline di import/tabella creata in questa sessione — solo diagnostica
(`scripts/places/wikidata/opere/probe.ts`) e questo report, in continuità con il metodo già seguito
per ArCo.
