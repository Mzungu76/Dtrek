# DTREK — UX, Usability & Information Architecture Audit

**Data**: 2026-08-19
**Metodo**: lettura diretta del codice sorgente (route Next.js, componenti, testi UI reali, commenti
architetturali) e dei documenti di progetto (`README.md`, `docs/navigator-dtrek-boundary.md`).
**Limite dichiarato**: questa sessione non ha un ambiente con credenziali Supabase/Anthropic
funzionanti per avviare l'app dal vivo su un dispositivo reale — non sono stati acquisiti screenshot
di un runtime in esecuzione. L'analisi di gerarchia visiva, mobile UX e comportamento a runtime è
quindi ricostruita leggendo con attenzione markup, classi Tailwind, stati e logica dei componenti (che
sono espliciti e ben commentati) piuttosto che osservata su schermo. Dove la fonte è solo codice e non
osservazione diretta, è segnalato esplicitamente. Questo è un audit **separato** da quello funzionale
(`DTREK-AUDIT.md`), che valuta se le funzioni esistono e funzionano — qui la domanda è se l'utente le
capisce, le trova, e le usa senza attrito.

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
compito**. Punteggio complessivo stimato: **5.5/10** — un prodotto potente con un'architettura
informativa che richiede tempo di apprendimento sproporzionato rispetto alla sua natura (un'app da
usare *durante* un'escursione, spesso con attenzione e connettività limitate).

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
  percorsi) o meriterebbe un ingresso proprio, non un teaser dentro il cruscotto statistico. "Vette
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
| "Prepararsi per usarlo offline" | Un bottone "Scarica offline" visibile sul percorso | Esiste un pacchetto offline (POI notes, trailGraphStore) ma non è emerso nella UI esplorata un controllo esplicito e ben visibile "Rendi disponibile offline" nella scheda del percorso | Da verificare — se nascosto, è un problema di discoverability grave per un'app outdoor |

