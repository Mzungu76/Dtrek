// Fonte unica di verità per la direzione "taccuino" — variante approvata dall'utente dopo il
// mockup (docs/diario-a-libro-piano.md, Fase 17) per succedere gradualmente alla pergamena calda
// di components/libro/BookPage.tsx. Non sostituisce nulla da sola: è il file che ogni pagina o
// componente riscritto in questo stile importerà, un pezzo alla volta, invece di ridefinire gli
// stessi valori localmente come è successo per la pergamena (vedi il commento in cima a
// BookPage.tsx) — questa volta la palette nasce già centralizzata.
//
// Fase 40 — palette riallineata alla direzione "Taccuino Botanico" (salvia/terracotta), scelta
// tra tre proposte (Campo/terra, Topografico/pino, Botanico) — docs/taccuino-botanico-piano.md.
// Non un nuovo file: lo stesso "taccuino" di Fase 17, solo con i toni definitivi.
//
// Separato da lib/designTokens.ts (non aggiunto lì) perché quel file serve l'intera app, oggi
// ancora nella sua estetica corrente — mescolarci una direzione non ancora applicata da nessuna
// parte lo confonderebbe. Quando il taccuino avrà preso il posto della pergamena ovunque, questi
// token potranno confluire lì.
//
// Il font a mano è self-hosted da next/font (app/layout.tsx, variabile --font-caveat) con lo
// stesso meccanismo degli altri — mai scrivere il nome letterale del font in un fontFamily al di
// fuori di qui, si comporterebbe come un font non caricato (stesso principio spiegato in
// designTokens.ts per gli altri font del brand). Caveat sostituisce Kalam, provato per primo in
// Fase 17 (git history) — stesso ruolo, tratto diverso, ancora in valutazione.
import { useId, type CSSProperties } from 'react'

export const FONT_VAR_HAND = '--font-caveat'
/** Titoli e annotazioni scritte a mano — corpo del testo resta su FONT.lora (designTokens.ts):
 *  professionalità e precisione del contenuto, non tutto scritto a mano allo stesso modo. */
export const FONT_HAND = `var(${FONT_VAR_HAND}), cursive`

/**
 * Inchiostro "assorbito" nella carta — da applicare (via spread, dopo `fontFamily: FONT_HAND`) ai
 * titoli/etichette scritti a mano. Fase 43: confrontate in un mockup quattro varianti (colore
 * piatto; alone sfumato via `text-shadow`; assorbimento via `mix-blend-mode`; le due sommate con un
 * bordo irregolare via filtro SVG) — approvata la terza. `mix-blend-mode: multiply` fa sì che il
 * colore dell'inchiostro si scurisca insieme a grana/nuvolato sotto invece di restare un blocco
 * piatto sopra la carta, più coerente con una scrittura che si "beve" nelle fibre. Il colore deve
 * avere alpha <1 (mai un hex pieno): `multiply` con un colore completamente opaco produce lo stesso
 * risultato di nessun blend. Il `textShadow` aggiunge un accenno di capillare attorno al tratto.
 */
export const INK_ABSORB_STYLE: CSSProperties = {
  color: 'rgba(46,42,34,.82)',
  mixBlendMode: 'multiply',
  textShadow: '0 0 2px rgba(122,90,50,.3)',
}

/** Carta — Fase 31, palette "Travel Journal" iniziale, poi riallineata in Fase 40 alla direzione
 *  approvata "Taccuino Botanico" (docs/taccuino-botanico-piano.md — valori esatti dalla guida,
 *  stessi usati dal chrome di sistema in tailwind.config.ts, colori `botanico.*`): sfondo tenue,
 *  quasi nessuna variazione percepibile, mai una "macchia" visibile come tale — la texture vera
 *  vive in `TaccuinoPaperTexture` come rumore quasi impercettibile, non come due chiazze scure. */
