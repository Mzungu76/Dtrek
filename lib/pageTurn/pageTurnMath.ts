// Dtrek Page Turning Engine — parte "fisica" pura (nessun DOM, nessun React): un unico posto dove
// vivono le costanti e le formule che descrivono come si comporta una pagina che si sfoglia,
// condivise sia dal ramo gesture (trascinamento, components/libro/pageTurn/usePageDrag.ts)
// sia dal ramo programmatico (click/tastiera su Indietro/Avanti/pillole, DtrekPageTurn.tsx). Tenerle
// qui invece che duplicate nei due punti d'uso è il motivo per cui "un click" e "un drag completato
// oltre soglia" finiscono nello stesso identico movimento invece di due animazioni scollegate.
//
// `flipProgress` è il valore normalizzato 0→1 richiesto dalla specifica: 0 = pagina piatta a
// riposo, 1 = pagina completamente girata (di schiena, appoggiata sul lato opposto). Ogni funzione
// qui sotto prende in ingresso solo quel numero (più, dove serve, il segno del cardine) e restituisce
// un valore derivato — mai stato, mai side-effect.

/** Verso del cardine (dove sta la "rilegatura" di questa specifica pagina che si gira) — determina
 *  il segno della rotazione: cardine a sinistra ⇒ il bordo libero (destro) ruota verso l'interno
 *  dello schermo con un angolo negativo; cardine a destra ⇒ positivo. */
export type HingeSide = 'left' | 'right'

export function hingeSign(side: HingeSide): 1 | -1 {
  return side === 'left' ? -1 : 1
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

// ── Curve di easing — niente libreria, sono tre righe ciascuna ─────────────────────────────────
export function easeOutCubic(t: number): number {
  const p = clamp(t, 0, 1)
  return 1 - Math.pow(1 - p, 3)
}
export function easeInCubic(t: number): number {
  const p = clamp(t, 0, 1)
  return p * p * p
}
/** Piccolo "rimbalzo elastico" oltre il target prima di assestarsi — usata solo per il ritorno di
 *  un gesto annullato (Sezione 11/12 della specifica: "il ritorno non deve essere istantaneo,
 *  deve avere una piccola inerzia fisica"). `overshoot` più alto = rimbalzo più marcato. */
export function easeOutBack(t: number, overshoot = 1.15): number {
  const p = clamp(t, 0, 1)
  const c1 = overshoot
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2)
}

// ── Costanti tarate a occhio (Sezione 24 della specifica invita a un secondo giro di rifinitura
//    proprio su questi numeri: sono gli unici punti da toccare per cambiare "il carattere" dello
//    sfoglio senza riscrivere la logica). ──────────────────────────────────────────────────────
export const PAGE_TURN_TIMING = {
  /** Sopra questa frazione di trascinamento un rilascio completa lo sfoglio; sotto, torna indietro. */
  completionThreshold: 0.5,
  /** Un rilascio più lento della soglia ma abbastanza *veloce* (px/ms) completa comunque lo sfoglio
   *  — un "flick" — anche se la distanza percorsa non ha superato `completionThreshold`. */
  flingVelocityPxMs: 0.6,
  /** Durata dell'uscita avviata da click/tastiera: 0 → `clickHandoffProgress`, poi la navigazione
   *  vera parte subito — non si aspetta la fine dello sfoglio per non "rallentare la navigazione"
   *  (Sezione 1). Il resto del movimento (da `clickHandoffProgress` a 0, letto come "sto arrivando
   *  già girato") lo continua la pagina di destinazione al proprio mount, vedi
   *  `pageTurnHandoff.ts` — la stessa idea di "due pagine reali che si incontrano a metà" del volta
   *  pagina precedente (View Transitions), ma senza dipendere da un'API del browser. */
  clickExitMs: 320,
  clickHandoffProgress: 0.55,
  /** Durata dell'ingresso della pagina di destinazione, da `clickHandoffProgress` (o da dove un
   *  drag committato si era spinto) fino a 0 (piatta, posata). */
  enterMs: 300,
  /** Un drag committato continua da dove si trovava fino a 1 (giro completo) invece di fermarsi a
   *  `clickHandoffProgress`: il tempo già investito dal dito è "gratis", non serve accorciarlo. */
  dragCommitMinMs: 90,
  dragCommitMaxMs: 260,
  /** Ritorno elastico di un drag annullato (sotto soglia). */
  cancelReturnMs: 260,
  /** Rotazione massima — non 180° pieni: una pagina reale "atterra" ben prima di un piatto 180°
   *  geometrico, che con la prospettiva darebbe un fastidioso scatto ottico esattamente al bordo. */
  maxRotateDeg: 150,
  /** Sollevamento massimo (px) lungo Z, raggiunto a metà sfoglio (Sezione 5, "sollevamento"). */
  liftPx: 22,
  /** Spostamento laterale massimo (px) verso il cardine, sollevamento in stile "pagina che scivola
   *  leggermente mentre si solleva" invece di un rotateY rigido sul posto. */
  shiftPx: 7,
} as const

