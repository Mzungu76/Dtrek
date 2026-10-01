// Fonte della descrizione automatica di un luogo (Sito o Borgo/Città) — quella che arriva
// dall'archivio dtrek_places o da Wikipedia, mai un testo scritto dall'utente né generato dall'AI:
// quei testi non hanno una "fonte" da citare, questi sì (e le licenze CC BY / CC BY-SA la
// richiedono). Un solo posto per i nomi, usato dalla Guida, dal Reportage privato, dal libro e dalle
// pagine pubbliche.

export interface DescriptionCredit {
  label: string
  url?: string
}

const ARCHIVE_CREDITS: Record<string, DescriptionCredit> = {
  mic:              { label: 'Ministero della Cultura — Catalogo generale dei beni culturali', url: 'https://catalogo.beniculturali.it' },
  mic_iccd:         { label: 'Ministero della Cultura — Catalogo generale dei beni culturali', url: 'https://catalogo.beniculturali.it' },
  ptpr_lazio:       { label: 'PTPR Regione Lazio — Tavola B (CC BY 4.0)' },
  lombardia_sirbec: { label: 'Regione Lombardia — Lombardia Beni Culturali', url: 'https://www.lombardiabeniculturali.it' },
}

/** La fonte di una descrizione che viene dall'archivio (`dtrek_places.source`). Null per una fonte
 *  non nota — meglio nessuna dicitura che una attribuzione inventata. */
export function archiveDescriptionCredit(source: string | null | undefined): DescriptionCredit | null {
  return (source && ARCHIVE_CREDITS[source]) || null
}

/** La fonte di una descrizione presa dall'estratto Wikipedia (CC BY-SA 4.0). */
export function wikipediaDescriptionCredit(url?: string | null): DescriptionCredit {
  return { label: 'Wikipedia (CC BY-SA 4.0)', ...(url ? { url } : {}) }
}

const PTPR_ATTRIBUTION = 'PTPR Regione Lazio — Tavola B (CC BY 4.0)'

/** L'importer PTPR scrive l'attribuzione dentro il testo stesso della descrizione: mostrata come
 *  fonte a parte non va ripetuta nel testo. */
export function stripEmbeddedAttribution(description: string): string {
  return description.replace(PTPR_ATTRIBUTION, '').replace(/[\s·]+$/, '').trim()
}