export const TACCUINO_PAPER = {
  base:   '#F5EDDD',
  /** Variante più chiara — zone "in luce" (piega, evidenziature leggere), mai lo sfondo pagina. */
  light:  '#F9F2E4',
  /** Sfondo di una "card incollata" — mappe, ricerca — leggermente più scuro della pagina stessa. */
  card:       '#EBE0C8',
  cardBorder: '#D9C9A8',
  /** Linee di livello disegnate a mano sullo sfondo pagina, molto tenui. */
  contourLine: '#A89A78',
  /** Evidenziatore — striscia calda dietro una riga "importante" (es. un percorso con un
   *  Reportage), sempre con un'opacità in coda (`${highlight}66` ecc.), mai a piena tinta: deve
   *  restare una pennellata di evidenziatore su carta, non un riquadro colorato. */
  highlight: '#EBE0C8',
} as const

/** Toni di inchiostro — il testo "stampato" (narrativo, professionale) e quello scritto a mano
 *  (titoli, etichette, annotazioni) sono volutamente due toni diversi, come in un vero taccuino
 *  dove il contenuto di base è preciso e le note a margine sono personali. `typed` non è mai nero
 *  puro (Fase 31, richiesta esplicita): un quasi-nero caldo resta coerente con la carta invece di
 *  "bucarla" con un contrasto da schermo. */
export const TACCUINO_INK = {
  typed:     '#2E2A22',
  hand:      '#7A6F52',
  handMuted: '#95886A',
  mapSepia:   '#3d2b1f',
  mapContour: '#C8B99F',
} as const

/** Accento funzionale (stati attivi, CTA) — Fase 40, direzione "Taccuino Botanico": non più la
 *  scala TERRA del brand, ma il duo salvia/terracotta approvato (docs/taccuino-botanico-piano.md).
 *  Solo `[600]` è mai stato usato dai chiamanti (BookPage.tsx, app/diari/[id]/page.tsx) — niente
 *  scala completa a 9 gradini come TERRA/FOREST, sarebbero valori inventati e mai referenziati. */
export const TACCUINO_ACCENT = { 600: '#C0603D' } as const
/** Accento secondario — salvia polverosa, mai per CTA/stati selezionati (quelli restano
 *  `TACCUINO_ACCENT`, terracotta). */
export const TACCUINO_ACCENT_SECONDARY = '#7C8F6E'
/** Tinta di sfondo per badge/chip nello stato attivo, dietro testo `TACCUINO_ACCENT`. */
export const TACCUINO_ACCENT_TINT = '#E9DAC3'

/**
 * Divisorio per elenchi verticali su fondo rigato (Mete, Reportage) — sostituisce il tratteggio
 * chiaro (`${TACCUINO_PAPER.cardBorder}80`) usato in precedenza: segnalato dall'utente su
 * screenshot reale, si confondeva visivamente con `TaccuinoRuledLines` dietro. Solido (il
 * tratteggio è la parte che si mimetizzava — i trattini si confondono con le righe ripetute dello
 * sfondo, una linea continua no) e color terra (`TACCUINO_ACCENT`, lo stesso accento già usato per
 * titoli/nastro — non un grigio neutro estraneo alla palette). Calibrato in un mockup dedicato.
 */
export const TACCUINO_LIST_DIVIDER = `1.5px solid ${TACCUINO_ACCENT[600]}73`

/**
 * Filtro SVG che dà un tratto "disegnato a mano" (leggero tremore organico) a un path/forma —
 * mai su testo o su icone piccole (sotto i ~24px il tremore le rende irriconoscibili invece che
 * "artigianali", verificato nel mockup): mappe, bordi di pagina, separatori, forme grandi.
 *
 * Va montato UNA VOLTA per pagina (dentro il primo `<svg>` che lo usa) e referenziato da
 * qualunque altro elemento con `filter="url(#ID)"`, `ID` = l'`id` restituito da `useHandWobbleId`
 * — mai un id fisso: due istanze sulla stessa pagina (es. una mappa nel Sommario e una nella
 * pagina del Percorso, se mai finissero nello stesso DOM) si scontrerebbero.
 *
 * ⚠️ Fase 23→24 — la Fase 23 aveva tolto questo filtro da `TaccuinoPaperTexture` sospettandolo
 * causa di un bug (testo invisibile nelle righe del Sommario), senza risolvere: isolato meglio in
 * Fase 24, la causa reale non era il filtro ma qualunque `<svg>` **che ricopre la pagina**
 * (`fixed`/`absolute` a piena area), con o senza questo filtro, con o senza z-index —
 * `TaccuinoPaperTexture` è stata riscritta senza SVG (sfondo CSS puro). Questo filtro resta quindi
 * sicuro dove l'avevo già descritto: una forma piccola/contenuta nel proprio riquadro (una mappa
 * in miniatura, un bordo locale) — non su un `<svg>` che ricopre l'intera pagina, a prescindere
 * dal filtro.
 */
