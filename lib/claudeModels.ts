// Modello Claude usato per la generazione (guida, Chiedi a Giulia, confronto percorsi) quando
// l'utente non ha ancora scelto un modello nelle impostazioni (user_settings.claude_model nullo).
// Aggiornare qui quando Anthropic rilascia un nuovo modello "raccomandato" di default.
export const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-5'

export interface ClaudeModelOption {
  id: string
  displayName: string
}

// Elenco di riserva, mostrato nel selettore di Impostazioni finché GET /api/ai-models non è ancora
// tornato, o se fallisce (es. nessuna chiave API salvata) — l'elenco "vero" arriva sempre dalla
// Models API di Anthropic (client.models.list(), vedi app/api/ai-models/route.ts), così il
// selettore resta aggiornato ad ogni nuovo modello rilasciato senza dover toccare questo file.
export const FALLBACK_CLAUDE_MODELS: ClaudeModelOption[] = [
  { id: 'claude-sonnet-5',  displayName: 'Claude Sonnet 5' },
  { id: 'claude-opus-4-8',  displayName: 'Claude Opus 4.8' },
  { id: 'claude-haiku-4-5', displayName: 'Claude Haiku 4.5' },
]

/** Validazione minima prima di salvare/usare un model id arrivato dal client — non un elenco
 *  chiuso (la Models API può aggiungerne di nuovi in qualunque momento), solo un controllo di
 *  forma per evitare di mandare a Supabase/Anthropic una stringa arbitraria. */
export function isValidClaudeModelId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && id.length <= 64 && /^claude-[a-z0-9.-]+$/.test(id)
}
