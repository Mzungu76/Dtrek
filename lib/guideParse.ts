// Parsing/serializzazione del markdown della guida ("## Titolo\n\ncorpo" per sezione) — condiviso
// tra client (components/guida/GuideReader.tsx, spostato qui da una funzione locale) e server
// (app/api/guide/route.ts, per il salvataggio di un "Approfondisci" su una singola sezione, che
// deve fondersi con il testo già esistente invece di sovrascriverlo per intero).
import { GUIDE_SECTIONS, sectionDefForTitle, type GuideSectionKey } from './guideSections'

export interface ParsedGuideSection {
  key: GuideSectionKey | null
  title: string
  body: string
}

export function parseGuideSections(text: string): ParsedGuideSection[] {
  return text.split(/^## /m).filter(Boolean).map(part => {
    const nl = part.indexOf('\n')
    const title = (nl === -1 ? part : part.slice(0, nl)).trim()
    const body = nl === -1 ? '' : part.slice(nl + 1).trim()
    return { key: sectionDefForTitle(title)?.key ?? null, title, body }
  })
}

/**
 * Sostituisce (o inserisce, se non presente) il testo di UNA sezione nel markdown completo della
 * guida, mantenendo l'ordine canonico di lib/guideSections.ts per le sezioni fisse e lasciando le
 * altre (incluse eventuali sezioni "legacy" non riconosciute) dove sono — usato da "Approfondisci"
 * su una singola sezione (components/guida/GuideReader.tsx / app/api/guide/route.ts), che deve
 * arricchire solo quella sezione senza toccare il resto della guida già scritta.
 */
export function mergeGuideSection(
  fullText: string,
  sectionKey: GuideSectionKey,
  newTitle: string,
  newBody: string,
): string {
  const parts = parseGuideSections(fullText).filter(p => p.key !== sectionKey)
  const canonicalOrder = GUIDE_SECTIONS.map(s => s.key)
  const targetIdx = canonicalOrder.indexOf(sectionKey)

  let insertAt = parts.length
  for (let i = 0; i < parts.length; i++) {
    const k = parts[i].key
    const idx = k ? canonicalOrder.indexOf(k) : -1
    if (idx === -1 || idx > targetIdx) { insertAt = i; break }
  }

  const merged = [...parts]
  merged.splice(insertAt, 0, { key: sectionKey, title: newTitle, body: newBody })
  return merged.map(p => `## ${p.title}\n\n${p.body}`).join('\n\n')
}
