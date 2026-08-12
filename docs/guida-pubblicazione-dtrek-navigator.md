# Guida: rendere operativa l'app DTrek Navigator

Questa guida è per te, non per un programmatore — spiega, passo per passo,
cosa devi fare **tu** con il mouse/telefono per far funzionare davvero
l'app Navigator. Il codice è già pronto; qui ci sono solo le azioni "fuori
dal codice" che nessuno può fare al posto tuo (account, pulsanti da
cliccare, permessi da concedere).

Ho organizzato tutto in due fasi, da fare in ordine:

- **Fase A** — provare subito l'app sul tuo telefono, **senza installare
  niente sul computer**. Ti basta un browser (per usare GitHub) e il
  telefono.
- **Fase B** — quando sei soddisfatto dei test, pubblicarla sul Play Store
  perché altre persone possano scaricarla. Questa fase richiede un account
  a pagamento e qualche passaggio in più — la trovi più sotto, non serve
  affrontarla subito.

Se in un punto qualsiasi non sai cosa fare o qualcosa non torna, fermati e
chiedimelo — non c'è fretta e niente di quello che segue è distruttivo:
se sbagli un passaggio si può sempre rifare.

---

## Fase A — Provare l'app sul telefono (0 installazioni sul computer)

L'idea: invece di installare Android Studio (un programma pesante,
pensato per sviluppatori) sul tuo computer, usiamo un servizio gratuito di
GitHub che "costruisce" l'app per te sui suoi server. Tu scarichi solo il
file finale.

### 1. Trova l'indirizzo del sito DTrek

Apri il sito DTrek principale nel browser (quello che usi normalmente).
Copia l'indirizzo che vedi nella barra in alto — solo la parte iniziale,
senza quello che viene dopo, es. se vedi
`https://dtrek-qualcosa.vercel.app/bacheca`, l'indirizzo che ti serve è
`https://dtrek-qualcosa.vercel.app`.

Tienilo da parte, ti serve tra un minuto.

### 2. Salva quell'indirizzo su GitHub (una volta sola)

1. Vai sulla pagina del repository `Dtrek` su github.com.
2. In alto, clicca **Settings** (l'ingranaggio — è l'ultima voce del menu
   in alto, potrebbe essere nascosta in un menu "…" se lo schermo è
   stretto).
3. Nel menu a sinistra, cerca **Secrets and variables** e cliccalo, poi
   scegli **Actions**.
4. In alto trovi due schede: **Secrets** e **Variables**. Clicca
   **Variables**.
5. Clicca **New repository variable**.
6. Nel campo **Name** scrivi esattamente: `CAPACITOR_SERVER_URL`
7. Nel campo **Value** incolla l'indirizzo copiato al punto 1.
8. Clicca **Add variable**.

Fatto — non dovrai rifare questo passaggio, resta salvato.

### 3. Fai costruire l'app

1. Sempre sulla pagina del repository, in alto clicca **Actions**.
2. Nella lista a sinistra clicca **Build DTrek Navigator APK**.
3. A destra compare un pulsante **Run workflow** — cliccalo. Si apre un
   piccolo pannello: lascia il campo vuoto (userà l'indirizzo salvato al
   punto 2) e clicca di nuovo il pulsante verde **Run workflow**.
4. Aspetta — compare una riga con un pallino giallo che gira. Quando
   diventa un segno di spunta verde ✅ (di solito 5-10 minuti), è pronta.
   Puoi anche chiudere la pagina e tornare più tardi, non si interrompe.

### 4. Scarica il file dell'app

1. Clicca sulla riga verde appena completata (quella con la data di oggi).
2. Scorri in fondo alla pagina fino alla sezione **Artifacts**.
3. Clicca su **dtrek-navigator-debug-apk** per scaricarlo — sul computer
   arriva uno **zip**; dentro c'è un file che si chiama `app-debug.apk`.
   Questo è l'app vera e propria.

### 5. Porta il file sul telefono

Nel modo che preferisci: mandatelo per email, caricalo su Google Drive e
aprilo dal telefono, oppure collega il telefono al computer con il cavo
USB e copialo nella cartella Download. Deve solo arrivare sul telefono.

### 6. Installa l'app sul telefono

1. Sul telefono, apri il file `app-debug.apk` (dal gestore file, da Gmail,
   da Drive — dove l'hai salvato).
2. Android probabilmente ti avviserà: **"Installazione bloccata"** o
   **"App non riconosciuta"**. È normale — succede per qualunque app che
   non viene dal Play Store, non è un problema di sicurezza legato a
   questa app in particolare. Segui l'avviso: di solito basta toccare
   **Impostazioni** nel popup e attivare **"Consenti da questa fonte"**
   (per l'app da cui l'hai aperto, es. Google Drive o Gestione file), poi
   tornare indietro e toccare di nuovo il file.
3. Tocca **Installa**.

Ora hai un'icona **DTrek Navigator** sulla home del telefono.

### 7. Prova l'app

1. Aprila, fai login con lo stesso account che usi su DTrek.
2. Se non hai ancora nessun percorso pianificato, vedrai due scelte:
   aprire DTrek per pianificarne uno, oppure "Registra un percorso senza
   pianificazione" (traccia solo dove cammini, senza un percorso di
   riferimento).
