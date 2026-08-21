# DTREK — UX, Usability & Information Architecture Audit

**Data**: 2026-08-19 (aggiornato con evidenza visiva reale lo stesso giorno)
**Metodo**: lettura diretta del codice sorgente (route Next.js, componenti, testi UI reali, commenti
architetturali) e dei documenti di progetto (`README.md`, `docs/navigator-dtrek-boundary.md`), **integrata
con 51 screenshot reali forniti dall'utente in due giri successivi** — il primo copre Bacheca, Guida
(dettaglio percorso "Camposecco"), Resoconto (dettaglio "Faggeta del Cimino"), Diario (copertina, indice,
statistiche, pagine-resoconto), Profilo, e l'app nativa DTrek Navigator (home mappa, menu, elenco
percorsi, import, registrazione libera, navigazione attiva); il secondo copre Statistiche (Panoramica,
Andamento, Traguardi, Confronto) e Profilo → Impostazioni. Dove un rilievo è confermato da uno screenshot
è segnalato come **CONFERMATO**; dove resta dedotto dal solo codice resta segnalato come **da codice**.
Due precisazioni dirette dall'autore del prodotto, incorporate in questa revisione: "Percorsi per te" è
**attualmente non funzionante** (non un problema di adozione/scoperta ma un difetto funzionale a monte,
fuori perimetro per `DTREK-AUDIT.md`) ed è **candidata esplicita a diventare la nuova Home**; e
l'orientamento su smartphone è **fissato verticale per scelta di prodotto**, quindi non è un'area aperta
di verifica — resta aperta solo la resa su PC/tablet, per cui non sono ancora disponibili screenshot.
Questo è un audit **separato** da quello funzionale (`DTREK-AUDIT.md`), che valuta se le funzioni
esistono e funzionano — qui la domanda è se l'utente le capisce, le trova, e le usa senza attrito.

---

## Executive Summary

DTREK è tecnicamente molto più ricco di quanto la sua Home comunichi. Sotto la superficie convivono
**due prodotti**: un'app web ("Dtrek", pianificazione + AI + diario, a pagamento dopo un trial) e
un'app nativa separata ("DTrek Navigator", gratuita, per la navigazione GPS sul sentiero), collegate
solo da un pulsante "Apri app principale" che passa dal browser di sistema. Questa non è
un'implementazione nascosta — è documentata esplicitamente nel codice (`docs/navigator-dtrek-boundary.md`,
`app/navigatore/page.tsx`) — ma **dal punto di vista di chi apre l'app per la prima volta non esiste
alcuna spiegazione di questa architettura**: la si scopre solo incontrando il pulsante "Upgrade a Dtrek"
o "Apri Dtrek" senza contesto.

La Home reale dell'app (`/bacheca`, ex "Stato") è un **cruscotto di statistiche fisiologiche**
(Recovery Score, TSS, VO₂max, streak) a schermo intero su foto ambiente, con zero inviti diretti a
"pianifica un'escursione" finché l'utente non ha già caricato attività. Le tre funzioni che un nuovo
escursionista cercherebbe per prime — trovare un percorso, prepararsi, iniziare a camminare — non hanno
una casa ovvia dalla schermata di apertura: si trovano solo esplorando la voce di menu "Guide" (un nome
che non comunica "i miei percorsi pianificati") o scoprendo che la voce "Diario" nel tab bar in realtà
apre un libro impaginato di ricordi, non un diario da scrivere.

Il problema più grande non è la mancanza di funzionalità — ce ne sono moltissime, spesso ben progettate
singolarmente — ma la **mancanza di una gerarchia esplicita che dica all'utente dove comincia il suo
compito**. Gli screenshot reali confermano questa diagnosi e ne aggiungono una seconda, altrettanto
seria: la **schermata di navigazione attiva** di DTrek Navigator (§11) — il momento in cui l'utente sta
davvero camminando sul sentiero — è la più densa e sovraccarica di controlli di tutta l'app: fino a 12
icone solo-icona impilate ai bordi dello schermo e due avvisi importanti (fauna selvatica, luce
insufficiente per rientrare) mostrati sovrapposti nello stesso istante, proprio nel momento in cui la
chiarezza conta di più. Punteggio complessivo aggiornato: **5.2/10** — un prodotto potente con
un'architettura informativa che richiede tempo di apprendimento sproporzionato rispetto alla sua natura
(un'app da usare *durante* un'escursione, spesso con attenzione e connettività limitate), e con un
momento d'uso critico (la navigazione reale) meno curato del resto dell'app dal punto di vista del
sovraccarico visivo.

---

## 1. First Impression — utente che non conosce DTrek

Simulando l'apertura dell'app senza alcuna documentazione, solo dall'interfaccia (`app/page.tsx` →
redirect a `/bacheca`; `components/Navbar.tsx`; `app/bacheca/page.tsx`):

- **Cosa penso che faccia l'app?** Una prima impressione plausibile è "un'app di fitness tracking con
  grafici" — la schermata di apertura è dominata da un Recovery Score, streak, carico di allenamento,
  VO₂max: linguaggio da app sportiva (tipo Strava/Garmin Connect), non da "diario di trekking con guide
  turistiche AI" come si descrive il progetto stesso in `README.md`.
- **Qual è l'azione principale?** Non è ovvio. La prima schermata, per un account senza attività
  caricate, mostra solo "Crea un Resoconto" (`app/bacheca/page.tsx:576-586`) — cioè: *documentare
  un'escursione già fatta*. Non c'è alcun invito a "trova un percorso" o "pianifica la prossima uscita",
  che è presumibilmente il primo bisogno reale di chi apre un'app di trekking.
