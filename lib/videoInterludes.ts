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
  opts: { fps: number; routeFrames: number; available: (kind: InterludeKind) => boolean },
): PlannedInterlude[] {
  const { fps, routeFrames, available } = opts
  return settings
    .filter(s => s.enabled && available(s.kind) && s.seconds > 0)
    .slice()
    .sort((a, b) => a.atP - b.atP)
    .map(s => ({
      kind: s.kind,
      atP: s.atP,
      frames: Math.max(1, Math.round(s.seconds * fps)),
      triggerRouteFrame: Math.round(Math.min(0.995, Math.max(0, s.atP)) * routeFrames),
    }))
}

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
