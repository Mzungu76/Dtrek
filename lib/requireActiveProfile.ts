import { supabase } from './supabase'

// Il gate del "un solo link": nessun Diario/Reportage/Raccolta può ottenere un share_token finché
// l'utente non ha scelto e attivato il proprio indirizzo pubblico (/u/[slug], user_settings.
// profile_slug + profile_enabled). Da qui in poi il profilo È il link da condividere — pubblicare
// un contenuto significa solo farlo comparire lì, non generare un altro indirizzo a sé.
export async function hasActiveProfile(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('user_settings')
    .select('profile_slug, profile_enabled')
    .eq('user_id', userId)
    .maybeSingle()
  return !!(data?.profile_slug && data?.profile_enabled)
}

export const PROFILE_REQUIRED_ERROR = 'Attiva prima il tuo sito pubblico (indirizzo /u/…) per pubblicare qualcosa.'