- **Capisco la differenza tra le sezioni?** Le quattro voci del tab bar sono "Bacheca · Guide ·
  Resoconti · Diario" (`components/Navbar.tsx:18-23`). Senza glossario, "Guide" non comunica affatto
  "i percorsi che ho pianificato" — comunica contenuto editoriale/tutorial. "Resoconti" e "Diario"
  suonano quasi sinonimi (entrambi parlano di racconto di un'escursione passata); solo aprendoli si
  scopre che uno è la galleria dei singoli resoconti e l'altro un libro impaginato che li raccoglie
  tutti.
- **Capisco dove trovare un percorso?** No, non dalla Home. Esiste solo se si nota la piccola tile
  "Percorsi per te" nel filmstrip in basso (`app/bacheca/page.tsx:711-725`), visivamente identica a una
  qualunque statistica.
- **Capisco dove vedere i miei percorsi salvati?** Solo entrando in "Guide" — nome non intuitivo per
  questo contenuto.
- **Capisco dove iniziare una navigazione?** No. La navigazione GPS vive in un'app separata
  (Navigator), mai menzionata nella UI di Dtrek finché non si importa un GPX e non compare "Avvia
  navigazione ora" (`app/upload/page.tsx:60-71`) o si apre un percorso e si preme "Naviga" dentro
  `GuidaHub`.
- **Capisco dove registrare un'escursione?** Parzialmente: "Crea un Resoconto" è visibile, ma il verbo
  "Resoconto" implica narrazione/racconto, non registrazione GPS in tempo reale.
- **Capisco cosa rappresentano gli score?** No, non a colpo d'occhio: Recovery Score, Trail Score,
  Beauty Score, Safety Score, CTS, TSS, IEV, EF, VO₂max convivono nell'app (vedi §12 Linguaggio). C'è
  un pulsante "i" (info) su quasi ogni score (`InfoToggleButton`) — buon segnale — ma la sua presenza
  stessa conferma che gli score da soli non si spiegano.
- **Capisco cosa succede premendo ogni pulsante importante?** In gran parte sì per i pulsanti con
  etichetta testuale esplicita (es. "Importa un percorso"); meno per le icone pure nella barra
  laterale del Diario (vedi §13).

**Sintesi prima impressione**: DTREK si presenta come un cruscotto statistico avanzato per chi *ha già
usato l'app a lungo*, non come un punto di partenza per chi deve ancora pianificare la prima uscita.
Per un nuovo utente la prima cosa vista è quasi vuota di percorsi/mappe e piena di grafici che non ha
ancora dati per riempire.

---

## 2. Test "First 5 minutes"

Percorso simulato (nuovo account, nessuna attività):

1. **Apri DTREK** → redirect a `/bacheca` → stato vuoto con un solo CTA: "Crea un Resoconto"
   (`app/bacheca/page.tsx:563-589`). *Punto di incertezza*: l'utente che vuole prima **pianificare**
   un'escursione futura (non raccontarne una già fatta) non trova qui nulla di pertinente.
2. **Capire cosa offre** → deve esplorare i 4 tab uno per uno. "Guide" si apre e mostra... uno stato
   vuoto con bottone "Crea una guida" (`GuidaHub.tsx:555-563`), oppure — se l'utente è fortunato e ha
   ricevuto il "percorso omaggio" all'onboarding — un percorso reale. *Punto di incertezza*: "guida" e
   "resoconto" restano indistinguibili finché non se ne apre uno di ciascuno.
3. **Trovare un percorso** → due strade non ovviamente equivalenti: (a) `/percorsi-per-te`
   (raccomandazioni AI, richiede geolocalizzazione), (b) importare un GPX proprio da `/upload?tab=gpx`
   con **tre sotto-modalità** (File traccia / Manuale / Da diario esistente,
   `app/upload/page.tsx:74-98`). *Punto di incertezza*: tre modi di creare lo stesso tipo di oggetto,
   nessun consiglio su quale scegliere.
4. **Aprire il percorso** → apre `GuidaHub`, un'esperienza "magazine" a schermo intero con card
   swipeabili, punteggi (TS, Sicurezza), meteo, mappa 3D, POI, flora/fauna.
5. **Capire le informazioni principali** → il carico informativo è alto: nella stessa vista convivono
   pillole di distanza/dislivello/quota/durata, un badge Trail Score a doppio anello, un chip "Meteo",
   possibili avvisi ("Verificato online"), preferiti, confronto, editing titolo/note, export PDF,
   pulsante "Percorso di Default" (solo owner). *Punto di incertezza*: nessuna gerarchia visiva
   dichiarata separa "quello che ti serve per decidere se fare questa escursione" da "quello che ti
   serve per gestire il percorso salvato".
6. **Avviare una navigazione** → il bottone di navigazione porta a `/guida/[id]/naviga` — ma se l'utente
   sta usando la PWA/web (non l'app nativa Navigator), rischia di restare in una WebView senza GPS in
   background affidabile (vedi confine Navigator/Dtrek). Se ha installato Navigator, l'ingresso è
   diverso: si apre l'app nativa e — se non ha ancora "pianificato" nulla lì — deve prima importare di
   nuovo (`app/navigatore/importa`), duplicando un passo appena fatto in Dtrek.
7. **Tornare indietro** → nessun problema tecnico noto, ma nessuna "home" univoca a cui tornare: il tab
   attivo resta quello da cui si è partiti, non necessariamente dove serve.
8. **Ritrovare ciò che aveva appena usato** → il carosello di "Guide" mostra i percorsi più recenti per
   primi, quindi funziona; ma se l'utente è passato da Dtrek a Navigator per navigare, il percorso vive
   ora in due "elenchi" nominalmente diversi (Percorsi pianificati di Navigator vs. galleria di Guide),
   sincronizzati sullo stesso dato ma con interfacce e limiti diversi (Navigator ha un tetto di 1
   percorso "pronto", `lib/navigatorSlot.ts`).

**Conclusione test 5 minuti**: l'obiettivo dichiarato ("capire il prodotto e compiere un'azione
significativa senza assistenza") **non è raggiunto in modo lineare**. L'utente arriva al traguardo
("ho pianificato/importato un percorso") ma passando per almeno 3-4 momenti di incertezza sul nome
delle sezioni e sulla scelta tra percorsi paralleli per fare la stessa cosa.

---

## 3. Test "utente abituale" (30+ escursioni)

Per un utente esperto la valutazione è più favorevole ma non priva di attrito:

- **Operazioni frequenti veloci?** Sì per "apri l'ultimo percorso pianificato" (primo item del
  carosello) e per "guarda le mie statistiche della settimana" (Bacheca, filmstrip con pillole sempre
  visibili). La gestualità swipe/tap è coerente tra Bacheca/Guide/Resoconto (stesso pattern
  `RouteHub`/galleria fotografica).
- **Tap inutili**: la creazione di un nuovo percorso richiede sempre di passare da `/upload`, scegliere
  una tab, e in caso GPX scegliere una delle tre sotto-modalità — anche per l'utente che lo fa ogni
  settimana esattamente allo stesso modo (file da orologio GPS). Non esiste una scorciatoia "ultima
  modalità usata" o un'azione rapida dal tab bar/FAB.
- **Conferme ridondanti**: eliminazione percorso usa `confirm()` nativo del browser
  (`GuidaHub.tsx:618`, `"Eliminare questa escursione pianificata?"`) — funzionale ma stona con il resto
  dell'interfaccia molto curata (nessun'altra modale nell'app usa il dialog nativo del browser).
- **Informazioni ripetute**: le pillole km/D+/quota/durata sono ripetute identiche nella card del
  carosello (`metaToItem`, `GuidaHub.tsx:78-83`), nell'header aperto (`TopOverlay`) e nella card di
  `RouteHub`. Corretto in sé (serve overview + dettaglio), ma nessuna le distingue visivamente come
  "stesso dato, contesto diverso".
- **Funzioni nascoste**: "Ricerche salvate" e "Log ricerche" vivono solo dentro `/profilo` come voci di
  menu testuali (`app/profilo/ricerche-salvate`, `app/profilo/log-ricerche`), non collegate in alcun
  modo dal punto in cui si fa una ricerca. Un utente che cerca spesso lo stesso tipo di percorso non ha
  un accesso rapido da lì.
- **Workflow lunghi**: pubblicare il Diario come PDF condivisibile richiede aprire `/diario`, individuare
  una delle **cinque icone della rail sinistra + quattro della rail destra** (copertina, testi,
  statistiche, blocca mappe, nascondi bozze, escluse, esporta, condividi —
  `app/diario/page.tsx:684-973`), capire quale sblocca cosa. Per un'azione compiuta 1-2 volte l'anno
  (pubblicare il diario) è accettabile; per la personalizzazione ricorrente (escludere una gita) è
  un'operazione a 3 click nascosta dietro un'icona "Archivio" non ovvia.

**Conclusione**: l'esperienza ripetuta è ragionevolmente efficiente per il *contenuto* (aprire/scorrere
percorsi), meno per le *azioni di gestione* (creare, pubblicare, escludere), che restano sempre dietro
menu/icone da reinterpretare ogni volta.

---

## 4. Architettura informativa (ricostruita)

```
DTREK (app web, dietro paywall/trial dopo import iniziale)
│
├── BACHECA  (Home reale — tab 1, redirect di "/")
│   ├── Recovery Score, Bilancio Fisico, Volume settimanale, Streak
│   ├── Traguardi (badge), Record personali
│   ├── ~15 grafici extra (annuale, mensile, stagionale, FC, zone, VO2max, calorie…)
│   ├── Filtro per categoria (Fisiologia/Andamento/Traguardi/Record/Totali) + vista a griglia
│   ├── Teaser "Percorsi per te" → /percorsi-per-te
│   └── Link "Tutte le statistiche" → /statistiche (statistiche DUPLICATE, vista non-fullscreen)
│
├── GUIDE  (tab 2 — in realtà: "i miei percorsi pianificati")
│   ├── Galleria swipeabile di percorsi pianificati (RouteHub, stile magazine)
│   ├── Per ogni percorso: mappa 3D, meteo, POI+Wikipedia, flora/fauna, Trail/Safety/Beauty Score,
│   │   guida testuale generata da AI ("Giulia"), export PDF, avvio navigazione, confronto
│   ├── /guida/elenco — lista non-magazine (esiste in parallelo alla galleria?)
│   └── /guida/[id]/naviga — schermo di navigazione dedicato
│
├── RESOCONTI  (tab 3 — escursioni concluse, stesso pattern hub di Guide)
│   ├── Galleria swipeabile di resoconti (racconto + dati dell'attività GPS registrata)
│   ├── /resoconto/elenco
│   └── Condivisione pubblica (/s/[token], /s/live)
│
├── DIARIO  (tab 4 — libro impaginato che raccoglie TUTTI i resoconti + attività senza racconto)
│   ├── Copertina personalizzabile, indice, mappa d'insieme, statistiche aggregate
│   ├── Pagine per ogni resoconto + "stub" per attività non ancora raccontate
│   ├── Esportazione PDF (per anno o completo), pubblicazione link pubblico (/leggi/d/[token])
│   └── 9 controlli in due rail laterali (copertina, testi, statistiche, blocco mappe, mostra bozze,
│       escluse, esporta, condividi)
│
├── PROFILO  (icona persistente, non tab — avatar in alto a destra)
│   ├── Statistiche, Traguardi, Vette raggiunte, Cronologia navigazione
│   ├── Impostazioni (identità, indirizzo, dati biometrici, comfort score)
│   ├── Intelligenza artificiale (chiave Claude personale — BYOK)
│   ├── Abbonamento (badge gioiello — stato Premium/trial)
│   ├── Installa l'app, Fonti e crediti, Esci
│
├── UPLOAD  (non in nav — raggiunto da CTA sparsi: "Crea un Resoconto" / "Crea una guida")
│   ├── tab "activity": Da GPS/orologio → Resoconto (+ "Avvia navigazione ora" inline)
│   └── tab "gpx": File traccia / Manuale / Da diario esistente → Guida (percorso pianificato)
│
├── VETTE  (solo da Profilo — cime raggiunte, calcolate dai GPX)
├── STATISTICHE  (solo da Profilo o dal link "Tutte le statistiche" in Bacheca — sovrapposto a Bacheca)
├── PERCORSI-PER-TE  (solo da una tile in Bacheca — raccomandazioni AI)
│
└── (APP SEPARATA) DTREK NAVIGATOR — shell Capacitor su /navigatore/*, installazione distinta
    ├── Home: mappa live, "pronto per la navigazione" se esiste un percorso attivo
    ├── Menu ☰: Percorsi pianificati (/navigatore/percorsi) · Importa un percorso (/navigatore/importa)
    │   · Registra senza pianificazione (/navigatore/traccia) · Upgrade/Apri Dtrek · Esci
    └── Nessuna statistica, nessun diario, nessuna AI: solo mappa + navigazione + import minimo
```

### Valutazione della struttura

- **Categorie realmente necessarie**: Guide (percorsi futuri), Resoconti (escursioni passate),
  Profilo/Impostazioni sono necessarie. Bacheca come cruscotto statistico è utile ma **non dovrebbe
  essere la Home** di un'app la cui prima proposta di valore è "pianifica e vivi un'escursione".
- **Categorie che si sovrappongono**: Bacheca (statistiche) e Statistiche (pagina dedicata) mostrano in
  larga parte gli stessi dati con presentazioni diverse — utile solo se le differenze avessero un nome
  che le distingua (non ce l'hanno: "Bacheca" non comunica "statistiche" a un nuovo utente). Resoconti
  e Diario sono concettualmente la stessa collezione di dati (racconti di escursioni) esposta in due UI
  radicalmente diverse (galleria vs. libro), entrambe tab di primo livello.
- **Funzioni fuori posto**: "Percorsi per te" (raccomandazione/scoperta di nuovi percorsi) è
  raggiungibile solo da una tile in Bacheca — concettualmente appartiene a "Guide" (dove si gestiscono i
  percorsi) o meriterebbe un ingresso proprio, non un teaser dentro il cruscotto statistico. **Nota
  dell'autore del prodotto**: la funzione **non funziona ancora** oggi (dipende interamente dall'AI, che
  richiede sblocco/BYOK) ed è vista come **candidata a diventare la Home** — coerente con la diagnosi di
  questo audit (§16, P-C2, Q23): risponde esattamente al bisogno "cosa voglio fare oggi" che la Home
  attuale non copre. Perché possa svolgere quel ruolo, però, deve funzionare anche **senza AI** (con un
  fallback basato su dati oggettivi — distanza da casa, punteggi calcolati, storico personale — non solo
  su generazione AI), altrimenti una Home che dipende da una funzione a pagamento/gated lascerebbe senza
  nulla proprio i nuovi utenti in prova, cioè chi ne ha più bisogno al primo avvio. "Vette
  raggiunte" e "Cronologia navigazione" sono dati derivati dalle attività/percorsi ma vivono solo dentro
  Profilo → Impostazioni-adiacenti, lontano dal contesto (un'attività, un percorso) a cui si
  riferiscono.
- **Sezioni troppo grandi**: Bacheca (~25 tipi di card statistiche in un'unica vista scrollabile/
  swipeabile) e la vista "featured" di `GuidaHub`/`GuideReader` (mappa 3D + meteo + POI + flora + fauna
  + punteggi + guida AI + editing + export, tutto in un'unica scheda) sono entrambe sovraccariche per
  essere "la prima cosa vista aprendo la sezione".
- **Sezioni troppo vuote**: `/vette` e `/percorsi-per-te` sono pagine intere dedicate a un singolo tipo
  di dato derivato, raggiungibili con difficoltà — la loro dimensione (utilità reale) non giustifica la
  loro scarsa raggiungibilità, è il contrario di quanto dovrebbe essere.
- **Funzioni da accorpare**: Statistiche (pagina) dentro Bacheca (o viceversa, con Bacheca ridotta a
  vero highlight/digest e "Statistiche" come unica destinazione per l'analisi completa).
- **Funzioni da separare**: la creazione percorso (`/upload?tab=gpx`) mischia tre flussi molto diversi
  (importa file, inserisci manualmente, deriva da un'attività già registrata) sotto un'unica etichetta
  "gpx" — utile raggrupparli in un solo punto d'ingresso, ma la scelta tra i tre andrebbe spiegata
  (quando uso "Manuale" invece di un file?) non solo elencata.

---

## 5. Mental model — "dove andrebbe un utente a cercare X?"

| L'utente cerca... | Dove ci si aspetterebbe | Dove si trova realmente | Problema? |
|---|---|---|---|
| "Le mie escursioni" (fatte) | Una sezione ovvia tipo "Le mie escursioni" | Sia in **Resoconti** (galleria) sia in **Diario** (libro) — stesso dato | Sì — due risposte plausibili, nessuna spiegazione di quale usare quando |
| "Un percorso che ho salvato" (da fare) | "Percorsi" o "I miei percorsi" | **Guide** | Sì — il nome non lo suggerisce |
| "Continuare una navigazione interrotta" | Dentro la mappa/navigazione stessa | Non emerge un punto esplicito di ripresa nella UI esaminata: si riparte da "pronto per la navigazione" in Navigator, ma non è chiaro se riprenda la sessione o la ricrei | Sì — punto critico non risolto visibilmente in superficie |
| "Foto scattate durante un'escursione" | Dentro il resoconto di quell'escursione | Sì, dentro Resoconto/Diario (`activityPhotos`) — corretto | No |
| "Analizzare un GPX" | Un'area "importa e analizza" | Si ottiene analizzandolo *implicitamente* durante l'import in Guide (Trail/Safety/Beauty Score) — nessuna sezione "analisi" a sé stante nominata come tale | Parziale — funziona ma non ha un nome proprio nella UI |
| "Prepararsi per usarlo offline" | Un bottone "Scarica offline" visibile sul percorso | **CONFERMATO da screenshot**: un'icona di download esiste, ma solo nell'elenco "Percorsi pianificati" **di Navigator** — non è mai comparsa negli screenshot della sezione "Guide" di Dtrek web | Sì — chi pianifica da Dtrek (probabilmente la maggioranza, essendo dove si crea/valuta un percorso) non vede questa opzione finché non apre anche Navigator |

**In quattro casi su sei la risposta non è univoca o non è ovvia** — soglia superata per dichiarare un
problema di architettura secondo il criterio richiesto ("se esistono più risposte plausibili, segnalare
un problema").

---

## 6. Ridondanze

| # | Funzioni | Perché confondono | Sono davvero diverse? | Raccomandazione |
|---|---|---|---|---|
| 1 | **Bacheca** vs **Statistiche** (`/statistiche`) | Stessi dati (recovery, streak, grafici), presentazione diversa (fullscreen/foto vs. pagina bianca classica); Bacheca stessa linka a "Tutte le statistiche" | Diverse nell'uso (Bacheca = digest curato "di oggi"; Statistiche = archivio completo esplorabile) ma il nome "Bacheca" non comunica affatto questa relazione | Rinominare concettualmente: Bacheca dovrebbe presentarsi come "digest" con un titolo/hint esplicito ("Riepilogo di oggi"), e il link a Statistiche va reso più prominente, non un'unica tile tra tante |
| 2 | **Resoconti** vs **Diario** | Entrambi collezioni della stessa entità (escursioni concluse raccontate); un utente non sa quale aprire per "rivedere l'ultima gita" | Diverse per formato di output (galleria interattiva vs. libro stampabile/condivisibile) — distinzione reale ma non dichiarata in UI | Nella UI, "Diario" dovrebbe presentarsi esplicitamente come "il tuo libro/PDF" e "Resoconti" come "sfoglia le tue escursioni" — oggi sono solo due nomi vicini nel tab bar |
| 3 | **"Naviga adesso" / "Avvia navigazione ora" / "Registra senza pianificazione" / "Registra un percorso"** | **CONFERMATO da screenshot**: quattro etichette diverse per la stessa funzione di traccia GPS libera — le prime due lato Dtrek web (`app/upload/page.tsx:68`), la terza è la voce di menu in Navigator, la quarta è il titolo della stessa schermata una volta aperta da Navigator (screenshot "Registra un percorso") | Sembrano essere la STESSA funzione (`/navigatore/traccia`) raggiunta da quattro punti con quattro nomi diversi | Unificare l'etichetta ovunque, es. sempre "Traccia libera" |
| 4 | **Tre modalità di import GPX** (File / Manuale / Da diario esistente) sotto un'unica tab "gpx" | Nessuna guida su quale scegliere; "Manuale" e "Da diario esistente" nel contesto "crea una guida" non sono spiegate | Sì, realmente diverse (fonte del tracciato) | Aggiungere una riga descrittiva sotto ciascuna delle tre opzioni, non solo l'icona+etichetta |
| 5 | **Percorsi pianificati** (Dtrek, in Guide) vs **Percorsi pianificati** (Navigator, stesso nome nel menu) | Stesso nome esatto, stesso dato sincronizzato, ma due interfacce e due limiti diversi (Navigator ha tetto di percorsi "pronti", Dtrek no) | No — è (giustamente) lo stesso dato, ma l'utente non sa che aprirlo da un'app o dall'altra ha conseguenze diverse (limite raggiunto) | Il tetto di Navigator andrebbe comunicato preventivamente da dentro Dtrek quando si crea un percorso, non scoperto solo aprendo Navigator |
| 6 | **Ricerche salvate** e **Log ricerche** (`/profilo/ricerche-salvate`, `/profilo/log-ricerche`) | Due sistemi di "memoria di ricerca" separati, nessuna spiegazione della differenza (salvate = preferite? log = cronologia automatica?) | Presumibilmente sì (una è intenzionale, una automatica) ma il nome da solo non lo dice, e nessuna delle due è raggiungibile dal punto in cui si effettua una ricerca | Etichettare esplicitamente "Ricerche salvate (preferite)" vs "Cronologia ricerche (automatica)"; linkarle da dove si cerca |
| 7 | **Badge Premium/trial** (gioiello) presente su: avatar Navbar, header Profilo, foto profilo Impostazioni, card prezzi, banner trial | Stesso significato ovunque (coerente!) ma la ripetizione in 5+ punti aumenta la sensazione di "vendita" pervasiva in un'app che l'utente percepiva come diario personale | Non una vera ridondanza funzionale — è intenzionale e ben documentata (`docs/navigator-dtrek-boundary.md`, sessione 13) | Nessuna azione necessaria: la coerenza qui è un punto di forza, non un difetto — segnalato solo perché rientra nel criterio "stesso elemento in più punti" |
| 8 | **CONFERMATO da screenshot**: "Andamento" (foto in sequenza), "Punti di interesse" (mappa+2 POI) e "Galleria fotografica" (mappa+15 pin numerati) nella stessa pagina di Resoconto | Tre sezioni consecutive mostrano versioni diverse della stessa relazione foto↔posizione lungo il tracciato, senza che i nomi comunichino la differenza | Parzialmente — "Punti di interesse" mostra i POI esterni (rifugi, vette), "Galleria" mostra le foto proprie dell'utente: distinzione reale ma non ovvia dai soli titoli | Chiarire nei sottotitoli la differenza (es. "Punti di interesse — luoghi notevoli lungo il percorso" vs "Galleria fotografica — le tue foto sulla mappa") |
| 9 | **CONFERMATO da screenshot**: l'anello "Voto" (1-10, soggettivo) e l'anello "Comfort TrailScore"/CTS (0-100, calcolato) nella stessa pagina di Resoconto | Stesso trattamento visivo (anello colorato + etichetta "NELLA MEDIA") per un numero che l'utente ha scelto e uno che l'app ha calcolato | Sì, concetti diversi (opinione personale vs. punteggio oggettivo) | Differenziare visivamente i due anelli (stile/colore/forma) o etichettarli in modo che la differenza salti all'occhio anche senza leggere il testo piccolo |

---

## 7. Funzioni classificate per senso rispetto all'utente

| Funzione | Classificazione | Motivazione |
|---|---|---|
| Trail Score / Safety Score / Beauty Score con pulsante "i" ovunque | **USEFUL** | Risponde a un bisogno reale ("è adatto a me/è sicuro"), ma richiede il pulsante info perché il nome da solo non basta — segno che la spiegazione andrebbe integrata meglio, non solo raggiungibile |
| Recovery Score / TSB / TSS / VO₂max / IEV / EF nel Bacheca | **QUESTIONABLE** in questa posizione | Sono metriche sportive avanzate (mutuate da ciclismo/triathlon) proposte come **prima cosa vista aprendo l'app**, prima ancora di aver pianificato un'escursione. Utili per un utente esperto motivato dal training load, ma spiazzanti come biglietto da visita di un'app di "diario di trekking" |
| "Percorso omaggio"/"Percorso di Default" (badge visibile a tutti, toggle visibile solo owner) | **USEFUL** per onboarding, ma nome interno ("regalo"/"gift") ora correttamente ripulito in UI — buona correzione già fatta dal team (`navigator-dtrek-boundary.md`, sessione ottava) |
| Tre sotto-modalità di import GPX (File/Manuale/Da diario) | **USEFUL** ma **poco spiegate**: "Da diario esistente" per creare una Guida da un'attività già registrata è un caso d'uso reale (voglio pianificare di rifare un giro che ho già fatto) ma il nome non lo comunica |
| Confronto percorsi (bottone "Confronta" in TopOverlay) | **USEFUL**, non ancora verificato come si presenta il risultato (out of scope per questa lettura) |
| Icona "Blocca/Sblocca le mappe" nel Diario (evitare spostamenti involontari) | **QUESTIONABLE**: è una soluzione tecnica (le mappe Leaflet dentro un libro scrollabile catturano gesture) esposta come funzione all'utente — un problema di implementazione travestito da funzione. Utile che esista, ma la sua necessità stessa segnala un limite del pattern "mappe interattive dentro un libro scrollabile" |
| "Vista a griglia" in Bacheca (oltre al filmstrip + swipe) | **QUESTIONABLE**: una terza modalità di navigare lo stesso identico set di card (dopo swipe orizzontale e filmstrip) — aggiunge scelta ma anche un ulteriore concetto da imparare |
| Badge Premium/gioiello su 5+ superfici diverse | Vedi Ridondanza #7 — **USEFUL e coerente**, non un problema |
| Pulsante "Percorso di Default" per l'owner sulla pagina pubblica di un percorso | **CONFUSING per chiunque non sia l'owner se il codice lo rendesse visibile per errore** — ma dal codice risulta correttamente gated (`GiftRouteAdminToggle` solo `is_owner`); nessun rischio reale, citato solo per completezza dell'audit |

---

## 8. Navigazione principale (tab bar)

`components/Navbar.tsx:18-23` — 4 voci: **Bacheca · Guide · Resoconti · Diario**, più icona Profilo
persistente (non un tab).

- **Numero di voci**: 4+1 è un numero ragionevole per mobile (regola empirica 3-5 voci).
- **Ordine**: Bacheca prima (= Home, statistiche) è discutibile se l'obiettivo primario dell'app è
  "pianifica ed esegui un'escursione" — un ordine alternativo (Guide, Resoconti, Diario, Bacheca) o una
  Home diversa comunicherebbe meglio la proposta di valore.
- **Nomi**: "Guide" e "Resoconti" competono semanticamente — entrambi possono suggerire "contenuto da
  leggere su un'escursione". Un utente italiano leggerebbe "Guide" più naturalmente come "guide
  turistiche di zone/sentieri" (contenuto editoriale generico) che come "i miei percorsi pianificati
  personali".
- **Icone**: Home (Bacheca), Compass (Guide), BookOpen (Resoconti), BookMarked (Diario). Compass per
  "Guide" è potenzialmente fuorviante: una bussola comunica più naturalmente "navigazione/mappa" che
  "elenco di percorsi con guida testuale AI" — un utente potrebbe aspettarsi che il tab Compass apra la
  mappa/navigazione, non lo trova lì.
- **Stato attivo**: gestito correttamente via `isActive()` con evidenziazione colore/peso.
- **Coerenza**: la stessa barra (`MobileNavBar`) è ora davvero condivisa da tutte le pagine "hub"
  (Bacheca/Guide/Resoconto/Diario) dopo il fix documentato nella sessione dodicesima di
  `navigator-dtrek-boundary.md` — punto di forza, la disomogeneità era un problema noto e già risolto.
- **Assente dal tab bar**: non esiste una voce "Mappa" o "Naviga" — per un'app outdoor GPS-centrica,
  l'assenza di un ingresso diretto e sempre visibile alla mappa/navigazione dal tab bar principale è
  probabilmente la lacuna più sorprendente per un nuovo utente (mitigata solo se l'utente ha installato
  la app Navigator separata, cosa non scontata né spiegata al primo avvio).

---

## 9. Gerarchia visiva — CONFERMATO da screenshot reali

Nelle schermate "hub" (Bacheca/Guida/Resoconto), il pattern è coerente: foto/mappa a piena pagina,
overlay scuro in alto e in basso, titolo enorme (`text-2xl sm:text-4xl font-black uppercase`), pillole
bianche flottanti per i dati sintetici, filmstrip orizzontale in basso. Questo pattern è ben eseguito
visivamente (buon contrasto testo/sfondo, buona gerarchia titolo→sottotitolo→pillole) — confermato dallo
screenshot della Bacheca ("BILANCIO FISICO", pillole "In Calo · 4 sett. · 13 km/sett.").

Gli screenshot confermano — e rendono più gravi — i punti di attrito già ipotizzati dal codice, più
alcuni nuovi non deducibili dal solo markup:

- **Densità confermata e più alta del previsto nella scheda di un percorso/resoconto**: aprendo
  "Camposecco" (Guida) o "Faggeta del Cimino" (Resoconto) lo scroll misura **oltre 10 schermate intere**
  di contenuto continuo: meteo, punteggio complessivo, mappa interattiva, altimetria, "Verificato
  online", specie arboree, sapori e tradizioni, consigli finali (Guida) / cronaca, natura e storia, dati
  e punteggi, FC/velocità/passo, punti di interesse, galleria fotografica, gestione foto (Resoconto). Non
  esiste una gerarchia PRIMARY/SECONDARY/TERTIARY dichiarata: il bottone "Naviga" resta fisso e ben
  visibile (punto di forza confermato), ma tutto il resto compete allo stesso livello visivo.
- **Lo stesso pulsante "Approfondisci con Giulia (AI)" con lo stesso selettore a tre livelli
  (Essenziale/Approfondita/Molto approfondita) si ripete identico almeno 4 volte nella stessa pagina**
  (una per sezione: Il percorso, Specie arboree e flora, Sapori e tradizioni, Consigli finali) — per un
  percorso appena importato, la maggior parte della prima visita mostra la stessa scritta "Testo narrato
  non ancora generato" ripetuta invece di contenuto. Coerente (stesso controllo, stesso posto), ma
  amplifica la sensazione di una pagina vuota/da costruire più che di una guida pronta.
- **Bug di overlap confermato — chip "Voto X/10" fluttuante fisso**: nella pagina di Resoconto un chip
  "☆ Voto 5/10" resta ancorato in basso a destra per l'intera lunghezza dello scroll e **copre
  visibilmente testo e grafici sottostanti** — confermato su più schermate: taglia un paragrafo di
  "Cronaca", si sovrappone al grafico di frequenza cardiaca, copre parzialmente una foto nella galleria.
  Non è un rischio, è un difetto visibile.
- **Bug di overlap confermato — rail di 9 icone nel Diario**: le icone fluttuanti fisse ai due lati dello
  schermo **coprono davvero testo reale** durante lo scroll del libro — confermato: "PER USCITA" tagliato
  in "R USCITA", il conteggio escursioni sulla copertina reso illeggibile, la legenda della mappa
  d'insieme tagliata a sinistra, un chip "calorie" tagliato a destra. In più occupano stabilmente ~15-20%
  della larghezza utile su entrambi i lati per l'intera lettura del libro.
- **Titolo non troncato/gestito**: un percorso importato con il nome file GPX originale ("Sentiero della
  Faggeta giro ad anello con partenza da Monte Cimino UNESCO ancient depressed beech forest") viene
  mostrato per intero, in maiuscolo, su 5 righe, riempiendo l'intera immagine hero e sovrapponendosi a
  un'icona nell'header — e nell'indice del Diario la stessa voce spezza l'altezza uniforme delle righe
  della lista rispetto alle altre voci (titoli brevi tipo "Eremo di San Girolamo"). Nessun troncamento,
  nessun suggerimento di rinominare un titolo anomalo.
- **Due anelli-punteggio visivamente identici per concetti diversi**: il "Voto" personale (1-10,
  soggettivo, assegnato dall'utente) e il "Comfort TrailScore"/CTS (0-100, calcolato dall'app) usano lo
  stesso trattamento visivo — anello colorato + etichetta "NELLA MEDIA" — nella stessa pagina di
  Resoconto. Un utente può ragionevolmente pensare che siano la stessa cosa espressa in due scale.
- **Tripla ridondanza mappa+foto numerate sulla stessa pagina di Resoconto**: "Andamento" (foto con
  badge numerati in sequenza lineare), "Punti di interesse" (mappa con 2 marker POI, che nello screenshot
  arrivano a sovrapporsi tra loro) e "Galleria fotografica" (un'altra mappa con marker numerati 1-15) sono
  tre presentazioni diverse di dati in gran parte sovrapponibili (foto + posizione lungo il percorso),
  senza che il nome delle tre sezioni comunichi la differenza.
- **Filmstrip come unica lista di navigazione**: sia in Bacheca che in Guida/Resoconto la lista dei
  contenuti è un filmstrip orizzontale scrollabile (`data-hscroll`) — efficiente per lo swipe ma povero
  per la scansione rapida di molti elementi (es. 30+ percorsi pianificati): non emerge ricerca/filtro
  testuale nella galleria stessa oltre ai filtri per categoria in Bacheca e ai controlli di ordinamento
  (Data/Km/D+/TS/Distanza, confermati nello screenshot dell'elenco Guide) in fondo alla schermata.
- **Badge/chip multipli sulla stessa card**: badge punteggio, preferito (stella), "NUOVO" (tile Percorsi
  per te), scadenza pending, tutti co-presenti — rischio di "troppi badge" quando più condizioni sono
  vere insieme (percorso preferito + in scadenza + con punteggio + con avviso "Verificato online").
- **Icon-only ovunque, non solo nel Diario**: oltre alle 9 icone del Diario (Lock, Eye/EyeOff, Archive,
  FileDown, Share2), ogni singola mappa interattiva (Il percorso, Punti di interesse, Galleria
  fotografica) mostra **la stessa fila di 5-6 icone solo-icona** (orientamento, direzione, 3D/cubo,
  centra, espandi, blocca) — confermato identico su tre mappe diverse nella stessa pagina di Resoconto,
  senza mai un'etichetta testuale.

---

## 10. Mobile-first

**Nota dell'autore del prodotto**: l'orientamento su smartphone è **fissato verticale per scelta di
prodotto** — non è quindi un'area aperta da verificare in orizzontale su telefono, a differenza di quanto
il template di questo audit chiederebbe in generale. Resta aperta la resa su PC/tablet (nessuno
screenshot disponibile a oggi).

Osservazioni dal codice (classi Tailwind, `env(safe-area-inset-*)`, gestori touch):

- **Safe area**: gestita sistematicamente e con cura reale — `MOBILE_TOPBAR_SPACER`, `pb-[calc(env(safe-area-inset-bottom,0px)+…)]` ricorrono in tutte le pagine esaminate. Il changelog in
  `navigator-dtrek-boundary.md` documenta un bug reale già corretto (titolo tagliato sotto la navbar) e
  la barra unica edge-to-edge — segno di attenzione reale al dettaglio mobile, non solo teorica.
- **Controlli mappa**: nel Navigator, un solo bottone "centra sulla mia posizione" fluttuante
  (`app/navigatore/page.tsx:68-76`), dimensione 44px (`w-11 h-11`) — sopra la soglia raccomandata dei
  44px per target touch (Apple HIG) e dei ~40-48px generici. Buono.
- **Bottom sheet**: il pannello "pronto per la navigazione"/"Importa un percorso" nel Navigator è un
  pannello fisso in basso, non un vero bottom-sheet trascinabile — semplice e prevedibile.
- **Filmstrip/gallerie a swipe orizzontale**: rischio di conflitto gestuale con lo swipe di sistema
  "indietro" su Android/iOS ai bordi schermo — non verificabile senza test su device reale, ma il
  pattern (intera pagina swipeabile orizzontalmente per cambiare percorso, *dentro* una pagina che è
  già raggiunta scorrendo/navigando) è un'area classica di conflitto da testare esplicitamente su
  dispositivo.
- **Tastiera**: non osservato direttamente; i form (impostazioni, note, titolo) usano input controllati
  standard — nessun pattern anomalo rilevato nel codice che spinga a preoccupazione specifica.
- **Le due navbar diverse** (`Navbar.tsx` per pagine "normali", `HubNavBar` per pagine hub) sono ora
  **la stessa implementazione** dopo il fix — punto risolto, citato qui solo per completezza essendo
  esplicitamente richiesto dal template di verificare la coerenza mobile.
- **Icon rail del Diario — CONFERMATO da screenshot (non solo un rischio teorico)**: sullo screenshot
  reale (viewport ~360-390px) le 9 icone fluttuanti ai due lati **coprono visibilmente testo reale**
  durante lo scroll — non un rischio di overflow dei popover come ipotizzato dal solo codice, ma un
  difetto già visibile nel caso base (senza nemmeno aprire un popover): "PER USCITA" tagliato in
  "R USCITA", numeri di copertina illeggibili, legenda mappa tagliata, chip dati tagliati. I popover
  laterali (`w-72` = 288px) restano un rischio aggiuntivo non ancora verificato.
- **Schermata di navigazione attiva in Navigator — CONFERMATO da screenshot**: sullo stesso viewport
  mobile, 12 controlli icon-only più due box di avviso sovrapposti (vedi §11) affollano lo schermo
  durante il momento d'uso più critico dell'app — il caso di sovraccarico mobile più severo confermato in
  questo audit.

---

## 11. La mappa come interfaccia principale — CONFERMATO da screenshot reali, conclusione ribaltata

Sette screenshot reali di DTrek Navigator (home, menu, elenco percorsi, import, registrazione libera,
navigazione attiva) permettono ora una valutazione diretta, non più dedotta dal solo codice — e la
conclusione cambia rispetto a quanto la sola lettura del codice suggeriva.

**Home del Navigator (mappa in attesa)**: confermato un buon design map-first — mappa a schermo intero,
posizione live, un solo bottone "centra sulla mia posizione", pannello inferiore chiaro "PRONTO PER LA
NAVIGAZIONE — Camposecco". Il menu (☰) è pulito e testuale (Percorsi pianificati, Importa un percorso,
Registra senza pianificazione, Apri Dtrek, Esci) — coerente col codice. **Confermato anche un piccolo
indicatore "Sincronizzazione: 4/5"** in alto sul pannello: buon feedback di stato, anche se il
significato del rapporto "4/5" non è spiegato lì per lì.

**Verifica dei cinque elementi richiesti durante la navigazione attiva** ("dove sono / dove devo andare /
in che direzione / quanto manca / cosa devo fare") — ora confermabile sullo screenshot della navigazione
in corso:

- **Dove sono / direzione**: sì, marker di posizione con freccia di direzione sulla mappa.
- **Cosa devo fare**: sì, presente un banner istruzione in alto ("Si parte!" con icona di svolta).
- **Quanto manca**: sì, presente in basso ("0.0 km · arrivo 03:04 · +1104 m").

Le tre informazioni **ci sono davvero** — a differenza di quanto lasciato aperto nella prima stesura di
questo audit basata solo sul codice. Il problema reale, confermato dallo screenshot, è un altro e più
serio:

**La schermata di navigazione attiva è la più sovraccarica di controlli di tutta l'app.** Nello
screenshot della navigazione in corso si contano contemporaneamente:
- **12 pulsanti solo-icona senza etichetta**, distribuiti su due cluster verticali (9 sulla colonna
  destra: allerta, layer, velocità/andatura, bussola, segnale, download, auto, aiuto, microfono; 3 sulla
  colonna sinistra: percorso, posizione, quota/altimetria) — nessuno spiega cosa fa senza premerlo,
  esattamente il criterio "capirei cosa fa senza premere?" richiesto da questo audit, e qui la risposta è
  no per la quasi totalità.
- **Due avvisi sovrapposti nello stesso momento**: un box "Fauna nella zona" (semi-trasparente, in alto)
  e un box rosso pieno "Luce insufficiente per rientrare — valuta di tornare indietro ora" (al centro,
  sopra la mappa) — il secondo copre parzialmente il primo cluster di icone a sinistra e parte dei dati
  quota/distanza sulla mappa sottostante.
- **La mappa stessa è invasa da decine di etichette numeriche** (quote e distanze dei punti del sentiero,
  es. "710 m", "1.3 km", "576 m"…) sparse fittamente su tutto lo schermo — la leggibilità della mappa ne
  risente in modo diretto, proprio nel momento (cammino reale, possibile scarsa attenzione disponibile)
  in cui dovrebbe essere massima.
- **Bug di contenuto nell'avviso fauna**: l'elenco recita *"Orso marsicano, Lupo appenninico, Vipera,
  Ursus arctos, Canis lupus"* — mescola nomi comuni italiani e nomi scientifici latini come voci
  separate, per quelle che sembrano essere le stesse due specie (Orso marsicano = *Ursus arctos
  marsicanus*, Lupo appenninico = *Canis lupus italicus*) elencate due volte con nomi diversi. Un avviso
  di sicurezza che sembra raddoppiare gli animali presenti mina la fiducia proprio nel contenuto più
  critico da prendere sul serio.

**Conclusione ribaltata rispetto alla versione precedente di questo audit**: la Home del Navigator (in
attesa, prima di partire) è ben progettata e sobria; la schermata di **navigazione attiva** (durante il
cammino) è invece il punto più denso e meno leggibile di tutto DTrek — l'opposto di quanto un'app di
navigazione outdoor dovrebbe offrire nel suo momento d'uso più critico. Vedi P-C3 in §21.

**Confermato anche**: un'icona di download per singolo percorso esiste nell'elenco "Percorsi pianificati"
di Navigator (in alto a destra su ogni card) — presumibilmente per il pacchetto offline. Risolve il punto
lasciato aperto in §5/§14 ("prepararsi per l'uso offline"), ma con una precisazione: **questa icona esiste
solo dentro Navigator**, non è mai apparsa negli screenshot della sezione "Guide" di Dtrek web — un altro
caso in cui la stessa esigenza (offline) ha una risposta diversa a seconda di quale delle due app si sta
usando.

---

## 12. Linguaggio e terminologia

Inventario dei termini che convivono per concetti di "percorso/traccia/escursione":

| Termine | Significato reale nel codice |
|---|---|
| **Percorso (pianificato)** | Un GPX importato/costruito con l'intento di farlo in futuro — vive in "Guide" |
| **Guida** | (a) il nome del tab/hub che contiene i percorsi pianificati; (b) il testo narrativo generato dall'AI per un percorso ("la guida di Giulia") — **stessa parola, due referenti diversi nella stessa area dell'app** |
| **Resoconto** | Il racconto testuale + dati di un'attività GPS già conclusa |
| **Attività** | Il dato GPS grezzo importato/registrato (file GPX/TCX/FIT) da cui nasce un Resoconto |
| **Traccia** | Sinonimo informale di percorso/GPX nella UI di import ("File traccia"); anche il nome della route tecnica `/navigatore/traccia` per la registrazione libera |
| **Escursione** | Termine generico usato nei messaggi di conferma/copy per riferirsi indistintamente a un percorso pianificato O a un'attività registrata |
| **Diario** | Il libro impaginato che raccoglie i Resoconti; anche il nome storico del progetto ("Diario Trekking" nel `<title>`) |

**Problema concreto**: "Guida" per il tab e "guida" per il testo AI dentro quel tab è la stessa parola
usata per il contenitore e per un singolo contenuto al suo interno — esattamente il caso "stessa parola
usata per concetti diversi" che l'audit chiede di segnalare. Un utente che legge "genera la guida" dentro
la sezione "Guide" può ragionevolmente chiedersi se sta generando l'intera sezione o un singolo testo.

**Raccomandazione terminologica minima** (non implementata qui, solo suggerita): riservare "Guida" (tab)
a "Percorsi" o "I miei percorsi", e "guida"/"racconto AI" al solo testo narrativo generato — libera la
parola dall'ambiguità con un cambio di etichetta minimo, senza toccare i nomi tecnici interni (che il
codice già tiene volutamente separati dai nomi di dominio, come mostra il caso analogo "omaggio" →
"Percorso di Default" già risolto).

Altri rilievi di linguaggio:
- **Inglesismi tecnici filtrati bene**: il codice mostra intere sessioni dedicate proprio a togliere
  gergo interno dalla UI (es. "omaggio"/"regalo" → "Percorso di Default", `PremiumBadge` con "Sparkles"
  → gioiello per non richiamare l'AI) — segno di un'attenzione già presente al problema, non ignorata.
- **Sigle tecniche esposte senza spiegazione immediata nel testo stesso**: CTS, TSS, IEV, EF, TSB
  compaiono come etichette di card in Bacheca (`badgeText: 'TSS'`, `'EF'`, `'IEV'`) — comprensibili solo
  aprendo il pannello info. Per un pubblico di escursionisti (non ciclisti/triatleti abituati al
  training-load), queste sigle sono gergo settoriale non universalmente noto. **CONFERMATO da
  screenshot**: anche in Impostazioni, il titolo di sezione "Bellezza del percorso (**TEI**)" espone
  un'ulteriore sigla mai sciolta nel testo visibile — un sesto acronimo tecnico (dopo CTS/TSS/IEV/EF/TSB)
  che l'utente incontra prima ancora di sapere cosa significhi.

---

## 13. Iconografia e feedback (rilievi mirati)

- Le icone della navbar principale sono standard e testuali (icona + etichetta sempre visibile) — buona
  pratica, nessun problema di ambiguità lì.
- Le icone icon-only (rail del Diario, controlli mappa) si affidano a `title` (tooltip), inefficace su
  touch — vedi §10.
- Feedback di caricamento: pattern coerente con `Loader2` animato + testo ("Caricamento…",
  "Attivazione…", "Pubblicazione…") in tutte le pagine esaminate — buono, l'utente sa sempre se
  un'azione è in corso.
- Toast di conferma ("Percorso eliminato") con timeout 3s — pattern corretto e già arricchito
  esplicitamente (il commento nel codice spiega che è stato aggiunto proprio perché la sua assenza
  creava ambiguità "sto ancora eliminando o è già fatto?", `GuidaHub.tsx:140-146`) — buon esempio di
  iterazione UX già avvenuta nel progetto.
- Errori di rete: il pattern osservato in `diario/page.tsx` (gestione esplicita "Failed to fetch" con
  messaggio utente distinto da errore tecnico, retry automatico 3 tentativi) è un buon esempio di
  errore tradotto per l'utente, non lasciato come stack trace — ma è puntuale (fix mirato dopo un
  incidente reale, secondo il commento), non necessariamente lo standard applicato ovunque nell'app;
  non è stato possibile verificare la gestione errori di ogni endpoint in questa sessione.

---

## 14. Discoverability

| Funzione | Classificazione | Motivo |
|---|---|---|
| Cambiare tab (Bacheca/Guide/Resoconti/Diario) | **EASY** | Tab bar sempre visibile |
| Aprire il proprio profilo/impostazioni | **EASY** | Avatar persistente in alto a destra |
| Trovare "Percorsi per te" | **MODERATE, ma la funzione non è ancora funzionante** (nota dell'autore) | Solo una tile tra tante in fondo alla Bacheca; anche trovata, oggi non restituisce risultati utilizzabili — la discoverability è un problema secondario finché la funzione stessa non funziona |
| Importare un GPX | **MODERATE** | Nessun ingresso diretto dal tab bar; richiede sapere che "Crea una guida" dentro Guide (stato vuoto) o navigare a `/upload` |
| Vedere le "Vette raggiunte" | **MODERATE** (corretto dopo screenshot: era HARD) | **CONFERMATO da screenshot**: raggiungibile da Profilo **e** da Statistiche → Panoramica (banner "Vette Conquistate", incontrato scorrendo oltre "Record personali") — non isolata come inizialmente scritto, ma comunque non raggiungibile in meno di 2-3 scroll/tap da nessuno dei due punti |
| Cronologia navigazione | **HARD** | Solo dentro Profilo, nome poco distintivo da "Resoconti"/"Diario" |
| Ricerche salvate / Log ricerche | **VERY HARD** | Solo dentro Profilo, non linkate dal punto di ricerca stesso |
| Scaricare un percorso per l'uso offline | **EASY, ma solo dentro Navigator** — **MODERATE/HARD** se si parte da Dtrek web | **CONFERMATO da screenshot**: icona di download ben visibile su ogni card in "Percorsi pianificati" di Navigator; nessuna icona equivalente osservata nella sezione "Guide" di Dtrek web, dove il percorso viene effettivamente creato/valutato |
| Passare da Dtrek a Navigator (o viceversa) | **MODERATE** | Un solo pulsante ("Apri Dtrek" / "Upgrade a Dtrek"), ma la sua esistenza e il perché delle due app non sono spiegati la prima volta che compare |

---

## 15. User Journey — ciclo di vita ideale

```
SCOPERTA → RICERCA → VALUTAZIONE → PREPARAZIONE → NAVIGAZIONE → REGISTRAZIONE
   → DOCUMENTAZIONE → RITORNO → ANALISI → MEMORIA → NUOVA ESCURSIONE
```

Mappatura su DTREK:

- **Scoperta/Ricerca**: `/percorsi-per-te` (raccomandazioni AI) — isolata, raggiunta solo da Bacheca.
- **Valutazione**: dentro `GuidaHub` (Trail/Safety/Beauty Score, meteo, POI) — ben coperta, forse
  fin troppo densa (vedi §9).
- **Preparazione** (offline, materiali): copertura incerta/non confermata in superficie (vedi §14).
- **Navigazione**: **spezzata tra due app** (Dtrek web per aprire, Navigator nativo per l'esecuzione
  reale sul sentiero) — è la rottura più netta del ciclo naturale. Un'app che deve accompagnare durante
  la camminata costringe l'utente a decidere in anticipo se ha installato l'app giusta.
  **Questo è il punto dove il ciclo utente si spezza più visibilmente rispetto al modello ideale.**
- **Registrazione**: `/upload?tab=activity` o `/navigatore/traccia` — due punti d'ingresso per lo stesso
  concetto (registrare una traccia), coerente con la ridondanza #3.
  **Documentazione**: Resoconto (racconto + foto) — ben coperta.
- **Ritorno/Analisi**: Diario, Statistiche, Bacheca — tre presentazioni parzialmente sovrapposte dello
  stesso materiale (vedi Ridondanza #1, #2).
- **Memoria**: Vette raggiunte, Traguardi/Badge — presenti ma isolate dentro Profilo, staccate dal
  flusso "ho appena finito, cosa ho ottenuto?" che avviene subito dopo la Documentazione.
- **Nuova escursione**: il cerchio si chiude solo se l'utente ricorda da solo di tornare su "Guide" o
  "Percorsi per te" — nessun invito esplicito osservato al termine di un Resoconto ("pianifica la
  prossima uscita").

**Conclusione**: il ciclo è coperto quasi per intero dalle funzionalità esistenti, ma **non è cucito
insieme da collegamenti diretti fase→fase** — ogni fase è un'isola raggiungibile solo tornando al tab
bar, non un flusso guidato.

---

## 16. Principio "One Home"

Domanda: *da dove parte normalmente l'utente?*

Oggi la risposta tecnica è univoca (`/` → redirect a `/bacheca`), ma la risposta **percepita** non lo è:

- Un utente che vuole **pianificare** pensa naturalmente a "Guide".
- Un utente che vuole **rivedere cosa ha fatto** pensa a "Resoconti" o "Diario" — due risposte.
- Un utente che vuole solo **camminare adesso** pensa al Navigator — un'app diversa.
- Bacheca, la Home tecnica, risponde bene solo alla domanda implicita "come sto andando?" — una domanda
  che un nuovo utente, alla primissima apertura, non si sta ancora ponendo (non ha ancora dati).

**Diagnosi**: DTrek non ha una singola Home percepita — ne ha almeno tre candidate plausibili (Bacheca,
Guide, Navigator) a seconda dell'intento, senza una gerarchia dichiarata tra loro. Questo è esattamente
il caso descritto dal principio "One Home" come problema da segnalare.

---

## 17. Principio "Zero Surprise"

Casi verificati nel codice dove l'azione effettiva potrebbe non coincidere con l'aspettativa:

- **"Crea un Resoconto" come unico CTA nello stato vuoto della Home** (`app/bacheca/page.tsx:581-586`):
  un nuovo utente che vuole *pianificare* (non raccontare) preme comunque questo bottone perché è
  l'unico presente, e si ritrova nel flusso "activity" (registrazione GPS di un'uscita già fatta) invece
  che nel flusso "pianifica un percorso futuro" — flusso sbagliato rispetto all'intento più probabile di
  un primo utilizzo.
- **Import di un GPX da Navigator vs. da Dtrek**: importare da dentro Navigator marca il percorso con
  `sourceApp: 'navigator'` e applica un tetto quantità (`NAVIGATOR_SLOT_LIMIT`) che non esiste importando
  lo stesso file da Dtrek — la stessa identica azione ("importa un GPX") ha conseguenze diverse a seconda
  di quale icona ha aperto l'utente, senza che questo sia comunicato al momento dell'import stesso.
- **Cambiare "sola andata/andata e ritorno" (routeMode) ricalcola i punteggi ma NON rigenera il testo AI
  già scritto** — comportamento corretto e intenzionale (spiegato esplicitamente nel commento del
  codice, `GuidaHub.tsx:658-670`, per evitare una "sorpresa costosa"), e il popup lo dichiara prima della
  scelta: **buon esempio di prevenzione attiva della sorpresa**, citato qui come caso positivo.

---

## 18. Coerenza interna

Punti di forza confermati dal codice:
- Stessa navbar ovunque (già discusso, fix esplicito documentato).
- Stesso pattern di gallery/hub (RouteHub) condiviso tra Guida e Resoconto — stessa gestualità, stessi
  componenti (`TopOverlay`, `HubNavBar`, filmstrip).
- Stesso linguaggio di colore per lo stato Premium (verde=sbloccato, ambra=trial/mensile, rosso=scaduto)
  applicato coerentemente su 5+ superfici (documentato esplicitamente come scelta deliberata,
  sessione tredicesima).

Punti di incoerenza:
- Il Diario **non usa** il pattern hub a schermo intero con filmstrip di Bacheca/Guida/Resoconto — è un
  libro scrollabile verticale con rail laterali fisse, un paradigma di interazione completamente diverso
  dalle altre tre sezioni dello stesso tab bar. Chi ha imparato a navigare Guide/Resoconto a swipe
  orizzontale deve reimparare da zero l'interazione in Diario.
- Conferma di eliminazione via `confirm()` nativo del browser in `GuidaHub` (vedi §3) rompe lo stile
  custom (Sheet, popover) usato ovunque altrove per conferme/azioni.

---

## 19. New User vs Experienced User — sintesi per workflow chiave

| Workflow | Cosa NON capisce il nuovo utente | Cosa rallenta l'utente esperto |
|---|---|---|
| Trovare un percorso da fare | Che "Guide" è la sezione giusta; che esiste "Percorsi per te" | Nessuna scorciatoia da tab bar, deve sempre passare da Bacheca o Guide |
| Importare un GPX | Le differenze tra le 3 sotto-modalità; dove si trova il bottone (non in nav) | Nessuna modalità "ultima usata" ricordata, sempre 2 tap per arrivarci |
| Iniziare a navigare sul sentiero | Che serve un'app diversa (Navigator) installata a parte | Cambio di contesto app→app anche quando entrambe sono già installate |
| Rivedere un'escursione passata | Se andare in Resoconti o Diario | — (una volta imparato, entrambi i percorsi sono comunque rapidi) |
| Capire un punteggio (Trail/Safety/Beauty/Recovery…) | Il significato di ogni sigla/score | Il pulsante info è comunque un tap in più ogni volta che serve un promemoria rapido |
| Pubblicare/condividere il Diario | Quale delle 9 icone-rail serve | Il flusso multi-icona resta comunque lento anche da esperti, per un'azione rara |

---

## 20. Visual QA — bug confermati da screenshot reali

A differenza della prima stesura di questo audit (basata solo su codice, senza un runtime disponibile in
sandbox), l'utente ha fornito 37 screenshot reali (viewport Android ~360-390px, giro completo
Bacheca→Guida→Resoconto→Diario→Profilo→Navigator) che permettono di confermare o correggere le ipotesi
fatte dal solo markup. Bug visivi **confermati**, in ordine di gravità:

1. **Chip "Voto X/10" fluttuante nel Resoconto** copre stabilmente testo/grafici/foto per l'intera
   lunghezza della pagina (§9).
2. **Rail di 9 icone nel Diario** copre stabilmente testo reale durante lo scroll del libro, non solo in
   teoria (§9, §10).
3. **Schermata di navigazione attiva in Navigator**: 12 controlli icon-only + due avvisi sovrapposti +
   mappa invasa da etichette numeriche, tutti presenti simultaneamente (§11).
4. **Titolo GPX grezzo non gestito**: nessun troncamento né suggerimento di rinomina per un titolo di 5
   righe che riempie l'intera immagine hero e altera l'altezza delle righe nell'indice del Diario (§9).
5. **Densità reale confermata**: oltre 10 schermate di scroll continuo per aprire un singolo percorso o
   resoconto, con lo stesso controllo AI (Essenziale/Approfondita/Molto approfondita) ripetuto 4+ volte
   e la stessa fila di 5-6 icone mappa ripetuta identica su 3 mappe diverse nella stessa pagina (§9).

6. **Tab e colonne scrollabili orizzontalmente tagliati senza indizio visivo** — confermato in Statistiche
   (tab "Tr…", colonna "Distanz…") oltre che nei tab di dettaglio Guida/Resoconto (§21, P-H8).

Un secondo giro di screenshot (Statistiche — Panoramica/Andamento/Traguardi/Confronto, Profilo →
Impostazioni) copre anche le aree che restavano aperte: **confermato positivamente** che Impostazioni è
tra le schermate meglio scritte dell'app (microcopy chiara sotto ogni controllo, valori derivati
calcolati automaticamente, es. FC max via formula Tanaka) e che il sistema Traguardi/badge (categorie
Distanza/Dislivello/Quota/Costanza/Speciale, percentuali di completamento, banner di sblocco) è ricco e
ben eseguito — il problema resta la sua collocazione (solo dentro Statistiche/Profilo, mai al momento
naturale subito dopo un'escursione, vedi P-O2), non la qualità del contenuto stesso.

Aree **ancora non coperte da screenshot**: la resa su PC/tablet (nessuno screenshot disponibile a oggi;
l'orientamento orizzontale su smartphone non è invece un'area aperta — vedi nota in §10, orientamento
fissato verticale per scelta di prodotto). "Percorsi per te" non è coperta da screenshot perché, per
ammissione dell'autore, **non è ancora funzionante** — vedi §4 e §21 (P-O4). Resta anche l'esperienza di
digitazione nei form. Si raccomanda comunque una sessione dedicata a queste aree residue.

---

## 21. UX Problems — elenco prioritizzato

### CRITICAL UX

**P-C1 — Architettura a due app non spiegata al primo utilizzo**
- EVIDENCE: `docs/navigator-dtrek-boundary.md` conferma esplicitamente il design a due app separate
  (Dtrek web, Navigator nativo); nessuna schermata di onboarding individuata che lo spieghi a un nuovo
  utente prima che incontri il pulsante "Apri Dtrek"/"Upgrade a Dtrek".
- USER IMPACT: un utente che installa "solo" Navigator (probabile, essendo l'app store-friendly e
  gratuita) non capisce perché non vede diario/statistiche/AI, e uno che usa solo Dtrek via web non
  capisce perché la navigazione GPS sembra meno affidabile della app nativa.
- CURRENT BEHAVIOR: la distinzione emerge solo incontrando etichette come "Upgrade a Dtrek — sblocca
  guide, diario, statistiche" senza contesto previo.
- EXPECTED BEHAVIOR: un messaggio di onboarding esplicito ("Navigator è l'app gratuita per navigare sul
  sentiero; Dtrek è dove pianifichi, racconti e analizzi le tue escursioni") alla primissima apertura di
  entrambe le shell.
- RECOMMENDATION: una schermata/tooltip di orientamento una tantum in ciascuna delle due shell.
- PRIORITY: CRITICAL (blocca la comprensione stessa del prodotto).

**P-C2 — Nessun invito a "pianifica" nella Home per un nuovo utente**
- EVIDENCE: `app/bacheca/page.tsx:563-589`, stato vuoto con unico CTA "Crea un Resoconto".
- USER IMPACT: chi apre l'app per la prima volta con l'intento più naturale ("voglio pianificare
  un'escursione") non trova un'azione corrispondente nella prima schermata.
- CURRENT BEHAVIOR: unico CTA porta al flusso di registrazione attività (post-escursione).
- EXPECTED BEHAVIOR: almeno due CTA nello stato vuoto — "Pianifica un percorso" e "Registra
  un'escursione fatta" — o un unico ingresso che chiede prima l'intento.
- RECOMMENDATION: nel breve periodo, aggiungere un secondo CTA equivalente verso `/upload?tab=gpx` (o
  verso `/percorsi-per-te`) — quick fix a bassissimo sforzo. Nel medio periodo, sostituire lo stato
  vuoto (e l'intera Home) con la soluzione a tre componenti decisa in sessione con l'autore del prodotto
  — vedi P-O5.
- PRIORITY: CRITICAL (primo momento d'uso, alto tasso di abbandono potenziale).

**P-C3 — CONFERMATO da screenshot: la schermata di navigazione attiva è sovraccarica proprio nel momento
d'uso più critico**
- EVIDENCE: screenshot reale della navigazione attiva in DTrek Navigator — 12 controlli icon-only senza
  etichetta, due avvisi di sicurezza sovrapposti nello stesso istante (fauna selvatica + "luce
  insufficiente per rientrare"), mappa invasa da decine di etichette numeriche.
- USER IMPACT: proprio nel momento in cui l'utente cammina sul sentiero — possibilmente stanco, con poca
  attenzione disponibile, in condizioni di luce calante secondo l'avviso stesso mostrato — l'interfaccia
  richiede più decodifica visiva che in qualunque altra schermata dell'app. Rientra esplicitamente nel
  criterio CRITICAL di questo audit ("l'utente... può compiere azioni pericolose/confondenti durante la
  navigazione").
- CURRENT BEHAVIOR: tutti i controlli e gli avvisi vengono mostrati contemporaneamente, sempre visibili,
  senza priorità dichiarata tra loro.
- EXPECTED BEHAVIOR: un solo avviso alla volta (in coda se necessario, non sovrapposti), un sottoinsieme
  minimo di controlli sempre visibili con gli altri dietro un unico menu "altro", ed etichette numeriche
  sulla mappa mostrate solo su richiesta (es. al tap su un punto) invece che tutte insieme di default.
- RECOMMENDATION: ridisegnare la gerarchia della schermata di navigazione attiva dando priorità a
  posizione/direzione/istruzione/ETA (già presenti e corretti) e nascondendo il resto dietro
  progressive disclosure.
- PRIORITY: CRITICAL.

### HIGH UX

**P-H1 — "Guide" non comunica "i miei percorsi pianificati"**
- EVIDENCE: `components/Navbar.tsx:20`, nome tab "Guide", icona Compass.
- USER IMPACT: tempo perso ad esplorare per capire cosa contiene la sezione; rischio di non trovarla mai
  associata mentalmente al bisogno "dove sono i miei percorsi".
- RECOMMENDATION: valutare rinominare il tab in "Percorsi" (riservando "Guida"/"guida AI" al solo
  contenuto testuale generato).
- PRIORITY: HIGH.

**P-H2 — Terminologia sovrapposta "Guida" (sezione) / "guida" (testo AI)**
- EVIDENCE: §12.
- USER IMPACT: ambiguità cognitiva ricorrente ogni volta che si legge "genera la guida" dentro il tab
  "Guide".
- RECOMMENDATION: vedi P-H1; in alternativa rinominare il testo AI come "Racconto"/"Narrazione" (Giulia).
- PRIORITY: HIGH.

**P-H3 — Nessuna voce "Mappa/Naviga" nel tab bar di Dtrek**
- EVIDENCE: §8, 4 voci Navbar, nessuna dedicata a mappa/navigazione.
- USER IMPACT: chi usa solo la web app non ha un punto d'accesso ovvio e persistente alla funzione più
  identitaria di un'app di trekking (la mappa).
- RECOMMENDATION: valutare se serva un ingresso rapido, anche solo come deep-link al Navigator/traccia
  libera, raggiungibile dal tab bar.
- PRIORITY: HIGH.

**P-H4 — Tre etichette diverse per la stessa funzione di traccia libera**
- EVIDENCE: Ridondanza #3.
- USER IMPACT: un utente che impara il nome in un punto non riconosce la stessa funzione altrove.
- RECOMMENDATION: unificare l'etichetta.
- PRIORITY: HIGH (basso sforzo, alto beneficio — quick win).

**P-H5 — Discoverability molto bassa di funzioni "di memoria" (Vette, Cronologia navigazione, Ricerche
salvate/Log ricerche)**
- EVIDENCE: §14.
- USER IMPACT: funzioni con valore reale (traguardi personali) restano invisibili, riducendo il senso di
  progressione/gratificazione che dovrebbe rinforzare l'uso ricorrente dell'app.
- RECOMMENDATION: collegarle dai contesti naturali (Vette da Statistiche/Bacheca; Ricerche salvate dal
  punto di ricerca).
- PRIORITY: HIGH.

**P-H6 — CONFERMATO da screenshot: elementi fluttuanti persistenti coprono contenuto reale**
- EVIDENCE: chip "Voto X/10" nel Resoconto e rail di 9 icone nel Diario, entrambi confermati coprire
  testo/grafici/foto durante lo scroll (§9, §20). **Terza occorrenza confermata**: nel grafico "Training
  Load" di Statistiche, un tooltip data ("16 ago · Stress (TSS): 40") copre parzialmente il titolo del
  grafico immediatamente sottostante ("Carico giornaliero") — lo stesso difetto di categoria (elemento
  fluttuante non consapevole di cosa ha sotto) in una terza area indipendente dell'app.
- USER IMPACT: informazioni parzialmente illeggibili (numeri di copertina, chip dati, paragrafi di
  racconto, titoli di grafico) in tre delle sezioni più curate dell'app dal punto di vista dei contenuti
  — non un incidente isolato ma un pattern che si ripete ogni volta che l'app sovrappone un elemento
  fluttuante a contenuto scrollabile.
- RECOMMENDATION: rendere questi elementi collassabili/trasparenti solo quando davvero necessario, o
  spostarli fuori dall'area di scroll del contenuto (es. barra fissa in alto invece che fluttuante sopra
  il testo).
- PRIORITY: HIGH.

**P-H8 — CONFERMATO da screenshot: tab e colonne scrollabili orizzontalmente si tagliano al bordo senza
alcun indizio visivo**
- EVIDENCE: i tab "Panoramica/Andamento/Confronto/Traguardi" di Statistiche mostrano solo "Tr…" per
  l'ultimo, tagliato di netto al bordo destro senza sfumatura né freccia; la tabella "Tutte le
  escursioni" mostra la colonna "Distanza" tagliata in "Distanz…"; lo stesso pattern era già stato
  osservato nei tab di dettaglio Guida/Resoconto ("In si…" per "In sintesi"). Confermato in almeno 3 aree
  indipendenti dell'app.
- USER IMPACT: un utente può non accorgersi che esiste altro contenuto scorrendo lateralmente — soprattutto
  la prima volta, prima di aver imparato che quei tab/quelle tabelle sono scrollabili — e perdere sezioni
  intere (es. "Traguardi" in Statistiche) semplicemente perché il nome è tagliato e non invita al tap.
- RECOMMENDATION: aggiungere un'indicazione visiva di scroll disponibile (sfumatura/ombra sul bordo, o
  mostrare sempre l'inizio della voce successiva) su ogni fila di tab/tabella scrollabile orizzontalmente.
- PRIORITY: HIGH (pattern sistemico, basso sforzo di correzione una volta centralizzato).

**P-H7 — CONFERMATO da screenshot: avviso di sicurezza sulla fauna sembra elencare le stesse specie due
volte**
- EVIDENCE: "Fauna nella zona: Orso marsicano, Lupo appenninico, Vipera, Ursus arctos, Canis lupus" —
  nomi comuni e nomi scientifici della stessa specie presentati come voci distinte.
- USER IMPACT: un avviso di sicurezza che appare internamente incoerente rischia di essere preso meno sul
  serio nel suo insieme.
- RECOMMENDATION: deduplicare per specie, scegliendo un solo formato di nome (comune o scientifico, non
  entrambi come voci separate).
- PRIORITY: HIGH (è un avviso di sicurezza, non un'etichetta qualsiasi).

### MEDIUM UX

**P-M1 — Bacheca e Statistiche duplicano contenuto senza dichiarare la relazione**
- EVIDENCE: Ridondanza #1.
- RECOMMENDATION: Bacheca dovrebbe presentarsi esplicitamente come sintesi/digest, con rimando più
  prominente (non solo una tile tra tante) a Statistiche come "vista completa".
- PRIORITY: MEDIUM.

**P-M2 — Resoconti/Diario: due UI per la stessa collezione senza differenza dichiarata**
- EVIDENCE: Ridondanza #2.
- RECOMMENDATION: sottotitolo/hint nel tab o nella schermata che chiarisca "Diario = il tuo libro/PDF
  stampabile, Resoconti = sfoglia le singole escursioni".
- PRIORITY: MEDIUM.

**P-M3 — Tre sotto-modalità di import GPX senza guida alla scelta**
- EVIDENCE: `app/upload/page.tsx:74-98`.
- RECOMMENDATION: aggiungere una riga descrittiva per opzione.
- PRIORITY: MEDIUM.

**P-M4 — Conferma di eliminazione con `confirm()` nativo, fuori stile**
- EVIDENCE: `GuidaHub.tsx:618`.
- RECOMMENDATION: sostituire con lo stesso pattern Sheet/popover usato altrove.
- PRIORITY: MEDIUM.

**P-M5 — Sigle tecniche (CTS, TSS, IEV, EF, TSB) esposte come etichette primarie di card**
- EVIDENCE: `app/bacheca/page.tsx`, badgeText vari.
- RECOMMENDATION: preferire etichette in linguaggio naturale nella card, lasciare la sigla come
  dettaglio secondario nel pannello info.
- PRIORITY: MEDIUM.

**P-M6 — CONFERMATO da screenshot: titolo GPX grezzo mostrato senza troncamento**
- EVIDENCE: un percorso con nome file lunghissimo occupa 5 righe nell'immagine hero e altera l'altezza
  della riga nell'indice del Diario.
- RECOMMENDATION: troncare con ellissi oltre una lunghezza ragionevole (mantenendo il titolo completo
  disponibile al tap), o proporre attivamente di rinominare un titolo importato anomalo.
- PRIORITY: MEDIUM.

**P-M7 — CONFERMATO da screenshot: due anelli-punteggio visivamente identici per concetti diversi**
- EVIDENCE: "Voto" (1-10, soggettivo) e "Comfort TrailScore" (0-100, calcolato) con lo stesso stile
  visivo nella stessa pagina di Resoconto (Ridondanza #9).
- RECOMMENDATION: differenziare stile/colore dei due anelli o accompagnarli con etichette che rendano
  ovvia la differenza a colpo d'occhio.
- PRIORITY: MEDIUM.

### LOW UX

**P-L1 — Icone icon-only nella rail del Diario si affidano a `title` (inefficace su touch)**
- RECOMMENDATION: micro-label sotto ogni icona, o long-press/tap rivela nome la prima volta.
- PRIORITY: LOW.

**P-L2 — Paradigma di interazione del Diario (libro verticale) incoerente con il resto (swipe hub)**
- RECOMMENDATION: accettabile come scelta deliberata (è letteralmente un libro), ma andrebbe introdotta
  con un breve indizio visivo la prima volta ("scorri per sfogliare") per chi arriva aspettandosi lo
  swipe orizzontale delle altre sezioni.
- PRIORITY: LOW.

### OPPORTUNITY

**P-O1** — Un CTA "Pianifica la prossima uscita" al termine della visualizzazione di un Resoconto
chiuderebbe esplicitamente il ciclo utente (§15/17) invece di lasciare che l'utente torni da solo al tab
bar.

**P-O2** — Un badge/riepilogo "traguardi appena sbloccati" mostrato subito dopo aver salvato un Resoconto
collegherebbe la fase "Memoria" (oggi isolata in Profilo/Statistiche) al momento più naturale per
riceverla. **Nota confermata da screenshot**: il sistema esiste già ed è ben fatto (categorie
Distanza/Dislivello/Quota/Costanza/Speciale, percentuali di completamento, banner "Hai sbloccato 5 nuovi
badge!") — non va costruito da zero, va solo *spostato/duplicato* al momento giusto invece di restare
raggiungibile solo scorrendo dentro Statistiche.

**P-O3** — Comunicare in anticipo, al momento di creare un percorso da Dtrek, che Navigator ha un tetto
di percorsi "pronti" (`NAVIGATOR_SLOT_LIMIT`) eviterebbe la sorpresa scoperta solo aprendo l'altra app.

**P-O4 — "Percorsi per te" come base della nuova Home, ma con un fallback senza AI** — Confermato
dall'autore del prodotto: la funzione oggi non è ancora funzionante ed è pensata come candidata a
diventare la Home (coerente con P-C2 e con la risposta alla domanda 23 in §24, che indicava esattamente
questo bisogno). Perché possa davvero ricoprire quel ruolo, la raccomandazione di questo audit è di
progettarla fin dall'inizio con **due percorsi di generazione**: uno basato su AI (racconto/motivazione
personalizzata, quando l'accesso è sbloccato) e uno **puramente basato su dati oggettivi già calcolati
dall'app** (distanza dal punto di partenza salvato, Trail/Safety Score, storico personale, stagionalità)
per chi è in prova senza AI attiva o ha esaurito il periodo di prova. Una Home che mostra risultati solo a
chi ha già sbloccato l'AI escluderebbe proprio i nuovi utenti del primo avvio — l'esatto pubblico che
questa modifica dovrebbe servire meglio.

**P-O5 — Direzione decisa per la nuova Home (sessione con l'autore del prodotto, 2026-08-20): tre
componenti, nessuno dei quali richiede AI per funzionare al minimo indispensabile.**

Discusse e scartate prima di arrivare qui due alternative più semplici: (a) la sola Bacheca attuale
(bocciata dalla diagnosi di questo audit, §16/P-C2); (b) una Home "editoriale" con notizie generiche dal
mondo trekking/turismo, scartata perché risponde a "cosa succede nel mondo" invece di "cosa faccio io
oggi" (lo stesso errore della Bacheca, con un contenuto diverso) e perché richiederebbe comunque una
pipeline di curation o di generazione AI per restare pertinente e localizzata.

La direzione scelta:

1. **Scorciatoie d'azione esplicite** in linguaggio naturale — Pianifica un percorso · Continua l'ultima
   escursione (se esiste un percorso pronto) · Rivedi cosa ho fatto — sostituiscono il cruscotto
   statistico come primo contenuto della schermata.
2. **"Prossima uscita" in cima quando esiste**: se un percorso pianificato ha una `plannedDate` impostata
   (campo già presente nel modello dati, usato oggi solo dentro `GuidaHub` — vedi il `dateChip` in
   §21/P-C2 evidence), la Home dovrebbe aprirsi direttamente su quello — titolo, meteo, conto alla
   rovescia — invece che su statistiche generiche. Nessun nuovo dato da calcolare, solo da riportare in
   superficie.
3. **Un digest "curiosità" storico-culturale legato a un percorso/resoconto reale dell'utente**, non a
   notizie esterne generiche. La app arricchisce **già oggi automaticamente** ogni percorso importato con
   POI + estratto Wikipedia (Overpass/Wikipedia, gratuito, nessuna chiamata AI — visto nel codice di
   `GpxUploader.tsx` e confermato dagli screenshot: sezioni "Natura e storia"/"Punti di interesse" già
   scritte per "Faggeta del Cimino" e "Camposecco"). Questo contenuto oggi resta sepolto in fondo a 8-9
   schermate di scroll (§9) — la Home dovrebbe pescarne uno a rotazione dal prossimo percorso pianificato
   o dall'ultimo resoconto, con un formato tipo "Lo sapevi che…", invece di lasciarlo scoperto solo da chi
   apre per intero quel singolo percorso. Funziona anche per il percorso omaggio/di default offerto
   all'onboarding, quindi copre anche il caso di un utente nuovo senza storico.

Il cruscotto Recovery/TSB/badge di oggi non sparisce: diventa sezione secondaria raggiungibile subito
sotto (o con uno swipe), non più il primo e unico contenuto della schermata di apertura. Questa
combinazione risolve insieme il cold-start (nessun dato personale richiesto nel caso limite), la
dipendenza da AI (P-O4, qui risolta anche meglio: il digest culturale è oggettivo per costruzione, non
solo "con un fallback"), e il collegamento fase→fase del ciclo utente che mancava (P-O1) — un utente che
finisce un resoconto vede la propria prossima uscita e una curiosità legata a un proprio percorso, non
un vicolo cieco.

**Raffinamento (sessione con l'autore del prodotto, seguito del 2026-08-20): Regione obbligatoria nel
wizard iniziale, come base del punto 3 sopra invece che il solo percorso omaggio.**

Il punto 3 di P-O5, così come scritto, copre bene il cold-start solo se l'utente ha completato
l'onboarding col percorso omaggio (skippabile, quindi non garantito — vedi P-O4/P-O5 originale). La
proposta che lo rende robusto: rendere **obbligatoria la scelta della Regione** nel wizard iniziale quando
la geolocalizzazione automatica non è concessa (con una riga di spiegazione sintetica del perché serve),
mai un vero blocco senza via d'uscita — un utente che chiude comunque il wizard deve ricadere su un
default neutro (es. scala nazionale) piuttosto che restare bloccato. Regione/posizione alimenta due cose
utilizzabili **dal primo avvio, senza AI**:

- **POI pertinenti alla zona**, per popolare da subito il digest "curiosità" del punto 3 anche senza che
  l'utente abbia ancora un proprio percorso o resoconto.
- **Una prima ricerca di percorsi non-AI nella zona** (candidata naturale per "Percorsi per te" prima che
  esista uno storico personale da cui affinarla — coerente con P-O4) — quindi la Home ha sempre un
  percorso reale da proporre come "prossima uscita candidata", non solo quando arriva dal percorso
  omaggio.

Effetto pratico sulle tre opzioni di layout (§ mockup "DTrek Home Layouts"): attenua parecchio la
debolezza sul cold-start che questo audit attribuiva all'Opzione A (hero a schermo intero) — con la
Regione sempre disponibile, l'hero ha quasi sempre un soggetto reale da mostrare fin dal giorno 1, non
solo nel caso limite del percorso omaggio completato.

**Nota di estensibilità, non di scope**: l'autore del prodotto ha segnalato una possibile modalità
futura dedicata a borghi/città (dove i POI contano quanto o più dei sentieri). Non è una decisione da
prendere ora per la Home, ma è un motivo in più per scrivere fin da subito il modulo curiosità/POI in
modo generico — "nella tua zona", non "nei tuoi percorsi" — così l'eventuale estensione futura non
richiede di riprogettare la Home da capo.

**Nota implementativa: da dove vengono le foto dell'hero/della card in Opzione A e C** (chiarita per i
mockup "DTrek Home Layouts", che usano un'illustrazione vettoriale segnaposto non avendo foto reali a
disposizione). Nessuna nuova fonte da costruire — una catena di fallback che riusa solo cose che l'app
già fa:

1. **Foto dell'utente**, quando esistono — per un'escursione già registrata (resoconto/"ultima uscita")
   l'app usa già oggi `pickBestCoverPhoto`/`fetchActivityPhotos` (`app/bacheca/page.tsx`) per scegliere la
   copertina tra le foto caricate per quell'attività. Stessa logica riusabile senza modifiche.
2. **Foto del POI da Wikipedia**, per un percorso non ancora fatto (prossima uscita pianificata, o
   proposta regionale del giorno 1, P-O5 sopra) — l'arricchimento automatico all'import (`GpxUploader.tsx`)
   scarica già "estratto + foto" da Wikipedia per i POI vicini al tracciato, gratis, senza AI: è la fonte
   più adatta sia per l'hero senza foto propria sia per la card "curiosità".
3. **Il tracciato disegnato su sfondo topografico** (`RouteThumb` + il pattern `bg-topography` già in
   `tailwind.config.ts`) — il modo in cui l'app mostra oggi un percorso senza foto (filmstrip di
   Guida/Resoconto): fallback intermedio coerente con lo stile esistente, non una foto ma non un buco
   vuoto.
4. **L'immagine di fallback generica** che la Bacheca usa già oggi (`FALLBACK_HERO =
   '/stato-hero-fallback.jpg'`, `app/bacheca/page.tsx`) come ultima rete di sicurezza.

Attenzione a un dettaglio non solo estetico: le foto da Wikipedia/Wikimedia Commons richiedono quasi
sempre attribuzione visibile (licenza CC-BY-SA nella maggior parte dei casi) — va previsto un credito
discreto sull'immagine stessa quando la fonte 2 è quella usata, non solo un rimando alla pagina "Fonti e
crediti" già esistente in Profilo.

---

## 22. UX Score (0-10)

| Area | Punteggio | Motivazione |
|---|---|---|
| **Learnability** | 4.5 | Terminologia sovrapposta (Guida/Resoconti/Diario), Home che non comunica il compito primario, architettura a due app non spiegata. |
| **Discoverability** | 5 | Funzioni core (percorsi, navigazione) richiedono esplorazione; funzioni di supporto (vette, ricerche salvate) quasi invisibili; però le funzioni una volta trovate restano ben raggiungibili (tab bar persistente). |
| **Information Architecture** | 4.5 | Categorie sovrapposte (Bacheca/Statistiche, Resoconti/Diario), assenza di una "Mappa" di primo livello, due app parallele con nomi identici per lo stesso concetto ("Percorsi pianificati"). |
| **Navigation** | 6 | Tab bar coerente, stato attivo corretto, ma nomi ambigui e assenza di ingresso mappa; buona la coerenza tecnica raggiunta tra le pagine hub. |
| **Consistency** | 7 | Punto di forza reale: navbar unificata (fix documentato), pattern hub condiviso Guida/Resoconto, linguaggio colore Premium coerente ovunque. Penalizzato dal Diario come paradigma a sé e dal `confirm()` nativo fuori stile. |
| **Visual hierarchy** | 4.5 (CONFERMATO da screenshot, rivisto al ribasso) | Buon contrasto e gerarchia titolo/sottotitolo nelle pagine hub; ma confermati due bug di overlap reali (chip Voto, rail Diario) e una schermata di navigazione attiva con 12 controlli icon-only senza priorità dichiarata — non più solo un rischio teorico. |
| **Mobile usability** | 5 (CONFERMATO da screenshot, rivisto al ribasso) | Ottima cura di safe-area/edge-to-edge (con bug reali già trovati e corretti in passato); ma confermati elementi fluttuanti che coprono contenuto e una schermata di navigazione affollata proprio sul viewport mobile che conta di più. |
| **Efficiency (utente esperto)** | 6 | Buona per consumo di contenuto (swipe/filmstrip), meno per azioni di gestione/pubblicazione (multi-icona, nessuna scorciatoia per operazioni ripetute come l'import). |
| **Error recovery** | 6.5 | Alcuni esempi solidi e documentati (retry PATCH diario, toast di conferma eliminazione, messaggi di errore distinti da tecnicismi); copertura non verificabile per l'intera app in questa sessione. |
| **Overall coherence** | 5.5 | Il prodotto è coerente *internamente* a ciascuna sezione, meno coerente *tra* le sezioni per nomi e paradigmi. |

**Media semplice: ~5.5/10** (rivista da 5.7 dopo la conferma visiva di bug precedentemente solo
ipotizzati dal codice).

---

## 23. Recommended Changes

### Stato implementazione — Home (P-O5 / Opzione D)

Sessione del 2026-08-20, stesso branch di questo audit. Riscritto `app/bacheca/page.tsx`.

- **Fase 1 — CONFERMATA da screenshot su dispositivo reale**: hero compatta con la prossima uscita
  pianificata (o fallback), card "Lo sapevi che…" dal POI/Wikipedia già arricchito, teaser
  "Percorsi per te" invariato, tre numeri di andamento con link a `/statistiche`. Verificato dal
  vivo: etichetta corretta "Pianificato, senza data ancora" + CTA "Vai al percorso" quando il
  percorso in evidenza non ha una data; curiosità che pesca davvero un estratto Wikipedia reale
  (Monte Autore, POI di Camposecco); teaser "Percorsi per te" correttamente nascosto (non rotto)
  quando quella funzione non ha risultati.
- **Fase 2 — CONFERMATA da screenshot su dispositivo reale**: catena di fallback per la foto
  dell'hero (foto propria → foto del POI Wikipedia → tracciato → immagine generica), curiosità con
  fallback all'ultima escursione fatta, terzo stato dell'hero ("La tua ultima uscita" + CTA
  "Rivedi") per chi ha già camminato ma non ha nulla pianificato. Verificato dal vivo: l'hero mostra
  la foto reale del POI Wikipedia (Monte Autore) al posto del tracciato, come da catena di fallback.
- **Fase 3 — IMPLEMENTATA (sessione successiva alla diagnosi del cron rotto, vedi sotto)**: il
  teaser singolo "Percorsi per te" è sostituito da una riga scorrevole di card vere e cliccabili
  (stesso stile della riga "Curiosità": card compatte 170px con tracciato via `RouteThumb`, non la
  mappa interattiva pesante di `TrailPreviewMap` usata nella pagina completa), popolata dalle stesse
  card lette da `?peek=1` (nessuna generazione in più, la Home non aspetta mai una ricerca
  Overpass). Toccare una card salva il percorso come pianificato e apre `/guida/[id]`, esattamente
  come il bottone "Apri" della pagina completa — logica estratta in
  `lib/routeBuilder/openRecommendationCard.ts`, condivisa tra le due pagine invece di duplicata.
  Link "Vedi tutti" verso `/percorsi-per-te` per i controlli ♥/✕ non presenti nella riga compatta.
  Non costruita finché la pipeline dati non era affidabile end-to-end (vedi la diagnosi sotto) —
  costruirci sopra prima avrebbe solo reso più visibile un difetto a monte. (Nota storica: un ramo
  di lavoro parallelo aveva inizialmente rimandato questa fase perché la funzione non era ancora
  confermata affidabile — la diagnosi/fix del cron sotto ha risolto esattamente quel blocco.)
- **Fase 4 — IMPLEMENTATA, da verificare dal vivo**: `components/onboarding/GiftRouteStep.tsx`
  (già eseguito dopo il wizard di profilo, già con geolocalizzazione + picker manuale per il
  percorso omaggio) ora persiste anche una `home_region` su `user_settings`, riusabile ovunque
  serva un primo segnale geografico senza AI. Quando la geolocalizzazione non basta, il picker
  manuale diventa l'unica via avanti (via tolta la scorciatoia "Salta" solo in quella fase) ma resta
  sempre disponibile l'opzione neutra "Preferisco non specificare ora" — mai un blocco duro. **Nota
  operativa**: richiede la migrazione `supabase/migrations/add_home_region.sql` sul progetto
  Supabase reale prima che il campo si salvi davvero (l'endpoint ha comunque un fallback che elimina
  da solo le colonne non ancora migrate, quindi non rompe nulla nel frattempo — semplicemente
  `homeRegion` resta vuoto finché la colonna non esiste).

**Fix (sessione successiva alla merge di Fase 3+4) — il passo si ripresentava a ogni accesso invece
che una sola volta**: il bottone "Salta" in alto a destra (visibile nelle fasi 'locating'/'done', mai
in 'manual') chiamava `onDone()` direttamente, senza mai scrivere `gift_route_offered_at` —
contraddiceva il commento del componente stesso ("Segna gift_route_offered_at indipendentemente
dall'esito"). Chi lo toccava durante la fase 'locating' (spinner "Cerchiamo il percorso più vicino a
te…", prima che `claim()` la scrivesse da solo) tornava quindi a vedere il passo del regalo/regione a
ogni apertura dell'app, perché `OnboardingGate.tsx` rilegge quel flag da `user_settings` a ogni
accesso. `declineRegion()` (il bottone "Preferisco non specificare ora" in fase 'manual') era già
corretto. Corretto aggiungendo `skip()`, che scrive il flag prima di chiamare `onDone()`, usato dal
bottone "Salta".

**Fix — testo del popup "Leggi tutto" troncato a metà frase**: `fetchWikiFullDetails`
(`lib/wikipedia.ts`) chiede il testo esteso con `exchars: '2000'` — un taglio duro a un numero di
caratteri dell'API Wikipedia, non a un confine di frase, quindi l'ultima frase risultava quasi
sempre interrotta a metà. Aggiunta `trimToCompleteSentence()`: arretra il testo fino all'ultima
punteggiatura di fine frase (`.`/`!`/`?`) seguita da spazio o fine stringa, così il popup mostra
sempre un testo che finisce su una frase compiuta (il costo è perdere l'ultima frase incompleta, non
l'intero paragrafo) — se non trova nessuna punteggiatura del genere il testo resta invariato invece
di sparire.

**Segnalazione "le card si ripetono" — non riprodotta con i dati reali di produzione**: simulata la
stessa identica logica di dedup di `curiosityEntries` (`app/bacheca/page.tsx`, dedup per `wiki.url`
condiviso tra percorso in evidenza, tutti i percorsi pianificati attivi e le ultime 8 uscite) contro
i dati reali dell'account owner via Supabase MCP (32 percorsi con POI arricchiti, incluse le stesse
POI — es. "Monte Cimino" — citate da 7+ percorsi diversi): il risultato finale non contiene nessun
`wiki.url`/titolo duplicato, la logica di dedup regge. La riga `route_recommendations` (le card di
"Percorsi per te", l'altra riga di card nella stessa Home) risulta ancora vuota per questo account
(`cards: []`, mai rigenerata da quando esiste la funzione self-heal) — non può quindi essere la
causa osservata su questo account specifico. Non essendo riuscito a riprodurre il difetto con i dati
disponibili, resta da chiarire con l'autore quale riga di card esattamente mostra i doppioni (e
idealmente uno screenshot) prima di poter intervenire nel codice con sicurezza.

**Sessione successiva — sei segnalazioni ulteriori, tutte diagnosticate e corrette tranne "le card si
ripetono" (non riconfermata anche in questo giro, resta aperta come sopra):**

- **Problema grosso — il wizard/passo regalo tornava a ripresentarsi da solo, anche ad app già
  avviata**: causa reale trovata in `lib/sync/userSettingsStore.ts`, non in
  `GiftRouteStep.tsx`/`OnboardingWizard.tsx` (già corretti nel giro precedente). `updateUserSettings`
  scrive subito in cache locale ma mette in coda l'invio al server con un debounce di **15 secondi**
  (`scheduleFlush`, `lib/sync/syncEngine.ts`). Nel frattempo, un "pull ambientale" (l'app torna in
  primo piano, si riconnette — `registerPullTask`, scatta a ogni cambio di visibilità) chiamava
  `refreshUserSettings()` **senza alcun controllo** su scritture locali ancora in coda, sovrascrivendo
  la cache con lo snapshot vecchio dal server — cancellando il flag appena scritto (es.
  `gift_route_offered_at` dopo aver saltato l'onboarding) prima ancora che il flush avesse la
  possibilità di partire. `OnboardingGate.tsx` rilegge quel flag a ogni evento di autenticazione:
  trovandolo di nuovo assente, il passo tornava a comparire. Stesso meccanismo di protezione già
  esistente per le entità a lista (`getPendingRecordIds`, usato da `registerListReconciler` in
  `lib/sync/pullEngine.ts` per lo stesso motivo) ora applicato anche a questa, l'unica entità a riga
  singola: il pull ambientale salta il refresh se c'è ancora una scrittura in coda per
  `user_settings`; il refresh chiamato dal flusher subito dopo un invio riuscito resta invece SENZA
  quel controllo (altrimenti darebbe un falso positivo, dato che la riga outbox non è ancora stata
  rimossa in quel momento preciso — avviene dopo, in `syncEngine.ts`'s `flush()`).
- **Icona della card "Curiosità"**: `Sparkles` (associata a "generato dall'AI" nel resto del
  prodotto, es. il badge "Su misura per te") sostituita con `MapPin` — questa funzione non usa AI
  (POI+Wikipedia, vedi sopra), l'icona non doveva suggerire il contrario.
- **Popup ancora troncato con puntini di sospensione**: causa reale del fix precedente non bastare —
  l'API `extracts` di Wikipedia, quando tronca per `exchars`, **aggiunge lei stessa `"..."`/`"…"` in
  coda**; l'ultimo di quei tre punti risultava comunque "seguito da fine stringa", quindi il trim
  precedente lo trattava come una fine-frase valida e non tagliava nulla. `trimToCompleteSentence`
  ora toglie prima l'eventuale ellissi finale, poi cerca l'ultima frase compiuta nel testo rimasto.
- **Simboli "==" nel testo**: l'API `extracts` (senza `exintro`) restituisce le intestazioni di
  sezione come testo letterale `"== Titolo =="` — `explaintext` toglie il markup inline ma non
  quello di sezione. Nuova `stripHeadingMarkup()` toglie quelle righe prima del trim, lasciando solo
  prosa continua.
- **Percorso in evidenza sempre lo stesso, anche cambiando data — ora fino a 3**: implementata la
  proposta dell'autore: `featuredList` (`app/bacheca/page.tsx`) sostituisce il singolo `featured` con
  fino a 3 percorsi distinti, ordine di priorità (1) con data, dalla più vicina, (2) preferiti
  (`favorite:true`) non già inclusi, (3) più recenti creati non già inclusi. Il primo resta l'hero
  (forma invariata); gli altri 1-2 popolano una nuova riga scorrevole "Altre uscite in programma"
  subito sotto, stesso stile compatto delle righe "Percorsi per te"/"Curiosità", link diretto a
  `/guida/[id]` di quel percorso (già salvato, nessun salvataggio da rifare).
- **"Vai al percorso"/"Naviga" apriva la copertina chiusa invece della scheda**: `RouteHub.tsx`
  (usato sia da `/guida` in lista sia da `/guida/[id]` per un percorso preciso) parte SEMPRE con
  `openSection: null` (copertina chiusa, "trascinabile" per aprirla) — corretto per la navigazione a
  lista, sbagliato per un link diretto a un percorso già scelto, dove l'intento è chiaro e la
  copertina chiusa è solo un tap in più senza motivo. Nuovo prop opzionale `autoOpenSection`
  (`components/routehub/types.ts`, propagato in `useRouteHubState.ts`) fa partire Screen 2 già
  aperta sulla sezione indicata — `GuidaHub.tsx` lo passa solo quando riceve un `id` esplicito (il
  caso `/guida/[id]`), mai per la lista generica `/guida` senza id, dove la copertina chiusa resta il
  punto di partenza corretto. `ResocontoHub.tsx` (altro consumatore di `RouteHub`) non tocca il nuovo
  prop, nessun cambiamento per lui.

`npx tsc --noEmit` e `next lint` puliti su tutti i file toccati in questo giro.

**Sessione successiva — verifica dal vivo su dispositivo reale, sei rifiniture ulteriori (tutte
implementate):**
- **Bottone "Apri scheda" accanto a "Naviga"/"Vai al percorso"**: il CTA principale dell'hero apre
  direttamente la guida narrata (fix del giro precedente); ora affiancato da un secondo bottone
  (stile secondario, sfondo semi-trasparente) che apre la stessa pagina ma sulla copertina chiusa
  (mappa, statistiche, POI) invece di saltare alla guida — per chi vuole prima un colpo d'occhio.
  Nuovo query param `?scheda=1` su `/guida/[id]` disattiva l'auto-apertura di default solo per
  questo link (`app/guida/[id]/page.tsx`, avvolto in `<Suspense>` per `useSearchParams`, stesso
  pattern già usato altrove nel repo — es. `app/login/page.tsx`); propagato a `GuidaHub.tsx` come
  prop `startClosed`.
- **Sfondo delle card "Altre uscite in programma"**: quando il percorso ha un POI Wikipedia
  arricchito, la card compatta usa la sua foto come sfondo (stessa fonte/priorità di
  `heroPhotoUrl`) invece del solo tracciato — coerente con l'hero, che già usava le foto. **Giro
  successivo, verificato dal vivo**: la foto (quando presente) faceva sparire il tracciato, non più
  visibile affatto su quella card — stesso identico problema già risolto per l'hero nello stesso
  giro precedente, dimenticato qui. Corretto con lo stesso trattamento: un piccolo riquadro col
  tracciato (bianco su sfondo scuro semi-trasparente) sovrapposto in un angolo quando c'è una foto;
  il tracciato pieno, come già, quando non c'è.
- **Spazi bianchi enormi tra paragrafi nel popup "Leggi tutto"**: causa reale — il testo grezzo di
  Wikipedia ha tipicamente una riga vuota prima e dopo ogni intestazione di sezione; tolta la riga
  dell'intestazione stessa (fix del giro precedente per i simboli "=="), restavano 2+ righe vuote
  consecutive, che con `whitespace-pre-line` diventavano un salto visivo enorme. `stripHeadingMarkup`
  ora collassa le righe vuote multiple a una sola.
- **"Altre uscite in programma" ora fino a 5** (non più 2): `MAX_FEATURED` portato da 3 a 6 (1 hero
  + 5 nella riga sotto).
- **Perché alcuni percorsi principali non hanno la foto del POI**: non un bug — verificato che per
  quel percorso specifico (es. "Sentiero 651 – Le mole di Narni") l'arricchimento POI/Wikipedia non
  ha mai trovato nulla (`cachedPoiWiki` vuoto, 0 voci), quindi l'hero ricade correttamente sul
  tracciato su sfondo topografico (secondo anello della catena di fallback, mai il terzo/fallback
  generico dato che la geometria c'è) — comportamento corretto data l'assenza di dati, non
  un'incoerenza da correggere.
- **Mappa assente quando l'hero mostra una foto**: la foto (quando disponibile) sostituiva
  interamente il tracciato, mai mostrati insieme. Aggiunta una piccola mappa in un angolo dell'hero
  (tracciato bianco su sfondo scuro semi-trasparente) ogni volta che sia la foto sia una geometria
  sono disponibili — solo per l'hero, non per le card compatte di "Altre uscite in programma"
  (richiesta esplicita: quelle restano solo foto, niente mappa sovrapposta).

`npx tsc --noEmit` e `next lint` puliti su tutti i file toccati in questo giro.

**"Percorsi per te" — diagnosi della causa reale del malfunzionamento (sessione successiva) e fix
applicato**: verificato in produzione (query diretta su `route_recommendations` via Supabase MCP)
che la riga dell'account owner è ferma da quasi un mese (`generated_at` 2026-07-24, `status='ok'`
ma **0 card**, `dirty=true` da un'attività completata il 2026-08-18) — mai più aggiornata. Causa
reale, confermata sui runtime log di Vercel (MCP): il Cron Job `/api/cron/refresh-recommendations`
(`vercel.json`, deployato e presente in produzione dal 2026-08-14) **non ha mai una sola volta
eseguito** — zero invocazioni registrate nei log delle ultime 30 giorni, nonostante 6+ finestre
giornaliere (03:00 UTC) trascorse da quando è stato aggiunto. Causa di piattaforma non confermabile
da questo sandbox (verificare in Vercel → Project Settings → Cron Jobs se il job risulta
effettivamente registrato/abilitato, e se l'account Hobby — che nello stesso team ha decine di altri
progetti — non abbia già saturato altrove il tetto di cron consentiti). Indipendentemente dalla
causa di piattaforma, il bug applicativo vero è che **niente altro poteva mai correggere una riga
già esistente ma dirty/stale**: il bootstrap sincrono di `app/api/percorsi-per-te/route.ts`
scattava solo quando la riga non esisteva affatto, quindi un utente con una riga vecchia restava
bloccato a tempo indeterminato su quella, con l'unico meccanismo di refresh (il cron) silenziosamente
rotto. Corretto rendendo la lettura stessa auto-risanante: `route.ts` ora rigenera sincronamente
(stesso tetto morbido già in uso per il bootstrap) anche quando la riga esistente è `dirty` o più
vecchia di `STALE_AFTER_DAYS` (7gg, condivisa con il cron via `generateRecommendations.ts`) — mai
per `?peek=1`, che resta di sola lettura come già era. In caso di timeout del tetto morbido, la
risposta ora ricade sulla riga precedente (stantia ma reale) invece di un `pending` vuoto. Il cron
resta comunque utile per pre-scaldare la cache prima della visita dell'utente, ma la freschezza dei
dati non dipende più solo da lui. Lato pagina (`app/percorsi-per-te/page.tsx`), aggiunto uno stato
`pending` esplicito con un ritentativo automatico dopo 5s, al posto del falso "nessun percorso
disponibile" che veniva mostrato ogni volta che il bootstrap superava il tetto morbido.
`npx tsc --noEmit` pulito, `next lint` pulito sui file toccati.

**Miglioramenti aperti, emersi verificando la Fase 2 dal vivo** (non ancora implementati):
- **Popup "Leggi tutto" — IMPLEMENTATO**: la card di curiosità non porta più subito fuori
  dall'app con un link Wikipedia in evidenza (verde). Mostra "Leggi tutto", che apre un popup con
  testo esteso (fetch on-demand, non solo l'incipit breve già in cache), eventuali altre foto
  trovate sulla stessa pagina Wikipedia/Wikivoyage, e solo lì il link alla fonte, in grigio chiaro
  e non più in evidenza. Nessuna fonte oltre a Wikipedia/Wikivoyage esiste nell'arricchimento
  attuale (`fetchWikiForNamedPois`) — il popup chiede solo più contenuto alla stessa pagina già
  trovata, non ne cerca di nuove.
- **Curiosità multiple — IMPLEMENTATO (v2, sessione successiva)**: la prima versione ("una
  curiosità per percorso distinto", capped a 3 fonti fisse: percorso in evidenza + ultime 2
  uscite) era ancora troppo restrittiva — verificato dal vivo che in pratica mostrava sempre e sole
  una card, anche su un account con molti percorsi. Causa: prendeva solo la prima voce
  (`wikiList[0]`) di ogni percorso, mentre un percorso arricchito può averne fino a 10
  (`fetchWikiForNamedPois`, cap 10 POI). Corretto: la riga "Curiosità dai tuoi percorsi" ora
  scansiona *tutti* i percorsi disponibili (percorso in evidenza, tutti gli altri percorsi
  pianificati attivi, le ultime 8 uscite già fatte) e per ciascuno prende fino a 4 POI+Wikipedia,
  non solo il primo — quindi più card anche dallo stesso percorso quando ha più POI arricchiti, non
  solo una per percorso. Deduplicate per pagina Wikipedia (stesso POI raggiunto da percorsi diversi
  non compare due volte). Tetto complessivo di 20 card, solo per limitare la lunghezza della riga
  scorrevole, non le fonti scansionate. Un percorso senza POI arricchiti viene saltato, mai una card
  vuota.
- **Fix: hero senza mappa/foto al primo caricamento** — verificato dal vivo su un account con un
  solo percorso: la prima apertura della Home mostrava l'hero senza mappa né foto (solo sfondo
  generico), poi si aggiornava correttamente rientrando nella pagina. Causa reale: `getAllActivities`
  e `getAllPlanned` (lib/blobStore.ts, lib/plannedStore.ts) sono cache-first e, quando la cache
  locale ha un buco noto (es. `routePolyline` mancante su un'entry scritta da una build più vecchia),
  rilanciano da soli un refetch in background — ma lo consegnavano al chiamante solo tramite un
  parametro opzionale `onRefresh`, che `app/bacheca/page.tsx` non passava. Il dato corretto veniva
  scritto in cache silenziosamente, mai nello stato React della pagina già aperta: da qui "si
  aggiorna solo se rientri". Corretto passando `onRefresh` a entrambe le chiamate in `loadAll()`.
- **Più percorsi mostrati in Home**: da distinguere in due casi. (a) Percorsi *raccomandati* (non
  ancora dell'utente) — coincide con la Fase 3 già pianificata. (b) *Proprie* prossime uscite
  multiple, oltre a quella in evidenza nell'hero — **non prevista nel disegno attuale**: la scelta
  deliberata era una sola azione primaria in hero, coerente con il principio dell'audit di non far
  competere più elementi per la stessa attenzione (§9); le altre uscite pianificate restano
  raggiungibili da "Guide". Da decidere esplicitamente con l'autore del prodotto prima di
  implementarla, perché in tensione con quel principio.

### P0 — impatto massimo, agire per primi
1. **Aggiungere un secondo CTA "Pianifica un percorso" nello stato vuoto della Home** (accanto/al posto
   di "Crea un Resoconto" come unico invito) — risolve P-C2, bassissimo sforzo tecnico. **Nota
   dell'autore, incorporata qui**: "Percorsi per te" è la candidata naturale per diventare questa Home
   nel medio periodo, ma va prima resa funzionante e dotata di un percorso senza AI (P-O4) — finché non
   lo è, questo CTA minimo resta comunque il fix immediato da fare subito.
2. **Onboarding esplicito che spieghi la relazione Dtrek/Navigator** la primissima volta che l'utente
   incontra l'altra app o il pulsante che le collega — risolve P-C1.
3. **Rinominare il tab "Guide" in qualcosa che comunichi "i miei percorsi"** (es. "Percorsi"), liberando
   "guida" per il solo testo narrativo AI — risolve P-H1 e P-H2 insieme, un solo cambio di etichetta con
   effetto a cascata su tutta la comprensione dell'IA.
4. **CONFERMATO da screenshot — semplificare la schermata di navigazione attiva** in Navigator: ridurre i
   12 controlli icon-only a un sottoinsieme minimo sempre visibile, mostrare un solo avviso alla volta
   invece di due sovrapposti, alleggerire le etichette numeriche sulla mappa — risolve P-C3, il problema
   più grave scoperto dagli screenshot perché avviene nel momento d'uso più critico (sul sentiero).
5. **Correggere l'avviso fauna che sembra duplicare le specie** (nomi comuni e scientifici della stessa
   specie come voci separate) — risolve P-H7, basso sforzo, riguarda la fiducia in un avviso di sicurezza.

### P1 — alto impatto, sforzo contenuto
6. **CONFERMATO da screenshot — rendere gli elementi fluttuanti persistenti (chip Voto, rail Diario) non
   invasivi**: farli collassare o spostarli fuori dall'area di scroll del contenuto, così da smettere di
   coprire testo/grafici reali — risolve P-H6.
7. Unificare l'etichetta della funzione di traccia libera ovunque compaia, incluso il titolo di pagina
   "Registra un percorso" confermato in Navigator (P-H4, ora con 4 varianti confermate).
8. **CONFERMATO da screenshot — aggiungere un'indicazione di scroll disponibile** a ogni tab/tabella
   scrollabile orizzontalmente (Statistiche, dettaglio Guida/Resoconto) — pattern sistemico, correzione
   centralizzabile in un solo componente condiviso (P-H8).
9. Collegare Vette raggiunte, Cronologia navigazione, Ricerche salvate dai loro contesti d'uso naturali
   invece che solo da Profilo (P-H5).
10. Comunicare preventivamente il limite di Navigator al momento della creazione percorso in Dtrek (P-O3).
11. Dichiarare esplicitamente la differenza Bacheca/Statistiche e Resoconti/Diario con un sottotitolo o
    hint nella UI (P-M1, P-M2).

### P2 — miglioramento sostanziale, non bloccante
12. Aggiungere righe descrittive alle tre sotto-modalità di import GPX (P-M3) — nota: lo screenshot della
    schermata "Importa un percorso" di Navigator mostra un buon esempio di testo esplicativo ("Come
    funziona") da cui prendere spunto anche per Dtrek web.
13. Sostituire il `confirm()` nativo con il pattern Sheet/popover coerente col resto dell'app (P-M4).
14. Preferire etichette in linguaggio naturale sulle card di Bacheca, spostando le sigle tecniche nel
    solo pannello di dettaglio (P-M5) — vale anche per "TEI" in Impostazioni.
15. Troncare/gestire i titoli GPX anomali invece di mostrarli per intero senza limiti (P-M6).
16. Differenziare visivamente l'anello "Voto" da quello "Comfort TrailScore" (P-M7).
17. Chiudere il ciclo utente con un CTA "Pianifica la prossima uscita" al termine di un Resoconto (P-O1),
    magari accompagnato dal riepilogo Traguardi appena sbloccati (P-O2) — il sistema di badge esiste già
    ed è ben fatto, va solo mostrato al momento giusto.

### P3 — rifiniture
18. Micro-label o hint per le icone icon-only della rail del Diario e delle mappe interattive (ripetute
    identiche su ogni mappa della stessa pagina) (P-L1).
19. Un indizio visivo la prima volta che si apre il Diario, per introdurre il cambio di paradigma
    (scroll verticale libro vs. swipe orizzontale delle altre sezioni) (P-L2).
20. Sessione dedicata di Visual QA su device reale per l'unica area ancora priva di screenshot: la resa
    su PC/tablet (l'orientamento orizzontale su smartphone non si applica, vedi §10).

---

## 24. Valutazione finale

1. **DTREK si capisce nei primi 5 minuti?** In parte. Si capisce che è un'app di trekking con dati
   ricchi, ma non è ovvio da dove cominciare per il compito più naturale (pianificare un'uscita).
2. **È chiaro cosa rappresenta DTREK?** La prima impressione è più vicina a "un'app di fitness/training"
   che a "un diario di trekking con guide turistiche", per via del cruscotto Recovery/TSB/VO₂max in
   Home.
3. **È chiaro da dove iniziare?** No — almeno tre punti di partenza plausibili (Bacheca, Guide,
   Navigator) senza gerarchia dichiarata.
4. **È chiara la differenza tra percorso, traccia, attività e navigazione?** No — sono quattro termini
   che si sovrappongono parzialmente nella UI (§12) e richiedono uso ripetuto per essere disambiguati.
5. **È chiaro dove preparare un'escursione?** Solo dopo aver imparato che "Guide" è la sezione giusta;
   non lo è dal nome stesso.
6. **È chiaro dove iniziare un'escursione (navigazione GPS)?** No in modo diretto dalla web app — passa
   per la scoperta di un'app separata (Navigator).
7. **È chiaro dove ritrovare un'escursione conclusa?** Sì, ma con due risposte plausibili (Resoconti o
   Diario) non distinte esplicitamente.
8. **È chiaro dove trovare foto e note?** Sì, dentro il Resoconto/Diario della relativa escursione —
   punto positivo, nessuna ambiguità rilevata qui.
9. **È chiaro cosa succede offline?** **CONFERMATO da screenshot**: un'icona di download esiste, ma solo
   dentro Navigator ("Percorsi pianificati") — non compare lato Dtrek web, dove il percorso viene
   effettivamente creato. Chiaro solo per chi ha già scoperto ed esplorato Navigator.
10. **La navigazione (tab bar) è realmente centrata sul compito?** Parzialmente: centrata sui *contenuti*
    (percorsi, resoconti, diario, statistiche) più che sui *compiti* dell'utente (pianifica, cammina,
    documenta, rivivi).
11. **La mappa è sovraccarica?** **Risposta corretta dopo gli screenshot**: la Home del Navigator (in
    attesa) è sobria e ben progettata; ma la schermata di **navigazione attiva** (durante il cammino) è
    invece la più sovraccarica di tutta l'app — 12 controlli icon-only, due avvisi sovrapposti, mappa
    invasa da etichette numeriche. Nella scheda "featured" di un percorso in Guida/Resoconto, la mappa in
    sé resta pulita ma convive con moltissimi altri elementi nella pagina.
12. **Esistono funzioni duplicate?** Sì — vedi tabella Ridondanze (§6): tre etichette per la stessa
    funzione di traccia libera è il caso più netto; Bacheca/Statistiche e Resoconti/Diario sono
    sovrapposizioni parziali, non vere duplicazioni.
13. **Esistono sezioni che dovrebbero essere unite?** Bacheca e Statistiche sono le candidate più forti,
    o quantomeno và resa esplicita ed evidente la loro relazione gerarchica.
14. **Esistono funzioni che dovrebbero essere spostate?** "Percorsi per te" fuori da una tile di Bacheca
    verso una posizione propria o dentro "Guide"; "Vette raggiunte" e "Cronologia navigazione" fuori da
    Profilo verso i contesti (Statistiche, Resoconti) a cui appartengono concettualmente.
15. **Esistono funzioni che non hanno un chiaro valore per l'utente?** Il "blocca/sblocca le mappe" nel
    Diario è più una soluzione a un limite tecnico (gesture conflict) travestita da funzione utente che
    un bisogno reale dell'utente.
16. **L'utente esperto può utilizzare rapidamente le funzioni frequenti?** Sì per consumo di contenuto
    (aprire l'ultimo percorso, vedere le statistiche), meno per azioni di gestione ricorrenti (creare un
    percorso resta sempre un flusso a più passaggi identico ogni volta, senza scorciatoie).
17. **L'app richiede troppo "studio"?** Sì, soprattutto per la terminologia (Guida/Resoconto/Diario/
    Attività/Traccia) e per la relazione a due app (Dtrek/Navigator) — entrambe apprendibili, ma non
    comunicate proattivamente.
18. **Esistono informazioni che possono essere eliminate?** Le sigle tecniche (CTS/TSS/IEV/EF/TSB) come
    etichette primarie potrebbero cedere il posto a formulazioni in linguaggio naturale senza perdere
    informazione (restano disponibili nel pannello di dettaglio).
19. **Esistono informazioni importanti che invece mancano?** Un indicatore chiaro di stato offline/
    disponibilità offline del percorso aperto; un collegamento esplicito "fase successiva" al termine di
    ogni fase del ciclo utente (dopo un Resoconto → pianifica la prossima uscita).
20. **Qual è il principale problema UX di DTREK?** L'assenza di una Home che comunichi chiaramente il
    compito primario dell'app ("pianifica e vivi un'escursione") — la Home reale (Bacheca) comunica
    invece "monitora il tuo allenamento", spostando l'intera prima impressione fuori target.
21. **Qual è il secondo?** **CONFERMATO da screenshot**: la schermata di navigazione attiva di Navigator
    — il momento in cui l'utente sta davvero camminando sul sentiero — è la più sovraccarica di controlli
    icon-only e avvisi sovrapposti di tutta l'app, invece di essere la più semplice e prioritaria come
    dovrebbe essere in un'app di navigazione outdoor (P-C3).
22. **Qual è il terzo?** La terminologia sovrapposta tra le sezioni principali (Guida/Resoconti/Diario/
    Attività/Traccia — quest'ultima confermata avere **quattro** nomi diversi per la stessa funzione di
    traccia libera), che costringe ogni nuovo utente a un periodo di apprendimento per disambiguare nomi
    che dovrebbero essere autoesplicativi.
23. **Quale singola modifica produrrebbe il maggiore miglioramento dell'esperienza?**
    Restano **due** modifiche di pari impatto, per due momenti d'uso diversi, entrambe confermate dagli
    screenshot come i punti più critici del prodotto:
    - **Ridefinire la Home**: sostituire (o affiancare in cima, sopra il cruscotto statistico) lo stato
      di apertura dell'app con una vista che risponda prima di tutto alla domanda "cosa voglio fare
      oggi?" — con due-tre azioni esplicite e in linguaggio naturale (Pianifica un percorso · Continua
      l'ultima escursione · Rivedi cosa ho fatto), lasciando il cruscotto Recovery/TSB/badge come sezione
      raggiungibile subito sotto. Risolve da sola la maggior parte dei problemi che colpiscono il
      **primo momento d'uso** (P-C2, parzialmente P-C1 e P-H1).
    - **Alleggerire la schermata di navigazione attiva** in Navigator: un solo avviso alla volta, un
      sottoinsieme minimo di controlli sempre visibili, il resto dietro un unico menu. Risolve il
      problema che colpisce il **momento d'uso più critico** (P-C3), quello in cui l'utente è realmente
      sul sentiero e la chiarezza conta più che altrove.
    Se si può agire solo su una delle due, la Home ha impatto più ampio (tocca il 100% degli utenti al
    primo avvio); la navigazione attiva ha impatto più profondo per chi la raggiunge (implica anche un
    fattore di sicurezza, non solo di comprensione).

    **Aggiornamento — direzione decisa in sessione con l'autore del prodotto (2026-08-20), vedi P-O5**:
    confermato che la Home va ridefinita nella direzione indicata sopra, con una sintesi più precisa di
    "due-tre azioni esplicite": (1) scorciatoie d'azione (Pianifica · Continua · Rivedi), che diventano
    "prossima uscita" quando esiste già una data pianificata; (2) un digest di curiosità
    storico-culturali pescato dai POI/Wikipedia che l'app arricchisce già automaticamente per ogni
    percorso, non da notizie esterne generiche (idea valutata e scartata proprio perché avrebbe risposto
    alla domanda sbagliata — "cosa succede nel mondo" invece di "cosa faccio io oggi", vedi P-O5); (3) il
    cruscotto Recovery/TSB/badge spostato in sezione secondaria. Il punto di forza di questa sintesi
    rispetto alla versione precedente (basata solo su "Percorsi per te" + AI) è che il digest culturale
    **non dipende da AI per definizione** (Overpass/Wikipedia sono chiamate oggettive) — risolve quindi il
    rischio descritto in P-O4 in modo strutturale, non solo con un fallback aggiunto in un secondo tempo.

---

*Fine audit UX, aggiornato con evidenza visiva reale (51 screenshot: Bacheca, Guida, Resoconto, Diario,
Profilo, Statistiche, Impostazioni, DTrek Navigator). Report funzionale correlato: `DTREK-AUDIT.md`.*
