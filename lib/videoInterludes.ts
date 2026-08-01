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
  | 'profilo'    // profilo altimetrico, dislivello, pendenza
  | 'numeri'     // distanza, tempo, quota
  | 'natura'     // fascia vegetazionale, ambiente
  | 'tei'        // punteggio TEI con le sue componenti
  | 'avvisi'     // chiusure/allerte dalla guida ("Verificato online")
  | 'luoghi'     // i luoghi principali in elenco

export const INTERLUDE_LABEL: Record<InterludeKind, string> = {
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

export const DEFAULT_INTERLUDES: InterludeSetting[] = [
  { kind: 'numeri',  enabled: true,  seconds: 4, atP: 0.22 },
  { kind: 'profilo', enabled: true,  seconds: 4, atP: 0.50 },
  { kind: 'tei',     enabled: false, seconds: 5, atP: 0.78 },
  { kind: 'natura',  enabled: false, seconds: 4, atP: 0.64 },
  { kind: 'avvisi',  enabled: false, seconds: 5, atP: 0.36 },
  { kind: 'luoghi',  enabled: false, seconds: 4, atP: 0.86 },
]

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

    // Cercare un intervallo libero è più affidabile che spingere in avanti finché si trova posto:
    // la spinta, arrivata in fondo al percorso, andava ritagliata per rientrare — e il ritaglio
    // rimetteva lo stacco esattamente sopra la foto che stava cercando di evitare.
    // Primo tentativo col respiro; se il percorso è troppo affollato di foto si ripiega sul
    // rispetto della sola foto, che resta il vincolo vero — meglio uno stacco attaccato a una
    // polaroid che uno stacco che l'utente ha chiesto e non compare.
    const at = findSlot(want, frames, [...photoFrames.map(withBreath), ...placed])
             ?? findSlot(want, frames, [...photoFrames, ...placed])
    if (at == null) continue   // davvero nessuno spazio: saltarlo è meglio che coprire una foto

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
