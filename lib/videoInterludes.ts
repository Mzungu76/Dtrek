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
    /** Fotogrammi di percorso in cui è già prevista una foto (sosta o rivelazione). Uno stacco che
     *  ci cade sopra viene spostato — vedi `breathFrames`. */
    photoFrames?: { start: number; end: number }[]
    /** Respiro fra la fine di una foto e l'inizio di uno stacco. Attaccarlo subito dopo darebbe
     *  comunque due interruzioni di fila: chi guarda ha appena smesso di leggere una polaroid e si
     *  ritrova un pannello. Qualche secondo di percorso in mezzo rimette il ritmo a posto. */
    breathFrames?: number
  },
): PlannedInterlude[] {
  const { fps, routeFrames, available, photoFrames = [], breathFrames = Math.round(fps * 4) } = opts

  // Zone off-limits: le foto più il "respiro" DOPO di esse. Il respiro sta solo a valle perché è lì
  // che serve — si esce da una polaroid e non si deve incontrare subito un pannello — e perché
  // metterlo anche a monte raddoppierebbe lo spazio consumato, arrivando a non lasciare più posto
  // a nessuno stacco su un percorso con parecchie foto.
  const withBreath = (f: { start: number; end: number }) => ({ start: f.start, end: f.end + breathFrames })
  const placed: { start: number; end: number }[] = []

  /** Primo intervallo libero abbastanza capiente, il più vicino possibile alla posizione chiesta. */
  const findSlot = (want: number, frames: number, blocked: { start: number; end: number }[]) => {
    const sorted = blocked.slice().sort((x, y) => x.start - y.start)
    const gaps: { start: number; end: number }[] = []
    let cursor = 0
    for (const bz of sorted) {
      if (bz.start > cursor) gaps.push({ start: cursor, end: Math.min(bz.start, routeFrames) })
      cursor = Math.max(cursor, bz.end)
    }
    if (cursor < routeFrames) gaps.push({ start: cursor, end: routeFrames })
    let best: { at: number; dist: number } | null = null
    for (const g of gaps) {
      if (g.end - g.start < frames) continue
      const at = Math.min(Math.max(want, g.start), g.end - frames)
      const dist = Math.abs(at - want)
      if (!best || dist < best.dist) best = { at, dist }
    }
    return best?.at ?? null
  }

  const out: PlannedInterlude[] = []
  for (const st of settings.filter(x => x.enabled && available(x.kind) && x.seconds > 0).sort((a2, b2) => a2.atP - b2.atP)) {
    const frames = Math.max(1, Math.round(st.seconds * fps))
    const want = Math.round(clamp01(st.atP) * routeFrames)

    // Tre tentativi in ordine di preferenza, e l'ultimo non fallisce mai.
    //
    // I primi due cercano un intervallo libero — col respiro dopo le foto, poi senza — perché è la
    // disposizione che si legge meglio. Cercare un intervallo è più affidabile che spingere in
    // avanti finché si trova posto: la spinta, arrivata in fondo al percorso, andava ritagliata per
    // rientrare, e il ritaglio rimetteva lo stacco esattamente sopra la foto che stava cercando di
    // evitare.
    //
    // Il terzo è il punto chiesto e basta. Prima al suo posto c'era un `continue`: uno stacco che
    // l'utente aveva acceso spariva dal video, e il wizard poteva solo avvisare che sarebbe
    // successo. Era un errore di modello, non di disposizione — uno stacco NON consuma fotogrammi
    // di percorso, li AGGIUNGE: congela il volo dov'è e allunga il video (vedi frameToState in
    // components/RouteMap3D.tsx, dove tutte le pause condividono un unico accumulatore, e due pause
    // sullo stesso fotogramma si susseguono invece di sovrapporsi). Pretendere un "varco libero
    // lungo quanto lo stacco" era quindi una richiesta senza senso fisico, e su un percorso corto o
    // con un cursore veloce non era quasi mai soddisfacibile: il video da 3 s di volo non poteva
    // ospitare nessuno stacco da 6 s, e li perdeva tutti in silenzio.
    //
    // La regola ora è quella chiesta esplicitamente: tutto ciò che si accende finisce nel video, e
    // ad allungarsi è la durata totale — che il wizard mostra sempre in chiaro.
    const at = findSlot(want, frames, [...photoFrames.map(withBreath), ...placed])
             ?? findSlot(want, frames, [...photoFrames, ...placed])
             ?? Math.max(0, Math.min(want, routeFrames))

    placed.push({ start: at, end: at + frames })
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
