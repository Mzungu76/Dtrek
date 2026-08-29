# Direzione "Taccuino Botanico" — guida sintetica per la realizzazione

Mockup di riferimento (canvas Claude Design, statico, non aggiornato dopo questa nota):
https://claude.ai/code/artifact/ecea1be4-642c-4a3b-8e34-012daacbb2c7 — pagina "Taccuino Botanico".
Copia locale delle 9 schermate della sola direzione scelta (colori/markup di riferimento, non codice
da incollare): `docs/mockup-taccuino-botanico/*.dc.html`.

Scelta tra tre direzioni presentate (Campo/terra, Topografico/pino, **Botanico/salvia+terracotta**
— quella approvata). Sostituisce il verde `FOREST` (`#277134`, status bar e menù inferiore) ovunque
nell'app con questa palette; estende lo stile "taccuino" già avviato (Fase 17–31,
`lib/taccuinoTokens.tsx`) anche a `GuidaHub`/`ResocontoHub`/`HubNavBar`, finora rimaste nello stile
"vecchio" (fuori scope del redesign menù, Fasi 1–5 già completate su questo branch).

## Palette

| Ruolo | Hex | Uso |
|---|---|---|
| Carta (base) | `#F5EDDD` | sfondo pagina |
| Carta (chiara) | `#F9F2E4` | zone "in luce" |
| Card | `#EBE0C8` | card/riquadri incollati |
| Bordo card | `#D9C9A8` | bordi, separatori |
| Linee di contorno | `#A89A78` | decorazioni sottili |
| Inchiostro (testo) | `#2E2A22` | testo principale, mai nero puro |
| Inchiostro (mano) | `#7A6F52` | titoli/annotazioni scritte a mano |
| Inchiostro (muto) | `#95886A` | etichette secondarie |
| **Accento primario** | `#C0603D` (terracotta) | CTA, badge attivi, stato selezionato |
| **Accento secondario** | `#7C8F6E` (salvia polverosa) | accenti secondari, non CTA |
| Tinta accento | `#E9DAC3` | sfondo badge/chip |
| **Barra globale / status bar** | `#5F7355` (salvia scura) | sostituisce `FOREST[600]` ovunque: menù inferiore, `manifest.json theme_color` |
| Icona attiva in barra | `#F5EDDD` | |
| Icona inattiva in barra | `#B9C4AE` | |
| Hero scuro (mappe/foto) | gradiente `#4A5A3F → #6B7D58` | sfondo hero Guida/Percorsi/mappe |

Motivo, per chi rivede la scelta: la più illustrata/editoriale delle tre — niente verde saturo
"da app", un duo salvia/terracotta da erbario naturalistico. Più lontana dall'estetica attuale delle
altre due, quindi più lavoro per estenderla a schermate dense (Statistiche, Percorsi) — accettato.

## Tipografia — invariata

Nessun cambio: `Playfair Display` (titoli editoriali/copertine), `Lora` (prosa narrativa),
`DM Sans` (interfaccia/etichette), `Caveat` (titoli scritti a mano), `JetBrains Mono` (numeri/stat) —
gli stessi font già in `lib/designTokens.ts`/`lib/taccuinoTokens.tsx`, self-hosted da `next/font`.

## Componenti — mapping sui token esistenti

- **Barra globale inferiore** (`components/Navbar.tsx`, `MobileBottomBar`) e **avatar flottante**:
  `bg-forest-600/95` → nuovo tono salvia scura `#5F7355`; icone attive `#F5EDDD`, inattive `#B9C4AE`.
- **Status bar nativa** (`manifest.json` → `theme_color`, oggi `#277134`): allineare a `#5F7355`.
- **Pillola in cima a Guida/Resoconto** (`MobileNavBar` in `components/Navbar.tsx`, usata da
  `components/routehub/HubNavBar.tsx`): stesso trattamento della barra globale.
- **Book bar** (voltapagina, `components/libro/BookPage.tsx`): già usa `TACCUINO_ACCENT`/`TERRA` —
  da riallineare al nuovo duo salvia/terracotta invece di terra pura.