export interface PageTurnVisualState {
  /** Gradi di rotazione da applicare a `.dtp-leaf` (già col segno del cardine). */
  rotateDeg: number
  /** px di sollevamento lungo Z, sempre positivo, massimo a metà sfoglio. */
  liftPx: number
  /** px di spostamento laterale verso il cardine (già col segno). */
  shiftPx: number
  /** Fattore di scala (≤1), leggera "strizzata" a metà sfoglio. */
  scale: number
  /** Opacità dell'ombra di contatto proiettata sulla pagina sottostante. */
  contactShadowOpacity: number
  /** Larghezza (in frazione 0–1 della larghezza pagina) dell'ombra di contatto — si allarga e
   *  scivola verso il cardine mano a mano che la pagina si solleva, invece di restare fissa. */
  contactShadowSpreadPct: number
  /** Opacità dell'ombreggiatura sulla superficie stessa della pagina (la faccia si scurisce mentre
   *  si allontana dalla luce). */
  selfShadowOpacity: number
  /** Opacità della pennellata di luce che attraversa la pagina mentre si solleva. */
  highlightOpacity: number
  /** Posizione (0–1) della pennellata di luce lungo la larghezza della pagina. */
  highlightPositionPct: number
  /** Opacità della piega/dorso reattiva — più intensa appena il foglio comincia a sollevarsi,
   *  si affievolisce mano a mano che si allontana dalla rilegatura. */
  spineGlowOpacity: number
  /** true oltre la metà "geometrica" della rotazione — la faccia frontale è girata di schiena
   *  rispetto allo schermo (usato solo per `aria-hidden`/`inert` sul contenuto reale mentre non è
   *  rivolto verso l'utente, il cambio di faccia visivo lo fa già `backface-visibility` in CSS). */
  isShowingBack: boolean
}

/**
 * L'unica funzione che traduce `flipProgress` (0→1) in tutto ciò che si vede — chiamata sia ad
 * ogni `pointermove` di un drag sia ad ogni frame di un tween automatico (click/tastiera/rilascio
 * committato): un solo posto dove "cosa succede a che punto dello sfoglio" è descritto, invece di
 * una serie di animazioni indipendenti (esplicitamente scartato dalla specifica, Sezione 2).
 */
export function computePageTurnVisualState(progress: number, hinge: HingeSide): PageTurnVisualState {
  const p = clamp(progress, 0, 1)
  const sign = hingeSign(hinge)
  const arc = Math.sin(p * Math.PI) // 0 → 1 → 0, picco a metà sfoglio: solleva-poi-riappoggia

  return {
    rotateDeg: sign * p * PAGE_TURN_TIMING.maxRotateDeg,
    liftPx: arc * PAGE_TURN_TIMING.liftPx,
    shiftPx: -sign * Math.sin(p * Math.PI * 0.5) * PAGE_TURN_TIMING.shiftPx,
    scale: 1 - arc * 0.035,
    contactShadowOpacity: arc * 0.38,
    contactShadowSpreadPct: 18 + p * 40,
    selfShadowOpacity: clamp(p * 1.25, 0, 0.5),
    highlightOpacity: Math.sin(clamp(p, 0, 0.65) / 0.65 * Math.PI) * 0.16,
    highlightPositionPct: clamp(p, 0, 1) * 100,
    // A riposo (p=0) la piega non deve leggersi come "sempre accesa": cresce appena il foglio
    // comincia a sollevarsi (picco intorno al 18% dello sfoglio, quando è ancora vicino alla
    // rilegatura) e si spegne mano a mano che si allontana — non un'ombra permanente.
    spineGlowOpacity: p <= 0 ? 0 : Math.sin(clamp(p, 0, 0.4) / 0.4 * Math.PI) * 0.5,
    isShowingBack: p > 90 / PAGE_TURN_TIMING.maxRotateDeg,
  }
}

/** Un rilascio (drag terminato) completa lo sfoglio se ha superato la soglia di distanza, oppure
 *  se è abbastanza veloce da leggersi come un "flick" anche sotto soglia (Sezione 12). */
export function shouldCommitRelease(progress: number, velocityPxMs: number): boolean {
  if (progress >= PAGE_TURN_TIMING.completionThreshold) return true
  return progress > 0.12 && Math.abs(velocityPxMs) >= PAGE_TURN_TIMING.flingVelocityPxMs
}

/** Durata del "coasting" da un drag committato fino a 1 — proporzionale a quanto manca, tra un
 *  minimo e un massimo (Sezione 1: percepibile ma mai un freno alla navigazione). */
export function dragCommitDurationMs(progress: number): number {
  const remaining = clamp(1 - progress, 0, 1)
  return PAGE_TURN_TIMING.dragCommitMinMs + remaining * (PAGE_TURN_TIMING.dragCommitMaxMs - PAGE_TURN_TIMING.dragCommitMinMs)
}