export function useHandWobbleId(): string {
  return `hand-wobble-${useId()}`
}

export function HandWobbleFilter({ id, seed = 5, baseFrequency = 0.02, scale = 3.5 }: {
  id: string; seed?: number; baseFrequency?: number; scale?: number
}) {
  return (
    <filter id={id}>
      <feTurbulence type="fractalNoise" baseFrequency={baseFrequency} numOctaves={2} seed={seed} result="n" />
      <feDisplacementMap in="SourceGraphic" in2="n" scale={scale} />
    </filter>
  )
}

/**
 * Bordo "disegnato a mano" — un `<rect>` con lieve tremore organico (`HandWobbleFilter`), pensato
 * per sostituire un `border` CSS piatto su miniature, pulsanti e pillole (Fase 27, richiesto
 * dall'utente col mockup alla mano: "contorni... leggermente allungati come se fossero cerchiati a
 * mano"). Sicuro rispetto al bug delle Fasi 23-24: è un `<svg>` **assoluto dentro il proprio
 * elemento** (`position: relative` sul chiamante), mai `fixed`/`absolute` a piena pagina — la
 * classe di bug isolata allora riguardava solo un `<svg>` che *ricopre la pagina*, non una forma
 * piccola contenuta nel proprio riquadro (esattamente il caso d'uso per cui `HandWobbleFilter` era
 * già documentato sicuro).
 *
 * `viewBox="0 0 100 100"` con `preserveAspectRatio="none"` fa scalare il rettangolo alle
 * dimensioni reali dell'elemento (anche non quadrato) senza calcoli manuali — `vectorEffect=
 * "non-scaling-stroke"` (stesso trucco di `components/RouteThumb.tsx`) mantiene lo spessore del
 * tratto in pixel reali invece di deformarsi con lo stretch. Un `rx` alto (es. 50) su un
 * rettangolo largo produce automaticamente una pillola — la leggera ellitticità che ne risulta
 * sugli angoli (raggio non uniforme quando il riquadro non è quadrato) è parte del look "non
 * perfettamente geometrico", non un difetto da correggere.
 */
