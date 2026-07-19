// Sottotitolo da copertina — scritto da Giulia al momento della generazione della guida (vedi
// app/api/guide/route.ts's SYSTEM prompt), non estratto a posteriori dal testo. Stesso principio
// dei tag [curiosita]/[epoca]: un blocco delimitato su una riga dedicata. A
// differenza di quelli, però, il tag va rimosso dal testo salvato — non è contenuto dell'articolo,
// serve solo per la copertina della card chiusa.
const SUBTITLE_BLOCK_RE = /\[sottotitolo\]([\s\S]*?)\[\/sottotitolo\]\s*/i

export interface ExtractedCoverSubtitle {
  subtitle: string | undefined
  cleanedText: string
}

/**
 * Estrae il blocco [sottotitolo]...[/sottotitolo] dal testo grezzo della guida generata e lo
 * rimuove dal testo restituito (cleanedText), così non finisce mai per errore nell'articolo
 * renderizzato né nel markdown persistito in cachedGuide.
 */
export function extractCoverSubtitle(rawGuideText: string): ExtractedCoverSubtitle {
  const match = SUBTITLE_BLOCK_RE.exec(rawGuideText)
  if (!match) return { subtitle: undefined, cleanedText: rawGuideText }
  const subtitle = match[1].trim().replace(/\s+/g, ' ')
  const cleanedText = (rawGuideText.slice(0, match.index) + rawGuideText.slice(match.index + match[0].length)).trimStart()
  return { subtitle: subtitle || undefined, cleanedText }
}
