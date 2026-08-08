// Blocchi [curiosita]/[avviso] + sottosezioni "### " dentro il testo di una sezione della Guida —
// stessa convenzione ovunque nell'app (vedi app/api/guide/route.ts), un'unica implementazione
// invece di due che stavano già divergendo (components/editorial/MagazineBody.tsx, a schermo, e
// app/components/guide/GuideSection.tsx, nel PDF): la logica di riconoscimento è identica in
// entrambi i contesti, solo l'etichettatura del primo paragrafo (per lo stile "lead"/pull-quote) e
// il pre-trattamento del testo (il PDF riceve il testo grezzo, lo schermo lo riceve già ripulito a
// monte) restano scelte del chiamante.

/**
 * Spezza una riga nei suoi tratti in grassetto e non, riconoscendo `**testo**` (e la variante a
 * quattro asterischi che i modelli producono ogni tanto quando enfatizzano un testo già in
 * grassetto).
 *
 * Serve perché il testo delle sezioni è markdown, ma finora veniva stampato alla lettera: nel PDF
 * del resoconto si leggeva `****9 chilometri****` invece di **9 chilometri**. Restituisce segmenti
 * invece di HTML per restare indipendente dal framework — chi rende decide se usare `<strong>`,
 * un `font-weight` su canvas o altro.
 */
export interface InlineSegment { text: string; bold: boolean }

export function parseInlineEmphasis(raw: string): InlineSegment[] {
  const out: InlineSegment[] = []
  const re = /\*{2,4}([^*]+?)\*{2,4}/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(raw)) !== null) {
    if (m.index > last) out.push({ text: raw.slice(last, m.index), bold: false })
    out.push({ text: m[1], bold: true })
    last = m.index + m[0].length
  }
  if (last < raw.length) out.push({ text: raw.slice(last), bold: false })
  // Asterischi spaiati rimasti (enfasi aperta e mai chiusa): meglio toglierli che stamparli.
  return out.filter(s => s.text.length > 0).map(s => ({ ...s, text: s.text.replace(/\*/g, '') }))
}

export interface MarkupBlock {
  type: 'text' | 'curiosita' | 'avviso' | 'subsection'
  text: string
  /** Solo per `type: 'text'` — true sul primo paragrafo di testo del blocco (non contando
   *  curiosità/avvisi/sottosezioni), per chi vuole dargli un trattamento "lead" distinto. */
  isFirstText?: boolean
}

export function parseMarkupBlocks(raw: string): MarkupBlock[] {
  const blocks: MarkupBlock[] = []
  const blockRe = /\[(curiosita|avviso)\]([\s\S]*?)\[\/\1\]/g
  let last = 0
  let m: RegExpExecArray | null
  let textCount = 0

  const flushText = (chunk: string) => {
    let buf: string[] = []
    const flush = () => {
      const p = buf.join(' ').trim()
      if (p) { blocks.push({ type: 'text', text: p, isFirstText: textCount === 0 }); textCount++; buf = [] }
    }
    for (const line of chunk.split('\n')) {
      const t = line.trim()
      if (t.startsWith('### ')) { flush(); blocks.push({ type: 'subsection', text: t.slice(4).trim() }) }
      else if (!t) flush()
      else buf.push(t)
    }
    flush()
  }

  while ((m = blockRe.exec(raw)) !== null) {
    flushText(raw.slice(last, m.index))
    blocks.push({ type: m[1] as 'curiosita' | 'avviso', text: m[2].trim().replace(/\n/g, ' ') })
    last = m.index + m[0].length
  }
  flushText(raw.slice(last))
  return blocks
}
