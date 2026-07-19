// Avvisi sullo stato aggiornato del percorso — scritti da Giulia dopo una ricerca web mirata al
// momento della generazione della guida (vedi app/api/guide/route.ts's SYSTEM prompt), stesso
// principio dei tag [sottotitolo]/[curiosita]/[epoca]: un blocco delimitato su una
// riga dedicata, scritto PRIMA della prima sezione "## " e quindi da estrarre e ripulire dal testo
// come il sottotitolo (lib/coverSubtitle.ts), non da un parsing per-sezione come [curiosita].
//
// Ogni avviso porta una gravità dichiarata da Giulia stessa in scrittura ([avviso:danger]...),
// stessa terminologia già in uso per SafetyRiskItem/ClassifiedDifficultyMarker altrove nell'app —
// una chiusura reale (danger) non è la stessa cosa di lavori minori (warning) o di una nota
// stagionale (info), e Giulia lo sa già dalla ricerca: ha senso che lo dichiari subito invece di
// doverlo indovinare dopo dal testo libero. Puramente informativo/visivo (vedi
// components/TrailScoreGaugeBadge.tsx) — non entra nel calcolo del punteggio Sicurezza.
// Il formato istruito (SYSTEM_VERIFICATO in app/api/guide/route.ts) è sempre [avviso:gravità]...
// [/avviso], ma il modello occasionalmente scrive la gravità stessa come nome del tag (es.
// [info]...[/info] invece di [avviso:info]...[/avviso]) — la seconda alternativa qui sotto
// riconosce anche quella variante, così un avviso non finisce visualizzato come testo grezzo solo
// perché Giulia non ha seguito il formato alla lettera. Il tag di chiusura è ugualmente permissivo
// (qualunque delle quattro parole, non necessariamente la stessa dell'apertura) per lo stesso motivo.
const NOTICE_RE = /\[(?:avviso(?::(danger|warning|info))?|(danger|warning|info))\]([\s\S]*?)\[\/(?:avviso|danger|warning|info)\]\s*/gi

export type NoticeSeverity = 'danger' | 'warning' | 'info'

export interface GuideNotice {
  severity: NoticeSeverity
  text: string
}

export interface ExtractedGuideNotices {
  notices: GuideNotice[]
  cleanedText: string
}

/**
 * Estrae tutti i blocchi [avviso:gravità]...[/avviso] dal testo grezzo della guida generata e li
 * rimuove dal testo restituito (cleanedText), così non finiscono per errore nell'articolo
 * renderizzato né nel markdown persistito in cachedGuide. Gravità assente (formato vecchio, o un
 * modello che dimentica il tag) ⇒ 'warning', una via di mezzo prudente invece di un default che
 * minimizzi o allarmi.
 */
export function extractGuideNotices(rawGuideText: string): ExtractedGuideNotices {
  const notices: GuideNotice[] = []
  const cleanedText = rawGuideText.replace(
    NOTICE_RE,
    (_match, severityFromAvviso: string | undefined, severityFromBareTag: string | undefined, text: string) => {
      const trimmed = text.trim().replace(/\s+/g, ' ')
      if (trimmed) notices.push({ severity: (severityFromAvviso ?? severityFromBareTag ?? 'warning') as NoticeSeverity, text: trimmed })
      return ''
    },
  ).trimStart()
  return { notices, cleanedText }
}

// Un avviso può chiudersi con "(https://...)" — l'URL esatto della pagina da cui Giulia ha tratto
// quell'informazione (vedi SYSTEM prompt in app/api/guide/route.ts) — non un campo strutturato a
// parte per restare compatibile con cachedGuideNotices (già persistito così ovunque): il parsing
// avviene solo qui, a livello di visualizzazione, non tocca lo storage.
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

/** Normalizza cachedGuideNotices per compatibilità con le guide generate prima dell'introduzione
 *  della gravità (string[] semplice, non {severity,text}[]) — 'warning' come default prudente,
 *  stessa scelta di extractGuideNotices sopra. Da usare ovunque cachedGuideNotices venga letto da
 *  un hike già persistito, non solo appena estratto da un nuovo stream. */
export function normalizeGuideNotices(raw: unknown): GuideNotice[] {
  if (!Array.isArray(raw)) return []
  return raw.map(entry =>
    typeof entry === 'string' ? { severity: 'warning' as const, text: entry } : entry as GuideNotice
  )
}
