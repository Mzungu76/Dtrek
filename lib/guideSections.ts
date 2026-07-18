// Scheletro fisso delle sezioni della Guida Turistica — condiviso tra il prompt AI
// (app/api/guide/route.ts), il parsing (components/guida/GuideReader.tsx) e il picker
// delle sezioni "Breve" (components/profilo/SectionGuida.tsx). L'ordine qui è l'ordine
// di visualizzazione/generazione.

export type GuideSectionKey =
  | 'prima_di_partire'
  | 'il_percorso'
  | 'verificato'
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
   *  cosa l'utente vi troverà — vedi components/guida/SectionCard.tsx. Per "Verificato online"
   *  dichiara esplicitamente la ricerca web (l'unica sezione dove Giulia la usa, vedi
   *  SYSTEM_VERIFICATO in app/api/guide/route.ts), così non è un dettaglio nascosto. */
  subtitle: string
}

export const GUIDE_SECTIONS: GuideSectionDef[] = [
  { key: 'prima_di_partire', title: 'Prima di partire',           match: ['prima di partire'],
    subtitle: 'Equipaggiamento, stagione ideale e orario di partenza consigliati per questo percorso.' },
  { key: 'il_percorso',      title: 'Il percorso',                match: ['il percorso'],
    subtitle: 'Il racconto del tracciato: atmosfera, panorami, cosa si prova a camminarci.' },
  { key: 'verificato',       title: 'Verificato online',          match: ['verificato online', 'verificato'],
    subtitle: 'Chiusure, allerte e aggiornamenti trovati online per questo percorso, con le fonti consultate.' },
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
 *  solo le tre sezioni essenziali (racconto del tracciato + verifica di sicurezza online + consigli
 *  pratici); tutte le altre restano un click di distanza ("Approfondisci con Giulia") invece di
 *  partire già tutte attive. */
export const DEFAULT_BREVE_SECTIONS: GuideSectionKey[] = ['prima_di_partire', 'il_percorso', 'verificato']

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

// ── Lunghezza del testo AI, personalizzabile per sezione ──────────────────────
//
// 'essenziale' è il comportamento storico (l'unico che esisteva prima di questa opzione) — resta
// il default per ogni sezione finché l'utente non sceglie diversamente in Impostazioni, e può
// comunque essere sovrascritto per singola generazione (vedi app/api/guide/route.ts, sectionsBlock
// in buildPrompt, e il selettore in components/guida/GuideReader.tsx).
export type GuideTextLength = 'essenziale' | 'approfondita' | 'molto_approfondita'

export interface GuideTextLengthDef {
  key: GuideTextLength
  label: string
  description: string
}

export const GUIDE_TEXT_LENGTHS: GuideTextLengthDef[] = [
  { key: 'essenziale',         label: 'Essenziale',         description: 'Il taglio di sempre: diretto e conciso.' },
  { key: 'approfondita',       label: 'Approfondita',       description: 'Più contesto e dettagli, senza dilungarsi.' },
  { key: 'molto_approfondita', label: 'Molto approfondita', description: 'Racconto ricco, con più aneddoti e dettagli.' },
]

export const DEFAULT_TEXT_LENGTH: GuideTextLength = 'essenziale'

export type SectionLengthMap = Record<GuideSectionKey, GuideTextLength>

export const DEFAULT_SECTION_LENGTHS: SectionLengthMap = GUIDE_SECTIONS.reduce((acc, s) => {
  acc[s.key] = DEFAULT_TEXT_LENGTH
  return acc
}, {} as SectionLengthMap)

export function isGuideTextLength(v: unknown): v is GuideTextLength {
  return v === 'essenziale' || v === 'approfondita' || v === 'molto_approfondita'
}

/** Valida/normalizza una mappa arbitraria sezione→lunghezza in una mappa SEMPRE completa (ogni
 *  GuideSectionKey presente): valori mancanti o non validi tornano a DEFAULT_TEXT_LENGTH invece di
 *  essere omessi, così i chiamanti possono indicizzarla senza controlli aggiuntivi. */
export function sanitizeSectionLengths(v: unknown): SectionLengthMap {
  const obj = (v && typeof v === 'object' && !Array.isArray(v)) ? v as Record<string, unknown> : {}
  return GUIDE_SECTIONS.reduce((acc, s) => {
    const val = obj[s.key]
    acc[s.key] = isGuideTextLength(val) ? val : DEFAULT_TEXT_LENGTH
    return acc
  }, {} as SectionLengthMap)
}
