// Blocchi [curiosita]/[avviso] + sottosezioni "### " dentro il testo di una sezione della Guida —
// stessa convenzione ovunque nell'app (vedi app/api/guide/route.ts), un'unica implementazione
// invece di due che stavano già divergendo (components/editorial/MagazineBody.tsx, a schermo, e
// app/components/guide/GuideSection.tsx, nel PDF): la logica di riconoscimento è identica in
// entrambi i contesti, solo l'etichettatura del primo paragrafo (per lo stile "lead"/pull-quote) e
// il pre-trattamento del testo (il PDF riceve il testo grezzo, lo schermo lo riceve già ripulito a
// monte) restano scelte del chiamante.

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
