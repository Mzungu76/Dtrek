// Sottotitolo di ogni Reportage nel Sommario del libro pubblico (components/leggi/DiaryBook.tsx) —
// una frase presa dal racconto stesso, non un riassunto scritto a parte: se il resoconto non ha
// ancora testo, la riga semplicemente non compare (nessun placeholder).
import { parseSections } from './reportStore'
import { extractCuriosita } from '@/components/diario/chartUtils'

/** Testo semplice (niente `##`, `**`, tag `[curiosita]`) del racconto, troncato a `maxLen`
 *  caratteri sull'ultimo spazio così da non tagliare una parola a metà. */
export function excerptFromContent(content: string, maxLen = 110): string {
  const text = parseSections(content)
    .map(s => extractCuriosita(s.body).clean)
    .join(' ')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/[*_`>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!text) return ''
  if (text.length <= maxLen) return text
  const cut = text.slice(0, maxLen)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}
