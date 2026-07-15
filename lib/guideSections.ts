// Scheletro fisso delle sezioni della Guida Turistica — condiviso tra il prompt AI
// (app/api/guide/route.ts), il parsing (components/guida/GuideReader.tsx) e il picker
// delle sezioni "Breve" (components/profilo/SectionGuida.tsx). L'ordine qui è l'ordine
// di visualizzazione/generazione.

export type GuideSectionKey =
  | 'prima_di_partire'
  | 'il_percorso'
  | 'dati_sicurezza'
  | 'comfort'
  | 'luoghi'
  | 'natura'
  | 'sapori'
  | 'consigli'

export interface GuideSectionDef {
  key: GuideSectionKey
  /** Titolo esatto che l'AI deve usare dopo "## " nel markdown generato. */
  title: string
  /** Sottostringhe (lowercase) per riconoscere la sezione in guide legacy/varianti di titolo. */
  match: string[]
  /** Riga statica (non scritta dall'AI) sotto il titolo di ogni sezione, per spiegare in anticipo
   *  cosa l'utente vi troverà — vedi components/guida/SectionCard.tsx. Per "Il percorso" dichiara
   *  esplicitamente la verifica online (l'unica sezione dove Giulia usa la ricerca web, vedi
   *  SYSTEM_RESEARCH in app/api/guide/route.ts), così non è un dettaglio nascosto. */
  subtitle: string
}

export const GUIDE_SECTIONS: GuideSectionDef[] = [
  { key: 'prima_di_partire', title: 'Prima di partire',           match: ['prima di partire'],
    subtitle: 'Equipaggiamento, stagione ideale e orario di partenza consigliati per questo percorso.' },
  { key: 'il_percorso',      title: 'Il percorso',                match: ['il percorso'],
    subtitle: 'Il racconto del tracciato, verificato online in tempo reale per chiusure, deviazioni e avvisi — con le fonti citate qui sotto.' },
  { key: 'dati_sicurezza',   title: 'Dati e sicurezza',           match: ['dati e sicurezza', 'sicurezza e dati'],
    subtitle: 'Un commento a voce su rischi, difficoltà e punteggi di sicurezza già mostrati sopra.' },
  { key: 'comfort',          title: 'Su misura per te',           match: ['su misura per te', 'su misura'],
    subtitle: 'Quanto questo percorso è in linea con le tue capacità e preferenze personali.' },
  { key: 'luoghi',           title: 'I luoghi da non perdere',    match: ['i luoghi', 'luoghi da non perdere'],
    subtitle: 'Storia, leggende e curiosità dei punti di interesse lungo il tracciato.' },
  { key: 'natura',           title: 'La natura intorno a te',     match: ['la natura'],
    subtitle: 'Flora, fauna e geologia che potresti incontrare, in base alla stagione.' },
  { key: 'sapori',           title: 'Sapori e tradizioni',        match: ['sapori'],
    subtitle: 'Gastronomia locale, tradizioni e prodotti tipici della zona.' },
  { key: 'consigli',         title: 'Consigli finali',            match: ['consigli'],
    subtitle: 'Sicurezza, segnaletica, varianti e contatti utili per l\'escursione.' },
]

/** Applicata quando l'utente non ha ancora scelto le sezioni della guida Breve in Impostazioni —
 *  solo le due sezioni essenziali (racconto del tracciato + consigli pratici); tutte le altre
 *  restano un click di distanza ("Approfondisci con Giulia") invece di partire già tutte attive. */
export const DEFAULT_BREVE_SECTIONS: GuideSectionKey[] = ['prima_di_partire', 'il_percorso']

export function isGuideSectionKey(v: unknown): v is GuideSectionKey {
  return typeof v === 'string' && GUIDE_SECTIONS.some(s => s.key === v)
}

/**
 * Valida/normalizza un array arbitrario in una lista di chiavi valide, deduplicata — nessun tetto
 * massimo (l'utente può automatizzare da 0 a tutte le sezioni, vedi components/profilo/
 * SectionGuida.tsx) e nessuna forzatura a un default quando la scelta è deliberatamente vuota:
 * il fallback a DEFAULT_BREVE_SECTIONS scatta solo più a monte, quando la colonna non è mai stata
 * impostata affatto (vedi app/api/user-settings/route.ts GET).
 */
export function sanitizeBreveSections(v: unknown): GuideSectionKey[] {
  if (!Array.isArray(v)) return DEFAULT_BREVE_SECTIONS
  return Array.from(new Set(v.filter(isGuideSectionKey)))
}

export function sectionDefForTitle(title: string): GuideSectionDef | undefined {
  const t = title.toLowerCase()
  return GUIDE_SECTIONS.find(s => s.match.some(m => t.includes(m)))
}
