// Avvisi sullo stato aggiornato del percorso — scritti da Giulia dopo una ricerca web mirata al
// momento della generazione della guida (vedi app/api/guide/route.ts's SYSTEM prompt), stesso
// principio dei tag [sottotitolo]/[curiosita]/[indovinello]/[epoca]: un blocco delimitato su una
// riga dedicata, scritto PRIMA della prima sezione "## " e quindi da estrarre e ripulire dal testo
// come il sottotitolo (lib/coverSubtitle.ts), non da un parsing per-sezione come [curiosita].
const NOTICE_RE = /\[avviso\]([\s\S]*?)\[\/avviso\]\s*/gi

export interface ExtractedGuideNotices {
  notices: string[]
  cleanedText: string
}

/**
 * Estrae tutti i blocchi [avviso]...[/avviso] dal testo grezzo della guida generata e li rimuove
 * dal testo restituito (cleanedText), così non finiscono per errore nell'articolo renderizzato
 * né nel markdown persistito in cachedGuide.
 */
export function extractGuideNotices(rawGuideText: string): ExtractedGuideNotices {
  const notices: string[] = []
  const cleanedText = rawGuideText.replace(NOTICE_RE, (_match, text: string) => {
    const trimmed = text.trim().replace(/\s+/g, ' ')
    if (trimmed) notices.push(trimmed)
    return ''
  }).trimStart()
  return { notices, cleanedText }
}

// Un avviso può chiudersi con "(https://...)" — l'URL esatto della pagina da cui Giulia ha tratto
// quell'informazione (vedi SYSTEM prompt in app/api/guide/route.ts) — non un campo strutturato a
// parte per restare compatibile con cachedGuideNotices (string[], già persistito così ovunque):
// il parsing avviene solo qui, a livello di visualizzazione, non tocca lo storage.
const TRAILING_URL_RE = /\s*\((https?:\/\/\S+?)\)\.?\s*$/

export interface ParsedNotice {
  text: string
  url?: string
}

export function parseNoticeSource(notice: string): ParsedNotice {
  const match = TRAILING_URL_RE.exec(notice)
  if (!match) return { text: notice }
  return { text: notice.slice(0, match.index).trim(), url: match[1] }
}
