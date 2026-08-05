// lib/videoInterludes.ts — gli "stacchi" che spezzano il volo sul percorso.
//
// Un video che scorre dall'inizio alla fine senza mai fermarsi mostra il percorso ma non lo
// racconta: i dati passano troppo in fretta per essere letti. Gli stacchi fermano la telecamera in
// due o tre punti e tengono un pannello a schermo abbastanza a lungo da poterlo davvero leggere.
//
// Meccanicamente riusano il congelamento che già esiste per le foto a schermo intero (vedi
// frameToState in components/RouteMap3D.tsx): l'avanzamento del percorso si blocca, il contatore
// dei fotogrammi no. Da qui la regola d'oro di questo file: le pause di ogni tipo — foto e stacchi
// — vanno fuse in UN'UNICA lista ordinata con UN SOLO accumulatore, altrimenti i due meccanismi si
// sommano male e le posizioni si spostano l'una rispetto all'altra.
//
// Logica pura: nessun canvas, nessun React.

export type InterludeKind =
  | 'visione'    // sguardo d'insieme: tutto il percorso a volo d'uccello, annotato — vedi lib/videoVision.ts
  | 'profilo'    // profilo altimetrico, dislivello, pendenza
  | 'numeri'     // distanza, tempo, quota
  | 'natura'     // fascia vegetazionale, ambiente
  | 'tei'        // punteggio TEI con le sue componenti
  | 'avvisi'     // chiusure/allerte dalla guida ("Verificato online")
  | 'luoghi'     // i luoghi principali in elenco

export const INTERLUDE_LABEL: Record<InterludeKind, string> = {
  visione: 'Visione d’insieme',
  profilo: 'Profilo altimetrico',
  numeri:  'I numeri del percorso',
  natura:  'La natura intorno',
  tei:     'Punteggio del percorso',
  avvisi:  'Avvisi e sicurezza',
  luoghi:  'I luoghi principali',
}

export interface InterludeSetting {
  kind: InterludeKind
  enabled: boolean
  /** Quanto resta a schermo. Il senso di uno stacco è dare il tempo di leggere: sotto i ~3s
   *  tanto vale non farlo. */
  seconds: number
  /** Dove cade lungo il percorso, 0..1. */
  atP: number
}

export interface PlannedInterlude {
  kind: InterludeKind
  atP: number
  frames: number
  /** Fotogramma di innesco in spazio "percorso" (al netto delle pause già accumulate prima). */
  triggerRouteFrame: number
}

// I `seconds` di partenza sono le durate consigliate a contenuto tipico (vedi
// recommendedInterludeSeconds più sotto). Il wizard le ricalcola sul contenuto REALE
// dell'escursione appena uno stacco viene attivato: questi valori servono solo come punto di
// partenza coerente, non come numeri scelti a sentimento.
export const DEFAULT_INTERLUDES: InterludeSetting[] = [
  // Vicino alla partenza: serve a capire dove si sta per andare, e messa in fondo racconterebbe
  // una cosa già vista. Acceso di default — è l'unico stacco che spiega il percorso invece di
  // commentarlo.
  { kind: 'visione', enabled: true,  seconds: 6,   atP: 0.06 },
  { kind: 'numeri',  enabled: true,  seconds: 3.5, atP: 0.22 },
  { kind: 'profilo', enabled: true,  seconds: 4,   atP: 0.50 },
  { kind: 'tei',     enabled: false, seconds: 5.5, atP: 0.78 },
  { kind: 'natura',  enabled: false, seconds: 5,   atP: 0.64 },
  { kind: 'avvisi',  enabled: false, seconds: 5.5, atP: 0.36 },
  { kind: 'luoghi',  enabled: false, seconds: 4,   atP: 0.86 },
]

// ── Quanto tenere a schermo uno stacco ────────────────────────────────────────
//
// La durata giusta non è un gusto: è quanto ci vuole a LEGGERE quello che c'è dentro. Un pannello
// di quattro numeri e uno con tre avvisi di due righe l'uno non possono durare lo stesso tempo — il
// primo diventa una fermata inutilmente lunga, il secondo sparisce a metà frase.
//
// Due velocità diverse, perché sono due gesti diversi:
//  · le voci brevi (una statistica, una barra del punteggio, il nome di un luogo) si COLGONO con
//    un'occhiata — mezzo secondo l'una, e non si leggono davvero parola per parola;
//  · le frasi vere (la descrizione della fascia vegetazionale, il testo di un avviso) si LEGGONO,
//    a ~3 parole al secondo: meno della lettura silenziosa da fermi (~4), perché qui si legge da un
//    video che scorre, col telefono in mano e senza poter tornare indietro.
// Applicare la velocità della prosa anche ai numeri era l'errore della prima versione: dava sette
// secondi a un pannello di quattro cifre.
const PROSE_WORDS_PER_SECOND = 3.0
/** Tempo per una voce breve colta a colpo d'occhio. Include lo scaglionamento con cui entrano. */
const GLANCE_SECONDS = 0.55
/** L'animazione d'entrata è la stessa per tutti gli stacchi. */
const ENTRY_SECONDS = 1.4
/** Oltre questo uno stacco non è più una pausa di lettura ma un'interruzione. Se il contenuto ne
 *  chiederebbe di più, vuol dire che è troppo denso: va accorciato il contenuto, non allungato il
 *  pannello (drawNoticesBeat mostra al massimo 3 avvisi, drawPlacesBeat 4 luoghi, proprio per questo). */
