# Perché il Diario non si percepisce come fulcro — diagnosi e tre direzioni

Punto di partenza: l'app è vissuta come complicata e confusionaria, e la prima pagina
("I miei Diari") non riesce a dare una mappa mentale. Questo documento non propone un
restyling: il restyling `/diari` è già stato fatto (`docs/diari-restyling-piano.md`,
versione A "Plancia di campo") e il problema è rimasto. Segno che la causa non è nella
pagina, ma nella struttura che la pagina prova a rappresentare.

---

## 1. La diagnosi in una riga

**Nell'app non esiste un oggetto che dura.** L'uscita cambia nome e cambia casa due volte
lungo la sua vita, e il Diario la riceve solo nell'ultimo terzo. Un utente non può
costruire una mappa mentale di un mondo in cui le cose che tocca non sopravvivono a se
stesse.

Il ciclo reale, oggi:

| Fase | Come si chiama | Dove vive | Il Diario la vede? |
|---|---|---|---|
| La cerco / la pianifico | **Meta** (record `planned_hikes`) | `/percorsi` — albero a sé | no |
| La cammino | traccia in **Navigator** | `/navigatore` — di fatto un'app a parte | no |
| L'ho fatta | **Reportage** (record `activities`) | `/diari/[id]` | sì, solo qui |

E il passaggio non è additivo, è **sostitutivo**: appena nasce un Reportage, la Meta
smette di comparire in `/percorsi` (commento esplicito in cima a `app/percorsi/page.tsx`).
Cioè l'oggetto che l'utente aveva salvato *sparisce* dall'elenco dove l'aveva messo e
*riappare altrove con un altro nome*. Questo è il singolo fatto che rende impossibile
orientarsi, e nessuna grafica lo può compensare.

Il Diario, di conseguenza, non è il fulcro: è **l'archivio del passato**. Contiene un
terzo del ciclo. Un fulcro è ciò che attraversa tutte le fasi, non ciò che le riceve alla
fine.

## 2. I quattro sintomi che ne discendono

### a) Due porte d'ingresso in conflitto

- `app/page.tsx` (l'avvio dell'app) → **redirect al Sommario dell'ultimo Diario aperto**.
- Il tab "Diari" della barra → **`/diari`, lo scaffale**.

Aprire l'app e toccare "Diari" portano in due posti diversi, entrambi con l'aria di essere
"l'inizio". L'utente non impara mai qual è la casa, e ogni volta deve ricostruire dove si
trova. Da sola, questa ambiguità basta a far percepire l'app come confusionaria.

### b) Quattro pari, nessun centro

La barra è `Diari · Mete · Navigator · Statistiche` (+ Profilo). Quattro voci allo stesso
livello comunicano quattro mondi paralleli. Se il Diario è il fulcro, non può essere un
quarto di barra: dovrebbe essere il contenitore *dentro cui* le altre voci accadono.

La `FasiRail` in cima a `/diari` **racconta** "Pianifica → Naviga → Registra", ma la
struttura sotto la smentisce: due fasi su tre non stanno nel Diario. Quando la parola dice
una cosa e la navigazione ne dice un'altra, vince la navigazione, e la parola diventa
rumore.

### c) Troppi sostantivi di primo livello

Diario, Reportage, Meta (ex Percorso), Raccolta, Guida, Resoconto, Vette, Statistiche,
Navigator, Percorsi per te. **Dieci nomi** per un utente che ne regge tre o quattro. Peggio:
alcuni sono lo stesso oggetto (Meta = Percorso, rinominato) e altri tre — Guida, Reportage,
Resoconto — sono *tre modi di leggere*, non tre cose.

### d) `/diari` è un cruscotto, non una casa

La pagina impila oggi otto blocchi senza gerarchia: intestazione + frase, rail delle fasi,
card prossima uscita, chip di filtro, righe di registro raggruppate, riga "nuovo Diario",
striscia Raccolte, ricerca globale, più due link di piede. Ci sono **tre meccanismi
distinti per andare altrove** (rail, ricerca, link di piede) e **due elenchi** (Diari,
Raccolte). Ogni blocco preso da solo è ragionevole; insieme chiedono al lettore di
scegliere fra otto inizi.