export function HandDrawnFrame({
  stroke, strokeWidth = 1.5, rx = 4, dashed = false, seed = 5, className = '',
}: { stroke: string; strokeWidth?: number; rx?: number; dashed?: boolean; seed?: number; className?: string }) {
  const filterId = useHandWobbleId()
  return (
    <svg
      aria-hidden="true"
      className={`absolute inset-0 w-full h-full pointer-events-none ${className}`}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      <defs><HandWobbleFilter id={filterId} seed={seed} baseFrequency={0.06} scale={1.6} /></defs>
      <rect
        x="2" y="2" width="96" height="96" rx={rx}
        fill="none" stroke={stroke} strokeWidth={strokeWidth}
        strokeDasharray={dashed ? '3 2.5' : undefined}
        filter={`url(#${filterId})`}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

/**
 * Grana della carta — un `repeating-linear-gradient` a passo fine (89deg, 1px pieno ogni 3px).
 * Rimossa in Fase 6 sospettandola causa del bug "testo invisibile", poi reintrodotta in Fase 8
 * dopo che la Fase 7 ha isolato la causa reale altrove (l'elemento `fixed`/`absolute inset-0`
 * separato, non il pattern disegnato sopra — vedi il commento su `taccuinoPaperBackgroundStyle`
 * più sotto): verificato con un browser reale che, come `background-image` del contenitore radice
 * invece che di un elemento a parte, non riproduce alcun bug. Passo fedele al mockup approvato
 * (`docs/mockup-siti-pubblici-diario/D_Sommario.dc.html`), mai un angolo esatto (89deg, non 90)
 * per non leggere come una texture generata al computer.
 */
const PAPER_GRAIN_IMAGE =
  'repeating-linear-gradient(89deg, rgba(122,111,82,.02) 0px, rgba(122,111,82,.02) 1px, transparent 1px, transparent 3px)'

/**
 * Rigatura orizzontale, ispirata ai quaderni tipo Moleskine (richiesta esplicita dell'utente:
 * "vorrei simulare queste righe orizzontali nelle pagine, sullo sfondo"). Calibrata in un mockup
 * a parte (opacità .07 su una singola riga, passo 34px) prima di essere riportata qui. Due
 * `repeating-linear-gradient` quasi orizzontali ma inclinati in verso opposto e di pochi decimi di
 * grado (stessa tecnica di `PAPER_GRAIN_IMAGE` sopra, qui quasi orizzontale invece che quasi
 * verticale) — mai un angolo esatto di 0deg, per non leggere come una riga stampata a righello.
 *
 * Vive in `TaccuinoRuledLines` (sotto), NON in `taccuinoPaperBackgroundStyle`: un primo giro
 * l'aveva incollata lì, ma vignettatura/nuvolato/grana sono un'atmosfera ambiente, ancorata al
 * viewport (non legata allo scroll) — la rigatura invece deve leggersi come stampata sul foglio,
 * quindi scorrere CON il testo. Messa nel layer fisso, scorrendo la pagina il testo scivolava sopra
 * righe che restavano ferme: "sembra che i testi e i foglietti siano volanti sulla pagina"
 * (segnalazione esplicita dell'utente). Da qui la separazione in due componenti con comportamento
 * di scroll diverso.
 *
 * ⚠️ Non ancora montata da nessuna pagina reale. Prima di un primo uso vero, verificare che non
 * riproduca il bug isolato in Fase 7 (vedi il commento su `taccuinoPaperBackgroundStyle` sotto):
 * questo componente è un `<div>` `absolute inset-0` che ricopre l'intero contenitore relativo in
 * cui viene montato, esattamente il pattern che lì corrompeva il rendering del testo altrove nel
 * DOM — indipendentemente dal contenuto disegnato sopra (bastava un `background-color` piatto). A
 * differenza della carta, qui l'effetto voluto è che scorra CON la pagina, quindi non si può
 * convertire in un `background` con `background-attachment: fixed` sul contenitore radice (quella
 * proprietà lo terrebbe agganciato al viewport, il contrario di quel che serve): se il bug si
 * ripresenta, la via è probabilmente disegnare la rigatura come `background` diretto di `<main>`
 * (o di un contenitore che già esiste nel DOM per altri scopi), mai come elemento a parte pensato
 * solo per ricoprire la pagina.
 */
/** Passo della rigatura — unica fonte per i gradienti sotto e per `TACCUINO_RULED_TEXT_STYLE`. */
const RULE_SPACING_PX = 34

const PAPER_RULED_LINE_IMAGES = [
  `repeating-linear-gradient(0.6deg, rgba(122,111,82,.05) 0px, rgba(122,111,82,.05) 1px, transparent 1px, transparent ${RULE_SPACING_PX}px)`,
  `repeating-linear-gradient(-0.4deg, rgba(122,111,82,.025) 0px, rgba(122,111,82,.025) 1px, transparent 1px, transparent ${RULE_SPACING_PX}px)`,
]
const PAPER_RULED_LINE_SIZES = ['auto', 'auto']

/**
 * Da usare SOLO su testo scritto direttamente sul fondo rigato della pagina (mai dentro una
 * TornFrame, mai su una riga di elenco: lì il testo ha già la propria tipografia e non deve
 * agganciarsi alla rigatura — richiesta esplicita dell'utente dopo aver visto il mockup: "devi
 * centrare solamente il testo scritto direttamente sul sottofondo dell'app, non quello sulle card
 * o sugli elenchi"). `lineHeight` pari al passo della rigatura fa sì che il testo si appoggi al
 * rigo come farebbe una persona che scrive, invece di fluttuare senza rapporto con lo sfondo.
 *
 * Approssimato, non millimetrico: l'allineamento esatto riga-per-riga dipenderebbe anche
 * dall'offset verticale del blocco rispetto all'origine della rigatura (varia da pagina a pagina
 * per header, safe-area, ecc.) — con la rigatura calibrata a un'opacità così tenue (.05/.025),
 * il ritmo di lettura che dà il `lineHeight` conta più del millimetro esatto.
 */
export const TACCUINO_RULED_TEXT_STYLE = { lineHeight: `${RULE_SPACING_PX}px` } as const

/**
 * Nuvolato — variazione di tono diffusa e leggera, non più chiazze marcate (Fase 43: le chiazze
 * grandi e sature testate nei giri precedenti leggevano o come "sporco" o restavano invisibili
 * sotto la sfumatura di luce dell'epoca — calibrata su un secondo riferimento fornito dall'utente:
 * "il nuvolato deve essere leggero e scurirsi con una vignettatura", la profondità principale ora
 * la dà `PAPER_VIGNETTE_IMAGE` sotto, non più queste chiazze). 10 ellissi piccole (95-165px) a
 * bassa opacità (.05-.10 per le colorate) e dissolvenza morbida (66-72%), quattro tonalità — crema
 * e bruno di prima più ambra e salvia (quest'ultima da `TACCUINO_ACCENT_SECONDARY`) per una
 * variazione anche di colore, non solo di chiaro/scuro.
 */
const PAPER_CLOUD_IMAGES = [
  'radial-gradient(ellipse 150px 115px at 18% 14%, rgba(249,242,228,.35), transparent 70%)',
  'radial-gradient(ellipse 125px 140px at 72% 10%, rgba(122,111,82,.10), transparent 68%)',
  'radial-gradient(ellipse 165px 125px at 45% 38%, rgba(184,142,86,.08), transparent 72%)',
  'radial-gradient(ellipse 110px 140px at 85% 42%, rgba(124,143,110,.07), transparent 68%)',
  'radial-gradient(ellipse 125px 140px at 10% 62%, rgba(249,242,228,.3), transparent 70%)',
  'radial-gradient(ellipse 140px 115px at 55% 72%, rgba(192,96,61,.06), transparent 68%)',
  'radial-gradient(ellipse 115px 130px at 88% 78%, rgba(122,111,82,.09), transparent 68%)',
  'radial-gradient(ellipse 130px 115px at 30% 92%, rgba(184,142,86,.08), transparent 66%)',
  'radial-gradient(ellipse 100px 90px at 60% 22%, rgba(124,143,110,.06), transparent 68%)',
  'radial-gradient(ellipse 95px 110px at 22% 45%, rgba(192,96,61,.05), transparent 68%)',
]

/**
 * Vignettatura — bordo che scurisce verso gli angoli lasciando il centro chiaro (Fase 43, su
 * riferimento fotografico: carta invecchiata con vignettatura in seppia/ambra). Sostituisce la
 * sfumatura di luce legata a `flip` (Fase 17-40): quel singolo blob chiaro in un angolo competeva
 * visivamente con il nuvolato sotto, coprendolo proprio dove contava di più. La vignettatura è
 * centrata e simmetrica — non serve più `flip` per posizionarla (il parametro non esiste più in
 * `taccuinoPaperBackgroundStyle`, Fase 7). Colore ambra caldo (#8B5E2C, non un token esistente — scelto su un giro di calibrazione visiva,
 * più caldo del seppia `TACCUINO_INK.mapSepia` provato per primo) con centro trasparente esteso
 * (55%) e dissolvenza rapida solo nella fascia esterna, per un effetto concentrato sul contorno
 * invece che diffuso verso il centro.
 */
const PAPER_VIGNETTE_IMAGE =
  'radial-gradient(ellipse 90% 84% at 50% 40%, transparent 55%, rgba(139,94,44,.15) 78%, rgba(139,94,44,.48) 100%)'

/**
 * Texture di sfondo del taccuino — tutta la pagina, dietro al contenuto.
 *
 * Fase 7 (docs/siti-pubblici-taccuino-piano.md) — RISCRITTA da capo dopo aver trovato un secondo
 * bug "testo/carte invisibili", stavolta nella sezione Numeri di `DiaryPublicView` e poi
 * riprodotto anche in `CollectionPublicView`, cioè in una pagina dove la Fase 6 (rimozione della
 * grana) avrebbe già dovuto risolvere tutto. Bisezionato di nuovo con un browser reale (Chromium
 * via Playwright, non solo letto nel codice), stavolta isolando l'elemento incriminato con uno
 * screenshot dell'elemento singolo (non dell'intera pagina, per escludere artefatti di
 * stitching): il colpevole non erano i gradienti, ma il *componente* stesso, allora chiamato
 * `TaccuinoPaperTexture` — un `<div>` `fixed inset-0 -z-10`. Anche ridotto a un `<div>` con il
 * solo `backgroundColor` piatto (niente vignettatura, niente nuvolato, niente grana) l'elemento
 * continuava a corrompere il rendering di contenuto altrove nel DOM. Sostituendo `fixed` con
 * `absolute` il bug rimaneva identico; togliendo lo `z-index` negativo pure. L'unica cosa che lo
 * fa sparire è NON avere affatto un elemento separato che "ricopre la pagina" — la Fase 6 aveva
 * quindi diagnosticato correttamente il sintomo (rimuovere la grana faceva sparire il bug nel
 * primo caso testato) ma sbagliato la causa: non è il pattern disegnato sopra, è l'esistenza
 * stessa di un layer `fixed`/`absolute inset-0` indipendente, qualunque cosa ci sia dentro — la
 * stessa classe di bug isolata in Fase 24 (lì un `<svg>` che ricopriva la pagina), qui provata
 * senza alcun SVG e senza alcun pattern ripetuto nel DOM.
 *
 * Il fix: niente più elemento a parte. Questa funzione restituisce solo un oggetto di stile, da
 * spargere (`style={{...taccuinoPaperBackgroundStyle()}}`) sul contenitore radice che ogni pagina
 * ha già (`<div className="min-h-screen relative">`) — un `background` sul box che contiene
 * comunque tutto il resto, non un elemento fratello che lo ricopre. Per ottenere lo stesso effetto
 * "atmosfera ancorata al viewport, non allo scroll" che dava `position: fixed`, usa
 * `background-attachment: fixed`: stessa resa visiva (la vignettatura resta centrata su quel che
 * si vede, non sul documento intero), ma è una proprietà del background di un elemento normale,
 * non un elemento composito a parte — verificato che non riproduce il bug.
 *
 * Composizione, dal layer più in alto al più in basso (l'ordine conta: in CSS multi-background il
 * primo elencato in `background-image` dipinge sopra gli altri): (1) vignettatura
 * (`PAPER_VIGNETTE_IMAGE`), (2) nuvolato leggero (`PAPER_CLOUD_IMAGES`), (3) grana verticale
 * sottile (`PAPER_GRAIN_IMAGE`, Fase 8), (4) il colore piatto di base in fondo a tutto — stessa
 * composizione e stessi valori del mockup approvato, non un'approssimazione. La rigatura
 * orizzontale NON è qui (vedi `TaccuinoRuledLines` sotto, con il proprio avviso): quella deve
 * scorrere CON il contenuto, quindi non può usare `background-attachment: fixed`.
 *
 * ⚠️ Chi chiama questa funzione deve spargerne il risultato DIRETTAMENTE sul contenitore radice,
 * non su un elemento a parte aggiunto per l'occasione: un `<div>` in più il cui unico scopo è
 * portare questo `style` ricadrebbe nello stesso schema (un elemento che esiste solo per
 * ricoprire la pagina) che questa riscrittura elimina.
 */
export function taccuinoPaperBackgroundStyle(): CSSProperties {
  return {
    backgroundColor: TACCUINO_PAPER.base,
    backgroundAttachment: 'fixed',
    backgroundImage: [PAPER_VIGNETTE_IMAGE, ...PAPER_CLOUD_IMAGES, PAPER_GRAIN_IMAGE].join(', '),
    backgroundRepeat: 'no-repeat',
  }
}

/**
 * Rigatura orizzontale del taccuino — da montare come primo figlio del contenitore radice (quello
 * che porta `style={{...taccuinoPaperBackgroundStyle()}}`), con `position: relative` e un'altezza
 * che segue il contenuto (niente `h-screen`/`overflow` che la tagli): `absolute inset-0` si estende
 * esattamente a quell'altezza, quindi scorre insieme al resto della pagina invece di restare
 * agganciata al viewport come la carta (`taccuinoPaperBackgroundStyle`, con
 * `background-attachment: fixed`). Vedi il commento su `PAPER_RULED_LINE_IMAGES` sopra per il
 * perché della separazione, e l'avviso lì sopra prima di un primo uso reale.
 */
export function TaccuinoRuledLines() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 -z-10 pointer-events-none"
      style={{
        backgroundImage: PAPER_RULED_LINE_IMAGES.join(', '),
        backgroundSize: PAPER_RULED_LINE_SIZES.join(', '),
        backgroundRepeat: PAPER_RULED_LINE_IMAGES.map(() => 'no-repeat').join(', '),
      }}
    />
  )
}

