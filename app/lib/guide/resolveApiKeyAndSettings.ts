import { supabase } from '@/lib/supabase'
import { sanitizeBreveSections, sanitizeSectionLengths, type GuideSectionKey, type SectionLengthMap } from '@/lib/guideSections'
import { readCachedAiSettings, writeCachedAiSettings, deleteCachedAiSettings, isEmergencySharedKeyEnabled } from '@/lib/aiKeyCache'
import { resolveDefaultModel, isValidClaudeModelId, type AiFeature } from '@/lib/claudeModels'

/** Chiave API Claude + preferenze utente rilevanti per la Guida — condiviso tra la generazione
 *  della guida (app/api/guide/route.ts), le domande e risposte sul percorso
 *  (app/api/guide/qa/route.ts), il confronto percorsi e l'assistente di editing del resoconto.
 *  `feature` sceglie il default corretto (lib/claudeModels.ts) quando l'utente non ha scelto
 *  esplicitamente un modello — la scelta esplicita, quando presente, resta identica per tutte le
 *  funzionalità e vince sempre. */
export async function resolveApiKeyAndSettings(userId: string, feature: AiFeature): Promise<{
  apiKey: string | null
  userGender: string
  breveSections: GuideSectionKey[]
  /** Modello Claude scelto dall'utente in Impostazioni, oppure il default della funzionalità
   *  richiesta (vedi lib/claudeModels.ts) se non ha mai scelto nulla o se il valore salvato non è
   *  più una stringa di modello valida. */
  claudeModel: string
  /** Consenso dell'utente all'uso, nei prompt AI, dei dati fisiologici/biometrici (età, sesso,
   *  frequenza cardiaca, calorie — dati "particolari" ex art. 9 GDPR) e dello storico/preferenze
   *  escursionistiche, rispettivamente — vedi components/profilo/SectionAiPrivacy.tsx. Default
   *  true (opt-out, non opt-in) quando l'utente non ha mai toccato l'interruttore o quando il
   *  valore non è ancora leggibile (blackout Supabase, colonna non ancora migrata). */
  aiUseBiometricData: boolean
  aiUseHistoryData: boolean
  /** Consenso dell'utente alla ricerca web di Giulia (sezione "Verificato online" della guida,
   *  "Chiedi a Giulia") — vedi components/profilo/SectionAiPrivacy.tsx. Default true (opt-out).
   *  NON copre app/api/route-search/route.ts: lì la ricerca web è il motore stesso della funzione
   *  (trovare percorsi da importare), non un extra disattivabile. */
  aiUseWebSearch: boolean
  /** Lunghezza del testo AI scelta dall'utente per ciascuna sezione (default in Impostazioni,
   *  sovrascrivibile per singola generazione — vedi requestedSectionLengths in
   *  app/api/guide/route.ts). Sempre completa: ogni GuideSectionKey ha un valore. */
  sectionLengths: SectionLengthMap
  /** true quando NÉ Supabase NÉ la copia di riserva (lib/aiKeyCache.ts, Upstash Redis) sono
   *  riuscite a rispondere — a differenza di una lettura riuscita che conferma semplicemente
   *  l'assenza di una chiave. I chiamanti devono mostrare "temporaneamente non disponibile", non
   *  "aggiungi la tua chiave". */
  lookupFailed: boolean
}> {
  const { data: settings, error } = await supabase
    .from('user_settings')
    .select('claude_api_key, subscription_tier, user_gender, guide_breve_sections, claude_model, ai_use_biometric_data, ai_use_history_data, ai_web_search, guide_section_lengths')
    .eq('user_id', userId)
    .maybeSingle()

  if (!error) {
    const userKey = settings?.claude_api_key as string | null | undefined
    const hasSub  = (settings?.subscription_tier as string) === 'premium'
    const apiKey  = userKey ?? (hasSub ? process.env.ANTHROPIC_API_KEY : null) ?? null
    const userGender = (settings?.user_gender as string | null) ?? 'non_specificato'
    const breveSections = sanitizeBreveSections(settings?.guide_breve_sections)
    // rawClaudeModel è la scelta esplicita dell'utente (o null) — non ancora risolta contro il
    // default, che dipende dalla funzionalità chiamante e quindi va calcolato qui, non cacheato.
    const rawClaudeModel = isValidClaudeModelId(settings?.claude_model) ? settings.claude_model : null
    const claudeModel = rawClaudeModel ?? resolveDefaultModel(feature)
    const aiUseBiometricData = (settings?.ai_use_biometric_data as boolean | null) ?? true
    const aiUseHistoryData   = (settings?.ai_use_history_data   as boolean | null) ?? true
    const aiUseWebSearch     = (settings?.ai_web_search         as boolean | null) ?? true
    const sectionLengths     = sanitizeSectionLengths(settings?.guide_section_lengths)

    // Tiene la copia di riserva sincronizzata con l'ultimo stato noto-buono di Supabase — sia
    // quando c'è una chiave personale da (ri)salvare, sia quando è stata rimossa, così un blackout
    // successivo non serve mai una chiave ormai cancellata. Non cachea mai la chiave condivisa
    // (fallback premium): non ha senso duplicarla per utente, e process.env resta comunque
    // disponibile in ogni caso.
    if (userKey) void writeCachedAiSettings(userId, { apiKey: userKey, userGender, breveSections, claudeModel: rawClaudeModel, aiUseBiometricData, aiUseHistoryData, aiUseWebSearch, sectionLengths })
    else void deleteCachedAiSettings(userId)

    return { apiKey, userGender, breveSections, claudeModel, aiUseBiometricData, aiUseHistoryData, aiUseWebSearch, sectionLengths, lookupFailed: false }
  }

  // Supabase irraggiungibile — prova la copia di riserva, infrastruttura indipendente.
  const cached = await readCachedAiSettings(userId)
  if (cached) {
    const rawClaudeModel = isValidClaudeModelId(cached.claudeModel) ? cached.claudeModel : null
    return {
      apiKey:        cached.apiKey,
      userGender:    cached.userGender,
      breveSections: sanitizeBreveSections(cached.breveSections),
      claudeModel:   rawClaudeModel ?? resolveDefaultModel(feature),
      aiUseBiometricData: cached.aiUseBiometricData ?? true,
      aiUseHistoryData:   cached.aiUseHistoryData ?? true,
      aiUseWebSearch:     cached.aiUseWebSearch ?? true,
      sectionLengths:     sanitizeSectionLengths(cached.sectionLengths),
      lookupFailed:  false,
    }
  }

  return {
    apiKey: null, userGender: 'non_specificato', breveSections: sanitizeBreveSections(undefined),
    claudeModel: resolveDefaultModel(feature), aiUseBiometricData: true, aiUseHistoryData: true,
    aiUseWebSearch: true, sectionLengths: sanitizeSectionLengths(undefined), lookupFailed: true,
  }
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
export async function resolveEmergencySharedKey(feature: AiFeature): Promise<{
  apiKey: string | null
  userGender: string
  breveSections: GuideSectionKey[]
  claudeModel: string
  aiUseBiometricData: boolean
  aiUseHistoryData: boolean
  aiUseWebSearch: boolean
  sectionLengths: SectionLengthMap
  lookupFailed: boolean
}> {
  const sharedKey = process.env.ANTHROPIC_API_KEY ?? null
  const enabled = sharedKey ? await isEmergencySharedKeyEnabled() : false
  return {
    apiKey:        enabled ? sharedKey : null,
    userGender:    'non_specificato',
    breveSections: sanitizeBreveSections(undefined),
    claudeModel:   resolveDefaultModel(feature),
    // Nessun utente identificabile in questo percorso di emergenza (vedi commento in cima al file)
    // — non c'è una preferenza da leggere, si presuppone il default opt-out come ovunque altrove.
    aiUseBiometricData: true,
    aiUseHistoryData:   true,
    aiUseWebSearch:     true,
    sectionLengths:     sanitizeSectionLengths(undefined),
    lookupFailed:  !enabled,
  }
}