const MAX_RECOMMENDED = 7
const MIN_RECOMMENDED = 3

/** Contenuto reale dello stacco, per pesarne la durata. Tutto opzionale: senza dati si ricade su
 *  una stima tipica del tipo di pannello. */
export interface InterludeContent {
  /** Voci brevi che compaiono: statistiche, barre, righe di elenco. */
  items?: number
  /** Parole di prosa vera da leggere (descrizioni, testi degli avvisi). Non i numeri. */
  proseWords?: number
}

/** Durata consigliata in secondi, al mezzo secondo. */
export function recommendedInterludeSeconds(kind: InterludeKind, content: InterludeContent = {}): number {
  const items = content.items ?? DEFAULT_ITEMS[kind]
  const prose = content.proseWords ?? DEFAULT_PROSE_WORDS[kind]
  const raw = ENTRY_SECONDS + items * GLANCE_SECONDS + prose / PROSE_WORDS_PER_SECOND + EXTRA_SECONDS[kind]
  return Math.min(MAX_RECOMMENDED, Math.max(MIN_RECOMMENDED, Math.round(raw * 2) / 2))
}

/** True quando il contenuto chiederebbe più del massimo: il pannello sarà comunque tagliato corto. */
export function interludeIsDense(kind: InterludeKind, content: InterludeContent = {}): boolean {
  const items = content.items ?? DEFAULT_ITEMS[kind]
  const prose = content.proseWords ?? DEFAULT_PROSE_WORDS[kind]
  return ENTRY_SECONDS + items * GLANCE_SECONDS + prose / PROSE_WORDS_PER_SECOND + EXTRA_SECONDS[kind] > MAX_RECOMMENDED
}

const DEFAULT_ITEMS: Record<InterludeKind, number> = {
  visione: 4, numeri: 4, profilo: 2, natura: 2, tei: 5, avvisi: 2, luoghi: 3,
}
const DEFAULT_PROSE_WORDS: Record<InterludeKind, number> = {
  visione: 0, numeri: 0, profilo: 0, natura: 18, tei: 0, avvisi: 24, luoghi: 0,
}
/** Tempo che il pannello si prende a prescindere dal testo: il profilo si disegna da sinistra a
 *  destra, il punteggio conta da zero e riempie cinque barre — animazioni che vanno viste finire. */
const EXTRA_SECONDS: Record<InterludeKind, number> = {
  // La Visione si prende il tempo dell'allargamento della telecamera prima che compaia la prima
  // etichetta: senza, le annotazioni arriverebbero mentre la mappa si sta ancora muovendo.
  visione: 2.6, numeri: 0, profilo: 1.6, natura: 0, tei: 1.4, avvisi: 0.4, luoghi: 0.4,
}

/**
 * Prepara gli stacchi da inserire nella fase di percorso: scarta quelli disattivati o senza dati,
 * li ordina per posizione e converte durata/posizione in fotogrammi.
 *
 * `available` dice quali hanno davvero qualcosa da mostrare — uno stacco "avvisi" su un'escursione
 * senza guida, o "TEI" senza punteggio, resterebbe un pannello vuoto ed è meglio non esista.
 */
