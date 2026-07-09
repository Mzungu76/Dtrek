// Marcatori transitori di stato emessi durante lo streaming della guida (vedi
// app/api/guide/route.ts) per dare un feedback di cosa sta facendo Giulia (es. "sto verificando
// online…") prima che compaia il primo testo vero. A differenza di [sottotitolo]/[avviso]/[fonti],
// non fanno mai parte del contenuto persistito: vengono rimossi dal testo ad ogni chunk e il loro
// contenuto va solo in uno stato UI effimero.
const STATUS_RE = /\[stato\]([\s\S]*?)\[\/stato\]/g

export interface StrippedGuideStatus {
  /** Ultimo messaggio di stato trovato in questo chunk, se presente. */
  lastStatus?: string
  cleanedText: string
}

export function stripGuideStatus(text: string): StrippedGuideStatus {
  let lastStatus: string | undefined
  const cleanedText = text.replace(STATUS_RE, (_match, inner: string) => {
    lastStatus = inner.trim()
    return ''
  })
  return { lastStatus, cleanedText }
}
