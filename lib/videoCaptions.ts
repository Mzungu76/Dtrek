// lib/videoCaptions.ts — estrae frasi brevi dal testo della guida per usarle come didascalie
// cinematografiche sopra al percorso.
//
// Due avvertenze che condizionano tutto il file:
//
// 1. Il testo della guida è scritto da un modello. Qui si producono CANDIDATI, non verità: chi
//    monta il video li vede tutti in un elenco modificabile e decide cosa entra. Nessuna frase
//    dovrebbe finire in un file che verrà condiviso senza essere passata sotto gli occhi di
//    qualcuno — vale per gli errori di fatto tanto quanto per il tono.
//
// 2. Una didascalia non è un paragrafo. Sopra a una mappa in movimento si legge una riga, e solo
//    se resta ferma abbastanza: le frasi troppo lunghe vengono scartate, non troncate, perché una
//    frase tagliata a metà dice spesso il contrario di quello che diceva intera.
//
// Logica pura: nessun canvas, nessun React.
import { parseGuideSections } from './guideParse'
import type { GuideSectionKey } from './guideSections'

export interface CaptionCandidate {
  id: string
  text: string
  /** Sezione della guida da cui viene — utile a mostrarne la provenienza in fase di scelta. */
  source: GuideSectionKey | 'altro'
  enabled: boolean
  /** Dove compare lungo il percorso, 0..1. */
  atP: number
}

/** Sezioni con prosa narrativa. "Il percorso" per prima: è il racconto del tracciato, esattamente
 *  ciò che serve sopra alle immagini del tracciato stesso. */
const NARRATIVE_SECTIONS: GuideSectionKey[] = ['il_percorso', 'luoghi', 'natura']

const MIN_LEN = 25
const MAX_LEN = 95

/** Ripulisce il markdown e i blocchi con tag ([curiosita], [epoca], [avviso]…) dal corpo di una sezione. */
function stripMarkup(body: string): string {
  return body
    .replace(/\[(\w+)(?::\w+)?\][\s\S]*?\[\/\1\]/g, ' ')  // blocchi delimitati
    .replace(/\[[^\]]*\]\([^)]*\)/g, ' ')                  // link markdown
    .replace(/[*_`>#]/g, ' ')                              // enfasi, titoli, citazioni
    .replace(/\s+/g, ' ')
    .trim()
}

/** Spezza in frasi tenendo la punteggiatura finale. */
function toSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean)
}

/**
 * Propone didascalie dal testo della guida, distribuite lungo il percorso.
 *
 * `max` è volutamente basso: su un percorso di trenta secondi più di quattro o cinque frasi si
 * accavallano fra loro e con le schede dei luoghi, e il video diventa da leggere invece che da
 * guardare.
 */
export function suggestCaptions(guideText: string | undefined, max = 4): CaptionCandidate[] {
  if (!guideText?.trim()) return []
  const sections = parseGuideSections(guideText)
  const pool: { text: string; source: GuideSectionKey | 'altro' }[] = []

  for (const key of NARRATIVE_SECTIONS) {
    const sec = sections.find(s => s.key === key)
    if (!sec) continue
    for (const sentence of toSentences(stripMarkup(sec.body))) {
      // Scartate, non troncate: una frase tagliata a metà cambia spesso di senso
      if (sentence.length < MIN_LEN || sentence.length > MAX_LEN) continue
      // Le frasi che si aprono con un connettivo dipendono da quella prima: da sole non stanno in piedi
      if (/^(inoltre|tuttavia|infatti|quindi|perciò|ma |e |o |anche|questo|questa|ciò)\b/i.test(sentence)) continue
      pool.push({ text: sentence, source: key })
    }
  }
  if (pool.length === 0) return []

  // Distribuite lungo la parte centrale del percorso: all'inizio c'è l'intro aerea, alla fine il
  // finale, e una didascalia a cavallo dell'una o dell'altro si vedrebbe a metà.
  const picked = pool.slice(0, max)
  return picked.map((c, i) => ({
    id: `cap-${i}`,
    text: c.text,
    source: c.source,
    enabled: true,
    atP: picked.length === 1 ? 0.5 : 0.18 + (0.62 * i) / (picked.length - 1),
  }))
}

/** Didascalia attiva in un dato punto del percorso, con il suo avanzamento 0..1.
 *  `windowP` è quanto resta a schermo, espresso in frazione di percorso. */
export function activeCaptionAt(
  captions: CaptionCandidate[], p: number, windowP: number,
): { caption: CaptionCandidate; t: number } | null {
  for (const c of captions) {
    if (!c.enabled || !c.text.trim()) continue
    const d = p - c.atP
    if (d >= 0 && d < windowP) return { caption: c, t: d / windowP }
  }
  return null
}
