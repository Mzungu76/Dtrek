// Fonti web citate da Giulia durante la generazione della guida (chiusure/deviazioni verificate
// online, vedi app/api/guide/route.ts) — appese in coda al testo grezzo come blocco delimitato
// [fonti]JSON[/fonti], stessa convenzione di [sottotitolo]/[avviso] (lib/coverSubtitle.ts,
// lib/guideNotices.ts), da estrarre e ripulire dal testo prima di mostrarlo/persisterlo.
const SOURCES_RE = /\s*\[fonti\]([\s\S]*?)\[\/fonti\]\s*$/i

export interface GuideSource {
  url: string
  title: string
}

export interface ExtractedGuideSources {
  sources: GuideSource[]
  cleanedText: string
}

export function extractGuideSources(rawGuideText: string): ExtractedGuideSources {
  const match = SOURCES_RE.exec(rawGuideText)
  if (!match) return { sources: [], cleanedText: rawGuideText }

  let sources: GuideSource[] = []
  try {
    const parsed = JSON.parse(match[1])
    if (Array.isArray(parsed)) {
      sources = parsed.filter((s): s is GuideSource => typeof s?.url === 'string' && typeof s?.title === 'string')
    }
  } catch {
    sources = []
  }

  const cleanedText = (rawGuideText.slice(0, match.index) + rawGuideText.slice(match.index + match[0].length)).trimEnd()
  return { sources, cleanedText }
}