**In quattro casi su sei la risposta non è univoca o non è ovvia** — soglia superata per dichiarare un
problema di architettura secondo il criterio richiesto ("se esistono più risposte plausibili, segnalare
un problema").

---

## 6. Ridondanze

| # | Funzioni | Perché confondono | Sono davvero diverse? | Raccomandazione |
|---|---|---|---|---|
| 1 | **Bacheca** vs **Statistiche** (`/statistiche`) | Stessi dati (recovery, streak, grafici), presentazione diversa (fullscreen/foto vs. pagina bianca classica); Bacheca stessa linka a "Tutte le statistiche" | Diverse nell'uso (Bacheca = digest curato "di oggi"; Statistiche = archivio completo esplorabile) ma il nome "Bacheca" non comunica affatto questa relazione | Rinominare concettualmente: Bacheca dovrebbe presentarsi come "digest" con un titolo/hint esplicito ("Riepilogo di oggi"), e il link a Statistiche va reso più prominente, non un'unica tile tra tante |
| 2 | **Resoconti** vs **Diario** | Entrambi collezioni della stessa entità (escursioni concluse raccontate); un utente non sa quale aprire per "rivedere l'ultima gita" | Diverse per formato di output (galleria interattiva vs. libro stampabile/condivisibile) — distinzione reale ma non dichiarata in UI | Nella UI, "Diario" dovrebbe presentarsi esplicitamente come "il tuo libro/PDF" e "Resoconti" come "sfoglia le tue escursioni" — oggi sono solo due nomi vicini nel tab bar |
| 3 | **"Naviga adesso" / "Avvia navigazione ora" / "Registra senza pianificazione"** | Tre etichette diverse (`app/upload/page.tsx:68`, stesso file, e `NavigatorMenu.tsx:89`) per una traccia GPS libera senza percorso pre-pianificato | Sembrano essere la STESSA funzione (`/navigatore/traccia`) raggiunta da tre punti con tre nomi | Unificare l'etichetta ovunque, es. sempre "Traccia libera" |
| 4 | **Tre modalità di import GPX** (File / Manuale / Da diario esistente) sotto un'unica tab "gpx" | Nessuna guida su quale scegliere; "Manuale" e "Da diario esistente" nel contesto "crea una guida" non sono spiegate | Sì, realmente diverse (fonte del tracciato) | Aggiungere una riga descrittiva sotto ciascuna delle tre opzioni, non solo l'icona+etichetta |
| 5 | **Percorsi pianificati** (Dtrek, in Guide) vs **Percorsi pianificati** (Navigator, stesso nome nel menu) | Stesso nome esatto, stesso dato sincronizzato, ma due interfacce e due limiti diversi (Navigator ha tetto di percorsi "pronti", Dtrek no) | No — è (giustamente) lo stesso dato, ma l'utente non sa che aprirlo da un'app o dall'altra ha conseguenze diverse (limite raggiunto) | Il tetto di Navigator andrebbe comunicato preventivamente da dentro Dtrek quando si crea un percorso, non scoperto solo aprendo Navigator |
| 6 | **Ricerche salvate** e **Log ricerche** (`/profilo/ricerche-salvate`, `/profilo/log-ricerche`) | Due sistemi di "memoria di ricerca" separati, nessuna spiegazione della differenza (salvate = preferite? log = cronologia automatica?) | Presumibilmente sì (una è intenzionale, una automatica) ma il nome da solo non lo dice, e nessuna delle due è raggiungibile dal punto in cui si effettua una ricerca | Etichettare esplicitamente "Ricerche salvate (preferite)" vs "Cronologia ricerche (automatica)"; linkarle da dove si cerca |
| 7 | **Badge Premium/trial** (gioiello) presente su: avatar Navbar, header Profilo, foto profilo Impostazioni, card prezzi, banner trial | Stesso significato ovunque (coerente!) ma la ripetizione in 5+ punti aumenta la sensazione di "vendita" pervasiva in un'app che l'utente percepiva come diario personale | Non una vera ridondanza funzionale — è intenzionale e ben documentata (`docs/navigator-dtrek-boundary.md`, sessione 13) | Nessuna azione necessaria: la coerenza qui è un punto di forza, non un difetto — segnalato solo perché rientra nel criterio "stesso elemento in più punti" |

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

## 9. Gerarchia visiva (letta dal codice, non osservata a schermo)

Nelle schermate "hub" (Bacheca/Guida/Resoconto), il pattern è coerente: foto/mappa a piena pagina,
overlay scuro in alto e in basso, titolo enorme (`text-2xl sm:text-4xl font-black uppercase`), pillole
bianche flottanti per i dati sintetici, filmstrip orizzontale in basso. Questo pattern è ben eseguito
visivamente (buon contrasto testo/sfondo con `textShadow`, buona gerarchia titolo→sottotitolo→pillole).

Punti di attrito individuati leggendo il markup:

- **Densità nella scheda "featured" di Guida**: in `GuidaHub`/`GuideReader` convivono nello stesso
  scroll: mappa 3D, meteo, POI, flora, fauna, tre punteggi diversi, editing note/titolo, azioni di
  archiviazione/proroga, export PDF, avviso "Verificato online". Non emerge dal codice una gerarchia
  esplicita PRIMARY/SECONDARY/TERTIARY dichiarata — le azioni (naviga, esporta, elimina, archivia) sono
  distribuite in popover/chip di pari peso visivo invece che con un'azione primaria dominante chiara
  ("Naviga questo percorso" dovrebbe probabilmente essere l'azione visivamente più forte su una guida
  pronta, ma condivide spazio con chip meteo/data/scadenza).
- **Filmstrip come unica lista di navigazione**: sia in Bacheca che in Guida/Resoconto la lista dei
  contenuti è un filmstrip orizzontale scrollabile (`data-hscroll`) — efficiente per lo swipe ma povero
  per la scansione rapida di molti elementi (es. 30+ percorsi pianificati): non emerge ricerca/filtro
  testuale nella galleria stessa oltre ai filtri per categoria in Bacheca.
- **Badge/chip multipli sulla stessa card**: badge punteggio, preferito (stella), "NUOVO" (tile Percorsi
  per te), scadenza pending, tutti co-presenti — rischio di "troppi badge" quando più condizioni sono
  vere insieme (percorso preferito + in scadenza + con punteggio + con avviso "Verificato online").
- **Icon-only rails nel Diario**: 9 pulsanti solo-icona (nessuna label visibile, solo `title` per
  hover/tooltip — inutile su touch) distribuiti su due colonne laterali fisse
  (`app/diario/page.tsx:684-973`). Su mobile, tooltip via `title` non è mai visibile (nessun hover):
  l'utente deve premere per scoprire cosa fa ogni icona, oppure indovinare dall'icona stessa (Lock,
  Eye/EyeOff, Archive, FileDown, Share2 — ragionevolmente standard, ma non tutte immediate: "Archive"
  per "escluse dal diario" richiede un salto interpretativo).

---

## 10. Mobile-first

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
- **Icon rail del Diario su schermi stretti (360px)**: 5 pulsanti impilati verticalmente per lato,
  ciascuno con popover che si apre lateralmente (`left-full ml-3` / `right-full mr-3`) — su un viewport
  di 360px questi popover (larghi fino a `w-72` = 288px) rischiano di uscire dallo schermo o sovrapporsi
  al centro pagina; non è confermabile senza test reale ma è un rischio concreto vista la matematica
  (288px di popover + rail su una finestra di 360px lascia margini minimi).

---

## 11. La mappa come interfaccia principale

Nel Navigator (`app/navigatore/page.tsx`), la mappa è correttamente il primo elemento renderizzato
(`FreeTrackMap` a schermo intero, `fixed inset-0`), con la posizione GPS live avviata immediatamente
all'apertura. Buona scelta map-first.

Verifica dei cinque elementi richiesti durante la navigazione ("dove sono / dove devo andare / in che
direzione / quanto manca / cosa devo fare"):

- **Dove sono**: sì, marker di posizione + bearing (`FreeTrackMap`, `bearingDeg`).
- **Quanto manca / dove devo andare**: non emerge, dalla sola Home del Navigator, alcuna indicazione di
  progresso lungo il percorso pianificato (distanza residua, ETA) — questi dati esistono altrove
  nell'app (pillole km/D+/durata nella scheda del percorso) ma non risultano riproposti come overlay
  live sulla mappa di navigazione dal codice esaminato (`app/guida/[id]/naviga/page.tsx`, non letto
  interamente per limiti di tempo/token in questa sessione — segnalato come **area da verificare**, non
  come difetto confermato).
- **Cosa devo fare**: analogamente da verificare nel dettaglio di `naviga/page.tsx`.

Il numero di controlli sovrapposti alla mappa nella Home del Navigator è contenuto e ben scelto (menu ☰,
titolo, eventuale "Apri Dtrek", ricentra, pannello inferiore) — non sovraccarica la mappa. Questo è un
punto di forza del Navigator rispetto alla densità informativa vista in `GuidaHub`.

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
  training-load), queste sigle sono gergo settoriale non universalmente noto.

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
| Trovare "Percorsi per te" | **MODERATE** | Solo una tile tra tante in fondo alla Bacheca |
| Importare un GPX | **MODERATE** | Nessun ingresso diretto dal tab bar; richiede sapere che "Crea una guida" dentro Guide (stato vuoto) o navigare a `/upload` |
| Vedere le "Vette raggiunte" | **HARD** | Solo dentro Profilo, nessun collegamento da Statistiche/Bacheca dove ci si aspetterebbe un rimando naturale (è un record personale) |
| Cronologia navigazione | **HARD** | Solo dentro Profilo, nome poco distintivo da "Resoconti"/"Diario" |
| Ricerche salvate / Log ricerche | **VERY HARD** | Solo dentro Profilo, non linkate dal punto di ricerca stesso |
| Scaricare un percorso per l'uso offline (se esiste un controllo dedicato) | **UNDISCOVERABLE** nella superficie UI esaminata | Il supporto tecnico offline esiste (poiNotesStore, trailGraphStore) ma nessun controllo "Rendi disponibile offline" è emerso nelle pagine lette — da verificare direttamente nel componente `GuideReader` (non letto per intero) prima di considerarlo un difetto confermato |
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

## 20. Visual QA — limiti di questa sessione

Non è stato possibile acquisire screenshot di un runtime funzionante (mancano credenziali Supabase/
Anthropic valide in questo ambiente sandbox, come indicato anche nel `README.md` e ripetutamente nel
`docs/navigator-dtrek-boundary.md`, dove sessioni precedenti riportano lo stesso limite: "Non testato in
un browser reale in questa sessione"). Le osservazioni su gerarchia visiva, densità, spaziature e
overflow (§9, §10) sono quindi **inferite dal markup/CSS**, non misurate su schermo. Si raccomanda una
sessione dedicata di Visual QA su device reale (360/390/412px, verticale e orizzontale) prima di
considerare chiuse le voci di questa sezione — in particolare i popover della rail del Diario (rischio
overflow concreto, vedi §10) e la densità della card "featured" di Guida.

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
- RECOMMENDATION: aggiungere un secondo CTA equivalente verso `/upload?tab=gpx` (o verso
  `/percorsi-per-te`).
- PRIORITY: CRITICAL (primo momento d'uso, alto tasso di abbandono potenziale).

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
collegherebbe la fase "Memoria" (oggi isolata in Profilo) al momento più naturale per riceverla.

**P-O3** — Comunicare in anticipo, al momento di creare un percorso da Dtrek, che Navigator ha un tetto
di percorsi "pronti" (`NAVIGATOR_SLOT_LIMIT`) eviterebbe la sorpresa scoperta solo aprendo l'altra app.

---

## 22. UX Score (0-10)

| Area | Punteggio | Motivazione |
|---|---|---|
| **Learnability** | 4.5 | Terminologia sovrapposta (Guida/Resoconti/Diario), Home che non comunica il compito primario, architettura a due app non spiegata. |
| **Discoverability** | 5 | Funzioni core (percorsi, navigazione) richiedono esplorazione; funzioni di supporto (vette, ricerche salvate) quasi invisibili; però le funzioni una volta trovate restano ben raggiungibili (tab bar persistente). |
| **Information Architecture** | 4.5 | Categorie sovrapposte (Bacheca/Statistiche, Resoconti/Diario), assenza di una "Mappa" di primo livello, due app parallele con nomi identici per lo stesso concetto ("Percorsi pianificati"). |
| **Navigation** | 6 | Tab bar coerente, stato attivo corretto, ma nomi ambigui e assenza di ingresso mappa; buona la coerenza tecnica raggiunta tra le pagine hub. |
| **Consistency** | 7 | Punto di forza reale: navbar unificata (fix documentato), pattern hub condiviso Guida/Resoconto, linguaggio colore Premium coerente ovunque. Penalizzato dal Diario come paradigma a sé e dal `confirm()` nativo fuori stile. |
| **Visual hierarchy** | 5.5 (stima da codice, non da schermo) | Buon contrasto e gerarchia titolo/sottotitolo nelle pagine hub; densità elevata nella scheda "featured" di Guida senza gerarchia PRIMARY/SECONDARY dichiarata tra le molte azioni disponibili. |
| **Mobile usability** | 6.5 (stima da codice) | Ottima cura di safe-area/edge-to-edge (con bug reali già trovati e corretti), target touch adeguati dove verificabili; rischio concreto di overflow popover su viewport stretti nella rail del Diario, da confermare su device. |
| **Efficiency (utente esperto)** | 6 | Buona per consumo di contenuto (swipe/filmstrip), meno per azioni di gestione/pubblicazione (multi-icona, nessuna scorciatoia per operazioni ripetute come l'import). |
| **Error recovery** | 6.5 | Alcuni esempi solidi e documentati (retry PATCH diario, toast di conferma eliminazione, messaggi di errore distinti da tecnicismi); copertura non verificabile per l'intera app in questa sessione. |
| **Overall coherence** | 5.5 | Il prodotto è coerente *internamente* a ciascuna sezione, meno coerente *tra* le sezioni per nomi e paradigmi. |

**Media semplice: ~5.7/10.**

---

## 23. Recommended Changes

### P0 — impatto massimo, agire per primi
1. **Aggiungere un secondo CTA "Pianifica un percorso" nello stato vuoto della Home** (accanto/al posto
   di "Crea un Resoconto" come unico invito) — risolve P-C2, bassissimo sforzo tecnico.
2. **Onboarding esplicito che spieghi la relazione Dtrek/Navigator** la primissima volta che l'utente
   incontra l'altra app o il pulsante che le collega — risolve P-C1.
3. **Rinominare il tab "Guide" in qualcosa che comunichi "i miei percorsi"** (es. "Percorsi"), liberando
   "guida" per il solo testo narrativo AI — risolve P-H1 e P-H2 insieme, un solo cambio di etichetta con
   effetto a cascata su tutta la comprensione dell'IA.

### P1 — alto impatto, sforzo contenuto
4. Unificare l'etichetta della funzione di traccia libera ovunque compaia (P-H4).
5. Collegare Vette raggiunte, Cronologia navigazione, Ricerche salvate dai loro contesti d'uso naturali
   invece che solo da Profilo (P-H5).
6. Comunicare preventivamente il limite di Navigator al momento della creazione percorso in Dtrek (P-O3).
7. Dichiarare esplicitamente la differenza Bacheca/Statistiche e Resoconti/Diario con un sottotitolo o
   hint nella UI (P-M1, P-M2).

### P2 — miglioramento sostanziale, non bloccante
8. Aggiungere righe descrittive alle tre sotto-modalità di import GPX (P-M3).
9. Sostituire il `confirm()` nativo con il pattern Sheet/popover coerente col resto dell'app (P-M4).
10. Preferire etichette in linguaggio naturale sulle card di Bacheca, spostando le sigle tecniche nel
    solo pannello di dettaglio (P-M5).
11. Chiudere il ciclo utente con un CTA "Pianifica la prossima uscita" al termine di un Resoconto (P-O1).

### P3 — rifiniture
12. Micro-label o hint per le icone icon-only della rail del Diario (P-L1).
13. Un indizio visivo la prima volta che si apre il Diario, per introdurre il cambio di paradigma
    (scroll verticale libro vs. swipe orizzontale delle altre sezioni) (P-L2).
14. Sessione dedicata di Visual QA su device reale (360/390/412px) per confermare/escludere i rischi di
    overflow identificati nella rail del Diario (§10, §20).

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
9. **È chiaro cosa succede offline?** Non confermabile positivamente dalla superficie UI esaminata — area
   da verificare con priorità, essendo centrale per un'app outdoor.
10. **La navigazione (tab bar) è realmente centrata sul compito?** Parzialmente: centrata sui *contenuti*
    (percorsi, resoconti, diario, statistiche) più che sui *compiti* dell'utente (pianifica, cammina,
    documenta, rivivi).
11. **La mappa è sovraccarica?** Nel Navigator no (buona sobrietà). Nella scheda "featured" di un
    percorso in Guida, la mappa convive con moltissimi altri elementi nella stessa vista — la vista nel
    suo complesso è densa, anche se la mappa in sé è pulita.
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
21. **Qual è il secondo?** La terminologia sovrapposta tra le quattro sezioni principali (Guida/
    Resoconti/Diario/Attività), che costringe ogni nuovo utente a un periodo di apprendimento per
    disambiguare nomi che dovrebbero essere autoesplicativi.
22. **Qual è il terzo?** La rottura del ciclo di navigazione GPS tra due app separate (Dtrek web e
    Navigator nativo), non comunicata proattivamente nel momento in cui l'utente ne ha più bisogno
    (subito prima di partire per il sentiero).
23. **Quale singola modifica produrrebbe il maggiore miglioramento dell'esperienza?**
    **Ridefinire la Home**: sostituire (o affiancare in cima, sopra il cruscotto statistico) lo stato di
    apertura dell'app con una vista che risponda prima di tutto alla domanda "cosa voglio fare oggi?" —
    con due-tre azioni esplicite e in linguaggio naturale (Pianifica un percorso · Continua l'ultima
    escursione · Rivedi cosa ho fatto), lasciando il cruscotto Recovery/TSB/badge come sezione
    raggiungibile subito sotto, non come unico contenuto della schermata di apertura. Questa singola
    modifica risolverebbe da sola la maggior parte dei problemi CRITICAL e HIGH di questo audit (P-C2,
    parzialmente P-C1 e P-H1), perché è il primo momento in cui l'utente forma il suo modello mentale
    dell'intero prodotto.

---

*Fine audit UX. Report funzionale correlato: `DTREK-AUDIT.md`.*
