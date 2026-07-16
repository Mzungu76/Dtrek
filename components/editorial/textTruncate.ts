/** Riduce il corpo di una sezione a unʼanteprima di poche parole per l'anteprima "chiusa" di
 *  SectionCard (vedi prop `collapsible`) — spoglia i blocchi di markup ([curiosita]/[avviso]/
 *  ### sottotitolo) così l'anteprima è sempre prosa piana, mai un frammento a metà di un blocco. */
export function truncateBody(body: string, maxWords = 26): { preview: string; isTruncated: boolean } {
  const plain = body
    .replace(/\[(curiosita|avviso)\][\s\S]*?\[\/\1\]/g, ' ')
    .replace(/^###\s.*$/gm, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const words = plain.split(' ').filter(Boolean)
  if (words.length <= maxWords) return { preview: plain, isTruncated: false }
  return { preview: `${words.slice(0, maxWords).join(' ')}…`, isTruncated: true }
}
