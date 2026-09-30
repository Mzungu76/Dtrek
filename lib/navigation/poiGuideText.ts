// Testo esteso per un punto di interesse, ricavato dalla guida del percorso (hike.cachedGuide) —
// già salvata sul dispositivo insieme al percorso pianificato, quindi disponibile anche senza
// rete. Serve quando un POI non ha né una nota dedicata ("I luoghi da non perdere") né
// un'estratto Wikipedia: prima il foglio mostrava solo il titolo.

const STOPWORDS = new Set([
  'di', 'del', 'della', 'dello', 'dei', 'delle', 'degli', 'da', 'dal', 'dalla', 'in', 'nel', 'nella',
  'con', 'su', 'sul', 'sulla', 'per', 'tra', 'fra', 'il', 'lo', 'la', 'le', 'gli', 'un', 'una', 'and', 'the', 'of',
])

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

function significantTokens(name: string): string[] {
  return normalize(name).split(' ').filter((t) => t.length > 2 && !STOPWORDS.has(t))
}

/** Toglie il markup interno della guida (tag [epoca]/[curiosita], intestazioni, grassetti) lasciando
 *  solo testo leggibile e leggibile ad alta voce. */
function stripMarkup(text: string): string {
  return text
    .replace(/\[epoca[^\]]*\][\s\S]*?\[\/epoca\]/g, ' ')
    .replace(/\[\/?curiosita\]/g, '')
    .replace(/\[\/?[a-z_]+(?:=[^\]]*)?\]/gi, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

const MAX_CHARS = 1600

/**
 * 1) una sezione della guida il cui titolo (## / ###) corrisponde al nome del luogo — testo intero;
 * 2) altrimenti i paragrafi che citano il luogo (nome intero, oppure tutte le parole significative
 *    del nome) — fino a tre. Null se la guida non ne parla.
 */
export function findGuideTextForPoi(guide: string, name: string | undefined | null): string | null {
  if (!guide || !name) return null
  const target = normalize(name)
  const tokens = significantTokens(name)
  if (!target || tokens.length === 0) return null

  const lines = guide.split('\n')
  type Block = { heading: string; body: string[] }
  const blocks: Block[] = []
  let cur: Block = { heading: '', body: [] }
  for (const line of lines) {
    const h = /^#{2,4}\s+(.*)$/.exec(line)
    if (h) { blocks.push(cur); cur = { heading: h[1], body: [] } } else cur.body.push(line)
  }
  blocks.push(cur)

  const headingMatch = blocks.find((b) => {
    if (!b.heading) return false
    const hn = normalize(b.heading)
    return hn === target || hn.includes(target) || (target.includes(hn) && hn.length > 4)
  })
  if (headingMatch) {
    const text = stripMarkup(headingMatch.body.join('\n')).trim()
    if (text.length > 60) return text.slice(0, MAX_CHARS)
  }

  const need = tokens.length <= 2 ? tokens.length : Math.ceil(tokens.length * 0.6)
  const paragraphs = stripMarkup(guide).split(/\n\s*\n/).map((p) => p.replace(/^#+\s+.*$/gm, '').trim()).filter((p) => p.length > 40)
  const hits = paragraphs.filter((p) => {
    const pn = normalize(p)
    if (pn.includes(target)) return true
    return tokens.filter((t) => pn.includes(t)).length >= need
  })
  if (hits.length === 0) return null
  return hits.slice(0, 3).join('\n\n').slice(0, MAX_CHARS)
}
