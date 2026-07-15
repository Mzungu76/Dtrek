// Errori AI irreversibili che possono verificarsi a metà dello streaming della guida (dopo che la
// Response è già partita con status 200, quindi non più segnalabili con un codice HTTP dedicato —
// es. credito Anthropic esaurito, vedi lib/anthropicErrors.ts) — stessa convenzione a tag
// delimitati di [sottotitolo]/[avviso] (lib/coverSubtitle.ts, lib/guideNotices.ts): un blocco su
// una riga dedicata, rimosso dal testo persistito/mostrato come contenuto e intercettato invece
// per mostrare un avviso dedicato all'utente (vedi components/guida/GuideReader.tsx).
const AI_ERROR_RE = /\[erroreai:(credito)\]([\s\S]*?)\[\/erroreai\]\s*/i

export type GuideAiErrorCode = 'credito'

export interface GuideAiError {
  code: GuideAiErrorCode
  message: string
}

export interface ExtractedGuideAiError {
  aiError?: GuideAiError
  cleanedText: string
}

export function extractGuideAiError(rawGuideText: string): ExtractedGuideAiError {
  const match = AI_ERROR_RE.exec(rawGuideText)
  if (!match) return { cleanedText: rawGuideText }
  const cleanedText = (rawGuideText.slice(0, match.index) + rawGuideText.slice(match.index + match[0].length)).trimStart()
  return { aiError: { code: match[1] as GuideAiErrorCode, message: match[2].trim() }, cleanedText }
}
