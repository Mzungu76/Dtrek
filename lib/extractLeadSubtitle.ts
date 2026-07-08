// Sottotitolo da copertina per il Resoconto — a differenza della Guida (lib/coverSubtitle.ts,
// scritto ad hoc dall'AI al momento della generazione), qui si ricava euristicamente dal primo
// paragrafo del resoconto già generato, dato che la procedura di generazione del Resoconto non
// va toccata in questa fase. Markdown a blocchi "## Titolo", stessa convenzione di sezioni usata
// da lib/reportStore.ts/RacconContent.tsx.
const CURIOSITA_RE = /\[curiosita\]([\s\S]*?)\[\/curiosita\]/g
const MAX_LENGTH = 140

function truncateAtWord(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  const cut = text.slice(0, maxLength)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…'
}

/** Isola la prima sezione "## Titolo" di un markdown, rimuove i blocchi [curiosita], e restituisce
 *  il primo paragrafo non vuoto troncato a lunghezza da sottotitolo. Undefined se non c'è nulla
 *  di utilizzabile (testo vuoto, o nessun paragrafo reale). */
export function extractLeadSubtitle(markdownText: string | undefined | null): string | undefined {
  if (!markdownText || !markdownText.trim()) return undefined

  const parts = markdownText.split(/^## /m).filter(Boolean)
  const firstSection = parts[0] ?? markdownText
  const nl = firstSection.indexOf('\n')
  const body = nl === -1 ? '' : firstSection.slice(nl + 1)

  const withoutCuriosita = body.replace(CURIOSITA_RE, ' ').trim()
  const firstParagraph = withoutCuriosita
    .split(/\n\s*\n/)
    .map(p => p.replace(/\s+/g, ' ').trim())
    .find(p => p.length > 0)

  if (!firstParagraph) return undefined
  return truncateAtWord(firstParagraph, MAX_LENGTH)
}