- **Card/badge/pill/bottone primario**: card = `#EBE0C8` bordo `#D9C9A8`; badge/pill attivi = tinta
  accento `#E9DAC3` su testo `#C0603D`; bottone primario = sfondo `#C0603D`, testo `#F9F2E4`.

`lib/taccuinoTokens.tsx` va aggiornato con questi valori (oggi porta ancora `TACCUINO_ACCENT = TERRA`,
la direzione "Campo"), oppure va introdotta una seconda palette selezionabile se si vuole tenere
`TERRA` disponibile altrove.

## Struttura sezioni Guida — da 9 a 3 gruppi

Oggi (`lib/guideSections.ts`, `GUIDE_SECTIONS`): `prima_di_partire`, `il_percorso`, `verificato`,
`dati_sicurezza`, `comfort`, `luoghi`, `natura`, `sapori`, `consigli`.

Nuovo raggruppamento (3 sezioni nella pillola di navigazione del libro):

1. **Prima di partire** = `prima_di_partire` + `consigli` (rinominata da "Consigli finali" a
   **"Consigli"**). Contiene, in quest'ordine:
   - **Mappa 3D navigabile** (componente esistente `RouteMap3D`, riusato — non da ricostruire),
     **default satellitare**, navigabile embedded nella pagina, con pulsante "espandi" che apre
     `RouteMap3D` a schermo intero (comportamento invariato, solo restyling — vedi sotto). La
     mappa resta **anche** nella sezione "Percorso" (nessuna delle due la perde).
   - Meteo (widget esistente, invariato).
   - Consigli pratici standard (equipaggiamento, stagione, orario — testo statico esistente,
     `subtitle` di `prima_di_partire` in `guideSections.ts`).
   - **"Consigli"** — l'AI di Giulia (`GuideGenerationPanel`, selettore Essenziale/Approfondita/
     Molto approfondita invariato), presentata come **approfondimento secondario**, sotto i
     consigli pratici, mai a sostituirli né in conflitto con essi.
2. **Percorso** = `il_percorso` + `dati_sicurezza` + `verificato` ("Verifiche online").
3. **Luoghi e Natura** = `luoghi` + `natura` + `sapori`.

`comfort` ("Su misura per te") non menzionato dall'utente in questo giro — lasciare dov'è o
chiedere prima di spostarlo, non deciso qui.

Impatto codice: `GUIDE_SECTIONS` (`lib/guideSections.ts`) passa da 9 a 3 chiavi di primo livello
(la generazione AI e il contenuto restano quelli delle 9 sotto-sezioni, raggruppate solo nella UI/
navigazione — non è detto che l'AI debba generare per forza in 3 blocchi, verificare con l'utente
se serve invarianza anche lato prompt/`app/api/guide/route.ts`); la striscia pillole in
`components/libro/BookPage.tsx` e `GuideBookPage.tsx` mostrano i 3 gruppi.

## Mappa 3D espansa — restyling

La pagina a schermo intero aperta da "espandi" **è la stessa `RouteMap3D` esistente**
(`components/RouteMap3D.tsx`, oggi raggiungibile anche da "Strumenti" → "Video 3D del percorso") —
non una pagina nuova. Solo restyling nella nuova palette:
- Chip toggle Satellite/Topografica in alto a destra (satellitare default).
- Bottone indietro in alto a sinistra.
- Controlli fluttuanti sul bordo destro (orientamento, 3D, centra, blocca) in stile pillola/cerchio
  coerente con card/badge del resto dell'app invece dei controlli icon-only attuali (P-H8 dell'audit
  UX, occasione per sistemarlo insieme al restyling, non un requisito separato).
- Scheda inferiore con titolo percorso, pillole km/D+/tempo, CTA "Naviga" — stesso pattern delle
  card app-wide.

## Cosa NON è ancora deciso/fatto

- Il restyling completo di `GuidaHub`/`ResocontoHub`/`HubNavBar` (contenuto scuro immersivo) resta
  fuori scope: qui è stata aggiornata solo la vista "a libro" (`GuideBookPage`).
- Nessun codice applicativo è stato toccato in questa sessione — solo il mockup e questa guida.
  Le Fasi 1–5 già pushate su questo branch riguardano il menù globale (navigazione), non i colori.