/**
 * Rilegatura — l'ombra e la piega fisiche sul bordo sinistro dello schermo.
 *
 * Fase 31 — riscritta da capo su specifica dettagliata dell'utente: non più una singola sfumatura
 * nera uniforme dall'alto al basso (Fase 29), ma una composizione a più livelli che simula la
 * rilegatura fisica — (1) ombra interna, (2) linea di piega sottile, (3) piccola zona di luce
 * appena oltre, (4) ombra esterna molto più morbida, tutte in un marrone caldo TRASPARENTE
 * (`TACCUINO_INK.hand`/`TACCUINO_PAPER.light`, mai nero) — e più intensa al centro verticale della
 * pagina, non uniforme dall'alto al basso: un `mask-image` verticale (sfuma a `transparent` in
 * cima e in fondo) applicato sopra i gradienti orizzontali che compongono i livelli, invece di
 * ricalcolare quei gradienti per l'altezza — le due dimensioni restano indipendenti. Niente
 * `<svg>` (mai stata la causa del bug isolato in Fase 24, ma qui basta il CSS): un solo `<div>`,
 * `background` per i livelli orizzontali, `mask-image`/`-webkit-mask-image` per la sagoma
 * verticale. Niente anelli o punti di cucitura (discussi e scartati: "se risultano troppo
 * decorativi, eliminarli" — con la sola ombra già chiaramente una rilegatura, aggiungerli sarebbe
 * stata decorazione sopra un effetto già leggibile).
 *
 * Fase 35 — rinforzata su richiesta esplicita dell'utente dopo un confronto prima/dopo: più
 * larga (26→34px) e più scura ai due estremi (`shadowIn`/`shadowOut` quasi raddoppiati), a leggersi
 * chiaramente come rilegatura invece di un'ombra appena accennata. Aveva anche guadagnato un lato
 * alternabile per l'effetto pagina girata (poi rimosso su richiesta esplicita, insieme a tutto il
 * resto dello sfoglio animato): resta solo sul bordo sinistro, come prima di quella fase.
 *
 * Fase 36 — tolta la "piccola zona di luce" (`light`, un caldo quasi-bianco): segnalata
 * esplicitamente come "riflesso bianco" indesiderato. La composizione resta comunque a più
 * livelli (ombra interna → piega → ombra esterna più morbida), solo senza lo schiarimento.
 */
export function TaccuinoSpineShadow() {
  const width = 34
  const shadowIn = 'rgba(41,35,30,0.48)'   // ombra interna, marrone-nero caldo (TACCUINO_INK.typed)
  const crease   = 'rgba(128,103,70,0.36)' // linea di piega (TACCUINO_INK.hand)
  const shadowOut = 'rgba(41,35,30,0.17)'  // ombra esterna, più morbida ma non più quasi invisibile
  const stops = [
    `${shadowIn} 0%`, `${shadowIn} 7%`, `${crease} 15%`, `${shadowOut} 30%`, 'transparent 60%',
  ].join(', ')
  const verticalMask = 'linear-gradient(to bottom, transparent 0%, black 18%, black 82%, transparent 100%)'
  return (
    <div
      aria-hidden="true"
      className="fixed inset-y-0 left-0 z-40 pointer-events-none"
      style={{
        width,
        background: `linear-gradient(to right, ${stops})`,
        WebkitMaskImage: verticalMask,
        maskImage: verticalMask,
      }}
    />
  )
}
