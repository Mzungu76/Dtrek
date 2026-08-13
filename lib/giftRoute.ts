/**
 * Percorso omaggio (docs/navigator-dtrek-boundary.md) — un percorso pianificato "master" per
 * regione, con solo dati calcolati (distanza, dislivello, tempo, POI reali da Overpass/Wikipedia,
 * punteggi sicurezza/bellezza): NIENTE testo generato da Claude (cached_guide resta vuoto anche se
 * per errore il master ne avesse uno) e NESSUN resoconto collegato — decisione esplicita, non
 * un'omissione: un resoconto è quasi solo testo AI, e nessuno ha davvero percorso questo sentiero.
 *
 * Clonato una sola volta per account, alla prima occasione utile (tipicamente subito dopo il wizard
 * di onboarding) — non ad ogni esecuzione del flusso.
 */
import { supabase } from '@/lib/supabase'
import { isItalianRegionSlug } from '@/lib/italianRegions'

export interface ClaimGiftRouteResult {
  claimed: boolean
  region: string
  /** id del percorso clonato nell'account dell'utente — solo quando claimed è true, per il deep
   *  link diretto (/guida/{hikeId}) dalla schermata di fine onboarding. */
  hikeId?: string
  reason?: 'already_claimed' | 'no_sample_for_region' | 'invalid_region' | 'clone_failed'
}

function newSampleId(region: string): string {
  return `sample_${region}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export async function claimGiftRoute(userId: string, region: string): Promise<ClaimGiftRouteResult> {
  if (!isItalianRegionSlug(region)) return { claimed: false, region, reason: 'invalid_region' }

  // Un solo regalo per account, per sempre — non uno ogni volta che il flusso di onboarding viene
  // rieseguito (es. utente che salta e poi ritenta, o bug lato client che richiama l'endpoint due volte).
  const { count: alreadyClaimed } = await supabase
    .from('planned_hikes').select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('is_sample', true)
  if ((alreadyClaimed ?? 0) > 0) return { claimed: false, region, reason: 'already_claimed' }

  const { data: masterHike } = await supabase
    .from('planned_hikes').select('id')
    .eq('is_sample', true).eq('sample_region', region)
    .maybeSingle()
  if (!masterHike) return { claimed: false, region, reason: 'no_sample_for_region' }

  const newHikeId = newSampleId(region)
  const { error } = await supabase.rpc('clone_row_for_user', {
    p_table:       'planned_hikes',
    p_source_id:   masterHike.id,
    p_new_id:      newHikeId,
    p_new_user_id: userId,
    p_extra: {
      sample_region:       region,
      // Un percorso "in attesa" senza scadenza forzata, e senza testo AI né valutazione
      // personalizzata (calcolata sullo storico del proprietario del master, non dell'utente nuovo).
      pending_expires_at:  null,
      assessment:          null,
      cached_guide:            null,
      cached_guide_subtitle:   null,
      cached_guide_notices:    null,
      cached_guide_sources:    null,
      guide_tier:               null,
      guide_generated_at:       null,
    },
  })
  if (error) {
    console.error('claimGiftRoute: clone_row_for_user failed:', error)
    return { claimed: false, region, reason: 'clone_failed' }
  }

  return { claimed: true, region, hikeId: newHikeId }
}