export function planInterludes(
  settings: InterludeSetting[],
  opts: {
    fps: number
    routeFrames: number
    available: (kind: InterludeKind) => boolean
    /** Tratti di percorso già occupati da una foto.
     *
     *  Attenzione a cosa è un "tratto" qui, che è la sottigliezza da cui dipende tutto il calcolo.
     *  In stile Carosello la sosta su una foto fa davvero parte della timeline di percorso (la
     *  costruisce buildJourneyTables) e l'intervallo è reale. In stile Classico no: la polaroid è
     *  una pausa AGGIUNTA sopra al percorso, che di percorso non consuma nulla, e l'intervallo giusto
     *  da passare qui è lungo zero — il solo fotogramma di innesco. Passare la durata della pausa,
     *  come si faceva prima, gonfiava ogni foto di 2,5 s di percorso inesistente: con quattro foto
     *  su un volo breve le zone occupate coprivano il tracciato intero e ogni stacco finiva
     *  addosso a una polaroid. */
    photoFrames?: { start: number; end: number }[]
    /** Quanto percorso deve scorrere fra un'interruzione e la successiva. Due pause attaccate danno
     *  comunque due interruzioni di fila: chi guarda ha appena smesso di leggere una polaroid e si
     *  ritrova un pannello. */
    breathFrames?: number
  },
): PlannedInterlude[] {
  const { fps, routeFrames, available, photoFrames = [], breathFrames = Math.round(fps * 4) } = opts

  /** Distanza di un punto da un intervallo occupato: 0 se ci sta dentro. */
  const gapTo = (at: number, z: { start: number; end: number }) =>
    at < z.start ? z.start - at : at > z.end ? at - z.end : 0

  /**
   * Dove mettere uno stacco, dato ciò che è già occupato.
   *
   * Uno stacco NON consuma fotogrammi di percorso: congela il volo dov'è e allunga il video (vedi
   * frameToState in components/RouteMap3D.tsx — tutte le pause condividono un accumulatore, e due
   * pause sullo stesso fotogramma si susseguono invece di sovrapporsi). Quindi non serve cercargli
   * un "varco largo quanto la sua durata": serve un PUNTO abbastanza lontano dalle altre
   * interruzioni. Era proprio quella richiesta senza senso fisico a far sparire in silenzio gli
   * stacchi accesi su qualunque video non lungo e lento.
   *
   * Si prende il punto col respiro maggiore attorno; a parità di respiro, il più vicino a quello
   * chiesto, così la scelta resta prevedibile. Se nemmeno il migliore raggiunge il respiro voluto
   * lo si usa lo stesso — meglio uno stacco un po' stretto fra due foto che uno stacco che l'utente
   * ha acceso e non compare.
   */
  const placeBeat = (want: number, blocked: { start: number; end: number }[]): number => {
    const clamp = (v: number) => Math.max(0, Math.min(Math.round(v), routeFrames))
    if (blocked.length === 0) return clamp(want)
    const zones = blocked.slice().sort((x, y) => x.start - y.start)

    const candidates: number[] = [clamp(want), 0, routeFrames]
    for (let i = 0; i < zones.length; i++) {
      candidates.push(clamp(zones[i].start - breathFrames))
      candidates.push(clamp(zones[i].end + breathFrames))
      if (i + 1 < zones.length) candidates.push(clamp((zones[i].end + zones[i + 1].start) / 2))
    }
    const clearance = (at: number) => Math.min(...zones.map(z => gapTo(at, z)))

    let best = clamp(want), bestClear = -1
    for (const at of candidates) {
      const c = Math.min(clearance(at), breathFrames)   // oltre il respiro voluto non serve di più
      if (c > bestClear || (c === bestClear && Math.abs(at - want) < Math.abs(best - want))) {
        best = at; bestClear = c
      }
    }
    return best
  }

  const placed: { start: number; end: number }[] = []
  const out: PlannedInterlude[] = []
  for (const st of settings.filter(x => x.enabled && available(x.kind) && x.seconds > 0).sort((a2, b2) => a2.atP - b2.atP)) {
    const frames = Math.max(1, Math.round(st.seconds * fps))
    const want = Math.round(clamp01(st.atP) * routeFrames)
    const at = placeBeat(want, [...photoFrames, ...placed])
    // Lo stacco appena messo diventa a sua volta un'interruzione da cui stare alla larga, ma resta
    // un punto: non occupa percorso, quindi l'intervallo che lascia è lungo zero.
    placed.push({ start: at, end: at })
    out.push({ kind: st.kind, atP: at / Math.max(1, routeFrames), frames, triggerRouteFrame: at })
  }
  return out.sort((a2, b2) => a2.triggerRouteFrame - b2.triggerRouteFrame)
}

const clamp01 = (v: number) => Math.max(0, Math.min(0.995, v))

/** Fotogrammi totali aggiunti al video dagli stacchi. */
export function interludeTotalFrames(planned: PlannedInterlude[]): number {
  return planned.reduce((sum, i) => sum + i.frames, 0)
}

/**
 * Quota del video occupata dai pannelli fermi. Su un percorso corto tre stacchi da cinque secondi
 * diventano metà del filmato: meglio dirlo prima di generarlo che scoprirlo dopo.
 */
export function interludeShareOfVideo(planned: PlannedInterlude[], routeFrames: number): number {
  const total = interludeTotalFrames(planned)
  return total / Math.max(1, total + routeFrames)
}
