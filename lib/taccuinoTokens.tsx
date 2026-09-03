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
 * Grana della carta — fibre verticali sottili via `repeating-linear-gradient`, non più cerchi
 * piastrellati (Fase 42: quei cerchi — per quanto alleggeriti in Fase 41 — restavano comunque
 * "puntini" riconoscibili come tali su schermo reale; l'utente ha ripetuto il feedback anche dopo
 * la Fase 41, che aveva toccato solo le imperfezioni sotto, non questo layer). Tre passi diversi
 * (3px/5px/8px) sovrapposti a angolazione quasi verticale ma leggermente diversa l'uno dall'altro
 * rompono la perfetta regolarità di un singolo pattern, per un effetto di fibra tessuta/carta
 * piuttosto che di righe meccaniche — stesso principio del riferimento "nuvolato" fornito
 * dall'utente, che mostra striature verticali sottili mai puntiformi. Nessun `<svg>`/`feTurbulence`
 * (per la classe di bug isolata in Fase 24, vedi sotto). Costruita una volta sola a import-time
 * (stringhe statiche), non ricalcolata a ogni render.
 */
const PAPER_GRAIN_IMAGES = [
  'repeating-linear-gradient(89deg, rgba(122,111,82,.05) 0px, rgba(122,111,82,.05) 1px, transparent 1px, transparent 3px)',
  'repeating-linear-gradient(91deg, rgba(46,42,34,.04) 0px, rgba(46,42,34,.04) 1px, transparent 1px, transparent 5px)',
  'repeating-linear-gradient(90.5deg, rgba(122,111,82,.035) 0px, rgba(122,111,82,.035) 1px, transparent 1px, transparent 8px)',
]
const PAPER_GRAIN_SIZES = ['auto', 'auto', 'auto']

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
 * centrata e simmetrica — non serve più `flip` per posizionarla (il parametro resta nella firma di
 * `TaccuinoPaperTexture` per compatibilità con i chiamanti esistenti, ma non ha più effetto).
 * Colore ambra caldo (#8B5E2C, non un token esistente — scelto su un giro di calibrazione visiva,
 * più caldo del seppia `TACCUINO_INK.mapSepia` provato per primo) con centro trasparente esteso
 * (55%) e dissolvenza rapida solo nella fascia esterna, per un effetto concentrato sul contorno
 * invece che diffuso verso il centro.
 */
const PAPER_VIGNETTE_IMAGE =
  'radial-gradient(ellipse 90% 84% at 50% 40%, transparent 55%, rgba(139,94,44,.15) 78%, rgba(139,94,44,.48) 100%)'

/**
 * Texture di sfondo del taccuino — tutta la pagina, dietro al contenuto.
 *
 * Composizione, dal layer più in alto al più in basso (l'ordine conta: in CSS multi-background il
 * primo elencato in `background-image` dipinge sopra gli altri): (1) vignettatura
 * (`PAPER_VIGNETTE_IMAGE`), (2) nuvolato leggero (`PAPER_CLOUD_IMAGES`), (3) fibre verticali
 * sottili (`PAPER_GRAIN_IMAGES`), (4) il colore piatto di base in fondo a tutto.
 *
 * Fase 24 — **causa reale, finalmente isolata**, del bug "titolo/statistiche invisibili" nelle
 * righe del Sommario: qualunque `<svg>` **vivo che ricopre la pagina** (fisso o assoluto, con o
 * senza filtro, con o senza z-index) corrompeva il rendering del testo altrove nel DOM — mai
 * l'SVG in sé, sempre la sovrapposizione. Questo componente resta quindi un `<div>` con sfondo
 * CSS puro (colore + gradienti), mai un elemento SVG nel DOM.
 *
 * `flip` non ha più effetto (Fase 43): posizionava la vecchia sfumatura di luce su un lato o
 * l'altro, sostituita dalla vignettatura centrata e simmetrica. Il parametro resta nella firma solo
 * per compatibilità con i chiamanti esistenti (`BookPage.tsx`, `app/diari/[id]/page.tsx`).
 *
 * ⚠️ Il chiamante NON deve mettere un `background` opaco sul proprio contenitore radice (lo
 * stesso `<div>` in cui questo componente viene montato come figlio): quel contenitore, essendo
 * un box non posizionato, dipinge il proprio sfondo (categoria 3 dell'ordine di stacking,
 * CSS2.1 §E.2) SOPRA questo `<div fixed>` a z-index negativo (categoria 2) — anche se nel markup
 * il componente compare prima. È la stessa classe di bug isolata in Fase 24 (un `<svg>` che
 * ricopre la pagina rompeva lo stacking), qui capovolta: non serve un colore duplicato sul
 * contenitore, questo componente fornisce già `TACCUINO_PAPER.base` come propria `backgroundColor`
 * — un `background` in più sul genitore nasconde grana e nuvolato lasciando visibile solo il
 * colore piatto (bug reale riscontrato su build reale in Fase 40, corretto rimuovendolo da
 * `app/diari/page.tsx` e `app/profilo/page.tsx`).
 */
export function TaccuinoPaperTexture({ flip = false }: { flip?: boolean }) {
  void flip
  const images = [
    PAPER_VIGNETTE_IMAGE,
    ...PAPER_CLOUD_IMAGES,
    ...PAPER_GRAIN_IMAGES,
  ]
  const sizes = ['auto', ...PAPER_CLOUD_IMAGES.map(() => 'auto'), ...PAPER_GRAIN_SIZES]
  const repeats = ['no-repeat', ...PAPER_CLOUD_IMAGES.map(() => 'no-repeat'), ...PAPER_GRAIN_IMAGES.map(() => 'no-repeat')]
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 -z-10 pointer-events-none"
      style={{
        backgroundColor: TACCUINO_PAPER.base,
        backgroundImage: images.join(', '),
        backgroundSize: sizes.join(', '),
        backgroundRepeat: repeats.join(', '),
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