E il titolo — *"I miei Diari"*, plurale — dichiara che il fulcro è **lo scaffale**, non il
Diario. Il primo oggetto che l'utente incontra è un contenitore di contenitori.

---

## 3. Tre direzioni

### Direzione A — L'uscita come oggetto che dura, il Diario come sua casa *(raccomandata)*

Un solo oggetto, **l'uscita**, con tre stati: `in programma` → `in cammino` → `registrata`.
Non cambia nome e non cambia casa: dal momento in cui la salvi, sta nel suo Diario. Il
lavoro è già cominciato in questa direzione — Navigator ora chiede in quale Diario salvare
la traccia (commit `5147aab`).

- **La casa è un Diario aperto**, non lo scaffale. Una pagina, tre sezioni nell'ordine del
  tempo: *In programma* (le tue Mete) · *In cammino* (se c'è una sessione aperta) ·
  *Registrate* (i Reportage). La stessa uscita scorre dall'alto in basso, restando dov'è.
- **Il rail delle fasi sparisce**: non serve raccontare il processo se la pagina *è* il
  processo.
- **"Mete" diventa "Cerca"** — una sorgente da cui pescare, non un archivio parallelo.
  Quello che trovi lo aggiungi a un Diario, e da lì in poi vive lì.
- **Lo scaffale `/diari` retrocede** a selettore ("cambia Diario"), raggiunto dal titolo in
  testata. Non è più la prima pagina, e questo risolve anche il conflitto fra le due porte.
- **Barra a quattro**: `Diario` (singolare) · `Cerca` · `Navigator` · `Profilo`.
  Statistiche entra nel Diario, dove sono i dati che riassume.

Mappa mentale che ne risulta, dicibile in una frase:
> **Un Diario è un'impresa in corso. Ci metti dentro le uscite che vuoi fare, il Navigator
> te le fa camminare, e quando torni sono già al loro posto.**

Costo: medio-alto. Tocca la barra, la home, `/diari`, `/percorsi`. Nessuna migrazione dati
distruttiva: `planned_hikes` acquisisce un `diary_id` opzionale, e le Mete senza Diario
restano nel Diario di default.

### Direzione B — Sistemare solo la porta d'ingresso

Si tiene la struttura ad alberi paralleli e si interviene sui sintomi: una sola porta
(l'app apre sempre nello stesso posto), `/diari` sfoltita a tre blocchi (prossima uscita,
elenco, nuovo), rail delle fasi rimosso, Raccolte e ricerca spostate.

Costo: basso, una PR. Onestà: parziale — l'uscita continua a cambiare nome e casa, quindi
la mappa mentale resta fragile. Utile come **primo passo dentro** la direzione A, non come
alternativa.

### Direzione C — Un solo Diario

I Diari multipli scompaiono come contenitori e diventano **etichette** su un unico registro
personale (le etichette esistono già: `labels` su `diaries`). L'app ha un solo albero, le
Raccolte restano l'unità di pubblicazione.

Costo: alto e irreversibile nella percezione. Elimina alla radice il livello "scaffale", ma
butta via il concetto stesso di Diario come volume — che è l'identità editoriale dell'app
(volume → collana, `docs/raccolte-pubblicazione-piano.md`). La cito per completezza; non la
consiglio.

---

## 4. Cosa vale la pena decidere per primo

Una sola domanda, e tutto il resto discende:

**Quando salvo una Meta, entra subito in un Diario — sì o no?**

- **Sì** → direzione A. Il Diario diventa il fulcro perché contiene il ciclo intero, e la
  prima pagina si scrive da sola.
- **No** → allora il Diario è un archivio, e va detto con chiarezza invece che promettere
  un fulcro che non c'è: la prima pagina dovrebbe essere Mete/Cerca, e i Diari il posto
  dove finiscono le cose fatte.

La versione peggiore è quella attuale: la promessa del fulcro senza la struttura che la
regge.