3. Se hai già un percorso pianificato sull'app principale, dovrebbe
   comparire nella lista — toccalo per avviare la navigazione.
4. Il test più importante: **avvia la navigazione, poi spegni lo
   schermo del telefono e mettilo in tasca per qualche minuto mentre
   cammini**. Quando riaccendi lo schermo, la posizione/traccia deve
   essere aggiornata come se il telefono non si fosse mai spento — è
   esattamente il problema che questa app risolve rispetto al sito
   normale.

Se qualcosa non va, dimmi esattamente cosa hai visto (un messaggio
d'errore, un blocco su una schermata, ecc.) e continuiamo da lì.

### Quando aggiorni il codice

Ogni volta che il codice dell'app Navigator cambia, ripeti solo il **punto
3** (Actions → Run workflow) e poi punti 4-6 per reinstallare — non serve
rifare la parte 1-2, l'indirizzo resta salvato.

---

## Fase B — Pubblicarla sul Play Store

Da fare solo quando sei soddisfatto dei test in Fase A. Qui entrano in
gioco alcune cose che solo tu puoi fare (serve un pagamento e dei dati
legati alla tua identità/azienda), ma ti guido passo passo quando ci
arrivi. Riassunto di cosa serve, così sai cosa aspettarti:

1. **Account Google Play Console** — una tantum, 25$, si crea su
   [play.google.com/console](https://play.google.com/console). Richiede
   una carta di pagamento e, a seconda dei casi, un documento d'identità
   per la verifica (Google può metterci qualche giorno).
2. **Icona e immagini della scheda dell'app** — oggi ci sono solo dei
   segnaposto generici. Quando siamo a questo punto dimmelo e ti aiuto a
   prepararle.
3. **Una pagina di "informativa privacy"** pubblica (obbligatoria per
   qualunque app sul Play Store) — posso scriverla io, tu la pubblichi da
   qualche parte raggiungibile (anche una pagina sul sito DTrek stesso).
4. **Una build "firmata" per il rilascio**, diversa da quella di prova
   della Fase A. In parole semplici: è come una firma digitale che
   dimostra che gli aggiornamenti futuri dell'app vengono davvero da te.
   Si genera una volta sola e va conservata con cura (se si perde,
   quell'app non potrà più ricevere aggiornamenti — bisognerebbe
   pubblicarne una nuova da zero). Quando arrivi a questo punto, preparo
   un altro workflow automatico (uguale a quello della Fase A) che genera
   questo file per te senza bisogno di installare altri programmi.
5. **La schermata "perché ti serve la posizione in background"** —
   Google la richiede esplicitamente per qualunque app che chiede il
   permesso "consenti sempre" alla posizione, prima ancora di poterlo
   chiedere all'utente. È un pezzo di app che manca ancora — lo
   costruiamo insieme quando arrivi a questa fase.
6. **Caricamento e revisione** — carichi la build sulla Play Console,
   rispondi a un questionario su cosa fa l'app (in particolare sull'uso
   della posizione — Google è severo su questo, a volte chiede anche un
   breve video che mostri perché serve), e invii. La revisione di Google
   può richiedere da qualche giorno a qualche settimana, soprattutto la
   prima volta e proprio a causa del permesso di posizione in background.

Non c'è bisogno di preparare tutto questo adesso — quando sei pronto per
la Fase B, dimmelo e affrontiamo un punto alla volta.

---

## Chi fa cosa, in breve

- **Il codice, i file di configurazione, i workflow automatici, i testi
  (privacy policy, descrizione app, ecc.)**: li preparo io.
- **Gli account, i pagamenti, i pochi click su GitHub/telefono/Play
  Console**: solo tu puoi farli (sono legati alla tua identità/ai tuoi
  dati di pagamento) — ma con istruzioni precise, passo per passo, come
  quelle sopra.

## Domande che potresti avere

**Devo comunque installare Android Studio prima o poi?**
No, non è obbligatorio: sia i test (Fase A) sia la build firmata per il
Play Store (Fase B, punto 4) possono passare dal workflow automatico su
GitHub. Se in futuro preferisci comunque installarlo (per vedere l'app in
un emulatore sul computer, per esempio), fammelo sapere e ti guido anche
in quel caso — ma non è necessario.

**E se sbaglio un passaggio nella Fase A?**
Nessun danno: puoi rifare "Run workflow" quante volte vuoi, e
disinstallare/reinstallare l'app sul telefono liberamente.

**Dove trovo di nuovo l'indirizzo del sito, se me lo scordo?**
È lo stesso indirizzo che vedi nel browser quando apri normalmente DTrek —
lo trovi anche già salvato su GitHub in Settings → Secrets and variables →
Actions → Variables (punto 2 della Fase A), puoi rileggerlo lì.
