// Fonti web citate da Giulia durante la generazione della guida (chiusure/deviazioni verificate
// online, vedi app/api/guide/route.ts) — appese in coda al testo grezzo come blocco delimitato
// [fonti]JSON[/fonti], stessa convenzione di [sottotitolo]/[avviso] (lib/coverSubtitle.ts,
// lib/guideNotices.ts), da estrarre e ripulire dal testo prima di mostrarlo/persisterlo.
// Niente ancoraggio a fine stringa (rimosso deliberatamente): benché il prompt istruisca questo
// blocco per ultimo, un qualunque scostamento minimo del modello (un a-capo, un commento residuo
// dopo il tag) bastava a far fallire il match e lasciare il JSON grezzo visibile in pagina — il
// pattern [fonti]...[/fonti] è già abbastanza distintivo da matchare ovunque compaia nel testo.
const SOURCES_RE = /\s*\[fonti\]([\s\S]*?)\[\/fonti\]\s*/i

export interface GuideSource {
  url: string
  title: string
  // Foto di riferimento del percorso letta dal meta tag og:image della pagina fonte (vedi
  // lib/sourceImageFetch.ts) — presente su ciascuna fonte la cui pagina ne espone una (possono
  // essere più di una). Assente sulle guide generate prima di questo campo, o quando la fonte non
  // espone un'immagine pubblica.
  imageUrl?: string
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
      sources = parsed
        .filter((s): s is GuideSource => typeof s?.url === 'string' && typeof s?.title === 'string')
        .map(s => typeof s.imageUrl === 'string' ? s : { url: s.url, title: s.title })
    }
  } catch {
    sources = []
  }

  const cleanedText = (rawGuideText.slice(0, match.index) + rawGuideText.slice(match.index + match[0].length)).trimEnd()
  return { sources, cleanedText }
}
