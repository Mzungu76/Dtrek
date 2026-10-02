// Esito per cammino di un import multiplo e riepilogo per $GITHUB_STEP_SUMMARY. Funzioni pure.

export type Outcome = 'scritto' | 'pronto' | 'da_rivedere' | 'saltato' | 'errore' | 'rimandato'

export interface RunRow {
  id: string
  name: string
  outcome: Outcome
  km?: number
  tappe?: number
  durationS?: number
  /** Errore (outcome errore) oppure motivi / nota (altri esiti). */
  detail?: string
}

const LABEL: Record<Outcome, string> = {
  scritto: '✅ scritto', pronto: '✅ pronto (dry-run)', da_rivedere: '⚠️ da rivedere', saltato: '⏭️ saltato', errore: '❌ errore', rimandato: '⏳ rimandato',
}

/** Uscita ≠ 0 solo se qualcosa è fallito davvero: errori o cammini non raggiunti. I "da rivedere" no. */
export function exitCodeFor(rows: RunRow[]): number {
  return rows.some(r => r.outcome === 'errore' || r.outcome === 'rimandato') ? 1 : 0
}

const cell = (s: string | undefined) => (s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 300)

export function summaryMarkdown(rows: RunRow[], title: string): string {
  const count = (o: Outcome) => rows.filter(r => r.outcome === o).length
  const head = `### ${title}\n\n${rows.length} voci — ${(['scritto', 'pronto', 'da_rivedere', 'saltato', 'errore', 'rimandato'] as Outcome[])
    .filter(o => count(o) > 0).map(o => `${count(o)} ${o.replace('_', ' ')}`).join(', ') || 'nessuna'}\n\n`
  const lines = rows.map(r => `| ${cell(r.name)} | \`${r.id}\` | ${LABEL[r.outcome]} | ${r.km != null ? r.km.toFixed(1) : '–'} | ${r.tappe ?? '–'} | ${r.durationS != null ? `${Math.round(r.durationS / 60 * 10) / 10} min` : '–'} | ${cell(r.detail)} |`)
  return `${head}| Cammino | Id | Esito | km | Tappe | Durata | Note / errore |\n|---|---|---|---:|---:|---:|---|\n${lines.join('\n')}\n`
}
