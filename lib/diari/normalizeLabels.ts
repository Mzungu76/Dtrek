// Normalizzazione delle etichette di un Diario — PATCH /api/diaries/[id], restyling pagina /diari
// Fase 2 (docs/diari-restyling-piano.md). Estratta dalla route per essere testabile: le regole
// (spazi ai bordi, doppioni, lunghezza, quante) sono l'unica logica non banale di quell'handler.
export const MAX_LABEL_LENGTH = 24
export const MAX_LABELS = 8

export function normalizeLabels(raw: string[]): string[] {
  return Array.from(new Set(
    raw.map(l => l.trim()).filter(l => l.length > 0 && l.length <= MAX_LABEL_LENGTH),
  )).slice(0, MAX_LABELS)
}
