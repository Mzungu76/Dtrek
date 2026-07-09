import { supabase } from '@/lib/supabase'
import { sanitizeBreveSections, type GuideSectionKey } from '@/lib/guideSections'

/** Chiave API Claude + preferenze utente rilevanti per la Guida — condiviso tra la generazione
 *  della guida (app/api/guide/route.ts) e le domande e risposte sul percorso (app/api/guide/qa/route.ts). */
export async function resolveApiKeyAndSettings(userId: string): Promise<{
  apiKey: string | null
  userGender: string
  breveSections: GuideSectionKey[]
}> {
  const { data: settings } = await supabase
    .from('user_settings')
    .select('claude_api_key, subscription_tier, user_gender, guide_breve_sections')
    .eq('user_id', userId)
    .maybeSingle()

  const userKey = settings?.claude_api_key as string | null | undefined
  const hasSub  = (settings?.subscription_tier as string) === 'premium'
  const apiKey  = userKey ?? (hasSub ? process.env.ANTHROPIC_API_KEY : null) ?? null
  const userGender = (settings?.user_gender as string | null) ?? 'non_specificato'
  const breveSections = sanitizeBreveSections(settings?.guide_breve_sections)

  return { apiKey, userGender, breveSections }
}
