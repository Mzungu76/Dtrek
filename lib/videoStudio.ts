// lib/videoStudio.ts — i comandi del video descritti come dati, non come JSX.
//
// Lo studio (components/video/VideoStudio.tsx) dispone decine di controlli attorno alla mappa, su
// due binari: a sinistra ciò che si posa SUL percorso, a destra ciò che vale per TUTTO il video.
// Se ogni controllo fosse scritto a mano nel layout, quel componente diventerebbe un secondo
// RouteMap3D — migliaia di righe in cui la struttura (dove sta un binario, come collassa su un
// telefono) è mescolata al contenuto (cosa fa questo interruttore).
//
// Qui invece i controlli sono un ELENCO: chi possiede lo stato (RouteMap3D) lo descrive, lo studio
// lo disegna e basta. Aggiungere un'opzione domani è una riga in un array, non una modifica al
// layout; e il layout si può cambiare — o riprovare l'opzione A o C del mockup — senza toccare
// nemmeno un controllo.
//
// Tipi puri: nessun React, nessun DOM. I `render` dei controlli `custom` sono l'unica porta verso
// il JSX, e servono ai pochi casi che non sono davvero un interruttore o un cursore (l'elenco delle
// foto, l'ordine delle inquadrature): forzarli nel modello li avrebbe resi peggiori, non più
// uniformi.

export interface StudioOption {
  value: string
  label: string
  /** Riga piccola sotto l'etichetta: a cosa serve questa scelta, non come si chiama. */
  sub?: string
  /** Pastiglia di colore (per le scelte che SONO un colore). */
  color?: string
  disabled?: boolean
}

export type StudioControl =
  /** Poche scelte mutuamente esclusive, tutte visibili insieme. */
  | { kind: 'segmented'; id: string; label?: string; value: string; options: StudioOption[]; onPick: (v: string) => void; hint?: string; columns?: number }
  /** Scelte "grandi", una per riga, con descrizione — per i bivi che cambiano il senso del video. */
  | { kind: 'cards'; id: string; label?: string; value: string; options: StudioOption[]; onPick: (v: string) => void; hint?: string }
  | { kind: 'toggle'; id: string; label: string; value: boolean; onToggle: (v: boolean) => void; hint?: string; disabled?: boolean; disabledReason?: string }
  | { kind: 'slider'; id: string; label: string; value: number; min: number; max: number; step: number; display: string; onChange: (v: number) => void; hint?: string }
  /** Un gruppo di interruttori minuti che condividono un senso (i "tocchi scenici"): messi uno per
   *  riga occuperebbero mezzo binario per cose che si accendono e si dimenticano. */
  | { kind: 'chips'; id: string; label?: string; options: { id: string; label: string; value: boolean; onToggle: (v: boolean) => void; disabled?: boolean }[]; hint?: string }
  /** L'unica porta verso il JSX — vedi il commento in testa al file. */
  | { kind: 'custom'; id: string; label?: string; render: () => unknown; hint?: string }
  /** Testo esplicativo o avviso, senza comando. */
  | { kind: 'note'; id: string; text: string; tone?: 'info' | 'warn' }

export interface StudioGroup {
  id: string
  /** Nome del gruppo: diventa la linguetta su telefono e l'intestazione su schermo largo. */
  label: string
  /** Un carattere che lo identifica quando lo spazio non basta per il nome. */
  glyph: string
  controls: StudioControl[]
  /** Nascosto quando non ha senso in questa modalità (es. le didascalie fuori da Illustrativo). */
  hidden?: boolean
}

/** Una voce della barra di durata: da cosa è fatto il totale, pezzo per pezzo. */
export interface StudioBudgetPart { key: string; label: string; sec: number; color: string }

export function visibleGroups(groups: StudioGroup[]): StudioGroup[] {
  return groups.filter(g => !g.hidden && g.controls.length > 0)
}
