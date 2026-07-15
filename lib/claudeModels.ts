// Modello Claude mostrato come default nel selettore di Impostazioni e usato per le funzionalità
// "di punta" (vedi FEATURE_DEFAULT_MODEL sotto) quando l'utente non ha ancora scelto un modello
// esplicito (user_settings.claude_model nullo). Aggiornare qui quando Anthropic rilascia un nuovo
// modello "raccomandato" di default.
export const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-5'

/** Le funzionalità AI dell'app — vedi FEATURE_DEFAULT_MODEL. */
export type AiFeature =
  | 'guide'            // app/api/guide/route.ts
  | 'guideQa'           // app/api/guide/qa/route.ts ("Chiedi a Giulia")
  | 'resoconto'         // app/api/resoconto/route.ts
  | 'routeCompare'       // app/api/route-compare/route.ts
  | 'routeSearch'        // app/api/route-search/route.ts (ricerca percorsi assistita da Giulia)
  | 'resocontoAssist'    // app/api/resoconto-assist/route.ts
  | 'questionnaire'      // app/api/questionnaire/route.ts
  | 'caption'            // app/api/caption/route.ts

/**
 * Default per funzionalità, usato SOLO quando l'utente non ha scelto un modello esplicito in
 * Impostazioni (colonna nulla) — la scelta esplicita, quando presente, vince sempre su questa
 * mappa (vedi resolveApiKeyAndSettings.ts). Le funzionalità "di punta" (narrativa lunga, persona
 * Giulia, verifica web di sicurezza) restano su Sonnet; quelle strutturate/meccaniche (editing di
 * un testo esistente, JSON templato) usano Haiku, molto più economico a parità di compito.
 */
const FEATURE_DEFAULT_MODEL: Record<AiFeature, string> = {
  guide:           DEFAULT_CLAUDE_MODEL,
  guideQa:         DEFAULT_CLAUDE_MODEL,
  resoconto:       DEFAULT_CLAUDE_MODEL,
  routeCompare:    DEFAULT_CLAUDE_MODEL,
  routeSearch:     DEFAULT_CLAUDE_MODEL,
  resocontoAssist: 'claude-haiku-4-5',
  questionnaire:   'claude-haiku-4-5',
  caption:         'claude-haiku-4-5',
}

export function resolveDefaultModel(feature: AiFeature): string {
  return FEATURE_DEFAULT_MODEL[feature]
}

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