// ── Curl del gesto (drag) — components/libro/pageTurn/PageCurlOverlay.tsx ─────────────────────
//
// Il rotateY "a porta rigida" qui sopra resta invariato per click/tastiera (Sezione 1: su
// desktop il click deve restare immediato, e riusa un meccanismo già verificato). Per il
// trascinamento invece — l'interazione primaria, quella che deve "materialmente piegare la
// carta sotto il dito" — questo modulo descrive una geometria diversa: non l'intera pagina che
// ruota come un pannello, ma una porzione di larghezza FISSA ("il lembo", `CURL_SPAN` della
// larghezza pagina) che scorre dal bordo libero verso il cardine mentre ruota su se stessa da
// 0° a 180°. Dove il lembo è già passato resta un'area piatta "già girata" (il retro, appoggiato
// sul lato opposto); dove non è ancora arrivato, il contenuto reale della pagina resta a vista
// invariato — è per questo che il lembo, e SOLO il lembo, ha bisogno di un'istantanea della
// pagina (lib/pageTurn/pageSnapshot.ts): non si può piegare/mostrare il retro di una mappa
// interattiva viva, ma il resto della pagina non viene mai toccato.
//
// Non è una vera superficie cilindrica continua (richiederebbe una mesh a più strisce con
// trigonometria per-pixel, troppo rischiosa da tarare senza poterla vedere dal vivo): un solo
// pannello rigido di larghezza fissa che scorre e ruota è una semplificazione dichiarata — si
// vede una piega che avanza sulla pagina invece di una porta intera che gira, già molto più
// vicina alla sensazione richiesta ("la carta si piega sotto il dito") pur restando
// implementabile con sicurezza.
export const CURL_SPAN = 0.42

export interface CurlGeometry {
  /** px da sinistra dello schermo dove comincia il lembo che ruota. */
  flapLeftPx: number
  /** larghezza del lembo — costante per tutto lo sfoglio. */
  flapWidthPx: number
  /** gradi di rotazione del lembo intorno al proprio bordo agganciato alla zona non ancora
   *  girata (0° = piatto, appena staccato dal resto della pagina; 180° = piatto sul lato
   *  opposto, di schiena). */
  flapRotateDeg: number
  /** true oltre i 90° locali del lembo — la sua faccia frontale (l'istantanea) è girata di
   *  schiena, `backface-visibility` mostra il retro. */
  flapShowingBack: boolean
  /** Regione già "girata" tra il lembo e il bordo libero — piatta, mostra solo il retro
   *  (nessuna istantanea necessaria: è comunque carta, non contenuto). Larghezza 0 a riposo. */
  turnedLeftPx: number
  turnedWidthPx: number
  /** Posizione (px, coordinate dell'istantanea intera) da cui ritagliare lo sfondo del lembo —
   *  `background-position-x` sull'elemento del lembo, sempre negativo o zero. */
  snapshotCropX: number
  /** Ombra di contatto alle due giunture del lembo (con la parte ancora piatta e con quella già
   *  girata) — stessa idea dell'ombra "a riposo poi via" dello sfoglio a porta rigida, qui
   *  applicata alla piega che avanza invece che all'intera pagina. */
  shadowOpacity: number
}

/**
 * Traduce `flipProgress` (0→1, distanza percorsa dal dito in frazione della larghezza pagina) e
 * il cardine nella geometria del lembo, in coordinate schermo assolute (px da sinistra) — così
 * chi la consuma (PageCurlOverlay.tsx) scrive `left`/`width`/`transform` senza dover rifare
 * calcoli specchiati per `hinge`.
 */
export function computeCurlGeometry(progress: number, hinge: HingeSide, pageWidthPx: number): CurlGeometry {
  const p = clamp(progress, 0, 1)
  const w = Math.max(0, pageWidthPx)
  const flapWidthPx = w * CURL_SPAN
  const travel = Math.max(0, w - flapWidthPx)
  // Distanza percorsa dal bordo del lembo più vicino al bordo libero — 0 a riposo (il lembo è
  // appoggiato proprio sul bordo libero), `travel` quando il lembo ha raggiunto il cardine.
  const nearFreeEdgeD = travel * p

  // Cardine a sinistra: il bordo libero è a destra, il lembo scorre da destra (flapLeftPx alto,
  // vicino a `w`) verso sinistra (flapLeftPx → 0). Cardine a destra: speculare, il bordo libero
  // è a sinistra, il lembo scorre da sinistra verso destra. La regione "già girata" (`turned...`)
  // sta sempre tra il lembo e il bordo libero, larga `nearFreeEdgeD` in entrambi i casi.
  const flapLeftPx = hinge === 'left' ? w - nearFreeEdgeD - flapWidthPx : nearFreeEdgeD
  const turnedLeftPx = hinge === 'left' ? flapLeftPx + flapWidthPx : 0

  const sign = hingeSign(hinge)
  const flapRotateDeg = sign * p * 180
  const arc = Math.sin(p * Math.PI)

  return {
    flapLeftPx,
    flapWidthPx,
    flapRotateDeg,
    flapShowingBack: p > 0.5,
    turnedLeftPx,
    turnedWidthPx: nearFreeEdgeD,
    snapshotCropX: -flapLeftPx,
    shadowOpacity: arc * 0.4,
  }
}
