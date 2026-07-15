import { supabase } from '@/lib/supabase'
import { sanitizeBreveSections, type GuideSectionKey } from '@/lib/guideSections'
import { readCachedAiSettings, writeCachedAiSettings, deleteCachedAiSettings, isEmergencySharedKeyEnabled } from '@/lib/aiKeyCache'
import { DEFAULT_CLAUDE_MODEL, isValidClaudeModelId } from '@/lib/claudeModels'

/** Chiave API Claude + preferenze utente rilevanti per la Guida — condiviso tra la generazione
 *  della guida (app/api/guide/route.ts) e le domande e risposte sul percorso (app/api/guide/qa/route.ts). */
export async function resolveApiKeyAndSettings(userId: string): Promise<{
  apiKey: string | null
  userGender: string
  breveSections: GuideSectionKey[]
  /** Modello Claude scelto dall'utente in Impostazioni (vedi lib/claudeModels.ts) — DEFAULT_CLAUDE_MODEL
   *  se non ha mai scelto nulla o se il valore salvato non è più una stringa di modello valida. */
  claudeModel: string
  /** true quando NÉ Supabase NÉ la copia di riserva (lib/aiKeyCache.ts, Upstash Redis) sono
   *  riuscite a rispondere — a differenza di una lettura riuscita che conferma semplicemente
   *  l'assenza di una chiave. I chiamanti devono mostrare "temporaneamente non disponibile", non
   *  "aggiungi la tua chiave". */
  lookupFailed: boolean
}> {
  const { data: settings, error } = await supabase
    .from('user_settings')
    .select('claude_api_key, subscription_tier, user_gender, guide_breve_sections, claude_model')
    .eq('user_id', userId)
    .maybeSingle()

  if (!error) {
    const userKey = settings?.claude_api_key as string | null | undefined
    const hasSub  = (settings?.subscription_tier as string) === 'premium'
    const apiKey  = userKey ?? (hasSub ? process.env.ANTHROPIC_API_KEY : null) ?? null
    const userGender = (settings?.user_gender as string | null) ?? 'non_specificato'
    const breveSections = sanitizeBreveSections(settings?.guide_breve_sections)
    const claudeModel = isValidClaudeModelId(settings?.claude_model) ? settings.claude_model : DEFAULT_CLAUDE_MODEL

    // Tiene la copia di riserva sincronizzata con l'ultimo stato noto-buono di Supabase — sia
    // quando c'è una chiave personale da (ri)salvare, sia quando è stata rimossa, così un blackout
    // successivo non serve mai una chiave ormai cancellata. Non cachea mai la chiave condivisa
    // (fallback premium): non ha senso duplicarla per utente, e process.env resta comunque
    // disponibile in ogni caso.
    if (userKey) void writeCachedAiSettings(userId, { apiKey: userKey, userGender, breveSections, claudeModel })
    else void deleteCachedAiSettings(userId)

    return { apiKey, userGender, breveSections, claudeModel, lookupFailed: false }
  }

  // Supabase irraggiungibile — prova la copia di riserva, infrastruttura indipendente.
  const cached = await readCachedAiSettings(userId)
  if (cached) {
    return {
      apiKey:        cached.apiKey,
      userGender:    cached.userGender,
      breveSections: sanitizeBreveSections(cached.breveSections),
      claudeModel:   isValidClaudeModelId(cached.claudeModel) ? cached.claudeModel : DEFAULT_CLAUDE_MODEL,
      lookupFailed:  false,
    }
  }

  return { apiKey: null, userGender: 'non_specificato', breveSections: sanitizeBreveSections(undefined), claudeModel: DEFAULT_CLAUDE_MODEL, lookupFailed: true }
}

/**
 * Percorso di emergenza esplicito, scelto dall'utente: quando Supabase è del tutto irraggiungibile
 * — JWKS incluse, quindi impossibile verificare CHI sta chiedendo (vedi
 * lib/supabaseAuth.ts's resolveUser, campo `degraded`) — l'identificazione per-utente viene
 * abbandonata e si usa la stessa chiave (pagata dal gestore dell'app) per chiunque abbia una
 * sessione presente, anche non verificabile in questo momento. Spegnibile su Upstash, vedi
 * lib/aiKeyCache.ts's isEmergencySharedKeyEnabled. Mai chiamata quando la verifica normale o
 * quella via JWKS riescono — solo come ultima risorsa.
 */
export async function resolveEmergencySharedKey(): Promise<{
  apiKey: string | null
  userGender: string
  breveSections: GuideSectionKey[]
  claudeModel: string
  lookupFailed: boolean
}> {
  const sharedKey = process.env.ANTHROPIC_API_KEY ?? null
  const enabled = sharedKey ? await isEmergencySharedKeyEnabled() : false
  return {
    apiKey:        enabled ? sharedKey : null,
    userGender:    'non_specificato',
    breveSections: sanitizeBreveSections(undefined),
    claudeModel:   DEFAULT_CLAUDE_MODEL,
    lookupFailed:  !enabled,
  }
}
