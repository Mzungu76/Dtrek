# Mockup "Taccuino Botanico" — riferimento visivo

10 schermate della direzione scelta (su 3 presentate), esportate dal canvas Claude Design usato per
la revisione — vedi `docs/taccuino-botanico-piano.md` per la guida sintetica alla realizzazione.

Ogni schermata ha un **contorno pagina** (filo sottile + margine più chiaro + leggera vignettatura)
sul bordo dello schermo, comprese `NavigatoreC.dc.html`/`Mappa3DC.dc.html` (mappe a schermo intero,
che però restano senza sfondo carta/grana per scelta). Le altre 8 portano la spinta editoriale
"taccuino di viaggio": grana carta rifatta da zero come puntinatura CSS (niente più filtro SVG,
sostituito perché troppo tenue anche dopo un primo rinforzo — la nuova versione è deliberatamente
più marcata) più qualche imperfezione sparsa (piccole macchie e puntini scuri, posizione diversa
per schermata, non un overlay ripetuto identico). Ogni foto — comprese le anteprime mappa dentro le
card, es. l'hero di `GuidaC.dc.html` — ha un pin a tinta unita in posizione variabile (mai sempre al
centro) e una leggera rotazione, mai su testo o note; rotazioni minime e mai in cascata sullo stesso
schermo. Niente pagine affiancate — provato in `ReportageC.dc.html` e rimosso: poco valore aggiunto
per lo spazio che occupava. Palette e tipografia invariate.

Questi file sono in formato "Design Component" (`.dc.html`): richiedono il runtime del canvas
editor (`support.js`, non incluso qui) per essere visualizzati come pagina — non sono codice
dell'app da incollare così com'è. Servono come riferimento per colori esatti (variabili CSS in
cima a ogni file), markup/gerarchia visiva e testi di esempio. Contenuti (nomi percorsi/diari,
numeri) sono di esempio, non dati reali.

Per vederli renderizzati: canvas pubblicato,
https://claude.ai/code/artifact/ecea1be4-642c-4a3b-8e34-012daacbb2c7 (pagina "Taccuino Botanico") —
non aggiornato oltre lo stato salvato qui.

| File | Schermata |
|---|---|
| `CoverC.dc.html` | Palette, tipografia, componenti — foglio di stile della direzione |
| `DiarioC.dc.html` | Home — "I miei Diari" |
| `SommarioC.dc.html` | Percorsi di un Diario |
| `GuidaC.dc.html` | Guida — sezione "Prima di partire" (nuova struttura a 3 sezioni) |
| `PercorsiC.dc.html` | Tutti i Percorsi (vista piatta) |
| `StatisticheC.dc.html` | Statistiche |
| `ProfiloC.dc.html` | Profilo |
| `NavigatoreC.dc.html` | Navigatore |
| `Mappa3DC.dc.html` | Mappa 3D espansa (schermo intero) |
| `ReportageC.dc.html` | Reportage — nuova, applica la spinta editoriale per intero |
