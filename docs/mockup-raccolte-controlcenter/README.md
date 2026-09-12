# Raccolte come centro di controllo — 3 direzioni

L'utente ha chiesto una nuova voce "Raccolte" in fondo al menù (ultima a destra, per
completare la struttura logica Dashboard/Guide/Reportage/Diari/**Raccolte**) e vuole che la
pagina che apre diventi un vero centro di controllo per riorganizzare i contenuti — non solo
l'elenco delle Raccolte di oggi (`app/raccolte/page.tsx`), ma un posto dove vedere e
manipolare l'intera gerarchia **Raccolta → Diario → Reportage** in un colpo d'occhio, con
trascinamento per spostare gli elementi, rinomina rapida e (per i Diari) eliminazione — "una
sorta di esplora risorse". Come richiesto, queste 3 direzioni sono **solo mockup**: nessun
codice toccato.

Stile: pagina "normale" chiara (`bg-stone-50`, non l'hero scuro di Guida/Reportage/Diari/
Dashboard) — coerente con l'attuale `/raccolte`, che è già una pagina di gestione, non di
lettura. Palette/font ripresi da `lib/designTokens.ts` e dall'attuale `app/raccolte/page.tsx`
(Playfair Display, DM Sans, Barlow Condensed, Lora; forest/terra/stone).

Canvas pubblicato: https://claude.ai/code/artifact/fce4cc35-0f49-4d65-8aae-bb7003e072f6

| File | Direzione | Idea portante |
|---|---|---|
| `Main.dc.html` | **A — Esploratore ad albero** | Un'unica lista verticale a tre livelli (Raccolta → Diario → Reportage), ciascuno con la sua riga, un chevron per aprire/chiudere e una maniglia di trascinamento (⠿) a destra. La gerarchia intera è sempre visibile in una sola vista, senza mai cambiare schermata — l'interpretazione più letterale di "esplora risorse". Il compromesso: con molti Diari/Reportage la lista si allunga parecchio (mitigabile tenendo i Reportage collassati di default, come nel mockup). Aggiornata: ogni riga (Raccolta, Diario **e** Reportage) mostra ora una copertina in miniatura con l'icona di riferimento del suo livello (Library/BookMarked/BookOpen, le stesse di `Navbar.tsx`) e un badge a penna nell'angolo per modificarne rapidamente l'immagine — non più solo la Raccolta. Il titolo si modifica in linea (campo di testo diretto sulla riga) per Diario e Reportage esattamente come già mostrato per la Raccolta via il menù •••, che resta anche il posto per rinomina/pubblica/elimina a livello di Raccolta. |
| `DirezioneB.dc.html` | **B — Board a colonne** | Ispirata a Finder/Files: una colonna stretta di Raccolte a sinistra, i Diari della Raccolta scelta al centro, un terzo pannello con i Reportage del Diario scelto che scorre da destra. Più spaziale e "esplorativa", ottima per capire subito "dove sono" nella gerarchia, ma su schermo stretto richiede scorrimento orizzontale o pannelli che si accavallano (come disegnato) invece di stare tutti affiancati. |
| `DirezioneC.dc.html` | **C — Evoluzione della lista attuale** | Il minimo cambiamento: le stesse card di `/raccolte` oggi, ma apribili ad accordion per rivelare i Diari (e un'anteprima dei loro Reportage) senza lasciare la pagina. La più rapida da realizzare e la più vicina a ciò che l'utente già conosce, ma la gerarchia a tre livelli dentro una card può risultare più densa delle altre due quando una Raccolta ha molti Diari. |

Tutte e tre disegnano anche **come apparirebbe un trascinamento in corso**: un elemento
sollevato (ombra, leggera rotazione) sopra una riga/card di destinazione evidenziata — così
si vede a colpo d'occhio cosa succede quando si sposta un Diario in un'altra Raccolta (o un
Reportage in un altro punto della stessa lista), non solo lo stato "a riposo".

## Un punto da decidere insieme, non deciso qui

Il resto dell'app **non usa mai il trascinamento reale per riordinare** — Diari, Raccolte e
widget si riordinano tutti con frecce su/giù (vedi `docs/mockup-bacheca-dashboard/README.md`:
"niente `@dnd-kit`"), una scelta deliberata per la sua semplicità e affidabilità su touch. Il
drag&drop vero e proprio qui è quello che l'utente ha chiesto esplicitamente per QUESTA
pagina, quindi è quello che i tre mockup mostrano — ma vale la pena saperlo prima di scegliere:
un'implementazione reale introdurrebbe la prima vera libreria di drag&drop dell'app (oggi
assente), con tutto il lavoro di gestione touch/accessibilità che comporta. Se si preferisce
restare coerenti con il resto dell'app, le stesse tre strutture (albero/board/accordion)
funzionano identiche con frecce su/giù al posto della maniglia di trascinamento — un dettaglio
facile da cambiare in fase di implementazione, qualunque direzione si scelga.

## Dati ipotizzati

Titoli, numeri e date sono di fantasia, stessi nomi già usati nel mockup precedente
(`docs/mockup-diari-raccolte/`, non collegato a questo): 2 Raccolte ("Le mie stagioni 2024",
pubblicata, con 2 Diari; "Sentieri di casa", bozza, con 1 Diario), il Diario "Appennino 2024"
con 3 Reportage di esempio. Nessuna di queste direzioni implementa ancora niente in codice.
